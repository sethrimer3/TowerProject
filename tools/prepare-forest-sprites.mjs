// Measured source crops; production PNGs use native pixels and the kit palette.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FOREST_CANOPIES, FOREST_GROUND, FOREST_LANDMARKS, FOREST_SPRITES } from "../src/sprite-forest.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const palette = join(root, "assets/ui-sprites/palette.ppm");
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const run = args => new Promise((resolve, reject) => {
  const p = spawn("magick", ["-limit", "thread", "1", ...args], { stdio: "inherit", timeout: 60000 });
  p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(Error(`ImageMagick exit ${code}`)));
});
const scratch = mkdtempSync(join(tmpdir(), "tower-forest-"));
const leafPalette = join(scratch, "leaves.ppm");
writeFileSync(leafPalette, "P3\n5 1\n255\n16 21 28 40 59 44 60 88 55 102 131 72 167 189 117\n");
// Quiet ground: tree detail belongs in the object layer, never noisy tiles.
const ramps = {
  "forest-litter": [[40, 59, 44], [60, 88, 55]],
  "forest-grass": [[40, 59, 44], [60, 88, 55]],
  "forest-path": [[73, 58, 44], [128, 96, 61]],
};
const crops = [
  "280x300+22+26", "350x300+300+26", "235x292+651+38", "240x285+896+45",
  "280x304+22+336", "182x220+380+411", "185x220+650+409", "240x210+887+435",
  "240x210+35+682", "280x230+327+674", "195x210+650+685", "260x220+873+676",
  "300x154+22+938", "220x170+376+935", "200x160+650+946", "190x160+912+942",
  "195x195+70+1138", "195x195+367+1138", "195x195+659+1138", "180x180+925+1175",
];
try {
  for (const [i, [id, [width, height]]] of Object.entries(FOREST_SPRITES).entries()) {
    const tile = FOREST_GROUND.includes(id);
    let colors = palette;
    if (tile) {
      colors = join(scratch, `${id}.ppm`);
      writeFileSync(colors, `P3\n${ramps[id].length} 1\n255\n${ramps[id].flat().join(" ")}\n`);
    }
    const geometry = tile ? ["-alpha", "off", "-filter", "point", "-resize", `${width}x${height}!`, "-alpha", "on"]
      : ["-channel", "A", "-threshold", "85%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", `${width - 2}x${height - 2}`,
        "-background", "none", "-gravity", "south", "-extent", `${width}x${height}`];
    const leafHeight = Math.floor(height * .7), flank = Math.floor(width * .34);
    const leaves = FOREST_CANOPIES.includes(id) || ["forest-young-pine", "forest-sapling", "forest-shrub", "forest-fern"].includes(id)
      ? [[width, leafHeight, 0, 0], [flank, height - leafHeight, 0, leafHeight], [flank, height - leafHeight, width - flank, leafHeight]]
        .flatMap(([w, h, x, y]) => ["-region", `${w}x${h}+${x}+${y}`, "+dither", "-remap", leafPalette, "+region"]) : [];
    await run([join(root, "assets/game-sprites/forest-nature.png"), "-crop", crops[i], "+repage", ...geometry,
      "-write", "mpr:original", ...leaves,
      "+dither", "-remap", colors, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`]);
    manifest.assets[id] = { file: `${id}.png`, width, height, ...(tile ? { tile: true } : {}) };
  }
  for (const [i, [id, [width, height]]] of Object.entries(FOREST_LANDMARKS).entries()) {
    await run([join(root, "assets/game-sprites/forest-landmarks.png"), "-crop", ["860x728+25+0", "1180x730+895+0"][i], "+repage",
      "-channel", "A", "-threshold", "85%", "+channel", "-filter", "point", "-resize", `${width}x${height}!`,
      "-write", "mpr:original", "+dither", "-remap", palette, "mpr:original", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip", `PNG32:${join(out, `${id}.png`)}`]);
    manifest.assets[id] = { file: `${id}.png`, width, height };
  }
} finally { rmSync(scratch, { recursive: true, force: true }); }
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Prepared 22 native forest PNG components.");
