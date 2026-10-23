// Measured extraction of native materials/plants from the companion atlas.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FLOWER_SPRITES, GLOWCAP_SPRITES, MOSS_SPRITES, VINE_SPRITES, WATER_SPRITES } from "../src/sprite-environment.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const palette = join(root, "assets/ui-sprites/palette.ppm");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const entries = [
  ...MOSS_SPRITES.map((id, col) => ({ id, col, row: 0, size: 24, tile: true })),
  ...WATER_SPRITES.map((id, col) => ({ id, col, row: 1, size: 24, tile: true })),
  ...FLOWER_SPRITES.map((id, col) => ({ id, col, row: 2, size: 8 })),
  ...GLOWCAP_SPRITES.map((id, col) => ({ id, col, row: 3, size: 12 })),
  { id: VINE_SPRITES[0], col: 3, row: 0, size: 8 },
  { id: VINE_SPRITES[1], col: 3, row: 3, size: 8 },
];
// Moss uses only its material ramp, avoiding stray soil/brass highlights.
const scratch = mkdtempSync(join(tmpdir(), "tower-environment-"));
const ramps = [
  [[40, 59, 44], [60, 88, 55], [102, 131, 72], [167, 189, 117]],
  [[22, 48, 61], [49, 83, 99], [84, 135, 154]],
  [[16, 21, 28], [40, 59, 44], [60, 88, 55], [102, 131, 72]],
];
for (let i = 0; i < ramps.length; i++) writeFileSync(join(scratch, `${i}.ppm`), `P3\n${ramps[i].length} 1\n255\n${ramps[i].flat().join(" ")}\n`);
try {
  for (const { id, col, row, size, tile } of entries) {
    const crop = tile ? `240x240+${[48, 352, 656, 960][col]}+${row ? 355 : 60}`
      : `260x${row === 2 ? 280 : 270}+${[45, 350, 655, 960][col]}+${row === 0 ? 50 : row === 2 ? 630 : 940}`;
    const geometry = tile ? ["-alpha", "off", "-filter", "point", "-resize", `${size}x${size}!`, "-alpha", "on"]
      : ["-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", `${size - 2}x${size - 2}`,
        "-background", "none", "-gravity", "center", "-extent", `${size}x${size}`];
    const colors = MOSS_SPRITES.includes(id) ? join(scratch, `${col}.ppm`) : palette;
    await run([join(root, "assets/game-sprites/environment.png"), "-crop", crop, "+repage", ...geometry,
      "-write", "mpr:original", "+dither", "-remap", colors, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`]);
    manifest.assets[id] = { file: `${id}.png`, width: size, height: size, ...(tile ? { tile: true } : {}) };
  }
} finally { rmSync(scratch, { recursive: true, force: true }); }
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${entries.length} native environmental PNG components.`);
