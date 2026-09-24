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

const ITEM = {
  outline: "#0b121b", steelDark: "#344657", steel: "#8195a7", steelLight: "#d8e1df",
  woodDark: "#3b2522", wood: "#704733", woodLight: "#a36a42",
  goldDark: "#8c5924", gold: "#d9a63f", goldLight: "#ffe291",
  blueDark: "#175a8d", blue: "#238fc4", blueLight: "#9de4ff",
  redDark: "#8f2d3d", red: "#d94a56", redLight: "#ffadb0",
};
function itemCanvas() { return canvas("#00000000"); }
// Hand-placed pixel clusters: no rotated raster edges or fractional pixels.
function pixelItem(rows, palette, x = 2, y = 2) {
  const p = itemCanvas();
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (palette[ch]) rect(p, x + dx, y + dy, 1, 1, palette[ch]);
  }));
  // A one-pixel dark silhouette keeps every pickup readable on stone and grass.
  const ink = p.map((v) => v[3] !== 0);
  for (let yy = 1; yy < SIZE - 1; yy++) for (let xx = 1; xx < SIZE - 1; xx++) {
    const i = yy * SIZE + xx;
    if (!ink[i] && [i-1,i+1,i-SIZE,i+SIZE].some((n) => ink[n])) rect(p, xx, yy, 1, 1, ITEM.outline);
  }
  return p;
}
function keyTile(color, shape) {
  const prefix = color === "yellow" ? "gold" : color;
  const palette = { h: ITEM[prefix + "Light"], m: ITEM[prefix], d: ITEM[prefix + "Dark"] };
  const rows = [
    "............hhhh....",
    "..........hhmmmmhd..",
    "..........hm....md..",
    ".........hm......md.",
    ".........hm......md.",
    ".........hm......md.",
    "..........mm....md..",
    "..........hmmmmmdd..",
    ".........hmmdddd....",
    "........hmmd........",
    ".......hmmd.........",
    "......hmmd..........",
    "..h..hmmd...........",
    ".hmhhmmd............",
    "..hmmmd.............",
    "...hmd..............",
    "..hmmd..............",
    ".hmmmd..............",
    "..ddd...............",
  ];
  // Matching lock shapes distinguish the keys without relying on color.
  if (shape === "diamond") rows.splice(0, 8,
    "............hh......", "...........hmmhd....", "..........hm..mhd...", ".........hm....mhd..",
    "........hm......md..", ".........mm....md...", "..........mm..md....", "...........mmdd.....");
  if (shape === "triangle") rows.splice(0, 8,
    ".............h......", "............hmh.....", "...........hm.md....", "..........hm..mdd...",
    ".........hm....md...", "........hm.....mdd..", "........hmmmmmmmmd..", ".........dddddddd...");
  return pixelItem(rows, palette);
}
function potionTile(percent) {
  return pixelItem([
    "......cccccc......", "......clllcd......", ".......ggsg.......", "......ghhhsg......",
    ".......g.sg.......", "......gh..sg......", ".....gh....sg.....", "....gh......sg....",
    "...ghhmmmmmmmgg...", "...ghhmmmmmmmdg...", "...ghmmmmmmmmddg..",
    "...ghmmmmmmmmddg..", "...gmmmmmmmmmddg..", "...gsmmmmmmmmddg..",
    "....gsmmmmmmddg...", ".....gssddddgg....", "......gggggg......",
  ], { c: ITEM.woodDark, l: ITEM.woodLight, d: percent ? ITEM.redDark : ITEM.blueDark,
    m: percent ? ITEM.red : ITEM.blue, g: "#607e91", h: "#ecffff", s: "#afced9", '.': undefined }, 3, 3).map((pixel, i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    const mark = percent
      ? ((x === 11 && y === 13) || (x === 14 && y === 16) || (x + y === 27 && y >= 13 && y <= 16))
      : ((x === 12 && y >= 13 && y <= 17) || (y === 15 && x >= 10 && x <= 14));
    return mark ? rgba("#fff1d6") : pixel;
  });
}
function swordTile() {
  return pixelItem([
    "................gg..", "...............ghgd.", "..............wldd..", ".............wld....",
    ".........gh.wld.....", ".........ghgld......", "..........ghgd......", ".........shhgg......",
    "........shhsdgg.....", ".......shhsd..gg....", "......shhsd....d....", ".....shhsd..........",
    "....shhsd...........", "...shhsd............", "..shhsd.............", ".shhsd..............",
    ".hhsd...............", ".hsd................", ".sd.................",
  ], { g: ITEM.gold, h: "#f3fcf5", d: ITEM.steelDark, s: ITEM.steel, w: ITEM.woodDark, l: ITEM.woodLight });
}
function shieldTile() {
  return pixelItem([
    "........hh........", ".....hhhsshhh.....", "..hhhsssssssshhh..", ".hssggggggggggssd.",
    ".hsghbbbbbbbdgsd.", ".hsghbbbbbbbdgsd.", ".hsghbbggbbbdgsd.", ".hsghbbghbbbdgsd.",
    ".hsghggghggbdgsd.", "..sghbbghbbbdgsd.", "..sghbbgdbbbdgsd.", "..ssgbbbbbbdgssd.",
    "...ssgbbbbdgssd..", "....ssgbbdgssd...", ".....ssgdgssd....", "......ssgssd.....",
    ".......ssd.......", "........d........",
  ], { h: "#e5f6f3", s: ITEM.steel, d: ITEM.steelDark, g: ITEM.gold, b: "#305679" }, 3, 2);
}
function chestTile(tier, open = false) {
  const p = itemCanvas();
  const metal = tier === "gold" || tier === "treasure" ? [ITEM.goldDark, ITEM.gold, ITEM.goldLight]
    : tier === "platinum" ? ["#3f7187", "#8fc5d5", "#e4ffff"] : ["#425669", "#8297aa", "#d5e0e4"];
  const wood = tier === "platinum" ? ["#22394d", "#34546a", "#5c8295"] : [ITEM.woodDark, ITEM.wood, ITEM.woodLight];
  if (open) {
    // Raised lid, empty dark cavity, and dropped latch: unmistakably spent.
    rect(p, 2, 2, 20, 10, ITEM.outline); rect(p, 4, 3, 16, 7, wood[1]); rect(p, 5, 4, 14, 2, wood[2]);
    rect(p, 2, 8, 4, 5, metal[0]); rect(p, 18, 8, 4, 5, metal[0]); rect(p, 3, 9, 18, 3, metal[1]);
    rect(p, 1, 11, 22, 12, ITEM.outline); rect(p, 3, 12, 18, 8, wood[0]); rect(p, 5, 12, 14, 5, "#111820");
    rect(p, 1, 18, 22, 5, metal[0]); rect(p, 3, 19, 18, 2, metal[1]); rect(p, 1, 12, 4, 11, metal[1]); rect(p, 19, 12, 4, 11, metal[0]);
    rect(p, 9, 18, 6, 5, ITEM.outline); rect(p, 10, 19, 4, 3, metal[1]); rect(p, 11, 20, 2, 2, "#111820");
    if (tier === "gold") { px(p, [[9,2],[12,1],[15,2]], metal[2]); rect(p,9,3,7,2,metal[1]); }
    if (tier === "platinum") { rect(p,11,0,3,4,ITEM.outline); rect(p,12,0,1,3,metal[2]); }
    return p;
  }
  rect(p, 1, 5, 22, 18, ITEM.outline); rect(p, 4, 3, 16, 3, ITEM.outline);
  rect(p, 3, 6, 18, 7, wood[1]); rect(p, 5, 5, 14, 3, wood[2]); rect(p, 2, 13, 20, 9, wood[0]); rect(p, 4, 15, 16, 6, wood[1]);
  rect(p, 1, 11, 22, 4, metal[0]); rect(p, 2, 11, 20, 2, metal[1]); rect(p, 1, 20, 22, 3, metal[0]); rect(p, 3, 20, 18, 2, metal[1]);
  rect(p, 1, 5, 4, 18, metal[0]); rect(p, 2, 6, 3, 15, metal[1]); rect(p, 19, 5, 4, 18, metal[0]); rect(p, 19, 6, 3, 15, metal[1]);
  rect(p, 9, 11, 6, 7, ITEM.outline); rect(p, 10, 12, 4, 5, metal[1]); rect(p, 11, 13, 2, 3, metal[2]);
  px(p, [[5,7],[7,7],[4,10],[19,7],[19,12],[5,18],[18,18]], metal[2]);
  if (tier === "gold") {
    rect(p, 8, 4, 8, 3, ITEM.outline); px(p, [[9,3],[12,2],[15,3]], ITEM.outline);
    rect(p, 9, 5, 6, 1, metal[2]); px(p, [[9,4],[12,3],[15,4]], metal[2]);
  } else if (tier === "platinum") {
    rect(p, 10, 3, 5, 4, ITEM.outline); rect(p, 12, 2, 1, 5, metal[2]); rect(p, 10, 4, 5, 1, metal[2]);
    px(p, [[11,3],[13,3],[11,5],[13,5]], "#78ddec");
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
mkdirSync(join(OUT, "items"), { recursive: true });
const itemTiles = {
  key_yellow: keyTile("yellow", "circle"), key_blue: keyTile("blue", "diamond"), key_red: keyTile("red", "triangle"),
  potion_flat: potionTile(false), potion_percent: potionTile(true), upgrade_attack: swordTile(), upgrade_defense: shieldTile(),
  chest_treasure: chestTile("treasure"), chest_silver: chestTile("silver"), chest_gold: chestTile("gold"), chest_platinum: chestTile("platinum"),
  chest_treasure_open: chestTile("treasure", true), chest_silver_open: chestTile("silver", true),
  chest_gold_open: chestTile("gold", true), chest_platinum_open: chestTile("platinum", true),
};
for (const [id, pixels] of Object.entries(itemTiles)) {
  save(`${id}.png`, pixels); renameSync(join(OUT, `${id}.png`), join(OUT, "items", `${id}.png`));
}
writeFileSync(join(OUT, "tileset.json"), JSON.stringify({
  tileSize: 24, palette: PALETTE, floor: ["floor_01.png", "floor_02.png", "floor_03.png", "floor_04.png"],
  wallBitOrder: { north: 1, east: 2, south: 4, west: 8 },
  walls: Object.fromEntries(roles.map((role, mask) => [mask, `wall_${role}.png`])),
  centerVariants: ["wall_center_01.png", "wall_center_02.png", "wall_center_03.png"],
  doors: Object.fromEntries(doorIds.map((id) => [id, `doors/door_${id}.png`])),
  doorSymbols: { a: "circle", b: "diamond", c: "triangle", steel: "four-point universal", heart: "heart crest" },
  items: Object.fromEntries(Object.keys(itemTiles).map((id) => [id, `items/${id}.png`])),
}, null, 2) + "\n");
console.log(`Generated 47 deterministic 24x24 PNG sprites in ${OUT}`);
