// Native material extraction and connected-wall assembly from generated PNG art.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DUNGEON_MATERIALS, DUNGEON_TONES, dungeonAtlasId } from "../src/sprite-dungeon.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const palette = join(root, "assets/ui-sprites/palette.ppm"), source = join(root, "assets/game-sprites/dungeon-materials.png");
const cornerSource = join(root, "assets/game-sprites/dungeon-corners.png");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "tower-dungeon-")), p = name => join(scratch, `${name}.png`);
const run = args => new Promise((resolve, reject) => {
  const command = args[0] === "montage" ? ["montage", "-limit", "thread", "1", ...args.slice(1)] : ["-limit", "thread", "1", ...args];
  const child = spawn("magick", command, { stdio: "inherit", timeout: 60000 });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}: ${JSON.stringify(args)}`)));
});
const normalizer = colors => ["-write", "mpr:alpha", "+dither", "-remap", colors, "mpr:alpha", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip"];
const normalize = normalizer(palette);
const grayPalette = join(scratch, "slate.ppm"), earthPalette = join(scratch, "earth.ppm");
const soilFloorPalette = join(scratch, "soil-floor.ppm"), soilCapPalette = join(scratch, "soil-cap.ppm");
for (const [path, colors] of [[grayPalette, ["10151c", "1b2430", "293543", "3e4c59", "63717b", "8b9a9d", "b8c2bb"]],
  [earthPalette, ["10151c", "29251f", "493a2c", "80603d", "b28a52", "293543", "3e4c59", "63717b"]],
  [soilFloorPalette, ["29251f", "493a2c"]], [soilCapPalette, ["493a2c", "80603d"]]])
  writeFileSync(path, `P3\n${colors.length} 1\n255\n${colors.flatMap(color => [0, 2, 4].map(i => parseInt(color.slice(i, i + 2), 16))).join(" ")}\n`);
async function extract(name, crop, width, height, isolated = false, imageSource = source) {
  await run([imageSource, "-crop", crop, "+repage", ...(isolated ? ["-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage"] : ["-alpha", "off"]),
    "-filter", "point", "-resize", `${width}x${height}!`, "-alpha", "on", ...normalizer(name.startsWith("earth-floor") ? soilFloorPalette
      : name.startsWith("earth-cap") ? soilCapPalette : name.startsWith("earth") || name.startsWith("soil") ? earthPalette : grayPalette), `PNG32:${p(name)}`]);
}
async function cornerFrames(material, row) {
  const frames = [];
  for (let corner = 0; corner < 4; corner++) {
    const name = `${material}-corner-${corner}`;
    await extract(name, `230x230+${[135, 480, 835, 1180][corner]}+${[25, 270, 510, 750][row]}`, 6, 6, true, cornerSource);
    const file = p(`${name}-frame`), x = corner === 1 || corner === 2 ? 18 : 0, y = corner >= 2 ? 18 : 0;
    await run(["-size", "24x24", "canvas:none", p(name), "-geometry", `+${x}+${y}`, "-compose", "Over", "-composite", "-strip", `PNG32:${file}`]);
    frames.push(file);
  }
  return frames;
}
const gray = ["10151c", "1b2430", "293543", "3e4c59", "63717b", "8b9a9d", "b8c2bb"];
// Shared palette ramps retain existing biome identities without new colors.
const tones = [gray,
  ["10151c", "1b2430", "283b2c", "3c5837", "668348", "a7bd75", "b8c2bb"],
  ["10151c", "29251f", "493a2c", "80603d", "b28a52", "e1bb78", "eee0b7"],
  ["10151c", "16303d", "293543", "315363", "54879a", "88c5db", "b8c2bb"],
  ["10151c", "382027", "693239", "a6544e", "d68a86", "e1bb78", "eee0b7"],
  ["10151c", "1b2430", "293543", "3e4c59", "80608e", "8b9a9d", "b8c2bb"],
  ["10151c", "16303d", "283b2c", "315363", "54879a", "a7bd75", "b8c2bb"],
  ["10151c", "382027", "493a2c", "693239", "80608e", "d68a86", "eee0b7"],
  ["0c1016", "10151c", "1b2430", "293543", "3e4c59", "80608e", "8b9a9d"],
  ["10151c", "1b2430", "293543", "3e4c59", "63717b", "e1bb78", "eee0b7"],
];
try {
  await extract("soil", "220x64+20+1395", 24, 6, true);
  await extract("shadow", "210x64+280+1395", 24, 3, true);
  await run([p("shadow"), "-fill", "#10151c", "-colorize", "100", ...normalize, `PNG32:${p("shadow")}`]);
  const edgeFrames = [];
  for (const kind of ["soil", "shadow"]) for (let mask = 0; mask < 16; mask++) {
    const args = ["-size", "24x24", "canvas:none"];
    for (const [bit, angle] of [[1, 0], [2, 90], [4, 180], [8, 270]]) if (mask & bit)
      args.push("(", "-size", "24x24", "canvas:none", p(kind), "-geometry", "+0+0", "-compose", "Over", "-composite", "-rotate", String(angle), ")", "-geometry", "+0+0", "-compose", "Over", "-composite");
    const file = p(`${kind}-${mask}`); await run([...args, "-strip", `PNG32:${file}`]); edgeFrames.push(file);
  }
  edgeFrames.push(...await cornerFrames("soil", 3));
  await run(["montage", ...edgeFrames, "-tile", "4x9", "-geometry", "24x24+0+0", "-background", "none", "-strip", `PNG32:${join(out, "dungeon-edges.png")}`]);
  manifest.assets["dungeon-edges"] = { file: "dungeon-edges.png", width: 96, height: 216, tile: true };
  for (const [row, material] of DUNGEON_MATERIALS.entries()) {
    const frames = [];
    for (let col = 0; col < 4; col++) {
      const name = `${material}-floor-${col}`;
      await extract(name, `176x176+${[41, 297, 553, 809][col]}+${[41, 265, 489][row]}`, 24, 24);
      frames.push(p(name));
    }
    for (let col = 0; col < 2; col++)
      await extract(`${material}-cap-${col}`, `170x170+${col ? 301 : 45}+${[711, 929, 1143][row]}`, 24, 24);
    await extract(`${material}-face`, `224x${row === 0 ? 80 : 96}+530+${[756, 970, 1186][row]}`, 24, 8, true);
    await extract(`${material}-rim`, `220x48+786+${[770, 986, 1200][row]}`, 24, 3, true);
    await run([p(`${material}-rim`), "-rotate", "270", "-strip", `PNG32:${p(`${material}-west`)}`]);
    await run([p(`${material}-rim`), "-rotate", "90", "-channel", "RGB", "-evaluate", "multiply", ".65", "+channel", ...normalizer(material === "earth" ? earthPalette : grayPalette), `PNG32:${p(`${material}-east`)}`]);
    for (let variant = 0; variant < 2; variant++) for (let mask = 0; mask < 16; mask++) {
      const args = [p(`${material}-cap-${variant}`)];
      const over = (file, x, y) => args.push(file, "-geometry", `+${x}+${y}`, "-compose", "Over", "-composite");
      if (!(mask & 8)) over(p(`${material}-west`), 0, 0);
      if (!(mask & 2)) over(p(`${material}-east`), 21, 0);
      if (!(mask & 1)) over(p(`${material}-rim`), 0, 0);
      if (!(mask & 4)) { over(p(`${material}-face`), 0, 16); over(p(`${material}-rim`), 0, 15); }
      const file = p(`${material}-wall-${variant}-${mask}`); await run([...args, "-strip", `PNG32:${file}`]); frames.push(file);
    }
    frames.push(...await cornerFrames(material, row));
    const base = p(`${material}-base`);
    await run(["montage", ...frames, "-tile", "4x10", "-geometry", "24x24+0+0", "-background", "none", "-strip", `PNG32:${base}`]);
    for (let tone = 0; tone < (material === "earth" ? 1 : DUNGEON_TONES); tone++) {
      const id = dungeonAtlasId(material, tone), args = [base];
      if (material !== "earth") {
        gray.forEach((color, i) => args.push("-fill", `rgb(1,2,${i + 1})`, "-opaque", `#${color}`));
        tones[tone].forEach((color, i) => args.push("-fill", `#${color}`, "-opaque", `rgb(1,2,${i + 1})`));
      }
      await run([...args, "-strip", `PNG32:${join(out, `${id}.png`)}`]);
      manifest.assets[id] = { file: `${id}.png`, width: 96, height: 240, tile: true };
    }
  }
} finally { rmSync(scratch, { recursive: true, force: true }); }
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared 21 native interior material atlases and one transition/contact atlas (876 frames).");
