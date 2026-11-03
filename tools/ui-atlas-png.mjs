// Lossless 8-bit RGBA PNG packing: preserve every source texel, including alpha.
import {inflateSync,deflateSync} from 'node:zlib';
export function decodePng(png){
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(png[24]!==8||png[25]!==6||png[28]!==0)throw Error('Atlas inputs must be non-interlaced 8-bit RGBA PNGs');
 const chunks=[];for(let off=8;off<png.length;){const n=png.readUInt32BE(off);if(png.toString('ascii',off+4,off+8)==='IDAT')chunks.push(png.subarray(off+8,off+8+n));off+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
  const left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,corner=x>=4&&y?pixels[(y-1)*stride+x-4]:0;
  const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner),paeth=a<=b&&a<=c?left:b<=c?up:corner;
  const filter=raw[y*(stride+1)];if(filter>4)throw Error('Invalid PNG filter');
  pixels[y*stride+x]=raw[y*(stride+1)+x+1]+[0,left,up,Math.floor((left+up)/2),paeth][filter];
 }
 return {width,height,pixels};
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);let c=0xffffffff;for(const b of Buffer.concat([name,data]))c=crcTable[(c^b)&255]^(c>>>8);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([length,name,data,crc]);}
export function encodePng(width,height,pixels){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const stride=width*4,raw=Buffer.alloc((stride+1)*height);
 for(let y=0;y<height;y++)pixels.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
