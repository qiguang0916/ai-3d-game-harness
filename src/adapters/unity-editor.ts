import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { UnityEditorAdapterConfig } from "../config.js";
import type { ActionAdapter, ActionExecutionContext, ActionExecutionResult } from "./action.js";
import type { AdapterHealth } from "./types.js";
import { StdioMcpClient } from "../mcp/stdio-client.js";
import { checkUnityJob, unwrapMcp } from "../qa/unity-mcp-result.js";

const exec=promisify(execFile);
const supported=["run-tests","read-console","inspect-scene"] as const;
const asObject=(value:unknown):Record<string,unknown>=>
  value!==null&&typeof value==="object"&&!Array.isArray(value)
  ?value as Record<string,unknown>:{};
const exactInt=(value:unknown,fallback:number):number=>
  typeof value==="number"&&Number.isInteger(value)&&value>0?value:fallback;

export interface EditorIdentity {
  editorPid: number;
  projectPath: string;
  bridgePort: number;
}

export async function identifyUnityEditor(
  projectPath:string,port:number,
):Promise<EditorIdentity> {
  const expected=await realpath(resolve(projectPath));
  const {stdout}=await exec("ps",["-axo","pid=,command="],{timeout:5000});
  const editors:number[]=[];
  for(const line of stdout.split("\n")) {
    if(!line.includes("/Unity.app/Contents/MacOS/Unity -projectPath ") ||
       line.includes(" -adb2 ") || line.includes(" -batchmode "))continue;
    const match=/^\s*(\d+)\s+/.exec(line);
    const path=/\s-projectPath\s+("([^"]+)"|'([^']+)'|(\S+))/.exec(line);
    if(!match||!path)continue;
    const actual=path[2]??path[3]??path[4]??"";
    if(actual===expected)editors.push(Number(match[1]));
  }
  if(editors.length!==1)
    throw new Error("expected exactly one Unity Editor for projectPath, found "+editors.length);
  const editorPid=editors[0]!;
  const {stdout:socketInfo}=await exec("lsof",
    ["-nP","-a","-p",String(editorPid),"-iTCP:"+port,"-sTCP:LISTEN"],
    {timeout:5000});
  if(!socketInfo.includes(":"+port+" (LISTEN)"))
    throw new Error("Unity target Editor does not own MCP bridge TCP port "+port);
  return {editorPid,projectPath:expected,bridgePort:port};
}

export class UnityEditorActionAdapter implements ActionAdapter {
  private client:StdioMcpClient|undefined;
  private instance:string|undefined;
  constructor(readonly id:string,private readonly config:UnityEditorAdapterConfig){}

  supportsAction(action:string):boolean {
    return supported.includes(action as typeof supported[number]) &&
      this.config.actions.includes(action);
  }

  async healthcheck():Promise<AdapterHealth> {
    try {
      const editor=await identifyUnityEditor(this.config.projectPath,this.config.bridgePort);
      const client=await this.connect();
      const names=new Set((await client.listTools()).map(x=>x.name));
      const needed=["set_active_instance","run_tests","get_test_job","read_console","find_gameobjects"];
      const missing=needed.filter(name=>!names.has(name));
      return {ok:missing.length===0,adapter:this.id,
        details:{transport:"coplay-unity-mcp-stdio",editor,
          instance:this.instance,toolCount:names.size,missing}};
    } catch(e) {
      return {ok:false,adapter:this.id,
        details:{error:e instanceof Error?e.message:String(e),
          projectPath:this.config.projectPath,bridgePort:this.config.bridgePort}};
    }
  }

  private async connect():Promise<StdioMcpClient> {
    if(this.client) return this.client;
    const client=new StdioMcpClient({
      command:this.config.command,
      ...(this.config.args?{args:this.config.args}:{}),
      ...(this.config.cwd?{cwd:this.config.cwd}:{}),
      env:{UNITY_MCP_SKIP_STARTUP_CONNECT:"1",DISABLE_TELEMETRY:"1",
        ...(this.config.env??{})},
      timeoutMs:this.config.timeoutMs??120000,
    });
    try {
      await client.connect();
      const result=await client.callTool("set_active_instance",
        {instance:String(this.config.bridgePort)});
      const status=unwrapMcp(result.structuredContent);
      if(result.isError===true || status.success!==true)
        throw new Error("MCP refused exact Unity target bridge port");
      this.instance=String(asObject(status.data).instance??"");
      if(!this.instance)throw new Error("MCP returned no target instance identity");
      this.client=client;
      return client;
    }catch(e) {await client.close();throw e;}
  }

  private async saveEvidence(
    context:ActionExecutionContext,document:Record<string,unknown>,
  ):Promise<{uri:string;sha256:string}> {
    const task=context.task.id;
    if(!/^[A-Za-z0-9._-]+$/.test(task))throw new Error("unsafe task id");
    const attempt=context.state.tasks[task]?.attempts??0;
    const root=join(context.projectRoot,".project","evidence-files",task,
      "attempt-"+attempt);
    await mkdir(root,{recursive:true});
    const bytes=Buffer.from(JSON.stringify(document,null,2)+"\n");
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const path=join(root,"unity-mcp-job-"+sha256.slice(0,24)+".json");
    await writeFile(path,bytes,{flag:"wx"}).catch((e:unknown)=>{
      if(e instanceof Error && "code" in e && e.code==="EEXIST")return;
      throw e;
    });
    return {uri:pathToFileURL(path).href,sha256};
  }

