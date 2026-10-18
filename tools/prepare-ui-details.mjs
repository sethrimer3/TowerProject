// Production Goal and utility PNGs from the shared reference atlas.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { UI_DETAIL_SPRITES, UI_ORNAMENT_SPRITES } from "../src/sprite-ui-details.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "public/assets/style");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const palette = join(root, "assets/ui-sprites/palette.ppm");
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject);
  p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const finish = id => ["-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`];
// Measured transparent gutters from the selected source, checked at native size.
const xs = [55, 355, 635, 910, 1225], ys = [40, 260, 445, 630, 823, 1020, 1225];
for (const [i, id] of UI_DETAIL_SPRITES.entries()) {
  const col = i % 4, row = Math.floor(i / 4);
  await run([join(root, "assets/game-sprites/ui-details.png"), "-crop", `${xs[col + 1] - xs[col]}x${ys[row + 1] - ys[row]}+${xs[col]}+${ys[row]}`, "+repage",
    "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "22x22",
    "-background", "none", "-gravity", "center", "-extent", "24x24", ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24 };
}
// The range ring is green; charged arrows keep their blue charge cue.
await run([join(out, "goal-attack-range.png"),
  "-fill", "#283b2c", "-opaque", "#16303d", "-fill", "#3c5837", "-opaque", "#315363",
  "-fill", "#668348", "-opaque", "#54879a", "-fill", "#a7bd75", "-opaque", "#88c5db", ...finish("goal-attack-range")]);
for (const [i, id] of UI_ORNAMENT_SPRITES.entries()) {
  const col = i % 4, row = Math.floor(i / 4);
  const columns = [25, 465, 905, 1310, 1774], rows = [50, 490, 850];
  await run([join(root, "assets/game-sprites/ui-ornaments.png"), "-crop", `${columns[col + 1] - columns[col]}x${rows[row + 1] - rows[row]}+${columns[col]}+${rows[row]}`, "+repage",
    "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "22x22",
    "-background", "none", "-gravity", "center", "-extent", "24x24", ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24 };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${UI_DETAIL_SPRITES.length + UI_ORNAMENT_SPRITES.length} Goal and utility sprites.`);
