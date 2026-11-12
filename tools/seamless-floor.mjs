import {readFileSync,writeFileSync} from 'node:fs';
import {decodePng,encodePng} from './ui-atlas-png.mjs';

const SIZE=96;
const wrap=n=>((n%SIZE)+SIZE)%SIZE;
const hash=(x,y)=>((Math.imul(x+31,73856093)^Math.imul(y+17,19349663))>>>0);
/** Rebuild native paving on a torus: shapes cross all panel edges.
 * Colors come from the authored floor, but source-sheet borders and clipped
 * source motifs are never copied into the repeat. No blending or rotation. */
export function seamlessFloor(input,style) {
 const counts=new Map();
 // The outer three pixels may be atlas separators, not material colors.
 for(let y=3;y<input.height-3;y++)for(let x=3;x<input.width-3;x++) {
  const i=(y*input.width+x)*4;if(input.pixels[i+3]!==255)continue;
  const key=[...input.pixels.subarray(i,i+3)].join(',');counts.set(key,(counts.get(key)??0)+1);
 }
 const colors=[...counts.keys()].map(s=>s.split(',').map(Number)).sort((a,b)=>(a[0]*299+a[1]*587+a[2]*114)-(b[0]*299+b[1]*587+b[2]*114));
 if(colors.length<2)throw Error('Floor source needs a material ramp');
 const dark=colors[0],light=colors.at(-1),shade=colors[Math.min(1,colors.length-1)];
 const dominant=[...counts].filter(([s])=>s!==dark.join(',')).sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);
 const pixels=Buffer.alloc(SIZE*SIZE*4);
 const put=(x,y,color)=>{const at=(wrap(y+5)*SIZE+wrap(x+7))*4;pixels[at]=color[0];pixels[at+1]=color[1];pixels[at+2]=color[2];pixels[at+3]=255;};
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)put(x,y,dark);
 const fillFor=(x,y)=>hash(wrap(x),wrap(y))%5===0?colors[Math.max(1,colors.length-2)]:dominant;
 const rect=(x,y,w,h,fill=fillFor(x,y))=>{
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++) {
   if(xx===w-1||yy===h-1)put(x+xx,y+yy,dark);
   else if(xx===0||yy===0)put(x+xx,y+yy,light);
   else if(xx===w-2||yy===h-2)put(x+xx,y+yy,shade);
   else {
    // Sparse stepped wear clusters, never a noisy per-pixel dither.
    const wear=hash(wrap(x),wrap(y)),cx=3+(wear>>>5)%Math.max(1,w-7),cy=3+(wear>>>13)%Math.max(1,h-7);
    const chipped=wear%3===0&&((xx===cx&&yy===cy)||(xx===cx+1&&yy===cy)||(xx===cx+1&&yy===cy+1));
    put(x+xx,y+yy,chipped?shade:fill);
   }
  }
 };
 const polygon=(cx,cy,vertices,fill=fillFor(cx,cy))=>{
  const xs=vertices.map(v=>v[0]),ys=vertices.map(v=>v[1]);
  for(let y=Math.min(...ys);y<Math.max(...ys);y++)for(let x=Math.min(...xs);x<Math.max(...xs);x++) {
   let distance=Infinity,bright=false,inside=true;
   for(let i=0;i<vertices.length;i++) {
    const [ax,ay]=vertices[i],[bx,by]=vertices[(i+1)%vertices.length],dx=bx-ax,dy=by-ay;
    const cross=dx*(y+.5-ay)-dy*(x+.5-ax),scale=Math.max(Math.abs(dx),Math.abs(dy));
    if(cross<0){inside=false;break;}
    if(cross/scale<distance){distance=cross/scale;bright=dy-dx<0;}
   }
   if(inside)put(cx+x,cy+y,distance<.7?dark:distance<1.7?(bright?light:shade):fill);
  }
 };
 if(style==='cobbles') {
  const seeds=[];
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){const h=hash(x,y);seeds.push({x:x*24+5+h%14,y:y*24+5+(h>>>8)%14});}
  const dist=(a,b)=>{const d=wrap(a-b+48)-48;return d;};
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++) {
   const near=seeds.map((s,i)=>({i,dx:dist(x,s.x),dy:dist(y,s.y)})).map(p=>({...p,d:p.dx*p.dx+p.dy*p.dy})).sort((a,b)=>a.d-b.d);
   const a=near[0],b=near[1],gap=(b.d-a.d)/Math.max(1,2*Math.sqrt((a.dx-b.dx)**2+(a.dy-b.dy)**2));
   const bright=a.dx-b.dx+a.dy-b.dy<0;
   put(x,y,gap<.65?dark:gap<1.65?(bright?light:shade):fillFor(seeds[a.i].x,seeds[a.i].y));
  }
 } else if(style==='diamonds'||style==='mosaic') {
  const half=style==='mosaic'?8:12,span=half*2;
  for(let row=-1;row<=SIZE/half+1;row++)for(let col=-2;col<=SIZE/span+1;col++) {
   const x=col*span+row*half,y=row*half;
   const fill=row%2===0?dominant:(style==='diamonds'?light:colors[Math.max(1,colors.length-2)]);
   polygon(x,y,[[0,-half],[half,0],[0,half],[-half,0]],fill);
   if(style==='mosaic'){put(x+half-1,y,light);put(x+half,y,light);}
  }
 } else if(style==='hexagons') {
  for(let q=-2;q<6;q++)for(let r=-3;r<6;r++)polygon(q*24,r*24+q*12,[[16,0],[8,12],[-8,12],[-16,0],[-8,-12],[8,-12]]);
 } else if(style==='octagons') {
  for(let y=-1;y<5;y++)for(let x=-1;x<5;x++) {
   polygon(x*24,y*24,[[8,-12],[12,-8],[12,8],[8,12],[-8,12],[-12,8],[-12,-8],[-8,-12]]);
   rect(x*24+9,y*24+9,6,6,shade);
  }
 } else if(style==='triangles') {
  for(let y=-1;y<5;y++)for(let x=-1;x<5;x++) {
   polygon(x*24,y*24,[[0,0],[24,0],[0,24]],dominant);
   polygon(x*24,y*24,[[24,0],[24,24],[0,24]],colors[Math.max(1,colors.length-2)]);
  }
 } else if(style==='herringbone') {
  for(let y=-2;y<10;y++)for(let x=-2;x<10;x++) {
   const n=((x+y)%4+4)%4;if(n===0)rect(x*12,y*12,24,12);else if(n===2)rect(x*12,y*12,12,24);
  }
 } else if(style==='slabs'||style==='iron') {
  for(let row=-1;row<9;row++)for(let col=-1;col<5;col++) {
   const x=col*24+(row%2)*12,y=row*12;rect(x,y,24,12);
   if(style==='iron')for(const [xx,yy] of [[2,2],[20,2],[2,8],[20,8]])put(x+xx,y+yy,light);
  }
 } else if(style==='marble') {
  for(let y=-1;y<5;y++)for(let x=-1;x<5;x++) {
   rect(x*24,y*24,24,24);polygon(x*24,y*24,[[0,-3],[3,0],[0,3],[-3,0]],shade);
   // One restrained chipped vein rather than fine grain or dithering.
   for(let i=5;i<13;i++)put(x*24+i,y*24+Math.floor(i/2)+5,shade);
  }
 } else if(style==='inlay') {
  for(let row=-1;row<3;row++)for(let col=-1;col<3;col++) {
   const x=col*48,y=row*48;
   rect(x,y,32,12);rect(x+32,y,16,32);rect(x+12,y+32,36,16);rect(x,y+12,12,36);rect(x+12,y+12,20,20);
  }
 } else if(style==='flagstones') {
  for(let row=-1;row<3;row++)for(let col=-1;col<3;col++) {
   const x=col*48,y=row*48;
   for(const [xx,yy,w,h] of [[0,0,32,16],[32,0,16,32],[0,16,16,32],[16,16,16,16],[16,32,32,16]])rect(x+xx,y+yy,w,h);
  }
 } else throw Error(`Unknown seamless floor style: ${style}`);
 return {width:SIZE,height:SIZE,pixels};
}
export function finishSeamlessFloor(path,style){const image=seamlessFloor(decodePng(readFileSync(path)),style);writeFileSync(path,encodePng(image.width,image.height,image.pixels));}
