// node --experimental-transform-types tools/prepare-enemy-sprites.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { decodePng, encodePng } from './ui-atlas-png.mjs';
import { ENEMY_ROSTER, ROSTER_PROFILES, ROSTER_STRENGTHS, ROSTER_TRAITS } from '../src/enemies/roster.ts';

const sourceNames = { attackHeavy:'attack-heavy', balanced:'balanced', defenseHeavy:'defense-heavy' };
const dir = 'public/assets/style';
const previewDir = 'public/assets/enemy-roster';
mkdirSync(previewDir, {recursive:true});
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`));
const width = 512, height = 256, padding = 2, pitch = 28;
const atlas = Buffer.alloc(width * height * 4), regions = {};
let index = 0;
for (const profile of ROSTER_PROFILES) {
  const source = `assets/game-sprites/enemy-sources/${sourceNames[profile]}.png`;
  const input = decodePng(readFileSync(source));
  // Generated sheets can have different top margins: locate the six occupied
  // row bands instead of cutting through creatures with uniform y coordinates.
  const bands = [];
  let start = -1;
  for(let y=0;y<=input.height;y++) {
    let opaque = 0;
    if(y<input.height)for(let x=0;x<input.width;x++)if(input.pixels[(y*input.width+x)*4+3]>192)opaque++;
    if(opaque>5 && start<0)start=y;
    if(opaque<=5 && start>=0){bands.push([start,y]);start=-1;}
  }
  if(bands.length!==6)throw Error(`${source}: expected six separated creature rows; got ${bands.length}`);
  // Keep wide frontal wings and shoulder armor intact: choose an empty
  // column near each nominal cell edge rather than cutting through artwork.
  const columnEdges = bands.map(([top,bottom]) => {
    const edges = [0];
    for(let column=1;column<7;column++) {
      const target=Math.round(input.width*column/7);
      let edge;
      for(let distance=0;distance<=Math.floor(input.width/21)&&edge===undefined;distance++) {
        for(const x of [target-distance,target+distance]) {
          let clear=true;
          for(let y=top;y<bottom;y++)if(input.pixels[(y*input.width+x)*4+3]>=192){clear=false;break;}
          if(clear){edge=x;break;}
        }
      }
      if(edge===undefined)throw Error(`${source}: no clear gutter at column ${column}`);
      edges.push(edge);
    }
    return [...edges,input.width];
  });
  for(const [row,strength] of ROSTER_STRENGTHS.entries())for(const [column,trait] of ROSTER_TRAITS.entries()) {
    const entry = ENEMY_ROSTER.find(e=>e.profile===profile&&e.strength===strength&&e.trait===trait);
    const left=columnEdges[row][column],right=columnEdges[row][column+1];
    const [top,bottom]=bands[row], footprint=[14,16,18,20,21,22][row];
    const file=`${entry.id}.png`;
    const result=spawnSync('magick',['-limit','thread','1',source,'-crop',`${right-left}x${bottom-top}+${left}+${top}`,'+repage',
      '-channel','A','-threshold','75%','+channel','-trim','+repage','-filter','point','-resize',`${footprint}x${footprint}`,
      '-background','none','-gravity','center','-extent','24x24','-write','mpr:alpha','+dither','-remap','assets/ui-sprites/palette.ppm',
      'mpr:alpha','-compose','CopyAlpha','-composite','-strip',`PNG32:${dir}/${file}`],{encoding:'utf8'});
    if(result.status!==0)throw Error(result.stderr||String(result.error));
    const sprite=decodePng(readFileSync(`${dir}/${file}`));
    const x=index%18*pitch+padding,y=Math.floor(index/18)*pitch+padding;
    for(let r=0;r<24;r++)sprite.pixels.copy(atlas,((y+r)*width+x)*4,r*24*4,(r+1)*24*4);
    regions[entry.id]={...entry,file:`../style/${file}`,x,y,width:24,height:24};
    manifest.assets[entry.id]={file,width:24,height:24};
    index++;
  }
}
writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
writeFileSync(`${previewDir}/atlas.png`,encodePng(width,height,atlas));
writeFileSync(`${previewDir}/atlas.json`,JSON.stringify({image:'atlas.png',width,height,padding,camera:"elevated-front-facing-down",regions},null,2)+'\n');
const camera = 'Elevated front view matching hero-down; every enemy faces screen-down with no sideways yaw.';
const hero=readFileSync('public/assets/style/hero-down.png').toString('base64');
const data=readFileSync(`${previewDir}/atlas.png`).toString('base64');
const cards=Object.values(regions).map(e=>`<article data-profile="${e.profile}"><div class="sprite" style="background-position:-${e.x*4}px -${e.y*4}px"></div><b>${e.name}</b><small>${e.strength} · ${e.trait} · ${e.profile}</small></article>`).join('');
writeFileSync(`${previewDir}/preview.html`,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tower Delve bestiary</title><style>body{background:#10151c;color:#eee0b7;font:14px system-ui;margin:24px}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:10px}article{background:#1b2430;border:1px solid #495d69;padding:16px;display:grid;justify-items:center;gap:8px;text-align:center}small{color:#8b9a9d}.reference{display:flex;align-items:center;gap:16px;margin:16px 0}.reference img{width:96px;height:96px;image-rendering:pixelated}.sprite{width:96px;height:96px;image-rendering:pixelated;background-image:url(data:image/png;base64,${data});background-size:2048px 1024px}</style><h1>Tower Delve · New Bestiary</h1><p>126 creatures · six strengths · seven appearances · three stat profiles</p><p>Attack-heavy: fangs and blades. Balanced: dungeon dwellers. Defense-heavy: shells and stone. Shown at 4× native size.</p><div class="reference"><img src="data:image/png;base64,${hero}" alt="Player facing downward"><p>${camera}</p></div><main>${cards}</main>`);
console.log(`Exported ${index} enemies and a lossless padded atlas; updated the style manifest.`);
