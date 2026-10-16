import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { comparePng } from "../qa/image-diff.js";

function example(width=80,height=60):PNG {
  const img=new PNG({width,height});
  for(let i=0;i<img.data.length;i+=4) {
    img.data[i]=65;img.data[i+1]=80;
    img.data[i+2]=96;img.data[i+3]=255;
  }
  return img;
}
test("pixel matcher passes unchanged images and emits inspectable heatmap",()=>{
  const b=PNG.sync.write(example());
  const result=comparePng(b,b,{maxChannelDelta:2,
    maxDifferentFraction:0,maxMeanAbsoluteDelta:0});
  assert.equal(result.passed,true);
  assert.equal(result.differentPixels,0);
  assert.equal(result.comparedPixels,4800);
  assert.ok(result.diffPng);
  assert.equal(PNG.sync.read(result.diffPng!).width,80);
});
test("pixel matcher catches real pixels and permits explicit dynamic masks",()=>{
  const base=example();
  const changed=example();
  for(let y=0;y<20;y++)for(let x=0;x<20;x++) {
    const i=(y*changed.width+x)*4;changed.data[i]=220;
  }
  const original=PNG.sync.write(base);
  const actual=PNG.sync.write(changed);
  const fail=comparePng(actual,original,{
    maxChannelDelta:4,maxDifferentFraction:.001});
  assert.equal(fail.passed,false);
  assert.equal(fail.differentPixels,400);
  const mask=comparePng(actual,original,{
    ignoreRegions:[{x:0,y:0,width:20,height:20}],
    maxChannelDelta:4,maxDifferentFraction:0});
  assert.equal(mask.passed,true);
  assert.equal(mask.comparedPixels,4400);
  const roi=comparePng(actual,original,{
    region:{x:30,y:0,width:20,height:20},
    maxDifferentFraction:0});
  assert.equal(roi.passed,true);
});
test("pixel matcher fails on size mismatch, invalid ROI and invalid PNG",()=>{
  const b=PNG.sync.write(example());
  assert.equal(comparePng(b,PNG.sync.write(example(70,60))).passed,false);
  assert.equal(comparePng(b,b,{region:{x:70,y:50,width:20,height:20}}).passed,false);
  assert.equal(comparePng(Buffer.from("invalid"),b).passed,false);
});
