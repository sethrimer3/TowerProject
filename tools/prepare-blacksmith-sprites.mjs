import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'public/assets/style'),scratch=mkdtempSync(join(tmpdir(),'blacksmith-'));
const palette=join(root,'assets/ui-sprites/palette.ppm'),source=join(root,'assets/game-sprites/blacksmith-effects.png');
const run=args=>new Promise((resolve,reject)=>{const p=spawn('magick',['-limit','thread','1',...args],{stdio:'inherit'});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(`magick ${c}`)))});
const finish=target=>['-channel','A','-threshold','85%','+channel','-write','mpr:original','+dither','-remap',palette,'mpr:original','-compose','CopyAlpha','-composite','-strip',`PNG32:${target}`];
const bytes=readFileSync(source),w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
for(let row=0;row<2;row++){
 const frames=[];
 for(let i=0;i<4;i++){
  const x=Math.round(i*w/4),right=Math.round((i+1)*w/4),y=Math.round(row*h/2),bottom=Math.round((row+1)*h/2),p=join(scratch,`${row}-${i}.png`);frames.push(p);
  const width=row?16:6,height=row?12:6,inner=row?`${[6,8,11,14][i]}x8`:'5x5';
  await run([source,'-crop',`${right-x}x${bottom-y}+${x}+${y}`,'+repage','-channel','A','-threshold','85%','+channel','-trim','+repage','-filter','point','-resize',inner,'-background','none','-gravity',row?'center':'south','-extent',`${width}x${height}`,...finish(p)]);
 }
 await run([...frames,'+append',...finish(join(out,row?'blacksmith-smoke.png':'blacksmith-fire.png'))]);
}
await run([join(out,'blacksmith.png'),'-crop','11x13+33+20','+repage','-background','none','-gravity','center','-extent','13x15',...finish(join(out,'blacksmith-sign.png'))]);
await run([join(out,'blacksmith.png'),'-fill','#10151c','-draw','rectangle 24,29 29,34','-region','11x13+33+20','-channel','A','-evaluate','set','0','+channel','+region',...finish(join(out,'blacksmith-base.png'))]);
const path=join(out,'manifest.json'),m=JSON.parse(readFileSync(path));
for(const [id,width,height]of [['blacksmith-base',48,48],['blacksmith-sign',13,15],['blacksmith-fire',24,6],['blacksmith-smoke',64,12]])m.assets[id]={file:`${id}.png`,width,height};
writeFileSync(path,JSON.stringify(m,null,2)+'\n');
