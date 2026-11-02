// Generated source art is retained separately from native, palette-correct exports.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'assets/game-sprites/remaining-native');
const palette = join(root, 'assets/ui-sprites/palette.ppm');
mkdirSync(out, { recursive: true });
const batches = {
  'arcana-hud': ['arcana-ricochet-shot','arcana-aurum-bloom','arcana-overseer','arcana-thunderbolt','arcana-lifespring','arcana-time-dilation','arcana-phantasm','arcana-necrotic-frost','arcana-voidwell','hud-aether-shield','ui-card-points','ui-auto-play','ui-hand-swap','ui-chevron-left','ui-chevron-right','ui-chevron-down'],
  'trial-actors': ['trial-light-elemental','trial-keymaster','trial-chest-mimic','trial-light-slime','trial-arcane-spire','trial-dread-obelisk','trial-arcane-wisp','trial-obelisk-sentry','trial-blaster-turret','trial-regen-conduit','trial-ward-crystal','trial-door-spirit'],
  'spell-effects': ['fx-ricochet-impact','fx-thunderbolt-segment','fx-thunderbolt-impact','fx-phantasm-ghost','fx-phantasm-burst','fx-lifespring-wave','fx-lifespring-field','fx-time-dilation-field','fx-necrotic-frost-burst','fx-necrotic-frost-field','fx-voidwell-vortex','fx-voidwell-collapse','fx-elemental-teleport','fx-keymaster-teleport','fx-obelisk-shot','fx-obelisk-pulse'],
  'environment-effects': ['fx-water-ripple-0','fx-water-ripple-1','fx-water-ripple-2','fx-water-ripple-3','fx-water-drop','fx-water-splash','fx-wet-footprints','fx-water-glint','fx-grass-0','fx-grass-1','fx-grass-2','fx-wall-corner','fx-reveal-rays','fx-celebration','fx-equipment-melt','ui-route-mark'],
  'theme-details': ['theme-wood','theme-stone','theme-parchment','theme-corner-frame','theme-wax-seal','theme-divider','theme-sigil','theme-orbit-stars','theme-ember-runes','theme-glyph-runes','theme-zen-circle','theme-vertical-ornament','tree-connector-straight','tree-connector-corner','tree-connector-branch','ui-badge-annotation'],
  'theme-frames': ['pixel','doodle','murk'].flatMap(theme => ['normal','hover','pressed','selected','disabled','danger','field','panel'].map(state => `theme-${theme}-${state}`)),
};
const run = args => new Promise((resolve,reject) => {
  const p=spawn('magick',['-limit','thread','1',...args],{stdio:'inherit'});
  p.on('error',reject); p.on('exit',code=>code===0?resolve():reject(Error(`ImageMagick exit ${code}`)));
});
const manifest = { palette: '../../ui-sprites/palette.ppm', status: 'Generated native assets; renderer integration pending.', assets: {} };
for (const [batch, ids] of Object.entries(batches)) {
  const source = join(root, `assets/game-sprites/remaining-sources/${batch}.png`);
  const header=readFileSync(source), sw=header.readUInt32BE(16), sh=header.readUInt32BE(20);
  const rows = ids.length / 4;
  for (const [i,id] of ids.entries()) {
    const col=i%4, row=Math.floor(i/4), frame=batch==='theme-frames';
    const xs = frame ? [0,320,630,940,sw] : Array.from({length:5},(_,n)=>Math.round(sw*n/4));
    const ys = frame ? [85,280,480,670,860,1045,1225] : Array.from({length:rows+1},(_,n)=>Math.round(sh*n/rows));
    const small = batch==='arcana-hud' && i>=10;
    const width = frame || batch==='theme-details' ? 48 : small ? 12 : 24;
    const height = frame ? 24 : batch==='theme-details' && (i===5 || i>=12 && i<=14) ? 24 : width;
    let inner = frame ? '48x24!' : `${width-4}x${height-4}`;
    if(batch==='environment-effects' && i<4) inner=`${[6,10,16,22][i]}x10`;
    const target=join(out,`${id}.png`);
    const frameCenter = !frame ? [] : ['-fill',i%8===5?'#693239':i%8===4?'#1b2430':Math.floor(i/8)===1?'#eee0b7':Math.floor(i/8)===2?'#29251f':'#1b2430','-draw','rectangle 7,7 40,16'];
    await run([source,'-crop',`${xs[col+1]-xs[col]}x${ys[row+1]-ys[row]}+${xs[col]}+${ys[row]}`,'+repage',
      '-channel','A','-threshold','85%','+channel','-trim','+repage','-filter','point','-resize',inner,
      '-background','none','-gravity','center','-extent',`${width}x${height}`,
      '-channel','A','-threshold','50%','+channel','-write','mpr:alpha','+dither','-remap',palette,
      'mpr:alpha','-compose','CopyAlpha','-composite',...frameCenter,'-strip',`PNG32:${target}`]);
    manifest.assets[id]={file:`${id}.png`,width,height,batch,...(frame?{slice:6}:{}),...(batch==='theme-details'&&i<3?{usage:'surface swatch; seamless tiling not verified'}:{})};
  }
}
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${Object.keys(manifest.assets).length} native PNGs.`);
