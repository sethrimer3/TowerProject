import { deflateSync } from "node:zlib";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "public", "assets", "tilesets", "area1");
const SIZE = 24;
const PALETTE = {
  floor: "#202a36", floorLight: "#2a3644", floorDark: "#171f2a",
  wall: "#536273", wallLight: "#718092", wallMid: "#465464",
  seam: "#283442", shadow: "#1b2530", accent: "#9b927f",
};

const rgba = (hex) => [...hex.matchAll(/[0-9a-f]{2}/gi)].map((m) => parseInt(m[0], 16)).concat(255);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
};
function save(name, pixels) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = y * (SIZE * 4 + 1); raw[row] = 0;
    for (let x = 0; x < SIZE; x++) Buffer.from(pixels[y * SIZE + x]).copy(raw, row + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  writeFileSync(join(OUT, name), png);
}
const canvas = (color) => Array.from({ length: SIZE * SIZE }, () => rgba(color));
const rect = (p, x, y, w, h, color) => {
  const ink = rgba(color);
  for (let yy = Math.max(0, y); yy < Math.min(SIZE, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(SIZE, x + w); xx++) p[yy * SIZE + xx] = ink;
};
const px = (p, points, color) => points.forEach(([x, y]) => rect(p, x, y, 1, 1, color));

function floorTile(variant) {
  const p = canvas(PALETTE.floor);
  rect(p, 0, 0, 24, 1, PALETTE.floorDark); rect(p, 0, 23, 24, 1, PALETTE.floorDark);
  rect(p, 0, 1, 1, 22, PALETTE.floorDark); rect(p, 23, 1, 1, 22, PALETTE.floorDark);
  if (variant === 0) { rect(p, 2, 2, 20, 1, PALETTE.floorLight); px(p, [[5,7],[6,7],[13,18]], PALETTE.floorLight); }
  if (variant === 1) { rect(p, 3, 11, 18, 1, PALETTE.floorDark); rect(p, 11, 2, 1, 9, PALETTE.floorDark); px(p, [[4,4],[17,16]], PALETTE.floorLight); }
  if (variant === 2) { px(p, [[4,5],[5,5],[6,6],[7,6],[7,7],[16,17],[17,17],[17,16]], PALETTE.floorDark); px(p, [[18,6],[8,16]], PALETTE.floorLight); }
  if (variant === 3) { rect(p, 2, 19, 8, 1, PALETTE.floorDark); px(p, [[9,18],[10,17],[15,5],[16,5],[18,13]], PALETTE.floorLight); px(p, [[5,14],[6,14]], PALETTE.accent); }
  return p;
}

function wallTile(mask, variant = 0) {
  const p = canvas(PALETTE.wall);
  // Three staggered masonry courses, with tiny variant-dependent offsets.
  rect(p, 0, 0, 24, 2, PALETTE.wallLight);
  rect(p, 0, 7, 24, 2, PALETTE.seam); rect(p, 0, 15, 24, 2, PALETTE.seam);
  const topSplit = [8, 13, 17][variant % 3], middleSplit = [15, 9, 12][variant % 3];
  rect(p, topSplit, 1, 2, 6, PALETTE.seam); rect(p, middleSplit, 9, 2, 6, PALETTE.seam);
  rect(p, 6 + variant * 4, 17, 2, 6, PALETTE.seam);
  rect(p, 0, 22, 24, 2, PALETTE.shadow);
  px(p, variant === 0 ? [[4,4],[18,11],[11,19]] : variant === 1 ? [[6,11],[19,4],[14,20]] : [[3,18],[11,4],[20,12]], PALETTE.wallMid);
  // Connected sides keep their masonry open; exposed sides receive a strong rim.
  if (!(mask & 1)) { rect(p, 0, 0, 24, 2, PALETTE.wallLight); rect(p, 0, 2, 24, 1, PALETTE.wallMid); }
  if (!(mask & 2)) { rect(p, 21, 0, 3, 24, PALETTE.shadow); rect(p, 20, 0, 1, 24, PALETTE.wallLight); }
  if (!(mask & 4)) { rect(p, 0, 21, 24, 3, PALETTE.shadow); rect(p, 0, 20, 24, 1, PALETTE.wallMid); }
  if (!(mask & 8)) { rect(p, 0, 0, 3, 24, PALETTE.shadow); rect(p, 3, 0, 1, 24, PALETTE.wallLight); }
  return p;
}

const DOOR_COLORS = { a: "#d4aa55", b: "#5f9fd0", c: "#c56268" };
function symbol(p, kind, cx, cy, color) {
  const dark = PALETTE.shadow;
  if (kind === "a") {
    rect(p, cx - 2, cy - 3, 5, 1, color); rect(p, cx - 2, cy + 3, 5, 1, dark);
    rect(p, cx - 3, cy - 2, 1, 5, color); rect(p, cx + 3, cy - 2, 1, 5, dark);
  } else if (kind === "b") {
    rect(p, cx, cy - 4, 1, 1, color); rect(p, cx - 1, cy - 3, 3, 1, color);
    rect(p, cx - 2, cy - 2, 5, 1, color); rect(p, cx - 3, cy - 1, 7, 3, color);
    rect(p, cx - 2, cy + 2, 5, 1, dark); rect(p, cx - 1, cy + 3, 3, 1, dark); rect(p, cx, cy + 4, 1, 1, dark);
  } else if (kind === "c") {
    rect(p, cx, cy - 4, 1, 1, color); rect(p, cx - 1, cy - 3, 3, 1, color);
    rect(p, cx - 2, cy - 2, 5, 1, color); rect(p, cx - 3, cy - 1, 7, 1, color);
    rect(p, cx - 3, cy, 7, 2, dark);
  } else if (kind === "steel") {
    rect(p, cx, cy - 4, 1, 9, color); rect(p, cx - 4, cy, 9, 1, color);
    rect(p, cx - 2, cy - 2, 5, 5, dark); rect(p, cx, cy - 1, 1, 3, color);
  } else {
    // Restrained heart crest, kept blocky and symmetrical.
    rect(p, cx - 4, cy - 2, 3, 3, color); rect(p, cx + 2, cy - 2, 3, 3, color);
    rect(p, cx - 3, cy, 7, 3, color); rect(p, cx - 2, cy + 3, 5, 1, color);
    rect(p, cx - 1, cy + 4, 3, 1, PALETTE.shadow);
  }
}
function doorTile(id) {
  const p = canvas(PALETTE.wall);
  // Shared stone jamb, timber leaf and iron bands keep all nine variants in
  // the same weathered-keep family.
  rect(p, 3, 1, 18, 23, PALETTE.shadow); rect(p, 5, 2, 14, 22, "#332d2c");
  rect(p, 6, 3, 3, 20, "#443936"); rect(p, 15, 3, 3, 20, "#443936");
  rect(p, 1, 0, 22, 3, PALETTE.wallLight); rect(p, 1, 3, 4, 21, PALETTE.wallMid);
  rect(p, 19, 3, 4, 21, PALETTE.shadow); rect(p, 5, 7, 14, 3, PALETTE.seam);
  rect(p, 5, 19, 14, 3, PALETTE.seam); px(p, [[7,8],[16,8],[7,20],[16,20]], PALETTE.wallLight);
  const ids = id === "abc" ? ["a", "b", "c"] : id.length === 2 ? id.split("") : [id];
  if (id === "steel") {
    rect(p, 5, 3, 14, 16, PALETTE.wallMid); rect(p, 6, 4, 12, 1, PALETTE.wallLight);
    symbol(p, "steel", 12, 13, "#c5ced8");
  } else if (id === "heart") {
    rect(p, 8, 10, 9, 9, PALETTE.wallMid); symbol(p, "heart", 12, 13, "#d97882");
  } else if (ids.length === 1) {
    symbol(p, ids[0], 12, 14, DOOR_COLORS[ids[0]]);
  } else {
    const positions = ids.length === 2 ? [[8, 14], [16, 14]] : [[7, 14], [12, 14], [17, 14]];
    ids.forEach((lock, i) => symbol(p, lock, positions[i][0], positions[i][1], DOOR_COLORS[lock]));
    if (ids.length === 3) rect(p, 5, 4, 14, 2, PALETTE.wallLight);
  }
  return p;
}

mkdirSync(OUT, { recursive: true });
for (let i = 0; i < 4; i++) save(`floor_0${i + 1}.png`, floorTile(i));
const roles = [
  "isolated", "cap_n", "cap_e", "corner_ne", "cap_s", "vertical", "corner_se", "tee_e",
  "cap_w", "corner_nw", "horizontal", "tee_n", "corner_sw", "tee_w", "tee_s", "cross",
];
for (let mask = 0; mask < 16; mask++) save(`wall_${roles[mask]}.png`, wallTile(mask, mask % 3));
for (let i = 0; i < 3; i++) save(`wall_center_0${i + 1}.png`, wallTile(15, i));
mkdirSync(join(OUT, "doors"), { recursive: true });
const doorIds = ["a", "b", "c", "ab", "ac", "bc", "abc", "steel", "heart"];
for (const id of doorIds) {
  const pixels = doorTile(id);
  // save() targets the tileset root; move the completed bytes into doors/.
  save(`door_${id}.png`, pixels);
  renameSync(join(OUT, `door_${id}.png`), join(OUT, "doors", `door_${id}.png`));
}
writeFileSync(join(OUT, "tileset.json"), JSON.stringify({
  tileSize: 24, palette: PALETTE, floor: ["floor_01.png", "floor_02.png", "floor_03.png", "floor_04.png"],
  wallBitOrder: { north: 1, east: 2, south: 4, west: 8 },
  walls: Object.fromEntries(roles.map((role, mask) => [mask, `wall_${role}.png`])),
  centerVariants: ["wall_center_01.png", "wall_center_02.png", "wall_center_03.png"],
  doors: Object.fromEntries(doorIds.map((id) => [id, `doors/door_${id}.png`])),
  doorSymbols: { a: "circle", b: "diamond", c: "triangle", steel: "four-point universal", heart: "heart crest" },
}, null, 2) + "\n");
console.log(`Generated 32 opaque 24x24 PNG tiles in ${OUT}`);
