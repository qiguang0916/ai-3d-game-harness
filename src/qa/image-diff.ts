import { PNG } from "pngjs";

export interface PixelRect { x:number;y:number;width:number;height:number }
export interface ImageCompareOptions {
  region?: PixelRect;
  ignoreRegions?: PixelRect[];
  maxChannelDelta?: number;
  maxDifferentFraction?: number;
  maxMeanAbsoluteDelta?: number;
}
export interface ImageCompareResult {
  passed:boolean;
  width:number;height:number;
  comparedPixels:number;differentPixels:number;
  differentFraction:number;meanAbsoluteDelta:number;largestChannelDelta:number;
  errors:string[];
  diffPng?:Buffer;
}
function bounded(rect:PixelRect,width:number,height:number):boolean {
  return Number.isInteger(rect.x)&&Number.isInteger(rect.y)&&
    Number.isInteger(rect.width)&&Number.isInteger(rect.height)&&
    rect.width>0&&rect.height>0&&rect.x>=0&&rect.y>=0 &&
    rect.x+rect.width<=width&&rect.y+rect.height<=height;
}
function inRect(x:number,y:number,r:PixelRect):boolean {
  return x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height;
}
export function comparePng(
  actualBytes:Buffer,referenceBytes:Buffer,options:ImageCompareOptions={},
):ImageCompareResult {
  const errors:string[]=[];
  let a:PNG,r:PNG;
  try {
    a=PNG.sync.read(actualBytes);
    r=PNG.sync.read(referenceBytes);
  } catch(e) {
    return {passed:false,width:0,height:0,comparedPixels:0,differentPixels:0,
      differentFraction:1,meanAbsoluteDelta:255,largestChannelDelta:255,
      errors:["PNG could not decode: "+String(e).slice(0,150)]};
  }
  if(a.width!==r.width||a.height!==r.height)errors.push("image dimensions mismatch");
  if(a.width*a.height>20_000_000)errors.push("image exceeds 20MP comparison cap");
  const region=options.region??{x:0,y:0,width:a.width,height:a.height};
  if(!bounded(region,a.width,a.height))errors.push("region outside image dimensions");
  const ignores=options.ignoreRegions??[];
  if(ignores.some(item=>!bounded(item,a.width,a.height)))
    errors.push("invalid ignore region");
  const threshold=options.maxChannelDelta??8;
  const maxFraction=options.maxDifferentFraction??.01;
  const maxMean=options.maxMeanAbsoluteDelta??6;
  if(!Number.isFinite(threshold)||threshold<0||threshold>255||
    !Number.isFinite(maxFraction)||maxFraction<0||maxFraction>1||
    !Number.isFinite(maxMean)||maxMean<0||maxMean>255)
    errors.push("invalid image comparison thresholds");
  if(errors.length) return {passed:false,width:a.width,height:a.height,
    comparedPixels:0,differentPixels:0,differentFraction:1,
    meanAbsoluteDelta:255,largestChannelDelta:255,errors};
  const diff=new PNG({width:a.width,height:a.height});
  let compared=0,different=0,totalDelta=0,largest=0;
  for(let y=0;y<a.height;y++) for(let x=0;x<a.width;x++) {
    const idx=(y*a.width+x)*4;
    if(!inRect(x,y,region)||ignores.some(block=>inRect(x,y,block))) {
      diff.data[idx]=16;diff.data[idx+1]=20;diff.data[idx+2]=25;
      diff.data[idx+3]=255;continue;
    }
    compared++;
    let m=0,sum=0;
    for(let channel=0;channel<3;channel++) {
      const d=Math.abs(a.data[idx+channel]!-r.data[idx+channel]!);
      m=Math.max(m,d);sum+=d;
    }
    largest=Math.max(largest,m);totalDelta+=sum/3;
    const bad=m>threshold;
    if(bad)different++;
    const gray=Math.round((a.data[idx]!+a.data[idx+1]!+a.data[idx+2]!)/3);
    diff.data[idx]=bad?255:gray;
    diff.data[idx+1]=bad?40:gray;
    diff.data[idx+2]=bad?55:gray;
    diff.data[idx+3]=255;
  }
  const fraction=compared?different/compared:1;
  const mean=compared?totalDelta/compared:255;
  if(compared===0)errors.push("ROI contains no comparable pixels");
  if(fraction>maxFraction)errors.push("pixel-change fraction exceeds threshold");
  if(mean>maxMean)errors.push("mean absolute RGB delta exceeds threshold");
  return {passed:errors.length===0,width:a.width,height:a.height,
    comparedPixels:compared,differentPixels:different,differentFraction:fraction,
    meanAbsoluteDelta:mean,largestChannelDelta:largest,errors,
    diffPng:PNG.sync.write(diff)};
}
