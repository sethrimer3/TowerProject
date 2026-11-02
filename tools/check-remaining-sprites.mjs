import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const root = new URL('../',import.meta.url);
const dir = new URL('assets/game-sprites/remaining-native/',root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',dir)));
const values=readFileSync(new URL('assets/ui-sprites/palette.ppm',root),'utf8').replace(/#[^\n]*/g,'').trim().split(/\s+/).slice(4).map(Number);
const palette=new Set(Array.from({length:values.length/3},(_,i)=>values.slice(i*3,i*3+3).join(',')));
let checked=0;
for(const [id,asset] of Object.entries(manifest.assets)) {
  const png=readFileSync(new URL(asset.file,dir)), width=png.readUInt32BE(16), height=png.readUInt32BE(20);
  assert.equal(width,asset.width,id); assert.equal(height,asset.height,id);
  assert.equal(png[24],8,id); assert.equal(png[25],6,id);
  const chunks=[];
  for(let off=8;off<png.length;) {const n=png.readUInt32BE(off);if(png.toString('ascii',off+4,off+8)==='IDAT')chunks.push(png.subarray(off+8,off+8+n));off+=n+12;}
  const raw=inflateSync(Buffer.concat(chunks)), stride=width*4, pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++) {
    const left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,corner=x>=4&&y?pixels[(y-1)*stride+x-4]:0;
    const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner),predictor=a<=b&&a<=c?left:b<=c?up:corner;
    const f=raw[y*(stride+1)]; assert.ok(f<=4);
    pixels[y*stride+x]=raw[y*(stride+1)+x+1]+[0,left,up,Math.floor((left+up)/2),predictor][f];
  }
  let opaque=0,transparent=0;
  for(let i=0;i<pixels.length;i+=4) {
    const alpha=pixels[i+3];assert.ok(alpha===0||alpha===255,`${id}: binary alpha`);
    if(alpha) {opaque++;assert.ok(palette.has([...pixels.subarray(i,i+3)].join(',')),`${id}: palette`);}else transparent++;
  }
  assert.ok(opaque>=4,`${id}: visible subject`);
  assert.ok(transparent>0,`${id}: transparency`);
  if(asset.width<=24)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x===0||y===0||x===width-1||y===height-1)assert.equal(pixels[(y*width+x)*4+3],0,`${id}: padding`);
  if(asset.slice)for(let y=8;y<16;y++)for(let x=8;x<40;x++)assert.deepEqual(pixels.subarray((y*width+x)*4,(y*width+x)*4+4),pixels.subarray((12*width+24)*4,(12*width+24)*4+4),`${id}: flat center`);
  checked++;
}
assert.equal(checked,100);
console.log(`Validated ${checked} PNGs: native dimensions, shared palette, binary alpha, padding, visible subjects and flat frame centers.`);
