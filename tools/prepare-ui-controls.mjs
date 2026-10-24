// Small symbols stay on a 12-pixel grid; larger reusable components retain
// native corners and quiet centers. Source gutters were measured per row.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SMALL_CONTROL_SPRITES, SLIDER_SPRITES } from "../src/sprites/controls.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const palette = join(root, "assets/ui-sprites/palette.ppm");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const finish = id => ["-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`];
const ids = [...Object.values(SMALL_CONTROL_SPRITES), ...SLIDER_SPRITES], ys = [50, 350, 665, 995];
for (const [i, id] of ids.entries()) {
  const col = i % 4, row = Math.floor(i / 4), xs = row < 2 ? [60, 400, 760, 1100, 1500] : [70, 400, 700, 990, 1510];
  const width = i < 8 ? 12 : i === 11 ? 48 : 24, height = i < 8 || i === 11 ? 12 : 24;
  const inner = i < 8 ? "10x10" : i === 8 ? "22x22" : `${width}x${height}!`;
  await run([join(root, "assets/game-sprites/ui-controls.png"), "-crop", `${xs[col + 1] - xs[col]}x${ys[row + 1] - ys[row]}+${xs[col]}+${ys[row]}`, "+repage",
    "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", inner,
    "-background", "none", "-gravity", "center", "-extent", `${width}x${height}`, ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width, height };
}
const id = "ui-fill-gain", source = join(root, "public/assets/ui/frames/fill-blue.png"), header = readFileSync(source);
await run([source, "-fill", "#eee0b7", "-opaque", "#88c5db", "-fill", "#88c5db", "-opaque", "#54879a", "-fill", "#54879a", "-opaque", "#315363", ...finish(id)]);
manifest.assets[id] = { file: `${id}.png`, width: header.readUInt32BE(16), height: header.readUInt32BE(20), tile: true };
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared nine control symbols, three slider components and a pale gain fill.");
