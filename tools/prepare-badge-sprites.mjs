// Export badge symbols, level star, exchange mark and three reusable PNG
// token frames. Run this before prepare-game-sprites.mjs --cards-only.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BADGE_IDS } from "../src/cards/badges.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "public/assets/style");
const palette = join(root, "assets/ui-sprites/palette.ppm");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject);
  p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const finish = id => ["-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`];
const ids = [...BADGE_IDS.map(id => `badge-${id}`), "badge-star", "card-exchange"];
// Measured transparent gutters, not equal-height cells: the last two rows
// sit lower and the open door extends right of an equal-width first cell.
const xs = [50, 350, 640, 910, 1225], ys = [50, 260, 440, 630, 818, 1007, 1225];
for (const [i, id] of ids.entries()) {
  const col = i % 4, row = Math.floor(i / 4);
  await run([join(root, "assets/game-sprites/badges.png"), "-crop", `${xs[col + 1] - xs[col]}x${ys[row + 1] - ys[row]}+${xs[col]}+${ys[row]}`, "+repage",
    "-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "22x22",
    "-background", "none", "-gravity", "center", "-extent", "24x24", ...finish(id)]);
  // Blue keys must remain blue at tiny sizes, rather than reading as silver.
  if (id === "badge-blueGate" || id === "badge-blueAtLeast") await run([join(out, `${id}.png`),
    "-fill", "#16303d", "-opaque", "#293543", "-fill", "#315363", "-opaque", "#3e4c59",
    "-fill", "#54879a", "-opaque", "#63717b", "-fill", "#88c5db", "-opaque", "#8b9a9d",
    "-fill", "#88c5db", "-opaque", "#b8c2bb", ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24 };
}
const ramps = {
  common: ["#1b2430", "#293543", "#3e4c59", "#63717b", "#8b9a9d", "#b8c2bb"],
  rare: ["#10151c", "#16303d", "#315363", "#54879a", "#88c5db", "#eee0b7"],
  epic: ["#10151c", "#1b2430", "#293543", "#3e4c59", "#80608e", "#b8c2bb"],
};
const brass = ["#29251f", "#493a2c", "#80603d", "#b28a52", "#e1bb78", "#eee0b7"];
for (const [rarity, ramp] of Object.entries(ramps)) {
  const id = `badge-frame-${rarity}`, frame = join(root, "public/assets/ui/frames/slot.png");
  await run(["-size", "24x24", "xc:none", "-filter", "point",
    "(", frame, "-crop", "6x24+0+0", "+repage", ")", "-geometry", "+0+0", "-composite",
    "(", frame, "-crop", "36x24+6+0", "+repage", "-resize", "12x24!", ")", "-geometry", "+6+0", "-composite",
    "(", frame, "-crop", "6x24+42+0", "+repage", ")", "-geometry", "+18+0", "-composite",
    ...brass.flatMap((color, i) => ["-fill", ramp[i], "-opaque", color]), ...finish(id)]);
  manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24 };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${ids.length} badge/card symbols and three rarity frames.`);
