import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {decodePng} from "../tools/ui-atlas-png.mjs";

const ids=[...Array.from({length:10},(_,i)=>`dungeon-floor-masonry-${i}`),...Array.from({length:8},(_,i)=>`dungeon-tower-${i+2}-floor`),...['iron','tideglass','reliquary'].map(id=>`dungeon-lab-${id}-floor`)];
const rgb=(image:ReturnType<typeof decodePng>,x:number,y:number)=>[...image.pixels.subarray((y*image.width+x)*4,(y*image.width+x)*4+3)];
const difference=(a:number[],b:number[])=>a.reduce((n,c,i)=>n+Math.abs(c-b[i]),0)/3;

test("all playable and experimental floor panels have no dark rectangular border or abnormal repeat jump",()=>{
 for(const id of ids) {
  const image=decodePng(readFileSync(new URL(`../public/assets/style/${id}.png`,import.meta.url)));
  assert.deepEqual([image.width,image.height],[96,96]);
  const luma=(c:number[])=>c[0]*299+c[1]*587+c[2]*114;
  let darkest=Infinity;
  for(let y=0;y<96;y++)for(let x=0;x<96;x++)darkest=Math.min(darkest,luma(rgb(image,x,y)));
  for(const side of ['left','right','top','bottom']) {
   let dark=0;
   for(let i=0;i<96;i++) {
    const x=side==='left'?0:side==='right'?95:i,y=side==='top'?0:side==='bottom'?95:i;
    if(luma(rgb(image,x,y))===darkest)dark++;
   }
   assert.ok(dark/96<.65,`${id}: ${side} must not be a dark source-sheet separator`);
  }
  for(const axis of ['x','y']) {
   const mean=(line:number,other:number)=>{
    let sum=0;for(let i=0;i<96;i++)sum+=axis==='x'?difference(rgb(image,line,i),rgb(image,other,i)):difference(rgb(image,i,line),rgb(image,i,other));
    return sum/96;
   };
   const interior=Array.from({length:95},(_,i)=>mean(i,i+1)),wrap=mean(95,0);
   assert.ok(wrap<=Math.max(...interior)+1,`${id}: ${axis} repeat jump ${wrap} exceeds every interior join`);
  }
 }
});

test("every floor repeat retains only approved opaque palette colors",()=>{
 const values=readFileSync(new URL('../assets/ui-sprites/palette.ppm',import.meta.url),'utf8').replace(/#[^\n]*/g,'').trim().split(/\s+/).slice(4).map(Number);
 const allowed=new Set(Array.from({length:values.length/3},(_,i)=>values.slice(i*3,i*3+3).join(',')));
 for(const id of ids) {
  const {pixels}=decodePng(readFileSync(new URL(`../public/assets/style/${id}.png`,import.meta.url)));
  for(let i=0;i<pixels.length;i+=4){assert.equal(pixels[i+3],255,`${id}: opaque floors`);assert.ok(allowed.has([...pixels.subarray(i,i+3)].join(',')),`${id}: shared palette`);}
 }
});
