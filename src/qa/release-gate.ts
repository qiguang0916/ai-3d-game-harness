import {createHash} from "node:crypto";
import {readFile,realpath,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";

/**
 * Strict Steam-release evidence policy. Every category must come from a
 * verifiable, same-commit artifact. Simulator replay != native OS input.
 * CI/unit PASS != real macOS Metal Player PASS.
 */
export type ReleaseCategory =
  | "unity-editor" | "game-physics" | "player-visual"
  | "os-input" | "paper-cut" | "performance" | "nondev-build";

export interface ReleaseEvidence {
  category: ReleaseCategory;
  passed: boolean;
  verified: boolean;
  sha256: string;
  commitSha: string;
  source: string;
  capturedAt: string;
  developmentBuild?: boolean;
  /** Immutable local evidence artifact. CLI verifies SHA-256 of its actual bytes. */
  artifactUri?: string;
}
export interface ReleaseDecision {
  passed:boolean; expectedCommit:string; missing:ReleaseCategory[];
  rejected:{category:string;reason:string}[];
}
export const GAME_RELEASE_CRITERIA:ReleaseCategory[]=[
  "unity-editor","game-physics","player-visual",
  "os-input","paper-cut","performance","nondev-build",
];
const sha256=(s:unknown):s is string=>
  typeof s==="string" && /^[a-f0-9]{64}$/.test(s);
const fullCommit=(s:unknown):s is string=>
  typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
/**
 * Refuse unverifiable release manifests even when every field claims PASS.
 * The on-disk evidence must exist, be a normal nonempty file, and exactly
 * match its declared SHA-256. No HTTP, cloud URLs, or arbitrary command exec.
 */
export async function verifyReleaseArtifacts(
  evidence:ReleaseEvidence[],expectedCommit:string,
  required:ReleaseCategory[]=GAME_RELEASE_CRITERIA,
):Promise<ReleaseDecision> {
  const problems:{category:string;reason:string}[]=[];
  const checked:ReleaseEvidence[]=[];
  for(const item of evidence) {
    let verified=false;
    try {
      if(typeof item.artifactUri!=="string" ||
         !item.artifactUri.startsWith("file://"))
        throw Error("missing local file:// evidence artifact");
      const file=fileURLToPath(item.artifactUri);
      const actual=await realpath(file);
      const details=await stat(actual);
      if(!details.isFile()||details.size<1||details.size>256*1024*1024)
        throw Error("artifact not a valid 1B..256MB regular file");
      const bytes=await readFile(actual);
      const sha=createHash("sha256").update(bytes).digest("hex");
      if(sha!==item.sha256)throw Error("evidence hash mismatch");
      verified=true;
    }catch(error) {
      problems.push({category:String(item.category??"unknown"),
        reason:"artifact verification rejected: "+
          (error instanceof Error?error.message:String(error))});
    }
    checked.push({...item,verified:verified&&item.verified===true});
  }
  const decision=evaluateReleaseGate(checked,expectedCommit,required);
  decision.rejected.push(...problems);
  decision.passed=decision.passed&&decision.rejected.length===0;
  return decision;
}

export function evaluateReleaseGate(
  evidence:ReleaseEvidence[],expectedCommit:string,
  required:ReleaseCategory[]=GAME_RELEASE_CRITERIA,
):ReleaseDecision {
  const rejected:{category:string;reason:string}[]=[];
  if(!fullCommit(expectedCommit))
    rejected.push({category:"manifest",reason:"expected commit must be 40 hex chars"});
  const missing:ReleaseCategory[]=[];
  for(const category of required) {
    const candidates=evidence.filter(x=>x.category===category);
    if(!candidates.length){missing.push(category);continue;}
    const passing=candidates.filter(x=>{
      if(x.passed!==true||x.verified!==true)return false;
      if(!sha256(x.sha256)||x.commitSha!==expectedCommit)return false;
      if(!Number.isFinite(Date.parse(x.capturedAt)))return false;
      if(category==="os-input"&&x.source!=="native-macos-input")return false;
      if(category==="player-visual"&&x.source!=="real-macos-unity-player")return false;
      if(category==="unity-editor"&&x.source!=="live-unity-mcp")return false;
      if(category==="nondev-build"&&x.developmentBuild!==false)return false;
      if(category==="game-physics"&&
         !["real-macos-unity-player","live-unity-mcp"].includes(x.source))
        return false;
      return true;
    });
    if(passing.length===0) {
      rejected.push({category,reason:"missing verified passing same-commit "+
        "evidence or source authenticity"});
    }
    if(candidates.some(x=>x.passed===false&&x.commitSha===expectedCommit))
      rejected.push({category,reason:"same-commit failing evidence exists"});
  }
  return {passed:rejected.length===0&&missing.length===0,
    expectedCommit,missing,rejected};
}
