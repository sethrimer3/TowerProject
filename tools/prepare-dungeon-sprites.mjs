// Native material extraction and connected-wall assembly from generated PNG art.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DUNGEON_MATERIALS, DUNGEON_TONES, DUNGEON_WALL_VARIANTS, dungeonAtlasId } from "../src/sprite-dungeon.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const palette = join(root, "assets/ui-sprites/palette.ppm"), source = join(root, "assets/game-sprites/dungeon-materials.png");
const cornerSource = join(root, "assets/game-sprites/dungeon-corners.png");
const wallSource = join(root, "assets/game-sprites/dungeon-wall-variations.png");
const blendSource = join(root, "assets/game-sprites/dungeon-material-blends.png");
const shadingSource = join(root, "assets/game-sprites/dungeon-wall-shading.png");
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
const soilFloorPalette = join(scratch, "soil-floor.ppm");
const wallTopPalette = join(scratch, "wall-top.ppm"), earthTopPalette = join(scratch, "earth-top.ppm");
const bedrockTopPalette = join(scratch, "bedrock-top.ppm");
for (const [path, colors] of [[grayPalette, ["10151c", "1b2430", "293543", "3e4c59", "63717b", "8b9a9d", "b8c2bb"]],
  [earthPalette, ["10151c", "29251f", "493a2c", "80603d", "b28a52", "293543", "3e4c59", "63717b"]],
  [soilFloorPalette, ["29251f", "493a2c"]],
  [wallTopPalette, ["293543", "3e4c59", "63717b"]],
  [bedrockTopPalette, ["293543", "3e4c59"]],
  [earthTopPalette, ["493a2c", "80603d", "3e4c59"]]])
  writeFileSync(path, `P3\n${colors.length} 1\n255\n${colors.flatMap(color => [0, 2, 4].map(i => parseInt(color.slice(i, i + 2), 16))).join(" ")}\n`);
