import { finishSeamlessFloor } from "./seamless-floor.mjs";
// Export original Tower II–IX materials into the existing native wall layout.
// Wall texels retain the authored material source and shared corner silhouettes.
// Floors use periodic native geometry in that material's palette.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const scratch = mkdtempSync(join(tmpdir(), "tower-tier-sprites-"));
const p = name => join(scratch, `${name}.png`);
const run = args => execFileSync("magick", ["montage", "identify"].includes(args[0])
  ? [args[0], "-limit", "thread", "1", ...args.slice(1)] : ["-limit", "thread", "1", ...args]);
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const sets = [
  { tier: 2, floor: ["29251f", "493a2c", "80603d"], cap: ["493a2c", "80603d", "b28a52"], body: ["29251f", "493a2c", "80603d"], dark: ["10151c", "29251f", "493a2c"], face: ["29251f", "493a2c", "80603d", "b28a52", "e1bb78"] },
  { tier: 3, floor: ["1b2430", "293543", "3e4c59", "80608e"], cap: ["293543", "3e4c59", "80608e"], body: ["1b2430", "293543", "3e4c59"], dark: ["10151c", "1b2430", "293543"], face: ["10151c", "1b2430", "293543", "3e4c59", "63717b", "80608e"] },
  { tier: 4, floor: ["10151c", "283b2c", "3c5837", "668348"], cap: ["283b2c", "668348", "a7bd75"], body: ["10151c", "283b2c", "3c5837"], dark: ["10151c", "1b2430", "283b2c"], face: ["10151c", "283b2c", "3c5837", "668348", "a7bd75"] },
  { tier: 5, floor: ["382027", "693239", "a6544e"], cap: ["693239", "a6544e", "d68a86"], body: ["382027", "693239", "a6544e"], dark: ["10151c", "382027", "693239"], face: ["10151c", "382027", "693239", "a6544e", "d68a86"] },
  { tier: 6, floor: ["16303d", "315363", "54879a"], cap: ["315363", "54879a", "88c5db"], body: ["16303d", "315363", "54879a"], dark: ["10151c", "16303d", "315363"], face: ["10151c", "16303d", "315363", "54879a", "88c5db"] },
  { tier: 7, floor: ["293543", "63717b", "8b9a9d", "b8c2bb"], cap: ["63717b", "b8c2bb", "eee0b7"], body: ["293543", "63717b", "8b9a9d"], dark: ["1b2430", "293543", "3e4c59"], face: ["293543", "63717b", "8b9a9d", "b8c2bb", "eee0b7"] },
  { tier: 8, floor: ["29251f", "493a2c", "80603d"], cap: ["493a2c", "80603d", "e1bb78"], body: ["29251f", "493a2c", "80603d"], dark: ["10151c", "29251f", "493a2c"], face: ["10151c", "29251f", "493a2c", "80603d", "b28a52", "e1bb78"] },
  { tier: 9, floor: ["1b2430", "293543", "3e4c59", "80608e"], cap: ["293543", "80608e", "8b9a9d"], body: ["1b2430", "293543", "80608e"], dark: ["10151c", "1b2430", "293543"], face: ["10151c", "1b2430", "293543", "3e4c59", "80608e", "8b9a9d"] },
];
const experimentalSets = [
  { tier: 0, lab: "iron", column: 0, floor: ["10151c", "1b2430", "293543", "3e4c59"], cap: ["293543", "63717b", "b28a52"], body: ["1b2430", "293543", "493a2c"], dark: ["10151c", "1b2430", "29251f"], face: ["10151c", "293543", "3e4c59", "63717b", "80603d", "e1bb78"] },
  { tier: 0, lab: "tideglass", column: 1, floor: ["16303d", "315363", "3c5837", "54879a"], cap: ["315363", "54879a", "a7bd75"], body: ["16303d", "315363", "3c5837"], dark: ["10151c", "16303d", "283b2c"], face: ["10151c", "16303d", "315363", "54879a", "668348", "b8c2bb"] },
  { tier: 0, lab: "reliquary", column: 2, floor: ["493a2c", "80603d", "b8c2bb", "eee0b7"], cap: ["63717b", "b8c2bb", "eee0b7"], body: ["3e4c59", "63717b", "8b9a9d"], dark: ["1b2430", "293543", "3e4c59"], face: ["293543", "693239", "63717b", "8b9a9d", "b8c2bb", "eee0b7"] },
];
function palette(name, colors) {
  const path = join(scratch, `${name}.ppm`);
  writeFileSync(path, `P3\n${colors.length} 1\n255\n${colors.flatMap(c => [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16))).join(" ")}\n`);
  return path;
}
function recolor(input, output, from, to) {
  const args = [input];
  from.forEach((color, i) => args.push("-fill", `rgb(1,2,${i + 1})`, "-opaque", `#${color}`));
  to.forEach((color, i) => args.push("-fill", `#${color}`, "-opaque", `rgb(1,2,${i + 1})`));
  run([...args, "-strip", `PNG32:${output}`]);
}
try {
  const experimental = process.argv.includes("--experimental");
  const selected = process.argv.slice(2).filter(arg=>arg!=="--experimental").map(Number);
  if (selected.some(t => !sets.some(s => s.tier === t))) throw Error("Expected tower numbers 2–9");
  for (const set of experimental ? experimentalSets : sets.filter(s => !selected.length || selected.includes(s.tier))) {
    let source = join(root, `assets/game-sprites/tower-${set.tier}-materials.png`);
    if (set.lab) {
      const atlas = join(root, "assets/game-sprites/experimental-materials.png");
      const [w,h] = run(["identify", "-format", "%w %h", atlas]).toString().split(" ").map(Number);
      if (w % 3) throw Error("Expected three source columns");
      source = p(`source-${set.lab}`);
      run([atlas, "-crop", `${w/3}x${h}+${set.column*w/3}+0`, "+repage", "-strip", `PNG32:${source}`]);
    } else if (set.tier >= 4) {
      const atlas = join(root, "assets/game-sprites/tower-4-9-materials.png");
      const [w, h] = run(["identify", "-format", "%w %h", atlas]).toString().split(" ").map(Number);
      const index = set.tier - 4, cw = w / 3, ch = h / 2;
      if (!Number.isInteger(cw) || !Number.isInteger(ch)) throw Error("Expected a 3×2 source grid");
      source = p(`source-${set.tier}`);
      run([atlas, "-crop", `${cw}x${ch}+${index % 3 * cw}+${Math.floor(index / 3) * ch}`, "+repage", "-strip", `PNG32:${source}`]);
    }
    const [width, height] = run(["identify", "-format", "%w %h", source]).toString().split(" ").map(Number);
    const halfW = Math.floor(width / 2), halfH = Math.floor(height / 2);
    const extract = (name, col, row, w, h, colors) => run([source, "-crop", `${halfW}x${halfH}+${col * halfW}+${row * halfH}`, "+repage",
      "-alpha", "off", "-filter", "point", "-resize", `${w}x${h}!`, "+dither", "-remap", palette(name, colors), "-alpha", "on", "-strip", `PNG32:${p(name)}`]);
    extract("floor", 0, 0, 96, 96, set.floor);
    const style = set.lab ? {iron:"iron",tideglass:"mosaic",reliquary:"hexagons"}[set.lab]
      : {2:"slabs",3:"octagons",4:"cobbles",5:"herringbone",6:"diamonds",7:"marble",8:"inlay",9:"triangles"}[set.tier];
    finishSeamlessFloor(p("floor"),style);
    extract("cap-field", 1, 0, 96, 96, set.cap);
    extract("face-field", 0, 1, 96, 32, set.face);
    // Sample the authored ledge's top face without the empty strip gutters.
    const rimY = halfH + Math.round(halfH * (set.lab ? .045 : set.tier >= 4 ? .075 : set.tier === 2 ? .022 : .043));
    run([source, "-crop", `${halfW - 12}x${Math.round(halfH * (set.lab ? .055 : set.tier >= 4 ? .04 : set.tier === 2 ? .065 : .045))}+${halfW + 6}+${rimY}`, "+repage",
      "-alpha", "off", "-filter", "point", "-resize", "96x3!", "+dither", "-remap", palette("rim", set.face), "-alpha", "on", "-strip", `PNG32:${p("rim-field")}`]);
    const prefix = set.lab ? `dungeon-lab-${set.lab}` : `dungeon-tower-${set.tier}`;
    const floorId = `${prefix}-floor`;
    run([p("floor"), "-strip", `PNG32:${join(out, `${floorId}.png`)}`]);
    manifest.assets[floorId] = { file: `${floorId}.png`, width: 96, height: 96, tile: true };
    const frames = [];
    // Legacy floor slots stay valid although the dedicated panel is used.
    for (let i = 0; i < 4; i++) {
      run([p("floor"), "-crop", `24x24+${i * 24}+0`, "+repage", `PNG32:${p(`floor-${i}`)}`]); frames.push(p(`floor-${i}`));
    }
    for (let v = 0; v < 6; v++) {
      const x = v % 3 * 24, y = Math.floor(v / 3) * 24;
      run([p("cap-field"), "-crop", `24x24+${x}+${y}`, "+repage", "-strip", `PNG32:${p(`cap-${v}`)}`]);
      run([p("face-field"), "-crop", `24x8+${x}+${Math.floor(v / 3) * 8}`, "+repage", "-strip", `PNG32:${p(`face-${v}`)}`]);
      run([p("rim-field"), "-crop", `24x3+${(v % 4) * 24}+0`, "+repage", "-strip", `PNG32:${p(`rim-${v}`)}`]);
      run([p(`rim-${v}`), "-rotate", "270", "-strip", `PNG32:${p(`west-${v}`)}`]);
      run([p(`rim-${v}`), "-rotate", "90", "+dither", "-remap", palette("east", set.body), "-strip", `PNG32:${p(`east-${v}`)}`]);
      recolor(p(`cap-${v}`), p(`body-${v}`), set.cap, set.body);
      recolor(p(`cap-${v}`), p(`dark-${v}`), set.cap, set.dark);
      for (let mask = 0; mask < 16; mask++) {
        const args = [p(`body-${v}`)];
        const over = (file, xx, yy) => args.push(file, "-geometry", `+${xx}+${yy}`, "-compose", "Over", "-composite");
        if (!(mask & 8)) over(p(`west-${v}`), 0, 0);
        if (!(mask & 2)) over(p(`east-${v}`), 21, 0);
        if (!(mask & 1)) over(p(`rim-${v}`), 0, 0);
        if (!(mask & 4)) { over(p(`face-${v}`), 0, 16); over(p(`rim-${v}`), 0, 15); }
        const file = p(`wall-${v}-${mask}`); run([...args, "-strip", `PNG32:${file}`]); frames.push(file);
      }
    }
    // Preserve the exact native corner footprint while replacing its stone.
    for (let corner = 0; corner < 4; corner++) {
      const frame = 100 + corner, file = p(`corner-${corner}`);
      run([p("cap-0"), "(", join(out, "dungeon-masonry-0.png"), "-crop", `24x24+${frame % 4 * 24}+${Math.floor(frame / 4) * 24}`, "+repage", ")",
        "-compose", "DstIn", "-composite", "-strip", `PNG32:${file}`]); frames.push(file);
    }
    for (let v = 0; v < 6; v++) frames.push(p(`cap-${v}`));
    for (let v = 0; v < 6; v++) frames.push(p(`dark-${v}`));
    const core = p("core"); run(["-size", "24x24", "canvas:#0c1016", "-strip", `PNG32:${core}`]);
    for (let i = 0; i < 4; i++) frames.push(core);
    const wallId = `${prefix}-walls`;
    run(["montage", ...frames, "-tile", "4x30", "-geometry", "24x24+0+0", "-background", "none", "-strip", `PNG32:${join(out, `${wallId}.png`)}`]);
    manifest.assets[wallId] = { file: `${wallId}.png`, width: 96, height: 720, tile: true };
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(experimental ? "Prepared three experimental floor-and-wall material sets." : "Prepared the requested native Tower II–IX floor-and-wall material sets.");
} finally { rmSync(scratch, { recursive: true, force: true }); }
