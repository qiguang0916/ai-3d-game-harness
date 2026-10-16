/** Interpret Coplay's actual async TestJob lifecycle, never invocation success. */
export interface JobVerification {
  verified: boolean;
  terminal: boolean;
  passed: boolean;
  jobId: string;
  status: string;
  total: number;
  passedCount: number;
  failed: number;
  skipped: number;
  durationSeconds: number;
  reasons: string[];
  failedCases: string[];
}
type ObjectMap=Record<string,unknown>;
const rec=(x:unknown):ObjectMap=>
  x!==null&&typeof x==="object"&&!Array.isArray(x)?x as ObjectMap:{};
export const unwrapMcp=(value:unknown):ObjectMap=>{
  const root=rec(value);
  // Coplay run_tests/get_test_job returns structuredContent.result,
  // whereas set_active_instance returns structuredContent directly.
  const nested=rec(root.result);
  return Object.keys(nested).length>0?nested:root;
};

export function checkUnityJob(raw: unknown, expectedJobId: string,
 minimumTests = 1):JobVerification {
  const envelope=unwrapMcp(raw);
  const data=rec(envelope.data);
  const result=rec(data.result);
  const summary=rec(result.summary);
  const progress=rec(data.progress);
  const reasons:string[]=[];
  const failedCases=Array.isArray(progress.failures_so_far)?
    progress.failures_so_far.map(f=>{
      const failure=rec(f);
      return String(failure.full_name??"unknown")+": "+String(failure.message??"");
    }):[];
  const number=(value:unknown,label:string):number=>{
    if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0) {
      reasons.push("invalid "+label);return 0;
    }
    return value;
  };
  const jobId=String(data.job_id??"");
  const status=String(data.status??"");
  const terminal=["succeeded","failed","cancelled","aborted","error"].includes(status);
  if(envelope.success!==true)reasons.push("Unity returned success=false");
  if(jobId!==expectedJobId)reasons.push("returned different or missing job ID");
  if(!terminal)reasons.push("test job is still running or unknown: "+status);
  if(status!=="succeeded")reasons.push("job did not succeed: "+status);
  if(failedCases.length)reasons.push(failedCases.length+" failing Unity assertions");
  // Failed test jobs may not expose a root result summary. Do not replace
  // it with fake zeros or lose the exact failing test names.
  const hasSummary=Object.keys(summary).length>0;
  if(hasSummary && result.mode!=="PlayMode" && result.mode!=="EditMode")
    reasons.push("missing Unity test mode");
  const total=hasSummary?number(summary.total,"summary.total"):0;
  const passedCount=hasSummary?number(summary.passed,"summary.passed"):0;
  const failed=hasSummary?number(summary.failed,"summary.failed"):0;
  const skipped=hasSummary?number(summary.skipped,"summary.skipped"):0;
  const complete=number(progress.completed,"progress.completed");
  const progressTotal=number(progress.total,"progress.total");
  if(hasSummary) {
    if(total<minimumTests)reasons.push("test total below minimum");
    if(passedCount!==total||failed||skipped)reasons.push("tests did not all pass");
    if(summary.resultState!=="Passed")reasons.push("Unity test resultState was not Passed");
    if(progressTotal!==total || complete!==total)reasons.push("test progress incomplete");
  } else {
    reasons.push("Unity job did not provide a completed test summary");
  }
  const start=number(data.started_unix_ms,"start timestamp");
  const finish=number(data.finished_unix_ms,"finish timestamp");
  if(start===0||finish<=start)reasons.push("test job has not recorded completion timestamp");
  const durationSeconds=typeof summary.durationSeconds==="number"?
    summary.durationSeconds:Number.NaN;
  if(hasSummary && (!Number.isFinite(durationSeconds)||durationSeconds<0))
    reasons.push("bad test duration");
  return {verified:reasons.length===0,terminal,passed:reasons.length===0,
    jobId,status,total:hasSummary?total:progressTotal,
    passedCount:hasSummary?passedCount:Math.max(0,complete-failedCases.length),
    failed:hasSummary?failed:failedCases.length,skipped,
    durationSeconds:Number.isFinite(durationSeconds)?durationSeconds:0,
    reasons,failedCases};
}