async function extract(name, crop, width, height, isolated = false, imageSource = source) {
  const colors = name.includes("-cap-")
    ? name.startsWith("earth") ? earthTopPalette : name.startsWith("stone") ? bedrockTopPalette : wallTopPalette
    : name.startsWith("earth-floor") ? soilFloorPalette
    : name.startsWith("earth") || name.startsWith("soil") ? earthPalette : grayPalette;
  await run([imageSource, "-crop", crop, "+repage", ...(isolated ? ["-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage"] : ["-alpha", "off"]),
    "-filter", "point", "-resize", `${width}x${height}!`, "-alpha", "on", ...normalizer(colors), `PNG32:${p(name)}`]);
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
  // Authored stepped silhouettes, with opaque joins and no soft-alpha fade.
  const blendFrames = [];
  for (let variant = 0; variant < 4; variant++) {
    await run([blendSource, "-crop", `274x160+${[30, 337, 644, 951][variant]}+995`, "+repage", "-fuzz", "12%", "-transparent", "#ff00ff",
      "-channel", "A", "-threshold", "50%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "24x9!",
      "-channel", "RGB", "-fill", "#eee0b7", "-colorize", "100", "+channel", "-strip", `PNG32:${p(`fringe-${variant}`)}`]);
    for (let mask = 0; mask < 16; mask++) {
      const args = ["-size", "24x24", "canvas:none"];
      for (const [bit, angle] of [[1, 0], [2, 90], [4, 180], [8, 270]]) if (mask & bit)
        args.push("(", "-size", "24x24", "canvas:none", p(`fringe-${variant}`), "-geometry", "+0+0", "-compose", "Over", "-composite",
          "-fill", "#eee0b7", "-draw", "rectangle 0,0 23,2", "-rotate", String(angle), ")", "-geometry", "+0+0", "-compose", "Over", "-composite");
      const file = p(`blend-${variant}-${mask}`); await run([...args, "-strip", `PNG32:${file}`]); blendFrames.push(file);
    }
    const corners = await cornerFrames("soil", 3);
    for (let corner = 0; corner < 4; corner++) {
      const file = p(`blend-${variant}-corner-${corner}`);
      await run([corners[corner], "-channel", "RGB", "-fill", "#eee0b7", "-colorize", "100", "+channel", "-strip", `PNG32:${file}`]); blendFrames.push(file);
    }
  }
  await run(["montage", ...blendFrames, "-tile", "4x20", "-geometry", "24x24+0+0", "-background", "none", "-strip", `PNG32:${join(out, "dungeon-blends.png")}`]);
  manifest.assets["dungeon-blends"] = { file: "dungeon-blends.png", width: 96, height: 480, tile: true };
  const infillFrames = [];
  const darkPalette = join(scratch, "infill.ppm");
  writeFileSync(darkPalette, "P3\n3 1\n255\n12 16 22 27 36 48 41 37 31\n");
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const file = p(`infill-${row}-${col}`);
    if (col === 3) await run(["-size", "24x24", "canvas:#0c1016", "-strip", `PNG32:${file}`]);
    else await run([blendSource, "-crop", `266x266+${[34, 341, 648][col]}+${[33, 335, 643][row]}`, "+repage", "-alpha", "off",
      "-filter", "point", "-resize", "24x24!", "-alpha", "on", ...normalizer(darkPalette), `PNG32:${file}`]);
    infillFrames.push(file);
  }
  for (let col = 0; col < 4; col++) {
    const file = p(`infill-core-${col}`); await run(["-size", "24x24", "canvas:#0c1016", "-strip", `PNG32:${file}`]); infillFrames.push(file);
  }
  await run(["montage", ...infillFrames, "-tile", "4x4", "-geometry", "24x24+0+0", "-background", "none", "-strip", `PNG32:${join(out, "dungeon-infill.png")}`]);
  manifest.assets["dungeon-infill"] = { file: "dungeon-infill.png", width: 96, height: 96, tile: true };
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
    for (let col = 0; col < DUNGEON_WALL_VARIANTS; col++) {
      const left = [27, 232, 438, 643, 849, 1054][col];
      await extract(`${material}-cap-${col}`, `173x173+${left}+${[63, 278, 487][row]}`, 24, 24, false, wallSource);
      await extract(`${material}-face-${col}`, `173x80+${left}+${[726, 884, 1042][row]}`, 24, 8, false, wallSource);
      const capColors = material === "earth" ? ["493a2c", "80603d", "3e4c59"] : ["293543", "3e4c59", "63717b"];
      const shadeColors = material === "earth" ? ["29251f", "493a2c", "1b2430"] : ["1b2430", "293543", "293543"];
      const shade = [p(`${material}-cap-${col}`)];
      capColors.forEach((color, i) => shade.push("-fill", `rgb(1,3,${i + 1})`, "-opaque", `#${color}`));
      shadeColors.forEach((color, i) => shade.push("-fill", `#${color}`, "-opaque", `rgb(1,3,${i + 1})`));
      await run([...shade, "-strip", `PNG32:${p(`${material}-shade-${col}`)}`]);
    }
    await extract(`${material}-rim`, `220x48+786+${[770, 986, 1200][row]}`, 24, 3, true);
    await run([p(`${material}-rim`), "-rotate", "270", "-strip", `PNG32:${p(`${material}-west`)}`]);
    await run([p(`${material}-rim`), "-rotate", "90", "-channel", "RGB", "-evaluate", "multiply", ".65", "+channel", ...normalizer(material === "earth" ? earthPalette : grayPalette), `PNG32:${p(`${material}-east`)}`]);
    for (let variant = 0; variant < DUNGEON_WALL_VARIANTS; variant++) for (let mask = 0; mask < 16; mask++) {
      const args = [p(`${material}-cap-${variant}`)];
      const over = (file, x, y) => args.push(file, "-geometry", `+${x}+${y}`, "-compose", "Over", "-composite");
      if (!(mask & 8)) over(p(`${material}-west`), 0, 0);
      if (!(mask & 2)) over(p(`${material}-east`), 21, 0);
      if (!(mask & 1)) over(p(`${material}-rim`), 0, 0);
      if (!(mask & 4)) { over(p(`${material}-face-${variant}`), 0, 16); over(p(`${material}-rim`), 0, 15); }
      const wallMask = p(`wall-mask-${variant}-${mask}`);
      const maskArgs = ["-size", "24x24", "canvas:none"];
      for (const [bit, angle] of [[1, 0], [2, 90], [4, 180], [8, 270]]) if (!(mask & bit))
        maskArgs.push("(", "-size", "24x24", "canvas:none", "(", p(`fringe-${variant % 4}`), "-filter", "point", "-resize", "24x18!", ")",
          "-geometry", "+0+0", "-compose", "Over", "-composite", "-fill", "#eee0b7", "-draw", "rectangle 0,0 23,7", "-rotate", String(angle), ")",
          "-geometry", "+0+0", "-compose", "Over", "-composite");
      await run([...maskArgs, ...(!(mask & 4) ? ["-fill", "#eee0b7", "-draw", "rectangle 0,16 23,23"] : []), "-strip", `PNG32:${wallMask}`]);
      const file = p(`${material}-wall-${variant}-${mask}`);
      await run([p(`${material}-shade-${variant}`), "(", ...args, wallMask, "-geometry", "+0+0", "-compose", "DstIn", "-composite", ")",
        "-geometry", "+0+0", "-compose", "Over", "-composite", "-strip", `PNG32:${file}`]); frames.push(file);
    }
    frames.push(...await cornerFrames(material, row));
    const shadePalette = join(scratch, `${material}-padding.ppm`);
    const shadeColors = material === "earth" ? ["0c1016", "29251f", "493a2c"] : ["0c1016", "1b2430", "293543"];
    writeFileSync(shadePalette, `P3\n3 1\n255\n${shadeColors.flatMap(color => [0, 2, 4].map(i => parseInt(color.slice(i, i + 2), 16))).join(" ")}\n`);
    // Clean isolated sampling speckles at native resolution, then restore the fixed palette.
    for (let direction = 0; direction < 4; direction++)
      await run([shadingSource, "-crop", `316x312+${[32, 388, 744, 1100][direction]}+${[28, 378, 726][row]}`, "+repage", "-alpha", "off", "-filter", "point", "-resize", "24x24!",
        "-statistic", "Median", "3x3", "-alpha", "on", ...normalizer(shadePalette), "-transparent", "#0c1016", "-strip", `PNG32:${p(`${material}-padding-${direction}`)}`]);
    for (let mask = 0; mask < 16; mask++) {
      const args = ["-size", "24x24", "canvas:#0c1016"];
      for (let direction = 0; direction < 4; direction++) if (mask & (1 << direction))
        args.push(p(`${material}-padding-${direction}`), "-geometry", "+0+0", "-compose", "Over", "-composite");
      const file = p(`${material}-padding-mask-${mask}`); await run([...args, "-strip", `PNG32:${file}`]); frames.push(file);
    }
    const base = p(`${material}-base`);
    await run(["montage", ...frames, "-tile", "4x30", "-geometry", "24x24+0+0", "-background", "none", "-strip", `PNG32:${base}`]);
    for (let tone = 0; tone < (material === "earth" ? 1 : DUNGEON_TONES); tone++) {
      const id = dungeonAtlasId(material, tone), args = [base];
      if (material !== "earth") {
        gray.forEach((color, i) => args.push("-fill", `rgb(1,2,${i + 1})`, "-opaque", `#${color}`));
        tones[tone].forEach((color, i) => args.push("-fill", `#${color}`, "-opaque", `rgb(1,2,${i + 1})`));
      }
      await run([...args, "-strip", `PNG32:${join(out, `${id}.png`)}`]);
      manifest.assets[id] = { file: `${id}.png`, width: 96, height: 720, tile: true };
    }
  }
} finally { rmSync(scratch, { recursive: true, force: true }); }
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared 21 native interior material atlases, directional shadow bands, material blends and dark infill (2652 frames).");
