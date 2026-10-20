// Export original sparse two-tile PNG overlays, with fixed native geometry.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gray, tones } from "./dungeon-palette.mjs";
import { dungeonDetailId } from "../src/dungeon-details.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const source = join(root, "assets/game-sprites/dungeon-details.png");
const scratch = mkdtempSync(join(tmpdir(), "tower-details-")), p = name => join(scratch, `${name}.png`);
const run = args => execFileSync("magick", ["-limit", "thread", "1", ...args]);
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
try {
  for (const [row, material] of ["masonry", "stone", "earth"].entries()) {
    const colors = material === "earth" ? ["29251f", "493a2c", "80603d", "3e4c59"] : ["1b2430", "293543", "3e4c59", "63717b"];
    const dim = material === "earth" ? ["10151c", "29251f", "493a2c", "1b2430"] : ["10151c", "1b2430", "293543", "3e4c59"];
    const palette = join(scratch, `${material}.ppm`);
    writeFileSync(palette, `P3\n4 1\n255\n${colors.flatMap(c => [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16))).join(" ")}\n`);
    const frames = [];
    for (let variant = 0; variant < 4; variant++) {
      const file = p(`${material}-${variant}`);
      run([source, "-crop", `384x192+${variant * 384}+${[128, 414, 728][row]}`, "+repage",
        "-channel", "A", "-threshold", "50%", "+channel", "-filter", "point", "-resize", "48x24!",
        "-write", "mpr:alpha", "+dither", "-remap", palette, "mpr:alpha", "-compose", "CopyAlpha", "-composite",
        "-channel", "A", "-fill", "none", "-draw", "rectangle 0,0 47,1 rectangle 0,22 47,23 rectangle 0,0 1,23 rectangle 46,0 47,23", "+channel",
        "-strip", `PNG32:${file}`]); frames.push(file);
    }
    const bright = p(`${material}-bright`), base = p(`${material}-base`);
    // +append preserves each shared 48-pixel motif without resampling halves.
    run([...frames, "+append", `PNG32:${bright}`]);
    const args = [bright];
    colors.forEach((color, i) => args.push("-fill", `rgb(1,5,${i + 1})`, "-opaque", `#${color}`));
    dim.forEach((color, i) => args.push("-fill", `#${color}`, "-opaque", `rgb(1,5,${i + 1})`));
    run([...args, `PNG32:${p(`${material}-dim`)}`]);
    run([bright, p(`${material}-dim`), "-append", `PNG32:${base}`]);
    for (let tone = 0; tone < (material === "earth" ? 1 : tones.length); tone++) {
      const id = dungeonDetailId(material, tone), args = [base];
      if (material !== "earth") {
        gray.forEach((color, i) => args.push("-fill", `rgb(1,6,${i + 1})`, "-opaque", `#${color}`));
        tones[tone].forEach((color, i) => args.push("-fill", `#${color}`, "-opaque", `rgb(1,6,${i + 1})`));
      }
      run([...args, "-strip", `PNG32:${join(out, `${id}.png`)}`]);
      manifest.assets[id] = { file: `${id}.png`, width: 192, height: 48, tile: true };
    }
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Prepared 21 contextual detail atlases: four original two-tile motifs in two native shade levels per material/biome.");
} finally { rmSync(scratch, { recursive: true, force: true }); }
