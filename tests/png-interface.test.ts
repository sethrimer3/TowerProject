import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import {ARCANUM_ICONS} from '../src/ui/arcana-panel.ts';
import {arcaniteIcon,POINTER_SVG} from '../src/ui/dom.ts';
import {categoryIcon} from '../src/ui/equipment-icons.ts';
import {kitIcon} from '../src/sprites/kit.ts';
test('interface source cannot reintroduce inline or linked vector artwork',()=>{
 const scan=(dir:URL)=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=new URL(e.name+(e.isDirectory()?'/':''),dir);if(e.isDirectory())scan(p);else if(/\.(ts|css)$/.test(e.name))assert.doesNotMatch(readFileSync(p,'utf8'),/<svg\b|data:image\/svg|url\([^\n]*\.svg["')]/i,p.pathname);}};
 scan(new URL('../src/',import.meta.url));
});
test('Arcana and shared icons emit PNGs with no vector or theme fallback branch',()=>{
 assert.equal(Object.keys(ARCANUM_ICONS).length,9);
 for(const html of [...Object.values(ARCANUM_ICONS),arcaniteIcon(),POINTER_SVG,categoryIcon('weapon')]){
  assert.match(html,/<img /);assert.doesNotMatch(html,/<svg|theme-art/);
 }
 assert.match(kitIcon('badge-hp','unused','badge-glyph','<b>7</b>'),/<b>7<\/b>/,'live overlays survive');
});
