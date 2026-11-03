// Lossless 8-bit RGBA PNG packing: preserve every source texel, including alpha.
import {inflateSync,deflateSync} from 'node:zlib';
export function decodePng(png){
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 const type=png[25],channels=type===6?4:type===2?3:1;
 if(png[24]!==8||![2,3,6].includes(type)||png[28]!==0)throw Error('Atlas inputs must be non-interlaced 8-bit RGB, indexed or RGBA PNGs');
 let palette,alpha;const chunks=[];for(let off=8;off<png.length;){const n=png.readUInt32BE(off);const kind=png.toString('ascii',off+4,off+8);if(kind==='PLTE')palette=png.subarray(off+8,off+8+n);if(kind==='tRNS')alpha=png.subarray(off+8,off+8+n);if(kind==='IDAT')chunks.push(png.subarray(off+8,off+8+n));off+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
  const left=x>=channels?pixels[y*stride+x-channels]:0,up=y?pixels[(y-1)*stride+x]:0,corner=x>=channels&&y?pixels[(y-1)*stride+x-channels]:0;
  const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner),paeth=a<=b&&a<=c?left:b<=c?up:corner;
  const filter=raw[y*(stride+1)];if(filter>4)throw Error('Invalid PNG filter');
  pixels[y*stride+x]=raw[y*(stride+1)+x+1]+[0,left,up,Math.floor((left+up)/2),paeth][filter];
 }
 if(type===6)return {width,height,pixels};
 const rgba=Buffer.alloc(width*height*4);
 for(let i=0;i<width*height;i++){
  const index=pixels[i],source=type===3?palette:pixels,at=type===3?index*3:i*3;
  source.copy(rgba,i*4,at,at+3);
  rgba[i*4+3]=type===3?(alpha?.[index]??255):alpha&&pixels[i*3]===alpha.readUInt16BE(0)&&pixels[i*3+1]===alpha.readUInt16BE(2)&&pixels[i*3+2]===alpha.readUInt16BE(4)?0:255;
 }
 return {width,height,pixels:rgba};
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);let c=0xffffffff;for(const b of Buffer.concat([name,data]))c=crcTable[(c^b)&255]^(c>>>8);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([length,name,data,crc]);}
export function encodePng(width,height,pixels){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const stride=width*4,raw=Buffer.alloc((stride+1)*height);
 for(let y=0;y<height;y++)pixels.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
