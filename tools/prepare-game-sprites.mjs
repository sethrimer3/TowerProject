// Production PNGs from the generated atlases plus palette-normalized terrain
// and Equipment's existing deliberately drawn silhouettes. ImageMagick is
// required only for authoring; the shipped game loads PNGs directly.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { ICON_SPRITES, WORLD_SPRITES, CONTROL_SPRITES, NAMED_ENEMY_SPRITES } from "../src/sprite-kit.ts";
import { ICON_ROWS, ICON_PALETTE } from "../src/ui/equipment-icons.ts";
import { CARD_SPRITE_SUBJECTS } from "../src/sprite-cards.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "public/assets/style");
const source = join(root, "assets/game-sprites");
const palette = join(root, "assets/ui-sprites/palette.ppm");
const temp = join(root, "test-results/sprite-preparation");
mkdirSync(out, { recursive: true });
mkdirSync(temp, { recursive: true });
const run = (args) => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject);
  p.on("exit", code => code === 0 ? resolve() : reject(new Error(`ImageMagick exit ${code}`)));
});
const cardsOnly = process.argv.includes("--cards-only");
const manifest = cardsOnly ? JSON.parse(readFileSync(join(out,"manifest.json"),"utf8")) : { palette: "../ui/frames/manifest.json", nativeSize: 24, assets: {}, terrain: {} };
if (!cardsOnly) for (const [file, ids] of [["icons.png", ICON_SPRITES], ["world.png", WORLD_SPRITES], ["controls.png", CONTROL_SPRITES]]) {
  const image = join(source, file), header = readFileSync(image);
  const w = header.readUInt32BE(16), h = header.readUInt32BE(20);
  const columns = file === "controls.png" ? 4 : 6;
  // Measured gutters in the selected images: generated rows have unequal
  // outer margins. Equal-height crops would leak neighboring silhouettes.
  const rowEdges = file === "icons.png" ? [50, 255, 447, 643, 843, 1032, 1235]
    : file === "world.png" ? [16, 208, 404, 601, 791, 982, 1170]
    : [70, 345, 630, 915, 1215];
  for (const [i, id] of ids.entries()) {
    const row = Math.floor(i / columns);
    const x = Math.round(i % columns * w / columns), y = rowEdges[row];
    const cw = Math.round((i % columns + 1) * w / columns) - x, ch = rowEdges[row + 1] - y;
    const building = file === "world.png" && i >= 18 && i < 28;
    const n = building ? 48 : 24, inner = n - 4;
    await run([image, "-crop", `${cw}x${ch}+${x}+${y}`, "+repage", "-channel", "A", "-threshold", "85%", "+channel",
      "-trim", "+repage", "-filter", "point", "-resize", `${inner}x${inner}`, "-background", "none",
      "-gravity", file === "world.png" && !building ? "south" : "center", "-extent", `${n}x${n}`,
      "+dither", "-remap", palette, "-strip", `PNG32:${join(out, `${id}.png`)}`]);
    manifest.assets[id] = { file: `${id}.png`, width: n, height: n };
  }
}

if (!cardsOnly) for (const [folder, names, prefix] of [["enemies", NAMED_ENEMY_SPRITES, "enemy"], ["materials", ["iron-bar", "steel-bar", "silversteel-bar", "embersteel-bar", "starsteel-bar", "voidsteel-bar"], "metal"]]) {
  for (const name of names) {
    const id = `${prefix}-${name}`;
    await run([join(root,`public/assets/${folder}/${name}.png`),"-channel","A","-threshold","50%","+channel","-filter","point","-resize","24x24!","+dither","-remap",palette,"-strip",`PNG32:${join(out,`${id}.png`)}`]);
    manifest.assets[id]={file:`${id}.png`,width:24,height:24};
  }
}

