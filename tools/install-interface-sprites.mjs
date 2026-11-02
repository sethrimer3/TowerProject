// Deploy only assets used by the SVG-to-PNG interface migration.
import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const native=join(root,'assets/game-sprites/remaining-native'),out=join(root,'public/assets/style');
const prepared=JSON.parse(readFileSync(join(native,'manifest.json'),'utf8'));
const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
let count=0;
for(const [id,a]of Object.entries(prepared.assets)) {
 if(!['arcana-hud','theme-details','theme-frames'].includes(a.batch))continue;
 copyFileSync(join(native,a.file),join(out,a.file));
 manifest.assets[id]={file:a.file,width:a.width,height:a.height};count++;
}
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Installed ${count} interface sprites. Run npm run sprites:manifest before building.`);
