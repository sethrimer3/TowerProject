// Palette-locked Shrine subjects and reusable choice/count/bar components.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOON_SPRITES, SHRINE_CONTROL_SPRITES } from "../src/sprites/boons.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "public/assets/style");
const frames = join(root, "public/assets/ui/frames");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const palette = join(root, "assets/ui-sprites/palette.ppm");
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const finish = id => ["-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`];
const xs = [50, 350, 635, 920, 1230], ys = [35, 255, 442, 642, 813, 1005, 1230];
const ids = [...Object.values(BOON_SPRITES), ...SHRINE_CONTROL_SPRITES];
for (const [i, id] of ids.entries()) {
  const col = i % 4, row = Math.floor(i / 4);
  await run([join(root, "assets/game-sprites/shrines.png"), "-crop", `${xs[col + 1] - xs[col]}x${ys[row + 1] - ys[row]}+${xs[col]}+${ys[row]}`, "+repage",
    "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "22x22",
    "-background", "none", "-gravity", "center", "-extent", "24x24",
    ...(id === "shrine-count" ? ["-fill", "#80608e", "-draw", "polygon 12,6 18,12 12,18 6,12"] : []), ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24 };
}
for (const [id, source] of [["shrine-fill", "fill-blue"]]) {
  const file = join(frames, `${source}.png`), header = readFileSync(file);
  await run([file, ...(id === "shrine-fill" ? ["-fill", "#80608e", "-opaque", "#54879a", "-fill", "#b8c2bb", "-opaque", "#88c5db"] : []), ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width: header.readUInt32BE(16), height: header.readUInt32BE(20), tile: true };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${ids.length} Shrine symbols and a reusable PNG bar fill.`);
