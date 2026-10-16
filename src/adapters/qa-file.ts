import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { QaFileAdapterConfig } from "../config.js";
import type { ActionAdapter, ActionExecutionContext, ActionExecutionResult } from "./action.js";
import type { AdapterHealth } from "./types.js";
import { inspectPngHeader, inspectUnityNUnitXml } from "../qa/verify.js";

const run = promisify(execFile);
const actions = ["unity-xml", "png", "json-pass", "json-check", "log-markers", "project-identity"] as const;
type QaAction = typeof actions[number];
const isQaAction = (action: string): action is QaAction =>
  actions.some(candidate => candidate === action);

const isWithin = (root: string, child: string): boolean => {
  const rel = relative(root, child);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
};

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(label+" must be nonempty");
  return value;
}
function numeric(value: unknown, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min)
    throw new Error("invalid numeric QA threshold");
  return value;
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every(s=>typeof s==="string"&&s.length>0))
    throw new Error(label+" must be a string array");
  return value as string[];
}

export class QaFileActionAdapter implements ActionAdapter {
  constructor(readonly id: string, private readonly config: QaFileAdapterConfig) {}

  supportsAction(action: string): boolean {
    return isQaAction(action) && this.config.actions.includes(action);
  }

  async healthcheck(): Promise<AdapterHealth> {
    const invalidRoots:string[]=[];
    for (const root of this.config.allowedRoots ?? []) {
      try {
        const actual=await realpath(resolve(root));
        if(!(await stat(actual)).isDirectory())invalidRoots.push(root);
      } catch {invalidRoots.push(root);}
    }
    return {
      ok: invalidRoots.length===0, adapter: this.id,
      details: {transport:"read-only-file-inspection",actions:this.config.actions,
        allowedRoots:this.config.allowedRoots ?? [],invalidRoots,
        performsEditorWrites:false},
    };
  }

  private async resolveSource(source: string, projectRoot: string): Promise<string> {
    const requested = resolve(projectRoot, source);
    const actual = await realpath(requested);
    const roots = [projectRoot, ...(this.config.allowedRoots ?? [])];
    const actualRoots = await Promise.all(roots.map(async r => realpath(resolve(r))));
    if (!actualRoots.some(root => isWithin(root, actual))) {
      throw new Error("artifact outside configured read roots");
    }
    return actual;
  }

  private async snapshot(
    source: string, context: ActionExecutionContext, bytes: Buffer,
  ): Promise<{ uri: string; sha256: string; size: number }> {
    const taskId = context.task.id;
    if (!/^[A-Za-z0-9._-]+$/.test(taskId)) throw new Error("unsafe task id");
    const attempt = context.state.tasks[taskId]?.attempts ?? 0;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const dir = join(context.projectRoot, ".project", "evidence-files", taskId,
      "attempt-"+attempt);
    await mkdir(dir, { recursive: true });
    const filename = basename(source).replace(/[^A-Za-z0-9._-]/g, "_");
    const copyPath = join(dir, sha256.slice(0, 24)+"-"+filename);
    // Same SHA -> immutable evidence. A different later source creates
    // another file and does not erase the failed attempt's original.
    try { await stat(copyPath); } catch { await copyFile(source, copyPath); }
    return { uri: pathToFileURL(copyPath).href, sha256, size: bytes.length };
  }

