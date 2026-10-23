// The open menu's X, drawn pixel by pixel in the hamburger's (ui-menu) palette
// and stroke weight: cream strokes, a green underside, an amber right edge
// and the kit's near-black outline. Edit the matrix and rerun.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const id = "ui-menu-close";
const PALETTE = { A: [12, 16, 22], B: [238, 224, 183], C: [225, 187, 120], D: [167, 189, 117] };
const PIXELS = `
........................
.AAAAA...........AAAAA..
.ABBCAA.........AACBBA..
.ABBBCAA.......AACBBBA..
.ADBBBCAA.....AACBBBDA..
.AADBBBCAA...AACBBBDAA..
..AADBBBCAA.AACBBBDAA...
...AADBBBCAAACBBBDAA....
....AADBBBCACBBBDAA.....
.....AADBBBBBBBDAA......
......AADBBBBBDAA.......
.......AABBBBBAA........
......AABBBBBBCAA.......
.....AABBBBBBBBCAA......
....AABBBBDADBBBCAA.....
...AABBBBDAAADBBBCAA....
..AABBBBDAA.AADBBBCAA...
.AABBBBDAA...AADBBBCAA..
.ABBBBDAA.....AADBBBCA..
.ABBBDAA.......AADBBBA..
.ADDDAA.........AADDDA..
.AAAAA...........AAAAA..
........................
........................`.trim().split("\n");
const size = PIXELS.length;
const rows = PIXELS.map(row => Buffer.concat([Buffer.from([0]), ...[...row].map(k => Buffer.from(k === "." ? [0, 0, 0, 0] : [...PALETTE[k], 255]))]));
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header.set([8, 6, 0, 0, 0], 8);
writeFileSync(join(out, `${id}.png`), Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]));
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
manifest.assets[id] = { file: `${id}.png`, width: size, height: size };
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${id}.`);
