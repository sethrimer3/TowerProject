import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "public", "assets", "tilesets", "outside");
const SIZE = 24;
const C = { grass:"#294632", grass2:"#34553a", moss:"#69834a", light:"#91a85c", dark:"#14291f", bark:"#574332", bark2:"#806047", stone:"#66706b", stone2:"#92998b", outline:"#101a19" };
const rgba = h => [...h.matchAll(/[0-9a-f]{2}/gi)].map(m=>parseInt(m[0],16)).concat(255);
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0};
const chunk=(t,d)=>{const n=Buffer.from(t),l=Buffer.alloc(4),r=Buffer.alloc(4);l.writeUInt32BE(d.length);r.writeUInt32BE(crc(Buffer.concat([n,d])));return Buffer.concat([l,n,d,r])};
function save(name,p){const raw=Buffer.alloc((SIZE*4+1)*SIZE);for(let y=0;y<SIZE;y++){const row=y*(SIZE*4+1);for(let x=0;x<SIZE;x++)Buffer.from(p[y*SIZE+x]).copy(raw,row+1+x*4)}const h=Buffer.alloc(13);h.writeUInt32BE(SIZE,0);h.writeUInt32BE(SIZE,4);h[8]=8;h[9]=6;writeFileSync(join(OUT,name),Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),chunk("IHDR",h),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]))}
const canvas=c=>Array.from({length:SIZE*SIZE},()=>rgba(c));
const rect=(p,x,y,w,h,c)=>{const ink=rgba(c);for(let yy=Math.max(0,y);yy<Math.min(SIZE,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(SIZE,x+w);xx++)p[yy*SIZE+xx]=ink};
const px=(p,a,c)=>a.forEach(([x,y])=>rect(p,x,y,1,1,c));
function ground(v) {
  const p = canvas(C.grass);
  for (let y = 0; y < SIZE; y += 4) for (let x = 0; x < SIZE; x += 4) {
    if ((x * 3 + y + v * 5) % 11 < 5) rect(p, x, y, 3, 2, C.grass2);
  }
  px(p, [[2+v,3],[9,7+v],[17-v,4],[20,15],[5,20-v],[13,18]], C.moss);
  px(p, [[3,4],[4,3],[4,5],[11+v,15],[12+v,14],[12+v,16]], C.light);
  return p;
}
// Six quiet earth textures share a palette, with no tile-sized border or grid.
const dirtRoll = (x, y, seed) => {
  let h = Math.imul(x + seed * 29, 374761393) ^ Math.imul(y - seed * 17, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function dirt(v) {
  const p = canvas("#66523c");
  const shades = ["#60503a", "#6c5940", "#715d43", "#5e4c38", "#68563e"];
  // Wrap the earth clumps through the edges, so no bright seam frames a tile.
  for (let i = 0; i < 32; i++) {
    const x = Math.floor(dirtRoll(i, 1, v) * SIZE), y = Math.floor(dirtRoll(i, 2, v) * SIZE);
    const w = 2 + Math.floor(dirtRoll(i, 3, v) * 5), h = 1 + Math.floor(dirtRoll(i, 4, v) * 3);
    const ink = shades[i % shades.length];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if ((xx === 0 || xx === w - 1) && yy === 0) continue;
      rect(p, (x + xx) % SIZE, (y + yy) % SIZE, 1, 1, ink);
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(dirtRoll(i, 5, v) * SIZE), y = Math.floor(dirtRoll(i, 6, v) * SIZE);
    rect(p, x, y, 1, 1, i % 3 ? "#705c42" : "#594a37");
  }
  const pebble = (x, y, wide = 2) => {
    rect(p, x, y + 1, wide + 1, 1, "#4e4537");
    rect(p, x, y, wide, 1, "#8b8166");
    rect(p, x + wide - 1, y + 1, 1, 1, "#706953");
  };
  if (v === 1) { pebble(5, 7); pebble(16, 17, 3); pebble(12, 4, 1); }
  if (v === 2) for (let i = 0; i < 13; i++) {
    const x = 3 + Math.floor(dirtRoll(i, 7, v) * 18), y = 3 + Math.floor(dirtRoll(i, 8, v) * 18);
    rect(p, x, y, 1 + i % 2, 1, i % 3 ? "#867454" : "#514532");
  }
  if (v === 3) {
    px(p, [[7,5],[8,6],[8,7],[9,8],[10,8],[11,9],[12,9],[13,10],[13,11],[14,12],[15,12],[10,9],[10,10],[9,11]], "#4e4132");
    px(p, [[7,6],[9,9],[12,10],[14,13],[9,12]], "#7a6347");
  }
  if (v === 4) for (const [x,y,w] of [[5,7,6],[7,9,4],[13,15,7],[14,17,4]]) {
    rect(p, x, y, w, 1, "#7b6446");
    rect(p, x + 1, y + 1, w - 2, 1, "#5b4935");
  }
  if (v === 5) {
    rect(p, 5, 6, 3, 2, "#7b7042"); px(p, [[5,7],[7,6],[17,16]], "#96804d");
    rect(p, 16, 15, 3, 1, "#72663a"); px(p, [[4,8],[8,5],[19,16]], "#4e4c31");
  }
  return p;
}
// Transparent grass fringes are composited only on sides facing off the road.
// Generate the four rotations from one strip so the corners meet cleanly.
function pathEdge(side) {
  const p = Array.from({ length: SIZE * SIZE }, () => [0, 0, 0, 0]);
  for (let x = 0; x < SIZE; x++) {
    const depth = 1 + Math.floor(dirtRoll(x, 31, 9) * 3);
    for (let y = 0; y < depth; y++) {
      const [xx, yy] = side === 0 ? [x, y] : side === 1 ? [SIZE-1-y, x] : side === 2 ? [SIZE-1-x, SIZE-1-y] : [y, SIZE-1-x];
      const colors = [C.grass, C.grass2, "#4c623b", "#384e31"];
      rect(p, xx, yy, 1, 1, y === depth - 1 ? C.dark : colors[(x + y) % colors.length]);
    }
  }
  return p;
}
function tree(v){const p=ground(v);rect(p,7,19,12,3,C.dark);rect(p,10,12,5,10,C.outline);rect(p,11,13,3,9,C.bark);rect(p,12,13,2,8,C.bark2);const layers=v===0?[[10,1,5],[7,5,11],[4,10,17],[2,15,21]]:v===1?[[13,1,4],[9,5,12],[5,9,18],[3,14,20]]:[[8,2,5],[5,6,12],[3,11,17],[1,16,20]];for(const [x,y,w] of layers){rect(p,x,y,w,3,C.outline);rect(p,x+2,y-1,w-4,2,C.moss);rect(p,x+1,y+1,w-2,2,v===1?"#244631":C.grass2);px(p,[[x+2,y],[x+w-3,y+1]],C.light)}return p}
function rock(v){const p=ground(v);rect(p,4,8,17,12,C.outline);rect(p,6,6,12,3,C.outline);rect(p,5,10,15,9,C.stone);rect(p,7,7,10,4,C.stone2);rect(p,6,13,5,5,"#778078");rect(p,14,11,5,7,"#4d5956");rect(p,5,8,9,2,C.moss);rect(p,8+v*4,6,7,2,C.light);px(p,[[7,12],[13,9],[17,15],[10,18]],"#aeb2a3");return p}
mkdirSync(OUT,{recursive:true});
const variants = (prefix, count, paint) => Array.from({ length: count }, (_, i) => {
  const name = `${prefix}_0${i + 1}.png`;
  save(name, paint(i));
  return name;
});
const grass = variants("grass", 4, ground), path = variants("path", 6, dirt);
const trees = variants("tree", 3, tree), boulders = variants("boulder", 2, rock);
const pathEdges = ["top", "right", "bottom", "left"].map((side, i) => {
  const name = `path_edge_${side}.png`;
  save(name, pathEdge(i));
  return name;
});
writeFileSync(join(OUT, "tileset.json"), JSON.stringify({ tileSize: SIZE, grass, path, pathEdges, trees, boulders }, null, 2) + "\n");
console.log(`Generated ${grass.length + path.length + trees.length + boulders.length + pathEdges.length} deterministic outside sprites in ${OUT}`);
