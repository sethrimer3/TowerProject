// Export retained generated Catacombs sources to the shared native palette.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const root='assets/game-sprites/catacombs-sources',out='public/assets/style';
const manifest=JSON.parse(readFileSync(`${out}/manifest.json`,'utf8'));
const run=args=>args[0]==='identify'?execFileSync('identify',args.slice(1)):execFileSync('convert',['-limit','thread','1',...args]);
const normalize=['-channel','A','-threshold','80%','+channel','-write','mpr:alpha','+dither','-remap','assets/ui-sprites/palette.ppm','mpr:alpha','-compose','CopyAlpha','-composite','-strip'];
function exportCell(sheet,cols,rows,index,id,size=24,content=size-4){
 const source=`${root}/${sheet}.png`;
 const [w,h]=run(['identify','-format','%w %h',source]).toString().split(' ').map(Number);
 const x=Math.floor(index%cols*w/cols),y=Math.floor(Math.floor(index/cols)*h/rows);
 const cw=Math.floor((index%cols+1)*w/cols)-x,ch=Math.floor((Math.floor(index/cols)+1)*h/rows)-y;
 run([source,'-crop',`${cw}x${ch}+${x}+${y}`,'+repage','-channel','A','-threshold','80%','+channel','-trim','+repage','-filter','point','-resize',`${content}x${content}`,'-background','none','-gravity','center','-extent',`${size}x${size}`,...normalize,`PNG32:${out}/${id}.png`]);
 manifest.assets[id]={file:`${id}.png`,width:size,height:size,tile:true};
}
for(const [i,id] of ['wisp','ghost','skeleton','ghoul','vampire','lich','demon'].entries())exportCell('creatures',4,2,i,`catacomb-undead-${id}`);
exportCell('creatures',4,2,7,'forest-mausoleum',72,68);
for(const [i,id] of ['fragments','common','uncommon','rare','epic','legendary','mythic','ancestral'].entries())exportCell('currencies',4,4,i,`catacomb-spirit-${id}`);
for(const [i,id] of ['brass','iron','steel','nickel'].entries()){
 exportCell('currencies',4,4,i+8,`catacomb-ingot-${id}`);
 exportCell('currencies',4,4,i+12,`catacomb-ingot-ui-${id}`);
}
for(const [i,id] of ['skills','spirit','forge','academy','catacombs'].entries())exportCell('icons',3,3,i,`catacomb-menu-${id}`);
for(const [i,id] of ['mxp','loot','speed','mhp'].entries())exportCell('icons',3,3,i+5,`catacomb-buff-${id}`,12,10);
writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared 33 native Catacombs sprites.');
