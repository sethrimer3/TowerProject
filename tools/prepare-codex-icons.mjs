// The Codex's icons, drawn pixel by pixel in the hamburger's (ui-menu)
// palette: a cream disc in the kit's near-black outline, shaded green at its
// lower right and amber at its upper left, bearing an "i" (ui-codex, the
// menu's Codex button) or a "?" (ui-codex-help, the Codex's How to progress).
// Edit the glyphs and rerun.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const PALETTE = { A: [12, 16, 22], B: [238, 224, 183], C: [225, 187, 120], D: [167, 189, 117] };
const SIZE = 24;
const GLYPHS = {
  "ui-codex": `
...AAAA...
...AAAA...
..........
.AAAAAA...
.AAAAAA...
...AAAA...
...AAAA...
...AAAA...
...AAAA...
...AAAA...
.AAAAAAAA.
.AAAAAAAA.`,
  "ui-codex-help": `
..AAAAAA..
.AAAAAAAA.
.AAA..AAAA
......AAAA
.....AAAA.
....AAAA..
....AAA...
....AAA...
..........
....AAA...
....AAA...
..........`,
};
/** The disc's pixels, the glyph centred on it. */
function draw(glyph) {
  const rows = glyph.trim().split("\n"), gw = rows[0].length, gh = rows.length;
  const gx = Math.floor((SIZE - gw) / 2), gy = Math.floor((SIZE - gh) / 2);
  const c = (SIZE - 1) / 2;
  return Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => {
    const d = Math.hypot(x - c, y - c);
    if (d > 11.4) return ".";
    if (d > 10) return "A";
    const g = rows[y - gy]?.[x - gx];
    if (g === "A") return "A";
    if (d > 8.4 && x + y > SIZE + 1) return "D";
    if (d > 8.4 && x + y < SIZE - 3) return "C";
    return "B";
  }).join(""));
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
for (const [id, glyph] of Object.entries(GLYPHS)) {
  const rows = draw(glyph).map(row => Buffer.concat([Buffer.from([0]), ...[...row].map(k => Buffer.from(k === "." ? [0, 0, 0, 0] : [...PALETTE[k], 255]))]));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0); header.writeUInt32BE(SIZE, 4); header.set([8, 6, 0, 0, 0], 8);
  writeFileSync(join(out, `${id}.png`), Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]));
  manifest.assets[id] = { file: `${id}.png`, width: SIZE, height: SIZE };
  console.log(`Prepared ${id}.`);
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
