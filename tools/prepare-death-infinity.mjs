// Normalize the retained infinity artwork, then reveal its native pixels along one loop.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePng, encodePng } from './ui-atlas-png.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'death-infinity-'));
try {
  const icon = join(scratch, 'icon.png');
  execFileSync('magick', ['-limit','thread','1','assets/game-sprites/death-infinity.png','-colorspace','gray','-threshold','55%','-trim','+repage','-filter','point','-resize','88x32!','-gravity','center','-background','black','-extent','96x40','-alpha','off','-transparent','black','-fill','#eee0b7','-opaque','white',`PNG32:${icon}`]);
  const { pixels } = decodePng(readFileSync(icon));
  const path = Array.from({length:1024}, (_,i) => {
    const t = i / 1023 * Math.PI * 2;
    return {x:47.5+43.5*Math.sin(t), y:19.5-15.5*Math.sin(t*2)};
  });
  const order = [];
  for (let y=0;y<40;y++) for (let x=0;x<96;x++) {
    if (!pixels[(y*96+x)*4+3]) continue;
    let nearest=0, distance=Infinity;
    for(let i=0;i<path.length;i++) {
      const d=(path[i].x-x)**2+(path[i].y-y)**2;
      if(d<distance){distance=d;nearest=i;}
    }
    order.push({x,y,at:nearest/1023});
  }
  const width=768,height=240, sheet=Buffer.alloc(width*height*4);
  for(let frame=0;frame<48;frame++) {
    const progress=frame/47, ox=frame%8*96,oy=Math.floor(frame/8)*40;
    for(const p of order) if(frame && p.at<=progress) {
      Buffer.from([238,224,183,255]).copy(sheet,((oy+p.y)*width+ox+p.x)*4);
    }
    // A tiny hard-edged traveling glint; no blur or halo.
    if(frame>0 && frame<47) {
      const p=path[Math.round(progress*1023)],x=Math.round(p.x),y=Math.round(p.y);
      for(const [dx,dy] of [[0,-2],[0,2],[-2,0],[2,0]]) {
        const xx=x+dx,yy=y+dy;
        if(xx>=0&&xx<96&&yy>=0&&yy<40)Buffer.from([238,224,183,255]).copy(sheet,((oy+yy)*width+ox+xx)*4);
      }
    }
  }
  const out='public/assets/style';
  writeFileSync(`${out}/death-infinity.png`,encodePng(width,height,sheet));
  const manifest=JSON.parse(readFileSync(`${out}/manifest.json`,'utf8'));
  manifest.assets['death-infinity']={file:'death-infinity.png',width,height,tile:true};
  writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
} finally { rmSync(scratch,{recursive:true,force:true}); }
