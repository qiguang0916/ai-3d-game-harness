import test from "node:test";
import assert from "node:assert/strict";
import { checkUnityJob, unwrapMcp } from "../qa/unity-mcp-result.js";

const finished=(overrides:Record<string,unknown>={}):Record<string,unknown>=>({
  result:{success:true,message:"Test job status retrieved.",data:{
    job_id:"test-123",status:"succeeded",mode:"PlayMode",
    started_unix_ms:1792136153868,finished_unix_ms:1792136163658,
    progress:{completed:8,total:8},
    result:{mode:"PlayMode",summary:{total:8,passed:8,failed:0,skipped:0,
      durationSeconds:1.9,resultState:"Passed"}},
    ...overrides,
  }},
});
test("Coplay wrapped payload unwraps without mistaking transport success for QA success",()=>{
  assert.equal(unwrapMcp(finished()).success,true);
  assert.equal(unwrapMcp({success:true,data:{status:"running"}}).success,true);
});
test("completed real Unity MCP job yields verified, evidence-eligible success",()=>{
  const result=checkUnityJob(finished(),"test-123",8);
  assert.equal(result.passed,true);
  assert.equal(result.total,8);
  assert.equal(result.failed,0);
});
test("strict Unity MCP gate blocks accepted jobs without completed results",()=>{
  const raw=finished({status:"running",finished_unix_ms:0});
  const result=checkUnityJob(raw,"test-123",8);
  assert.equal(result.terminal,false);
  assert.equal(result.passed,false);
  assert.equal(checkUnityJob(finished(),"other-job").passed,false);
});
test("strict Unity MCP gate blocks all semantic mismatches",()=>{
  const cases=[
    {status:"failed"},
    {result:{mode:"PlayMode",summary:{total:8,passed:7,failed:1,
      skipped:0,durationSeconds:1,resultState:"Failed"}}},
    {result:{mode:"PlayMode",summary:{total:8,passed:8,failed:0,
      skipped:1,durationSeconds:1,resultState:"Passed"}}},
    {progress:{total:8,completed:7}},
    {started_unix_ms:0},
  ];
  for(const change of cases) {
    assert.equal(checkUnityJob(finished(change),"test-123",8).passed,false,
      JSON.stringify(change));
  }
  assert.equal(checkUnityJob(finished(),"test-123",9).passed,false);
});
