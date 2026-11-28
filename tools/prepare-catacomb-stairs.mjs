// Draw the Catacombs stairwell on the native 24px grid with the kit palette.
import { readFileSync, writeFileSync } from "node:fs";
import { encodePng } from "./ui-atlas-png.mjs";

const rows = [
  "........................",
  "........................",
  ".....oooooooooooooo.....",
  "....ohhhhhhhhhhhhsso....",
  "...ohssssssssssssssoo...",
  "...osokkkkkkkkkkkoso....",
  "...osokkkkkkkkkkkoso....",
  "...osokkkkkkkkkkkoso....",
  "...osokkkkkkkkkkkoso....",
  "...osokkkkkkkkkkkoso....",
  "...osokddddddddddoso....",
  "...osoktttttttttdoso....",
  "...osokddddddddddoso....",
  "...osokssssssssssoso....",
  "...osottttttttttdoso....",
  "...osodddddddddddoso....",
  "...osohhhhhhhhhssoso....",
  "...osottttttttttdoso....",
  "...oshhhhhhhhhhhhhso....",
  "...othhhhhhhssssssso....",
  "....oooooooooooooooo....",
  "........................",
  "........................",
  "........................",
];
const palette = readFileSync("assets/ui-sprites/palette.ppm", "utf8").replace(/#[^\n]*/g, "").trim().split(/\s+/).slice(4).map(Number);
const colors = { o: 0, k: 1, d: 2, t: 3, s: 4, h: 6 };
const pixels = Buffer.alloc(24 * 24 * 4);
for (const [y, row] of rows.entries()) {
  if (row.length !== 24) throw new Error(`Invalid width on row ${y}`);
  for (const [x, key] of [...row].entries()) {
    if (key === ".") continue;
    const start = colors[key] * 3;
    pixels.set([...palette.slice(start, start + 3), 255], (y * 24 + x) * 4);
  }
}
const dir = "public/assets/style", id = "catacomb-stairs-down", file = `${id}.png`;
writeFileSync(`${dir}/${file}`, encodePng(24, 24, pixels));
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
manifest.assets[id] = { file, width: 24, height: 24, tile: true };
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
