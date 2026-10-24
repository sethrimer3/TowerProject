import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARD_MARK_SPRITES } from "../src/sprites/board-marks.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const palette = join(root, "assets/ui-sprites/palette.ppm");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const crops = ["540x540+240+50", "540x540+780+50", "480x370+280+600", "480x370+800+600"];
for (const [i, { id, size }] of Object.values(BOARD_MARK_SPRITES).entries()) {
  await run([join(root, "assets/game-sprites/board-marks.png"), "-crop", crops[i], "+repage", "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage",
    "-filter", "point", "-resize", `${size - 2}x${size - 2}`, "-background", "none", "-gravity", "center", "-extent", `${size}x${size}`,
    "-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`]);
  manifest.assets[id] = { file: `${id}.png`, width: size, height: size };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared four native PNG board marks.");
