// Extract engine-ready components from the selected image-generation atlas.
// ImageMagick is an authoring dependency only; the game loads plain PNGs.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const source = process.argv[2] ?? fileURLToPath(new URL("../assets/ui-sprites/source-atlas.png", import.meta.url));
const palette = fileURLToPath(new URL("../assets/ui-sprites/palette.ppm", import.meta.url));
const out = fileURLToPath(new URL("../public/assets/ui/frames/", import.meta.url));
mkdirSync(out, { recursive: true });
const names = [
  "button", "button-hover", "button-pressed", "button-selected",
  "button-disabled", "button-danger", "panel", "dialog",
  "field", "track", "fill-blue", "fill-red",
  "fill-green", "surface", "banner", "slot",
];
// Measured content bounds of the selected 1254 × 1254 source, padded to
// retain corner fittings. Logical dimensions and slice widths stay fixed.
const columns = [[20, 294], [332, 286], [637, 288], [943, 291]];
const rows = [[115, 161], [401, 163], [691, 156], [976, 161]];
const manifest = { nativeScale: 2, palette: "slate-and-brass", assets: {} };
for (const [index, name] of names.entries()) {
  const [x, w] = columns[index % 4], [y, h] = rows[Math.floor(index / 4)];
  let crop = `${w}x${h}+${x}+${y}`, size = "48x24!", slice = 6;
  // Fills and surface are repeatable interiors, without a frame baked in.
  if (name.startsWith("fill-")) {
    crop = `160x32+${x + 58}+${y + 57}`;
    size = "16x4!";
    slice = 0;
  } else if (name === "surface") {
    crop = `120x60+${x + 75}+${y + 45}`;
    size = "24x12!";
    slice = 0;
  }
  await new Promise((resolve, reject) => {
    const child = spawn("magick", ["-limit", "thread", "1", source, "-crop", crop, "+repage", "-channel", "A",
      "-threshold", "50%", "+channel", "-filter", "point", "-resize", size,
      "+dither", "-remap", palette, "-strip", `PNG32:${join(out, `${name}.png`)}`], { stdio: "inherit", timeout: 10000 });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Exporting ${name}: exit ${code}`)));
  });
  const [width, height] = size.replace("!", "").split("x").map(Number);
  manifest.assets[name] = { file: `${name}.png`, width, height, slice };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${names.length} PNG UI components in ${out}`);
