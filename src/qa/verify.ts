import { XMLParser, XMLValidator } from "fast-xml-parser";
import { inflateSync } from "node:zlib";

export interface UnityTestReport {
  passed: boolean; completed: boolean; total: number; passedCount: number;
  failed: number; skipped: number; inconclusive: number; caseCount: number;
  durationSeconds: number; failedCases: string[]; errors: string[];
}
function record(x: unknown): Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x)
    ? x as Record<string, unknown> : {};
}
function count(x: unknown): number | undefined {
  if (typeof x !== "string" || !/^\d+$/.test(x)) return undefined;
  const n=Number(x); return Number.isSafeInteger(n)?n:undefined;
}
export function inspectUnityNUnitXml(xml: string, minimumTests=1): UnityTestReport {
  const errors: string[]=[];
  const blank:UnityTestReport={passed:false,completed:false,total:0,passedCount:0,
    failed:0,skipped:0,inconclusive:0,caseCount:0,durationSeconds:0,failedCases:[],errors};
  if (!xml.trim()) return {...blank,errors:["empty XML report"]};
  // Unity NUnit XML never needs DTD/external entities. Reject entity
  // expansion payloads before handing them to the XML parser.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    return {...blank,errors:["NUnit XML DTD/entity declarations forbidden"]};
  if (XMLValidator.validate(xml)!==true) return {...blank,errors:["malformed or truncated NUnit XML"]};
  let root: Record<string,unknown>;
  try {
    const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@",
      parseAttributeValue:false,trimValues:false}).parse(xml) as unknown;
    root=record(record(parsed)["test-run"]);
  } catch {return {...blank,errors:["cannot parse NUnit XML"]};}
  if (!Object.keys(root).length) return {...blank,errors:["expected <test-run> root"]};
  const get=(key:string):number=>{
    const v=count(root["@"+key]);
    if(v===undefined){errors.push("invalid test-run."+key);return 0;}
    return v;
  };
  const total=get("total"),passedCount=get("passed"),failed=get("failed");
  const skipped=get("skipped"),inconclusive=get("inconclusive");
  const testcasecount=get("testcasecount");
  const result=String(root["@result"]??"");
  const start=String(root["@start-time"]??""),end=String(root["@end-time"]??"");
  const duration=Number(root["@duration"]);
  const completed=start!=="" && end!=="" && Number.isFinite(Date.parse(start)) &&
    Number.isFinite(Date.parse(end)) && Date.parse(end)>=Date.parse(start) &&
    Number.isFinite(duration) && duration>=0;
  if(!completed)errors.push("test-run not finished / invalid timestamps");
  if(result!=="Passed")errors.push("test-run status="+result);
  if(total<minimumTests)errors.push("total below minimum "+minimumTests);
  if(failed || skipped || inconclusive)errors.push("failed/skipped/inconclusive > 0");
  if(passedCount!==total)errors.push("passed != total");
  if(total!==testcasecount)errors.push("testcasecount != total");
  if(passedCount+failed+skipped+inconclusive!==total)errors.push("root counts inconsistent");
  const cases:Record<string,unknown>[]=[];
  const walk=(node:unknown):void=>{
    if(Array.isArray(node)){node.forEach(walk);return;}
    if(node===null||typeof node!=="object")return;
    for(const [key,value] of Object.entries(node as Record<string,unknown>)){
      if(key==="test-case") {
        if(Array.isArray(value))cases.push(...value.map(record));else cases.push(record(value));
      } else if(key==="test-suite") walk(value);
    }
  };
  walk(root);
  if(cases.length!==total)errors.push("parsed test-case count != total");
  const failedCases=cases.filter(c=>c["@result"]!=="Passed")
    .map(c=>String(c["@fullname"]??c["@name"]??"unknown"));
  if(failedCases.length)errors.push(failedCases.length+" nonpassing test cases");
  return {passed:errors.length===0,completed,total,passedCount,failed,skipped,
    inconclusive,caseCount:cases.length,durationSeconds:Number.isFinite(duration)?duration:0,
    failedCases,errors};
}

export interface PngReport {
  valid:boolean; width:number; height:number; errors:string[];
}
// Validate every chunk boundary and CRC, then actually inflate the IDAT
// stream. Checking only the PNG magic bytes permits truncated evidence.
const crc32=(data:Buffer):number=>{
  let value=0xFFFFFFFF;
  for(const byte of data) {
    value^=byte;
    for(let bit=0;bit<8;bit++) value=(value&1)?(value>>>1)^0xEDB88320:value>>>1;
  }
  return (value^0xFFFFFFFF)>>>0;
};

export function inspectPngHeader(data:Buffer,minWidth=320,minHeight=180):PngReport {
  const errors:string[]=[];
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  if(data.length<45 || !data.subarray(0,8).equals(signature))
    return {valid:false,width:0,height:0,errors:["bad PNG signature/short file"]};
  if(data.readUInt32BE(8)!==13 || data.toString("ascii",12,16)!=="IHDR")
    return {valid:false,width:0,height:0,errors:["missing PNG IHDR"]};
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
  if(width<minWidth || height<minHeight)errors.push("PNG below required dimensions");
  if(width>16384 || height>16384)errors.push("PNG unreasonable dimensions");
  if(data.readUInt8(26)!==0)errors.push("unsupported PNG compression header");
  let offset=8,finished=false;
  const imageChunks:Buffer[]=[];
  while(offset+12<=data.length) {
    const size=data.readUInt32BE(offset),start=offset+8,end=start+size;
    if(size>data.length || end+4>data.length) {
      errors.push("truncated PNG chunk");break;
    }
    const tag=data.toString("ascii",offset+4,offset+8);
    const expected=data.readUInt32BE(end);
    if(crc32(data.subarray(offset+4,end))!==expected)errors.push("PNG CRC mismatch: "+tag);
    if(tag==="IDAT")imageChunks.push(data.subarray(start,end));
    offset=end+4;
    if(tag==="IEND") {
      if(size!==0||offset!==data.length) errors.push("malformed final PNG IEND");
      finished=true;break;
    }
  }
  if(!finished||imageChunks.length===0)errors.push("PNG missing IDAT/IEND");
  if(imageChunks.length>0) {
    try{
      const decoded=inflateSync(Buffer.concat(imageChunks),{maxOutputLength:256*1024*1024});
      if(decoded.length===0)errors.push("empty PNG pixel stream");
    }catch{errors.push("corrupt PNG compressed pixel data");}
  }
  return {valid:errors.length===0,width,height,errors};
}
