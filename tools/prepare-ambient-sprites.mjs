// Native effect frames and small registered changes to the original hero.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const scratch = mkdtempSync(join(tmpdir(), "ambient-sprites-")), p = name => join(scratch, `${name}.png`);
const run = args => execFileSync("magick", args[0] === "identify" ? ["identify", ...args.slice(1)] : ["-limit", "thread", "1", ...args]);
const palette = join(root, "assets/ui-sprites/palette.ppm");
const normalize = ["-write", "mpr:alpha", "+dither", "-remap", palette, "mpr:alpha", "-geometry", "+0+0", "-compose", "CopyAlpha", "-composite", "-strip"];
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
const source = name => join(root, `assets/game-sprites/${name}.png`);
const dimensions = file => run(["identify", "-format", "%w %h", file]).toString().split(" ").map(Number);
const cell = (file, col, row, cols, rows) => {
  const [w, h] = dimensions(file), x0 = Math.floor(col * w / cols), y0 = Math.floor(row * h / rows);
  return [file, "-crop", `${Math.floor((col + 1) * w / cols) - x0}x${Math.floor((row + 1) * h / rows) - y0}+${x0}+${y0}`, "+repage"];
};
function strip(id, frames) {
  run([...frames, "+append", "-strip", `PNG32:${join(out, `${id}.png`)}`]);
  manifest.assets[id] = { file: `${id}.png`, width: frames.length * 24, height: 24, tile: true };
}
try {
  run(["-size", "24x24", "canvas:none", "-strip", `PNG32:${p("blank")}`]);
  const bubbles = [p("blank")], glints = [p("blank")];
  for (let i = 0; i < 4; i++) {
    const [x, y] = [[10, 14], [11, 13], [10, 12], [10, 11]][i];
    run([...cell(source("ambient-effects"), i, 0, 4, 2), "-channel", "A", "-threshold", "70%", "+channel", "-trim", "+repage",
      "-filter", "point", "-resize", "3x4!", "-background", "none", "-gravity", "northwest", "-splice", `${x}x${y}`, "-extent", "24x24",
      "(", join(out, "potion-red.png"), join(out, "potion-blue.png"), "-compose", "DstIn", "-composite", ")", "-geometry", "+0+0", "-compose", "DstIn", "-composite",
      ...normalize, `PNG32:${p(`bubble-${i}`)}`]); bubbles.push(p(`bubble-${i}`));
    const size = [1, 3, 5, 3][i], offset = Math.floor(size / 2);
    run([...cell(source("ambient-effects"), i, 1, 4, 2), "-channel", "A", "-threshold", "70%", "+channel", "-trim", "+repage",
      "-filter", "point", "-resize", `${size}x${size}!`, "-background", "none", "-gravity", "northwest", "-splice", `${15 - offset}x${7 - offset}`, "-extent", "24x24",
      ...normalize, `PNG32:${p(`glint-${i}`)}`]); glints.push(p(`glint-${i}`));
  }
  strip("ambient-potion-bubbles", bubbles); strip("ambient-key-shine", glints);
  for (const [row, facing] of ["down", "up", "left", "right"].entries()) {
    const original = join(out, `hero-${facing}.png`);
    const bounds = run([original, "-trim", "-format", "%w %h %X %Y", "info:"]).toString().split(" ").map(Number);
    const [w, h, x, y] = bounds;
    for (let frame = 0; frame < 4; frame++) run([...cell(source("hero-idle"), frame, row, 4, 4), "-channel", "A", "-threshold", "70%", "+channel",
      "-trim", "+repage", "-filter", "point", "-resize", `${w}x${h}!`, "-background", "none", "-gravity", "northwest", "-splice", `${x}x${y}`, "-extent", "24x24", ...normalize, `PNG32:${p(`hero-${frame}`)}`]);
    const frames = [original];
    // Preserve the exact original helmet, feet, gear and alpha silhouette.
    // Only changed torso/inner-cape pixels from the generated sequence apply.
    run(["-size", "24x24", "canvas:black", "-fill", "white", "-draw", facing === "up" ? "rectangle 8,12 15,19" : "rectangle 9,11 13,18", `PNG32:${p("torso-mask")}`]);
    for (let frame = 1; frame < 4; frame++) {
      run([p("hero-0"), p(`hero-${frame}`), "-compose", "Difference", "-composite", "-alpha", "off", "-colorspace", "Gray", "-threshold", "12%",
        p("torso-mask"), "-compose", "Multiply", "-composite", `PNG32:${p("difference")}`]);
      run([original, "(", p(`hero-${frame}`), "(", p("difference"), "-alpha", "off", ")", "-compose", "CopyAlpha", "-composite", ")", "-compose", "Over", "-composite",
        original, "-compose", "CopyAlpha", "-composite", ...normalize, `PNG32:${p(`idle-${frame}`)}`]); frames.push(p(`idle-${frame}`));
    }
    strip(`ambient-hero-${facing}`, frames);
  }
  const skulls = [];
  for (let frame = 0; frame < 6; frame++) {
    run([...cell(source("death-skull"), frame % 3, Math.floor(frame / 3), 3, 2), "-channel", "A", "-threshold", "80%", "+channel",
      "-trim", "+repage", "-filter", "point", "-resize", "20x20!", "-background", "none", "-gravity", "northwest", "-splice", "2x2", "-extent", "24x24",
      ...normalize, `PNG32:${p(`skull-${frame}`)}`]); skulls.push(p(`skull-${frame}`));
  }
  strip("ambient-death-skull", skulls);
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Prepared potion bubbles, rare key glints, four registered hero idle strips and six skull frames.");
} finally { rmSync(scratch, { recursive: true, force: true }); }
