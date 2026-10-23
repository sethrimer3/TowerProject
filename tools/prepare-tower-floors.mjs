// Keep the complete authored paving field: splitting independent swatches
// would break the large slabs and staggered joints at tile boundaries.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tones } from "./dungeon-palette.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const scratch = mkdtempSync(join(tmpdir(), "tower-floors-"));
const run = args => execFileSync("magick", ["-limit", "thread", "1", ...args]);
const colors = ["1b2430", "293543", "3e4c59", "63717b"];
try {
  const palette = join(scratch, "floor.ppm"), base = join(scratch, "floor.png");
  writeFileSync(palette, `P3\n4 1\n255\n${colors.flatMap(c => [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16))).join(" ")}\n`);
  run([join(root, "assets/game-sprites/tower-floor.png"), "-alpha", "off", "-filter", "point", "-resize", "96x96!",
    "+dither", "-remap", palette, "-alpha", "on", "-strip", `PNG32:${base}`]);
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  for (const [tone, ramp] of tones.entries()) {
    const id = `dungeon-floor-masonry-${tone}`;
    // Isolate source colors before replacing, so ramp colors cannot cascade.
    const args = [base];
    colors.forEach((color, i) => args.push("-fill", `rgb(${i + 1},0,0)`, "-opaque", `#${color}`));
    colors.forEach((_, i) => args.push("-fill", `#${ramp[i + 1]}`, "-opaque", `rgb(${i + 1},0,0)`));
    run([...args, "-strip", `PNG32:${join(out, `${id}.png`)}`]);
    manifest.assets[id] = { file: `${id}.png`, width: 96, height: 96, tile: true };
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Prepared ten connected 4×4 Tower paving panels with mixed-size bricks.");
} finally { rmSync(scratch, { recursive: true, force: true }); }