// Equipment retains each Unique piece's own silhouette, exported as true
// PNGs rather than live SVGs, remapped to exactly the same material palette.
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; return c; });
const chunk = (type, data) => {
  const name=Buffer.from(type), len=Buffer.alloc(4), sum=Buffer.alloc(4); len.writeUInt32BE(data.length);
  let c=0xffffffff; for(const b of Buffer.concat([name,data])) c=crcTable[(c^b)&255]^(c>>>8);
  sum.writeUInt32BE((c^0xffffffff)>>>0); return Buffer.concat([len,name,data,sum]);
};
if (!cardsOnly) for (const [id, rows] of Object.entries(ICON_ROWS)) {
  const raw = Buffer.alloc((24*4+1)*24);
  rows.forEach((row,y)=>[...row].forEach((key,x)=>{
    const color=ICON_PALETTE[key]; if(!color)return;
    const rgba=Buffer.from([...color.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16)).concat(255));
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) rgba.copy(raw,(y*2+dy)*(24*4+1)+1+(x*2+dx)*4);
  }));
  const header=Buffer.alloc(13);header.writeUInt32BE(24);header.writeUInt32BE(24,4);header[8]=8;header[9]=6;
  const intermediate=join(temp,`${id}.png`);
  writeFileSync(intermediate,Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),chunk("IHDR",header),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));
  await run([intermediate,"+dither","-remap",palette,"-strip",`PNG32:${join(out,`equip-${id}.png`)}`]);
  manifest.assets[`equip-${id}`]={file:`equip-${id}.png`,width:24,height:24};
}

// Pack all biome and forest textures into a single 24-pixel atlas. Existing
// adjacency and biome choices stay intact; no gameplay generation changes.
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const terrain = [...walk(join(root,"public/assets/tilesets")), ...walk(join(root,"public/assets/defend")).filter(p=>/floor-\d\.png$/.test(p))].filter(p=>p.endsWith(".png") && !/\/(items|doors)\//.test(p)).sort();
const tiles=[];
if (!cardsOnly) for(const [i,path]of terrain.entries()){
  const tile=join(temp,`terrain-${i}.png`);
  await run([path,"-filter","point","-resize","24x24!","-channel","A","-threshold","50%","+channel","+dither","-remap",palette,"-strip",`PNG32:${tile}`]);
  tiles.push(tile);manifest.terrain[path.slice(join(root,"public/assets/").length)]={x:i%16*24,y:Math.floor(i/16)*24};
}
// montage is a subcommand, so it precedes the shared thread limit.
if (!cardsOnly) await new Promise((resolve,reject)=>{
  const p=spawn("magick",["montage","-limit","thread","1",...tiles,"-tile","16x","-geometry","24x24+0+0","-background","none",`PNG32:${join(out,"terrain.png")}`],{stdio:"inherit",timeout:60000});
  p.on("error",reject);p.on("exit",code=>code===0?resolve():reject(new Error(`montage exit ${code}`)));
});
writeFileSync(join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
if (!cardsOnly) writeFileSync(join(root,"src/sprite-terrain-index.ts"),"// Generated by tools/prepare-game-sprites.mjs.\nexport const SPRITE_TERRAIN: Record<string, { x: number; y: number }> = "+JSON.stringify(manifest.terrain,null,2)+";\n");
for (const [id, subject] of Object.entries(CARD_SPRITE_SUBJECTS)) {
  const frame = join(root,"public/assets/ui/frames/slot.png");
  await run(["-size","48x64","xc:none","-filter","point",
    "(",frame,"-crop","48x6+0+0","+repage",")","-geometry","+0+0","-composite",
    "(",frame,"-crop","48x12+0+6","+repage","-resize","48x52!",")","-geometry","+0+6","-composite",
    "(",frame,"-crop","48x6+0+18","+repage",")","-geometry","+0+58","-composite",
    "(",join(out,`${subject}.png`),"-resize","24x24!",")","-geometry","+12+12","-composite","-strip",`PNG32:${join(out,`card-${id}.png`)}`]);
  manifest.assets[`card-${id}`]={file:`card-${id}.png`,width:48,height:64};
}
writeFileSync(join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(`Prepared ${Object.keys(manifest.assets).length} object/card sprites and ${terrain.length} terrain tiles.`);