  async executeAction(
    action: string, input: Record<string, unknown>, context: ActionExecutionContext,
  ): Promise<ActionExecutionResult> {
    if (!this.supportsAction(action)) throw new Error("unsupported QA action: "+action);
    try {
      if (action==="project-identity") return await this.projectIdentity(input,context);
      const source = await this.resolveSource(
        requireString(input.path,"input.path"), context.projectRoot);
      const stats=await stat(source);
      if (!stats.isFile() || stats.size > 24*1024*1024 || stats.size < 1)
        throw new Error("QA artifact not a regular 1B..24MB file");
      const bytes=await readFile(source);
      let passed=false;
      let summary="";
      let checks:Record<string,unknown>={};
      switch(action) {
        case "unity-xml": {
          const min=numeric(input.minimumTests,1,1);
          const result=inspectUnityNUnitXml(bytes.toString("utf8"),min);
          passed=result.passed;
          summary=passed?`NUnit ${result.passedCount}/${result.total} tests passed`:
            "NUnit rejected: "+result.errors.join("; ");
          checks={...result};break;
        }
        case "png": {
          const result=inspectPngHeader(bytes,numeric(input.minWidth,320,1),
            numeric(input.minHeight,180,1));
          passed=result.valid;
          summary=passed?`PNG ${result.width}x${result.height} verified`:
            "PNG rejected: "+result.errors.join("; ");
          checks={...result};break;
        }
        case "json-pass": {
          const json = JSON.parse(bytes.toString("utf8")) as unknown;
          if (json===null || typeof json!=="object" || Array.isArray(json))
            throw new Error("JSON QA report must be an object");
          const report=json as Record<string,unknown>;
          const entries=report.screenshots;
          passed=report.all_passed===true && Array.isArray(entries) &&
            entries.length >= numeric(input.minimumItems,1,1) &&
            entries.every(entry=>entry!==null&&typeof entry==="object"&&
              (entry as Record<string,unknown>).passed===true);
          summary=passed?`JSON QA ${(entries as unknown[]).length} checks passed`:
            "JSON QA missing all_passed=true or positive passing screenshots";
          checks={all_passed:report.all_passed,items:Array.isArray(entries)?entries.length:0};
          break;
        }
        case "json-check": {
          const parsed=JSON.parse(bytes.toString("utf8")) as unknown;
          const source=typeof parsed==="object" && parsed!==null && !Array.isArray(parsed)
            ?parsed as Record<string,unknown>:null;
          const rawChecks=input.checks;
          if(!source||!Array.isArray(rawChecks)||rawChecks.length===0)
            throw new Error("JSON assertions require object and nonempty checks array");
          const failures:string[]=[];
          for(const item of rawChecks) {
            if(item===null || typeof item!=="object" || Array.isArray(item))
              throw new Error("invalid JSON check");
            const rule=item as Record<string,unknown>;
            const path=requireString(rule.path,"json check path");
            const op=requireString(rule.operator,"json check operator");
            let value:unknown=source;
            for(const part of path.split(".")) {
              if(value===null||value===undefined){value=undefined;break;}
              if(Array.isArray(value))value=part==="length"?value.length:
                value[Number(part)];
              else if(typeof value==="object")value=(value as Record<string,unknown>)[part];
              else {value=undefined;break;}
            }
            let ok=false;
            if(op==="exists")ok=value!==undefined&&value!==null;
            else if(op==="equals")ok=isDeepStrictEqual(value,rule.value);
            else if(op==="gte"||op==="gt"||op==="lte"||op==="lt") {
              if(typeof value==="number"&&typeof rule.value==="number")
                ok=op==="gte"?value>=rule.value:op==="gt"?value>rule.value:
                  op==="lte"?value<=rule.value:value<rule.value;
            } else throw new Error("unsupported JSON check operator "+op);
            if(!ok)failures.push(path+" "+op+" "+JSON.stringify(rule.value)+" (got "+JSON.stringify(value)+")");
          }
          passed=failures.length===0;
          summary=passed?`JSON assertions ${rawChecks.length} passed`:
            "JSON assertions failed: "+failures.join("; ");
          checks={evaluated:rawChecks.length,failures};break;
        }
        case "log-markers": {
          const text=bytes.toString("utf8");
          const present=input.mustInclude===undefined?[]:strings(input.mustInclude,"mustInclude");
          const absent=input.mustExclude===undefined?[]:strings(input.mustExclude,"mustExclude");
          const missing=present.filter(s=>!text.includes(s));
          const unexpected=absent.filter(s=>text.includes(s));
          passed=missing.length===0 && unexpected.length===0 && present.length>0;
          summary=passed?`log markers verified (${present.length})`:
            "log failed (missing="+missing.join(",")+"; forbidden="+unexpected.join(",")+")";
          checks={missing,unexpected};break;
        }
      }
      const snapshot=await this.snapshot(source,context,bytes);
      return {
        outcome:passed?"pass":"fail",summary,uri:snapshot.uri,
        metadata:{action,source:source,sha256:snapshot.sha256,bytes:snapshot.size,
          checks,verified:true,snapshotUri:snapshot.uri},
      };
    } catch(error) {
      return {outcome:"fail",summary:"QA inspection blocked: "+
        (error instanceof Error?error.message:String(error)),
        metadata:{action,verified:false}};
    }
  }

