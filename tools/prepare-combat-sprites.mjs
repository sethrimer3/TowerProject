// Measured gutters; production art is palette-normalized on its native grid.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARROW_DIRECTIONS, SHIELD_SIZES } from "../src/sprite-combat.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "public/assets/style"), source = join(root, "assets/game-sprites/combat.png");
const palette = join(root, "assets/ui-sprites/palette.ppm");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const crop = (rect, input = source) => [input, "-crop", rect, "+repage", "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point"];
const finish = id => ["-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`];
async function exportPiece(id, rect, width, height, inner = `${width}x${height}`, extra = [], input = source) {
  await run([...crop(rect, input), "-resize", inner, "-background", "none", "-gravity", "center", "-extent", `${width}x${height}`, ...extra, ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width, height };
}
for (const [kind, rect] of [["arrow", "300x160+10+300"], ["charged", "310x160+320+300"]]) {
  const base = `combat-${kind}-e`;
  await exportPiece(base, rect, 16, 16, "14x6");
  for (const [i, dir] of ARROW_DIRECTIONS.entries()) {
    if (!i) continue;
    const id = `combat-${kind}-${dir}`;
    // Rotate normalized pixels with point sampling, never interpolated colors.
    await run([join(out, `${base}.png`), "-background", "none", "-virtual-pixel", "transparent", "-filter", "point", "-interpolate", "nearest-neighbor",
      "+distort", "SRT", String(i * 45), "+repage", "-gravity", "center", "-extent", "16x16", ...finish(id)]);
    manifest.assets[id] = { file: `${id}.png`, width: 16, height: 16 };
  }
}
await exportPiece("combat-shot", "220x210+650+285", 8, 8, "8x8");
await exportPiece("combat-wing", "260x250+50+620", 9, 8, "9x8!");
await exportPiece("combat-ranged", "200x230+360+630", 9, 8, "9x8!");
await exportPiece("combat-fast", "230x220+650+630", 12, 8, "12x8!");
await exportPiece("combat-rank-up", "210x180+970+650", 7, 6, "7x5!");
await exportPiece("combat-rank-down", "220x180+40+980", 7, 6, "7x5!");
await exportPiece("combat-chest-supply", "200x220+330+950", 10, 10, "10x10");
await exportPiece("combat-chest-equipment", "340x230+580+950", 20, 10, "20x10");
for (const size of SHIELD_SIZES) {
  // A separate fine-grid source keeps the large bubble round and its rim narrow.
  await exportPiece(`combat-shield-${size}`, "1280x1280+0+0", size, size, `${size}x${size}!`, [], join(root, "assets/game-sprites/combat-shield.png"));
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared 27 native combat PNGs: directional arrows, shots, marks, chest stars and shield rings.");
