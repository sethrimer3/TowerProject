import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "public", "assets", "tilesets", "outside");
const SIZE = 24;
const C = { grass:"#294632", grass2:"#34553a", moss:"#69834a", light:"#91a85c", dark:"#14291f", soil:"#625443", soil2:"#7b6b53", bark:"#574332", bark2:"#806047", stone:"#66706b", stone2:"#92998b", outline:"#101a19" };
const rgba = h => [...h.matchAll(/[0-9a-f]{2}/gi)].map(m=>parseInt(m[0],16)).concat(255);
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0};
const chunk=(t,d)=>{const n=Buffer.from(t),l=Buffer.alloc(4),r=Buffer.alloc(4);l.writeUInt32BE(d.length);r.writeUInt32BE(crc(Buffer.concat([n,d])));return Buffer.concat([l,n,d,r])};
function save(name,p){const raw=Buffer.alloc((SIZE*4+1)*SIZE);for(let y=0;y<SIZE;y++){const row=y*(SIZE*4+1);for(let x=0;x<SIZE;x++)Buffer.from(p[y*SIZE+x]).copy(raw,row+1+x*4)}const h=Buffer.alloc(13);h.writeUInt32BE(SIZE,0);h.writeUInt32BE(SIZE,4);h[8]=8;h[9]=6;writeFileSync(join(OUT,name),Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),chunk("IHDR",h),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]))}
const canvas=c=>Array.from({length:SIZE*SIZE},()=>rgba(c));
const rect=(p,x,y,w,h,c)=>{const ink=rgba(c);for(let yy=Math.max(0,y);yy<Math.min(SIZE,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(SIZE,x+w);xx++)p[yy*SIZE+xx]=ink};
const px=(p,a,c)=>a.forEach(([x,y])=>rect(p,x,y,1,1,c));
function ground(v,path=false){const p=canvas(path?C.soil:C.grass);for(let y=0;y<24;y+=4)for(let x=0;x<24;x+=4){if((x*3+y+v*5)%11<5)rect(p,x,y,3,2,path?C.soil2:C.grass2)}px(p,[[2+v,3],[9,7+v],[17-v,4],[20,15],[5,20-v],[13,18]],path?C.stone2:C.moss);if(!path){px(p,[[3,4],[4,3],[4,5],[11+v,15],[12+v,14],[12+v,16]],C.light)}else{px(p,[[4,11],[15,3],[19,18],[8,20],[12,9]],C.stone)}return p}
function tree(v){const p=ground(v);rect(p,7,19,12,3,C.dark);rect(p,10,12,5,10,C.outline);rect(p,11,13,3,9,C.bark);rect(p,12,13,2,8,C.bark2);const layers=v===0?[[10,1,5],[7,5,11],[4,10,17],[2,15,21]]:v===1?[[13,1,4],[9,5,12],[5,9,18],[3,14,20]]:[[8,2,5],[5,6,12],[3,11,17],[1,16,20]];for(const [x,y,w] of layers){rect(p,x,y,w,3,C.outline);rect(p,x+2,y-1,w-4,2,C.moss);rect(p,x+1,y+1,w-2,2,v===1?"#244631":C.grass2);px(p,[[x+2,y],[x+w-3,y+1]],C.light)}return p}
function rock(v){const p=ground(v);rect(p,4,8,17,12,C.outline);rect(p,6,6,12,3,C.outline);rect(p,5,10,15,9,C.stone);rect(p,7,7,10,4,C.stone2);rect(p,6,13,5,5,"#778078");rect(p,14,11,5,7,"#4d5956");rect(p,5,8,9,2,C.moss);rect(p,8+v*4,6,7,2,C.light);px(p,[[7,12],[13,9],[17,15],[10,18]],"#aeb2a3");return p}
mkdirSync(OUT,{recursive:true});
const files=[];for(let i=0;i<4;i++){const n=`grass_0${i+1}.png`;save(n,ground(i));files.push(n)}for(let i=0;i<3;i++){const n=`path_0${i+1}.png`;save(n,ground(i,true));files.push(n)}for(let i=0;i<3;i++){const n=`tree_0${i+1}.png`;save(n,tree(i));files.push(n)}for(let i=0;i<2;i++){const n=`boulder_0${i+1}.png`;save(n,rock(i));files.push(n)}
writeFileSync(join(OUT,"tileset.json"),JSON.stringify({tileSize:24,grass:files.slice(0,4),path:files.slice(4,7),trees:files.slice(7,10),boulders:files.slice(10)},null,2)+"\n");
console.log(`Generated ${files.length} deterministic outside sprites in ${OUT}`);
