import { deflateSync } from "node:zlib";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "public", "assets", "tilesets", "area1");
const SIZE = 24;
const PALETTE = {
  floor: "#273442", floorLight: "#3a4a59", floorDark: "#151e28",
  wall: "#39495a", wallLight: "#8fa0ad", wallMid: "#607283",
  seam: "#1c2733", shadow: "#111923", accent: "#b8b29f",
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

function stone(p, x, y, w, h, fill = PALETTE.floor) {
  rect(p, x, y, w, h, PALETTE.floorDark);
  if (w > 2 && h > 2) rect(p, x + 1, y + 1, w - 2, h - 2, fill);
  if (w > 3) rect(p, x + 2, y + 1, w - 3, 1, PALETTE.floorLight);
  if (h > 3) rect(p, x + 1, y + 2, 1, h - 3, PALETTE.floorLight);
  if (w > 3) rect(p, x + 2, y + h - 2, w - 3, 1, PALETTE.shadow);
}

function floorTile(variant) {
  const p = canvas(PALETTE.floorDark);
  if (variant === 0) {
    stone(p, 0, 0, 12, 8); stone(p, 12, 0, 12, 8); stone(p, 0, 8, 17, 10); stone(p, 17, 8, 7, 10);
    stone(p, 0, 18, 9, 6); stone(p, 9, 18, 15, 6);
    px(p, [[8,12],[9,13],[10,14],[10,15],[16,4]], PALETTE.shadow);
  } else if (variant === 1) {
    stone(p, 0, 0, 9, 12); stone(p, 9, 0, 15, 7); stone(p, 9, 7, 15, 8);
    stone(p, 0, 12, 9, 12); stone(p, 9, 15, 8, 9); stone(p, 17, 15, 7, 9);
    px(p, [[19,4],[20,5],[5,17],[6,17]], PALETTE.shadow);
  } else if (variant === 2) {
    // Chunky, hand-laid cobbles with clipped corners rather than noisy dots.
    for (const [x,y,w,h] of [[0,0,8,7],[8,0,9,6],[17,0,7,8],[0,7,10,9],[10,6,8,9],[18,8,6,8],[0,16,7,8],[7,16,10,8],[17,16,7,8]]) {
      stone(p, x, y, w, h, "#304050");
      px(p, [[x,y],[x+w-1,y],[x,y+h-1],[x+w-1,y+h-1]], PALETTE.floorDark);
    }
    px(p, [[4,3],[13,10],[20,12],[11,20]], PALETTE.floorLight);
  } else {
    for (let y = 0; y < 24; y += 6) for (let x = 0; x < 24; x += 6)
      stone(p, x, y, 6, 6, (x + y) % 12 ? "#2b3948" : "#314151");
    px(p, [[3,15],[4,14],[5,14],[15,8],[16,9],[17,9],[19,20]], PALETTE.shadow);
    px(p, [[7,3],[20,10]], PALETTE.accent);
  }
  return p;
}

function wallTile(mask, variant = 0) {
  const p = canvas(PALETTE.seam);
  // Recessed masonry core: irregular courses, darker than the pale structural rim.
  const splits = [[8,16],[11,19],[6,15]][variant % 3];
  stone(p, 0, 0, splits[0], 8, PALETTE.wall); stone(p, splits[0], 0, splits[1]-splits[0], 8, "#415264"); stone(p, splits[1], 0, 24-splits[1], 8, PALETTE.wall);
  stone(p, 0, 8, 13, 8, "#435568"); stone(p, 13, 8, 11, 8, PALETTE.wall);
  stone(p, 0, 16, 7 + variant * 2, 8, PALETTE.wall); stone(p, 7 + variant * 2, 16, 10, 8, "#425365"); stone(p, 17 + variant * 2, 16, 7 - variant * 2, 8, PALETTE.wall);
  const rim = PALETTE.wallLight, hi = "#c1c2b5", mid = PALETTE.wallMid, low = "#344354";
  // Thick, block-jointed exposed faces match the authoritative concept sheet.
  if (!(mask & 1)) {
    rect(p, 0, 0, 24, 6, rim); rect(p, 0, 0, 24, 1, hi); rect(p, 0, 5, 24, 1, low);
    rect(p, 8 + variant * 3, 0, 1, 6, mid); rect(p, 17, 0, 1, 6, mid);
  }
  if (!(mask & 2)) {
    rect(p, 18, 0, 6, 24, rim); rect(p, 18, 0, 1, 24, hi); rect(p, 23, 0, 1, 24, low);
    rect(p, 18, 8 + variant * 2, 6, 1, mid); rect(p, 18, 17, 6, 1, mid);
  }
  if (!(mask & 4)) {
    rect(p, 0, 18, 24, 6, rim); rect(p, 0, 18, 24, 1, hi); rect(p, 0, 23, 24, 1, low);
    rect(p, 7, 18, 1, 6, mid); rect(p, 16 - variant * 2, 18, 1, 6, mid);
  }
  if (!(mask & 8)) {
    rect(p, 0, 0, 6, 24, rim); rect(p, 0, 0, 1, 24, hi); rect(p, 5, 0, 1, 24, low);
    rect(p, 0, 7, 6, 1, mid); rect(p, 0, 16 + variant, 6, 1, mid);
  }
  px(p, variant === 0 ? [[3,3],[20,11],[11,20]] : variant === 1 ? [[5,12],[20,4],[14,21]] : [[3,19],[11,4],[20,13]], "#7b8d9c");
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
