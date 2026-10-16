import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { QaFileActionAdapter } from "../adapters/qa-file.js";
import { inspectPngHeader, inspectUnityNUnitXml } from "../qa/verify.js";
import type { ActionExecutionContext } from "../adapters/action.js";

const xml=(opts:{result?:string; passed?:number; failed?:number; skipped?:number;
  inconclusive?:number; total?:number; end?:boolean}={}):string=>{
  const total=opts.total??2;
  const passed=opts.passed??2, failed=opts.failed??0, skipped=opts.skipped??0;
  const inconclusive=opts.inconclusive??0;
  const attr=(opts.end===false?"":' end-time="2026-10-15T12:02:00Z"');
  return `<?xml version="1.0" encoding="utf-8"?>
  <test-run result="${opts.result??"Passed"}" total="${total}"
   testcasecount="${total}" passed="${passed}" failed="${failed}"
   skipped="${skipped}" inconclusive="${inconclusive}"
   start-time="2026-10-15T12:01:00Z"${attr} duration="59.0">
    <test-suite name="assembly"><test-suite name="fixture">
      <test-case name="A" fullname="A" result="Passed" />
      <test-case name="B" fullname="B" result="Passed" />
    </test-suite></test-suite></test-run>`;
};
test("Unity NUnit parser requires completed consistent 100% passing leaf cases",()=>{
  const accepted=inspectUnityNUnitXml(xml(),2);
  assert.equal(accepted.passed,true);
  assert.deepEqual([accepted.total,accepted.passedCount,accepted.caseCount],[2,2,2]);
  const invalid=[
    ["failed root",xml({result:"Failed",passed:1,failed:1})],
    ["skipped case",xml({passed:1,skipped:1})],
    ["inconclusive",xml({passed:1,inconclusive:1})],
    ["pending run",xml({end:false})],
    ["fake count",xml({total:5,passed:5})],
    ["zero tests",xml({total:0,passed:0})],
    ["truncated",xml().slice(0,-17)],
    ["empty",""],
    ["DTD entity",'<!DOCTYPE test-run [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml()],
  ] as const;
  for(const [name,content] of invalid) {
    assert.equal(inspectUnityNUnitXml(content).passed,false, name);
  }
});
function crc32(buf:Buffer):number {
  let crc=0xffffffff;
  for(const v of buf) {
    crc^=v;
    for(let i=0;i<8;i++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;
  }
  return (crc^0xffffffff)>>>0;
}
function pngChunk(tag:string,payload:Buffer):Buffer {
  const length=Buffer.alloc(4);length.writeUInt32BE(payload.length);
  const body=Buffer.concat([Buffer.from(tag),payload]);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length,body,checksum]);
}
function tinyPng():Buffer {
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);
  ihdr[8]=8;ihdr[9]=6;
  const pixels=deflateSync(Buffer.from([0,255,0,0,255]));
  return Buffer.concat([signature,pngChunk("IHDR",ihdr),
    pngChunk("IDAT",pixels),pngChunk("IEND",Buffer.alloc(0))]);
}
test("PNG verifier checks compression, chunk boundaries, CRC, pixel dimensions",()=>{
  const good=tinyPng();
  assert.equal(inspectPngHeader(good,1,1).valid,true);
  assert.equal(inspectPngHeader(good).valid,false,"tiny PNG cannot replace full screenshot");
  assert.equal(inspectPngHeader(good.subarray(0,-9),1,1).valid,false);
  const corrupted=Buffer.from(good);corrupted[42]=(corrupted[42]??0)^0x40;
  assert.equal(inspectPngHeader(corrupted,1,1).valid,false);
  assert.equal(inspectPngHeader(Buffer.from("fake"),1,1).valid,false);
});
async function sandbox(fn:(root:string)=>Promise<void>) {
  const root=await mkdtemp(join(tmpdir(),"qa-files-harness-"));
  try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}
}
const context=(projectRoot:string):ActionExecutionContext=>({
  projectRoot,
  task:{id:"T-QA",title:"QA",goal:"Verify",kind:"qa",dependencies:[],
    maxAttempts:1,acceptanceCriteria:[{id:"A",description:"Test",requiredEvidence:["test"]}]},
  step:{id:"verify",adapter:"files",action:"unity-xml",criterionId:"A",evidenceType:"test"},
  state:{version:1,tasks:{"T-QA":{taskId:"T-QA",status:"running",
    attempts:1,evidenceIds:[]}}},
});
test("local QA adapter stores SHA evidence; missing and dangerous paths fail",async()=>{
  await sandbox(async root=>{
    const source=join(root,"nunit.xml");
    await writeFile(source,xml(),"utf8");
    const adapter=new QaFileActionAdapter("files",{type:"qa-file",
      actions:["unity-xml","png","json-pass","log-markers","project-identity"]});
    const result=await adapter.executeAction("unity-xml",{path:source,minimumTests:2},context(root));
    assert.equal(result.outcome,"pass");
    assert.match(result.uri??"",/^file:\/\//);
    assert.equal(typeof result.metadata?.sha256,"string");
    const stored=await readFile(new URL(result.uri!),"utf8");
    assert.equal(stored,xml());
    await writeFile(source,xml({result:"Failed",passed:1,failed:1}),"utf8");
    const fail=await adapter.executeAction("unity-xml",{path:source},context(root));
    assert.equal(fail.outcome,"fail");
    assert.notEqual(fail.uri,result.uri,"older passing evidence remains immutable");
    const missing=await adapter.executeAction("unity-xml",{path:join(root,"missing.xml")},context(root));
    assert.equal(missing.outcome,"fail");
    await sandbox(async outside=>{
      const forbidden=join(outside,"private.xml");
      await writeFile(forbidden,xml(),"utf8");
      const blocked=await adapter.executeAction("unity-xml",{path:forbidden},context(root));
      assert.equal(blocked.outcome,"fail");
      const link=join(root,"symlink.xml");await symlink(forbidden,link);
      assert.equal((await adapter.executeAction("unity-xml",{path:link},context(root))).outcome,"fail");
    });
  });
});
test("QA adapter verifies PNG and strict pixel report semantics",async()=>{
  await sandbox(async root=>{
    const adapter=new QaFileActionAdapter("files",{type:"qa-file",actions:["png","json-pass","json-check"]});
    const img=join(root,"img.png");await writeFile(img,tinyPng());
    assert.equal((await adapter.executeAction("png",{path:img,minWidth:1,minHeight:1},context(root))).outcome,"pass");
    assert.equal((await adapter.executeAction("png",{path:img},context(root))).outcome,"fail");
    const report=join(root,"color.json");
    await writeFile(report,JSON.stringify({all_passed:true,screenshots:[{passed:true},{passed:true}]}));
    assert.equal((await adapter.executeAction("json-pass",{path:report,minimumItems:2},context(root))).outcome,"pass");
    await writeFile(report,JSON.stringify({all_passed:true,screenshots:[{passed:true},{passed:false}]}));
    assert.equal((await adapter.executeAction("json-pass",{path:report},context(root))).outcome,"fail");
    await writeFile(report,JSON.stringify({leftPassed:true,rightPassed:true,
      returnPassed:true,peakPenetrationMetres:.0004,errors:[]}));
    const checks=[
      {path:"leftPassed",operator:"equals",value:true},
      {path:"rightPassed",operator:"equals",value:true},
      {path:"errors.length",operator:"equals",value:0},
      {path:"peakPenetrationMetres",operator:"lt",value:.002},
    ];
    assert.equal((await adapter.executeAction("json-check",{path:report,checks},context(root))).outcome,"pass");
    await writeFile(report,JSON.stringify({leftPassed:true,rightPassed:false,
      returnPassed:true,peakPenetrationMetres:.05,errors:["bad contact"]}));
    assert.equal((await adapter.executeAction("json-check",{path:report,checks},context(root))).outcome,"fail");
    assert.equal((await adapter.executeAction("json-check",{path:report,checks:[]},context(root))).outcome,"fail",
      "empty checks must never be a successful test");
  });
});
test("project identity is read-only and checks branch/version/dirty flag",async()=>{
  await sandbox(async root=>{
    const game=join(root,"unity");await mkdir(join(game,"ProjectSettings"),{recursive:true});
    await writeFile(join(game,"ProjectSettings","ProjectVersion.txt"),"m_EditorVersion: 6000.6.3f1\n");
    const {execFile}=await import("node:child_process");
    const {promisify}=await import("node:util");const exec=promisify(execFile);
    await exec("git",["-C",game,"init","-b","main"]);
    await exec("git",["-C",game,"-c","user.name=Harness Test",
      "-c","user.email=harness-test@example.invalid","commit","--allow-empty","-m","baseline"]);
    const adapter=new QaFileActionAdapter("files",{type:"qa-file",actions:["project-identity"]});
    const ok=await adapter.executeAction("project-identity",{path:game,branch:"main",
      unityVersion:"6000.6.3f1"},context(root));
    assert.equal(ok.outcome,"pass");
    assert.equal((await adapter.executeAction("project-identity",{path:game,
      branch:"release"},context(root))).outcome,"fail");
    assert.equal((await adapter.executeAction("project-identity",{path:game,
      requireClean:true},context(root))).outcome,"fail");
    assert.equal((await adapter.executeAction("project-identity",{path:game,
      requireEditor:true},context(root))).outcome,"fail",
      "A matching real Unity Editor must be present, asset import workers cannot count.");
  });
});
