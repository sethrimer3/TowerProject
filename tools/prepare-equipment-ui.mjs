// Native Equipment frames and small status marks from measured atlas cells.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EQUIPMENT_FRAME_SPRITES, EQUIPMENT_MARK_SPRITES } from "../src/sprites/equipment.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "public/assets/style"), source = join(root, "assets/game-sprites/equipment-ui.png");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const palette = join(root, "assets/ui-sprites/palette.ppm");
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const finish = id => ["-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`];
const header = readFileSync(source), width = header.readUInt32BE(16), height = header.readUInt32BE(20);
const ids = [...EQUIPMENT_FRAME_SPRITES.slice(0, 4), ...EQUIPMENT_MARK_SPRITES, EQUIPMENT_FRAME_SPRITES[4]];
for (const [i, id] of ids.entries()) {
  const col = i % 4, row = Math.floor(i / 4), left = Math.floor(col * width / 4), top = Math.floor(row * height / 2);
  const w = Math.floor((col + 1) * width / 4) - left, h = Math.floor((row + 1) * height / 2) - top;
  const size = i < 4 || i === 7 ? 24 : 12;
  await run([source, "-crop", `${w}x${h}+${left}+${top}`, "+repage", "-channel", "A", "-threshold", "85%", "+channel",
    "-trim", "+repage", "-filter", "point", "-resize", `${size}x${size}`, "-background", "none", "-gravity", "center", "-extent", `${size}x${size}`,
    ...(i < 4 ? ["-fill", "#1b2430", "-draw", "rectangle 5,5 18,18"] : []), ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width: size, height: size };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared five Equipment frames and three status PNGs.");
