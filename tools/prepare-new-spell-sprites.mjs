// Export the retained six-column source sheet onto the game's native grid.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const source = "assets/game-sprites/new-spell-items.png", out = "public/assets/style";
const run = args => execFileSync("magick", ["-limit", "thread", "1", ...args]);
const [w, h] = execFileSync("magick", ["identify", "-format", "%w %h", source]).toString().split(" ").map(Number);
const scratch = mkdtempSync(join(tmpdir(), "spell-sprites-"));
const manifest = JSON.parse(readFileSync(`${out}/manifest.json`, "utf8"));
const normalize = ["-channel", "A", "-threshold", "80%", "+channel", "-write", "mpr:alpha", "+dither", "-remap", "assets/ui-sprites/palette.ppm", "mpr:alpha", "-compose", "CopyAlpha", "-composite", "-strip"];
const cell = (col, row) => {
  // The authored frame row starts above the regular animation-cell boundary.
  if (row === 5) {
    const edges = [0, 212, 417, 620, 829];
    return [source, "-crop", `${edges[col + 1] - edges[col]}x${h - 1030}+${edges[col]}+1030`, "+repage"];
  }
  return [source, "-crop", `${Math.floor((col + 1) * w / 6) - Math.floor(col * w / 6)}x${Math.floor((row + 1) * h / 6) - Math.floor(row * h / 6)}+${Math.floor(col * w / 6)}+${Math.floor(row * h / 6)}`, "+repage"];
};
const register = (id, width = 24) => { manifest.assets[id] = { file: `${id}.png`, width, height: 24, tile: true }; };
try {
  for (const [col, id] of ["gem-golden", "gem-stellar", "respec-training", "respec-arcana", "status-shock", "status-dilation-guard"].entries()) {
    run([...cell(col, 0), "-channel", "A", "-threshold", "80%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "20x20", "-background", "none", "-gravity", "center", "-extent", "24x24", ...normalize, `PNG32:${out}/${id}.png`]); register(id);
  }
  for (const [index, id] of ["ambient-phoenix-spark", "ambient-stellar-twinkles", "ambient-ricochet-shock", "ambient-dilation-guard"].entries()) {
    const frames = [];
    for (let col = 0; col < 6; col++) {
      const file = join(scratch, `${col}.png`); frames.push(file);
      run([...cell(col, index + 1), "-filter", "point", "-resize", "24x24!", ...normalize, `PNG32:${file}`]);
    }
    run([...frames, "+append", "-strip", `PNG32:${out}/${id}.png`]); register(id, 144);
  }
  run([...cell(2, 1), "-channel", "A", "-threshold", "80%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "20x20", "-background", "none", "-gravity", "center", "-extent", "24x24", ...normalize, `PNG32:${out}/phoenix-spark.png`]); register("phoenix-spark");
  for (const [col, rarity] of ["epic", "legendary", "mythic", "ancestral"].entries()) {
    const id = `ui-equip-frame-${rarity}`;
    run([...cell(col, 5), "-channel", "A", "-threshold", "80%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "24x24!", "-fill", "rgb(27,36,48)", "-draw", "rectangle 8,8 15,15", ...normalize, `PNG32:${out}/${id}.png`]); register(id);
  }
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
} finally { rmSync(scratch, { recursive: true, force: true }); }
