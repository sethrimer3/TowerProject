import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SQUARE_DOORS, SPRITE_TORCH_FRAMES } from "../src/sprite-options.ts";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const scratch = mkdtempSync(join(tmpdir(), "sprite-options-")), p = name => join(scratch, `${name}.png`);
const run = args => execFileSync("magick", ["-limit", "thread", "1", ...args]);
const palette = join(root, "assets/ui-sprites/palette.ppm");
const normalize = ["-write", "mpr:alpha", "+dither", "-remap", palette, "mpr:alpha", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip"];
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
try {
  for (const [i, door] of SQUARE_DOORS.entries()) {
    const id = `square-door-${door}`;
    run([join(root, "assets/game-sprites/square-doors.png"), "-crop", `480x480+${i % 3 * 492 + 38}+${Math.floor(i / 3) * 486 + 22}`, "+repage",
      "-channel", "A", "-threshold", "70%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "24x24!", "-alpha", "off", "-alpha", "on",
      ...normalize, `PNG32:${join(out, `${id}.png`)}`]);
    manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24, tile: true };
  }
  const frames = [];
  for (let i = 0; i < SPRITE_TORCH_FRAMES; i++) {
    const file = p(`torch-${i}`);
    run([join(root, "assets/game-sprites/torch-animation.png"), "-crop", `543x724+${i * 543}+0`, "+repage",
      "-channel", "A", "-threshold", "50%", "+channel", "-trim", "+repage", "-filter", "point", "-resize", "10x21!",
      "-background", "none", "-gravity", "northwest", "-splice", "7x1", "-extent", "24x24", "-crop", "24x11+0+0", "+repage",
      "-background", "none", "-gravity", "northwest", "-extent", "24x24",
      "(", join(out, "torch.png"), "-crop", "24x13+0+11", "+repage", ")", "-geometry", "+0+11", "-compose", "Over", "-composite",
      ...normalize, `PNG32:${file}`]); frames.push(file);
  }
  run([...frames, "+append", "-strip", `PNG32:${join(out, "torch-animation.png")}`]);
  manifest.assets["torch-animation"] = { file: "torch-animation.png", width: 96, height: 24, tile: true };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Prepared six native square doors and four palette-matched torch frames with stationary original hardware.");
} finally { rmSync(scratch, { recursive: true, force: true }); }
