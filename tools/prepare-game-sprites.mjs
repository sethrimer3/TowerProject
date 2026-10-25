// Production PNGs from the generated atlases and Equipment's deliberately
// drawn silhouettes. ImageMagick is
// required only for authoring; the shipped game loads PNGs directly.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { ICON_SPRITES, CONTROL_SPRITES, DETAIL_SPRITES } from "../src/sprites/kit.ts";
import { ICON_ROWS, ICON_PALETTE } from "../src/ui/equipment-icons.ts";
import { CARD_SPRITE_LAYERS } from "../src/sprites/cards.ts";
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
const detailsOnly = process.argv.includes("--details-only");
const cardsOnly = detailsOnly || process.argv.includes("--cards-only");
const previousManifest = JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
// Named enemy PNGs are native master assets now, not conversions
// from a second legacy runtime directory. Preserve them and extension atlases.
const manifest = { ...previousManifest, assets: { ...previousManifest.assets } };
// Blank cells preserve the coordinates of retained subjects in the shared atlas.
const WORLD_CELLS = ["hero-up", "hero-right", "hero-down", "hero-left", "skeleton", "slime", "goblin", "orc", "knight", "mage", "bat", "dragon", "troll", "golem", "wraith", "demon", "crystal", "spore", "tower", "cave", "blacksmith", "hall", null, null, null, null, null, null, null, null, "archer", "crate", "barrel", "shrine", "door-wood", "door-steel"];
if (!cardsOnly) for (const [file, ids] of [["icons.png", ICON_SPRITES], ["world.png", WORLD_CELLS], ["controls.png", CONTROL_SPRITES]]) {
  const image = join(source, file), header = readFileSync(image);
  const w = header.readUInt32BE(16), h = header.readUInt32BE(20);
  const columns = file === "controls.png" ? 4 : 6;
  // Measured gutters in the selected images: generated rows have unequal
  // outer margins. Equal-height crops would leak neighboring silhouettes.
  const rowEdges = file === "icons.png" ? [50, 255, 447, 643, 843, 1032, 1235]
    : file === "world.png" ? [16, 208, 404, 601, 791, 982, 1170]
    : [70, 345, 630, 915, 1215];
  for (const [i, id] of ids.entries()) {
    if(!id)continue;
    const row = Math.floor(i / columns);
    const x = Math.round(i % columns * w / columns), y = rowEdges[row];
    const cw = Math.round((i % columns + 1) * w / columns) - x, ch = rowEdges[row + 1] - y;
    const building = file === "world.png" && i >= 18 && i < 28;
    const n = building ? 48 : 24, inner = n - 4;
    await run([image, "-crop", `${cw}x${ch}+${x}+${y}`, "+repage", "-channel", "A", "-threshold", "85%", "+channel",
      "-trim", "+repage", "-filter", "point", "-resize", `${inner}x${inner}`, "-background", "none",
      "-gravity", file === "world.png" && !building ? "south" : "center", "-extent", `${n}x${n}`,
      "-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`]);
    manifest.assets[id] = { file: `${id}.png`, width: n, height: n };
  }
}

// Small dressing exports at 12 native pixels: it paints at 1:1 inside a
// 24-pixel tile, keeping the same pixel density as the larger objects.
if (!process.argv.includes("--cards-only")) for (const [i, id] of DETAIL_SPRITES.entries()) {
  const image = join(source, "details.png");
  const edges = [40, 350, 655, 940, 1230];
  const row = Math.floor(i / 4), x = i % 4 * 313;
  const n = i >= 8 ? 12 : 24, inner = n - 2;
  await run([image, "-crop", `313x${edges[row + 1] - edges[row]}+${x}+${edges[row]}`, "+repage",
    "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage",
    ...(id === "web" ? ["-flop"] : []), "-filter", "point", "-resize", `${inner}x${inner}`,
    "-background", "none", "-gravity", "center", "-extent", `${n}x${n}`,
    "-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`]);
  manifest.assets[id] = { file: `${id}.png`, width: n, height: n };
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
  await run([intermediate,"-write","mpr:original","+dither","-remap",palette,"mpr:original","-compose","CopyAlpha","-composite","-strip",`PNG32:${join(out,`equip-${id}.png`)}`]);
  manifest.assets[`equip-${id}`]={file:`equip-${id}.png`,width:24,height:24};
}

if (!detailsOnly) for (const [id, layers] of Object.entries(CARD_SPRITE_LAYERS)) {
  const frame = join(root,"public/assets/ui/frames/slot.png");
  await run(["-size","48x64","xc:none","-filter","point",
    "(",frame,"-crop","48x6+0+0","+repage",")","-geometry","+0+0","-composite",
    "(",frame,"-crop","48x12+0+6","+repage","-resize","48x52!",")","-geometry","+0+6","-composite",
    "(",frame,"-crop","48x6+0+18","+repage",")","-geometry","+0+58","-composite",
    ...layers.flatMap(({ sprite, x, y, size }) => ["(",join(out,`${sprite}.png`),"-resize",`${size}x${size}!`,")","-geometry",`+${x}+${y}`,"-composite"]),
    "-strip",`PNG32:${join(out,`card-${id}.png`)}`]);
  manifest.assets[`card-${id}`]={file:`card-${id}.png`,width:48,height:64};
}
writeFileSync(join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(`Prepared ${Object.keys(manifest.assets).length} object/card sprites.`);