  async executeAction(
    action:string,input:Record<string,unknown>,
    context:ActionExecutionContext,
  ):Promise<ActionExecutionResult> {
    if(!this.supportsAction(action))throw new Error("action not enabled: "+action);
    try {
      const editor=await identifyUnityEditor(this.config.projectPath,this.config.bridgePort);
      const client=await this.connect();
      if(action==="run-tests")return await this.runTests(client,input,context,editor);
      if(action==="read-console")return await this.readConsole(client,input,context,editor);
      return await this.inspectScene(client,input,context,editor);
    }catch(e) {
      return {outcome:"fail",summary:"Unity Editor task blocked: "+
        (e instanceof Error?e.message:String(e)),
        metadata:{verified:false,projectPath:this.config.projectPath,
          bridgePort:this.config.bridgePort,action}};
    }
  }

  private async runTests(client:StdioMcpClient,input:Record<string,unknown>,
    context:ActionExecutionContext,editor:EditorIdentity):Promise<ActionExecutionResult> {
    const testNames=input.testNames;
    if(!Array.isArray(testNames)||testNames.length===0 ||
       !testNames.every(s=>typeof s==="string"&&s.trim()))
      throw new Error("run-tests requires nonempty exact testNames");
    const mode=input.mode==="EditMode"?"EditMode":"PlayMode";
    const minimumTests=exactInt(input.minimumTests,1);
    const initiated=await client.callTool("run_tests",{
      mode,test_names:testNames,init_timeout:120000,include_failed_tests:true,
    });
    const start=unwrapMcp(initiated.structuredContent);
    if(initiated.isError===true || start.success!==true)
      throw new Error("Unity did not accept run_tests: "+JSON.stringify(start).slice(0,850));
    const id=asObject(start.data).job_id;
    if(typeof id!=="string"||!id)throw new Error("run_tests response missing job ID");

    const maxWaitMs=exactInt(input.maxWaitMs,240000);
    const until=Date.now()+maxWaitMs;
    let final:Record<string,unknown>|undefined;
    let polling=0;
    while(Date.now()<until) {
      // Unity domain reload can briefly delay the test result. Poll the same
      // job ID; NEVER invoke a second run to fake completion.
      const result=await client.callTool("get_test_job",{
        job_id:id,wait_timeout:Math.min(20,Math.max(1,
          Math.floor((until-Date.now())/1000))),include_failed_tests:true,
      });
      const job=unwrapMcp(result.structuredContent);
      if(result.isError===true || job.success!==true)
        throw new Error("get_test_job failed: "+JSON.stringify(job).slice(0,600));
      polling++;
      const status=String(asObject(job.data).status??"");
      if(["succeeded","failed","cancelled","aborted","error"].includes(status)){
        final=job;break;
      }
      if(!["running","queued","pending","initializing"].includes(status))
        throw new Error("unknown Unity job status "+status);
      if(polling>40)break;
    }
    const verification=checkUnityJob(final??{success:false,data:{job_id:id,status:"timeout"}},id,minimumTests);
    const document={source:"live-coplay-unity-mcp",editor,instance:this.instance,
      requested:{mode,testNames,minimumTests},jobId:id,polling,
      finishedAt:new Date().toISOString(),result:final??null,verification};
    const artifact=await this.saveEvidence(context,document);
    return {outcome:verification.passed?"pass":"fail",
      summary:verification.passed?
        `LIVE Unity ${mode} ${verification.passedCount}/${verification.total} passed`:
        "LIVE Unity test rejected: "+verification.reasons.join("; "),
      uri:artifact.uri,
      metadata:{verified:verification.verified,sha256:artifact.sha256,
        projectPath:editor.projectPath,instance:this.instance,
        jobId:id,summary:verification,polling,source:"live-unity-mcp"}};
  }

  private async readConsole(client:StdioMcpClient,input:Record<string,unknown>,
    context:ActionExecutionContext,editor:EditorIdentity):Promise<ActionExecutionResult> {
    const r=await client.callTool("read_console",{
      action:"get",types:["error"],count:exactInt(input.count,40),
    });
    const payload=unwrapMcp(r.structuredContent);
    if(r.isError||payload.success!==true)throw Error("read_console failed");
    const rows=asObject(payload).data;
    const messages=Array.isArray(rows)?rows:[];
    const snapshot=await this.saveEvidence(context,{source:"live-unity-mcp",
      editor,messages,at:new Date().toISOString()});
    return {outcome:messages.length===0?"pass":"fail",
      summary:`Unity console error entries: ${messages.length}`,
      uri:snapshot.uri,metadata:{verified:messages.length===0,
        sha256:snapshot.sha256,errors:messages.length,source:"live-unity-mcp"}};
  }

  private async inspectScene(client:StdioMcpClient,input:Record<string,unknown>,
    context:ActionExecutionContext,editor:EditorIdentity):Promise<ActionExecutionResult> {
    const term=typeof input.searchTerm==="string"?input.searchTerm:"";
    if(!term)throw Error("inspect-scene requires searchTerm");
    const r=await client.callTool("find_gameobjects",{
      search_term:term,search_method:"by_name",include_inactive:true,
    });
    const payload=unwrapMcp(r.structuredContent);
    if(r.isError||payload.success!==true)throw Error("find_gameobjects failed");
    const objects=payload.data;
    const found=(Array.isArray(objects)&&objects.length>0) ||
      (typeof objects==="object"&&objects!==null&&Object.keys(objects).length>0);
    const snapshot=await this.saveEvidence(context,{source:"live-unity-mcp",
      editor,searchTerm:term,objects});
    return {outcome:found?"pass":"fail",summary:`scene query ${term}: ${found?"found":"not found"}`,
      uri:snapshot.uri,metadata:{verified:found,sha256:snapshot.sha256,
        source:"live-unity-mcp"}};
  }

  async close():Promise<void> {
    await this.client?.close();this.client=undefined;this.instance=undefined;
  }
}
