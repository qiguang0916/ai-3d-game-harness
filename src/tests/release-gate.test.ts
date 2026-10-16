import test from "node:test";
import {createHash} from "node:crypto";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {evaluateReleaseGate,verifyReleaseArtifacts,GAME_RELEASE_CRITERIA,
  type ReleaseCategory,type ReleaseEvidence} from "../qa/release-gate.js";

const commit="a".repeat(40);
const now="2026-10-16T07:00:00Z";
function proof(category:ReleaseCategory):ReleaseEvidence {
  return {category,passed:true,verified:true,commitSha:commit,
    sha256:"f".repeat(64),source:
      category==="unity-editor"?"live-unity-mcp":
      category==="os-input"?"native-macos-input":
      category==="player-visual"?"real-macos-unity-player":
      category==="game-physics"?"live-unity-mcp":
      "strict-evidence",capturedAt:now,
    ...(category==="nondev-build"?{developmentBuild:false}:{})};
}
test("release gate accepts only complete same-commit multi-origin evidence",()=>{
 const all=GAME_RELEASE_CRITERIA.map(proof);
 assert.equal(evaluateReleaseGate(all,commit).passed,true);
});
test("release gate never treats scripted replay as native hardware input",()=>{
 const all=GAME_RELEASE_CRITERIA.map(proof);
 const os=all.find(x=>x.category==="os-input")!;
 os.source="scripted-input-replay";
 const result=evaluateReleaseGate(all,commit);
 assert.equal(result.passed,false);
 assert.ok(result.rejected.some(x=>x.category==="os-input"));
});
test("release gate blocks missing paper/cut and non-development evidence",()=>{
 const all=GAME_RELEASE_CRITERIA.filter(x=>x!=="paper-cut").map(proof);
 assert.deepEqual(evaluateReleaseGate(all,commit).missing,["paper-cut"]);
 all.find(x=>x.category==="nondev-build")!.developmentBuild=true;
 assert.equal(evaluateReleaseGate(all,commit).passed,false);
});
test("release gate cannot be weakened by omitted evidence categories",()=>{
  const all=GAME_RELEASE_CRITERIA.map(proof);
  assert.equal(evaluateReleaseGate(all,commit).passed,true);
  // Lower-level API allows targeted tests, but public CLI must enforce
  // GAME_RELEASE_CRITERIA regardless of user manifest overrides.
  const missing=all.filter(x=>x.category!=="os-input");
  assert.equal(evaluateReleaseGate(missing,commit).passed,false);
  assert.ok(evaluateReleaseGate(missing,commit).missing.includes("os-input"));
});

test("release manifest verifies real artifact content, never trusts claims",async()=>{
  const root=await mkdtemp(join(tmpdir(),"harness-release-proof-"));
  try{
    const file=join(root,"real-proof.json");
    const body=Buffer.from('{"unitTests":8,"passed":true}\\n');
    await writeFile(file,body);
    const sha=createHash("sha256").update(body).digest("hex");
    const evidence=GAME_RELEASE_CRITERIA.map(category=>({
      ...proof(category),sha256:sha,artifactUri:pathToFileURL(file).href
    }));
    assert.equal((await verifyReleaseArtifacts(evidence,commit)).passed,true);
    await writeFile(file,Buffer.from('{"unitTests":8,"passed":false}\\n'));
    const tampered=await verifyReleaseArtifacts(evidence,commit);
    assert.equal(tampered.passed,false);
    assert.ok(tampered.rejected.some(r=>r.reason.includes("hash mismatch")));
    evidence[0]!.artifactUri="https://example.invalid/evidence.json";
    assert.equal((await verifyReleaseArtifacts(evidence,commit)).passed,false);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("release gate blocks mismatched commits and outstanding explicit failures",()=>{
 const all=GAME_RELEASE_CRITERIA.map(proof);
 all[0]!.commitSha="b".repeat(40);
 assert.equal(evaluateReleaseGate(all,commit).passed,false);
 all[0]!.commitSha=commit;
 all.push({...proof("game-physics"),passed:false});
 assert.equal(evaluateReleaseGate(all,commit).passed,false);
});