  private async projectIdentity(
    input:Record<string,unknown>,context:ActionExecutionContext,
  ):Promise<ActionExecutionResult> {
    const path=await this.resolveSource(requireString(input.path,"input.path"),context.projectRoot);
    const versionFile=join(path,"ProjectSettings","ProjectVersion.txt");
    const raw=await readFile(versionFile,"utf8");
    const version=/m_EditorVersion:\s*(\S+)/.exec(raw)?.[1]??"";
    const {stdout:branchRaw}=await run("git",["-C",path,"branch","--show-current"]);
    const {stdout:shaRaw}=await run("git",["-C",path,"rev-parse","HEAD"]);
    const {stdout:dirtyRaw}=await run("git",["-C",path,"status","--porcelain"]);
    const branch=branchRaw.trim(),sha=shaRaw.trim(),dirty=dirtyRaw.trim()!=="";
    const expectedBranch=typeof input.branch==="string"?input.branch:undefined;
    const expectedVersion=typeof input.unityVersion==="string"?input.unityVersion:undefined;
    const requireClean=input.requireClean===true;
    const requireEditor=input.requireEditor===true;
    const errors:string[]=[];
    if(expectedBranch&&branch!==expectedBranch)errors.push("wrong branch: "+branch);
    if(expectedVersion&&version!==expectedVersion)errors.push("wrong Unity version: "+version);
    if(requireClean&&dirty)errors.push("project dirty");
    // Only read 'ps'; never invoke another Editor nor change which project it owns.
    // AssetImportWorker subprocesses cannot satisfy the identity gate.
    const {stdout:processes}=await run("ps",["-axo","command"]);
    const editorActive=processes.split("\n").some(line=>{
      const idx=line.indexOf("-projectPath ");
      if(idx<0 || !line.includes("/Unity.app/Contents/MacOS/Unity ") ||
          line.includes("-adb2 ") || line.includes("-batchMode ") ||
          line.includes("-batchmode "))return false;
      const observed=line.slice(idx+"-projectPath ".length).split(/\s/)[0];
      return observed===path;
    });
    if(requireEditor&&!editorActive)errors.push("requested Unity Editor is not running for this exact projectPath");
    const result={path,branch,sha,version,dirty,editorActive,verified:errors.length===0,
      errors,checkedAt:new Date().toISOString()};
    const dir=join(context.projectRoot,".project","evidence-files");
    await mkdir(dir,{recursive:true});
    const content=Buffer.from(JSON.stringify(result,null,2)+"\n");
    const sha256=createHash("sha256").update(content).digest("hex");
    const filename=join(dir,"unity-project-identity-"+sha256.slice(0,24)+".json");
    await writeFile(filename,content);
    return {outcome:result.verified?"pass":"fail",
      summary:result.verified?`Unity project ${branch} at ${sha.slice(0,10)}`:
        "Unity identity rejected: "+errors.join("; "),
      uri:pathToFileURL(filename).href,metadata:{...result,sha256}};
  }
}
