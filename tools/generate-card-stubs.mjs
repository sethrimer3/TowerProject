// Draws the placeholder card faces in public/assets/cards/: a plain border,
// a simple pixel icon and the card's name. Real art replaces these later.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "public", "assets", "cards");
const W = 48, H = 64;

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, sum]);
};
function save(name, pixels) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) Buffer.from(pixels[y * W + x]).copy(raw, y * (W * 4 + 1) + 1 + x * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(join(OUT, name), Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]));
}

const rgba = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
const C = {
  back: "#1b222d", border: "#d6ae68", text: "#efd496", dark: "#10161f",
  stone: "#8a93a3", stone2: "#5d6677", red: "#c8453c", red2: "#8e2a26", glass: "#cfd8e6",
  wood: "#8a5a32", wood2: "#5e3a1f", gold: "#e8c050", gold2: "#a8822a",
  green: "#5fa451", green2: "#3a6e33", white: "#f2efe6", steel: "#c4ccd8", steel2: "#7d8898", blue: "#4f6fb0", sky: "#7fb0f0",
  orange: "#d9822b", orange2: "#94531a", purple: "#9a5fc8", purple2: "#633b86", pink: "#d98591", pink2: "#9c5560",
};
const canvas = () => Array.from({ length: W * H }, () => rgba(C.back));
const rect = (p, x, y, w, h, color) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && i < W && j >= 0 && j < H) p[j * W + i] = rgba(color);
};
const px = (p, points, color) => points.forEach(([x, y]) => rect(p, x, y, 1, 1, color));

// A 3 × 5 pixel font, just the letters the card names use.
const FONT = {
  A: ["010", "101", "111", "101", "101"], D: ["110", "101", "101", "101", "110"], E: ["111", "100", "110", "100", "111"],
  H: ["101", "101", "111", "101", "101"], I: ["111", "010", "010", "010", "111"], K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"], M: ["101", "111", "111", "101", "101"], N: ["110", "101", "101", "101", "101"],
  O: ["010", "101", "101", "101", "010"], P: ["110", "101", "110", "100", "100"], Q: ["010", "101", "101", "110", "011"],
  R: ["110", "101", "110", "101", "101"], S: ["011", "100", "010", "001", "110"], T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"], Y: ["101", "101", "010", "010", "010"],
  B: ["110", "101", "110", "101", "110"], C: ["011", "100", "100", "100", "011"], F: ["111", "100", "110", "100", "100"], W:["101", "101", "111", "111", "101"], " ": ["000", "000", "000", "000", "000"],
  G: ["011", "100", "101", "101", "011"],
};
/** The card's name under its icon: on two lines when one is too wide. */
function nameLabel(p, text) {
  if (text.length * 4 - 1 <= W - 4) return label(p, text, 50);
  const cut = text.lastIndexOf(" ");
  label(p, text.slice(0, cut), 47);
  label(p, text.slice(cut + 1), 54);
}
function label(p, text, y) {
  const width = text.length * 4 - 1;
  let x = Math.floor((W - width) / 2);
  for (const ch of text) {
    FONT[ch].forEach((row, j) => [...row].forEach((bit, i) => bit === "1" && rect(p, x + i, y + j, 1, 1, C.text)));
    x += 4;
  }
}

/** A key, in `color` with a `rim` round its bow. */
function key(p, color, rim) {
  rect(p, 11, 14, 11, 11, rim);
  rect(p, 12, 15, 9, 9, color);
  rect(p, 15, 18, 3, 3, C.back);
  rect(p, 21, 18, 16, 3, color);
  rect(p, 31, 21, 2, 5, color);
  rect(p, 35, 21, 2, 4, color);
}
/** A shield (DEF UP's icon). */
function shield(p) {
  rect(p, 14, 13, 20, 18, C.blue);
  rect(p, 16, 31, 16, 4, C.blue);
  rect(p, 20, 35, 8, 3, C.blue);
  rect(p, 17, 16, 14, 13, C.steel2);
  rect(p, 23, 16, 2, 19, C.blue);
}
/** A heart (KEY SIPHON's, under its key): the curve
 * (x² + y² − 1)³ ≤ x²y³ over 28 × 26 pixels, dark red round its edge with a
 * light spot on its upper left lobe. */
function heart(p) {
  const left = 10, top = 11, w = 28, h = 26;
  const inside = (i, j) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    const x = ((i + 0.5) / w) * 2.6 - 1.3, y = 1.25 - ((j + 0.5) / h) * 2.5;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inside(i, j)) continue;
      const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
      rect(p, left + i, top + j, 1, 1, edge ? C.red2 : C.red);
    }
  rect(p, 15, 15, 3, 2, C.white);
  rect(p, 14, 17, 2, 2, C.white);
}
/** A door in `face` with `frame` round it and a `knob`. */
function door(p, face = C.wood, frame = C.wood2, knob = C.gold) {
  rect(p, 13, 12, 22, 26, frame);
  rect(p, 15, 10, 18, 2, frame);
  rect(p, 15, 13, 18, 25, face);
  for (const x of [20, 26]) rect(p, x, 13, 1, 25, frame);
  rect(p, 29, 25, 2, 2, knob);
}
/** A monster in `body`, `shade` round its feet, with `chevrons` over it. */
function monster(p, body = C.green, shade = C.green2, chevrons = 0) {
  rect(p, 13, 16, 22, 20, shade);
  rect(p, 14, 14, 20, 20, body);
  rect(p, 12, 34, 4, 3, shade);
  rect(p, 32, 34, 4, 3, shade);
  rect(p, 17, 19, 5, 5, C.white);
  rect(p, 26, 19, 5, 5, C.white);
  rect(p, 19, 21, 2, 2, C.dark);
  rect(p, 28, 21, 2, 2, C.dark);
  rect(p, 18, 28, 12, 2, C.dark);
  px(p, [[19, 30], [22, 30], [25, 30], [28, 30]], C.white);
  for (let c = 0; c < chevrons; c++) {
    const x = 24 - chevrons * 3 + c * 6;
    px(p, [[x, 11], [x + 1, 10], [x + 2, 9], [x + 3, 10], [x + 4, 11]], C.gold);
  }
}
/** A small key laid across the icon (the siphons'), in `color` with `rim`. */
function smallKey(p, color, rim, y = 18) {
  rect(p, 11, y, 9, 9, rim);
  rect(p, 12, y + 1, 7, 7, color);
  rect(p, 14, y + 3, 3, 3, C.back);
  rect(p, 19, y + 3, 18, 3, rim);
  rect(p, 19, y + 4, 18, 1, color);
  rect(p, 31, y + 6, 2, 4, rim);
  rect(p, 35, y + 6, 2, 3, rim);
}
/** A sword (ATK UP's icon). */
function sword(p) {
  for (let i = 0; i < 18; i++) rect(p, 14 + i, 32 - i, 3, 3, C.steel);
  rect(p, 13, 29, 9, 3, C.gold2);
  rect(p, 17, 31, 3, 7, C.gold2);
  rect(p, 10, 36, 4, 4, C.wood);
}
// Icons fill the 32 × 32 area at (8, 8).
const ICONS = {
  stairs(p) {
    for (let s = 0; s < 5; s++) rect(p, 10 + s * 5, 34 - s * 5, 25 - s * 5, 5, s % 2 ? C.stone2 : C.stone);
    rect(p, 13, 10, 3, 10, C.gold);
    rect(p, 11, 12, 7, 2, C.gold);
    rect(p, 12, 11, 5, 1, C.gold);
  },
  heal(p) {
    rect(p, 21, 9, 6, 3, C.wood);
    rect(p, 22, 12, 4, 5, C.glass);
    rect(p, 15, 17, 18, 18, C.glass);
    rect(p, 16, 22, 16, 12, C.red);
    rect(p, 16, 32, 16, 2, C.red2);
    rect(p, 18, 23, 2, 5, C.white);
  },
  door: (p) => door(p),
  yellowKey: (p) => key(p, C.gold, C.gold2),
  blueKey: (p) => key(p, C.sky, C.blue),
  monster: (p) => monster(p),
  atkUp: sword,
  defUp: shield,
  keySiphon(p) {
    // Max HP traded for a yellow key: a small key laid over the heart,
    // reaching out past its edge.
    heart(p);
    smallKey(p, C.gold, C.gold2);
  },
  yellowDoor: (p) => door(p, C.gold, C.gold2, C.wood2),
  heartDoor(p) {
    door(p, C.pink, C.pink2, C.white);
    // A small heart on its middle panel.
    px(p, [[22, 19], [23, 19], [25, 19], [26, 19]], C.red);
    rect(p, 21, 20, 7, 2, C.red);
    rect(p, 22, 22, 5, 1, C.red);
    rect(p, 23, 23, 3, 1, C.red);
    px(p, [[24, 24]], C.red);
  },
  weakEnemy: (p) => monster(p, C.steel, C.steel2),
  baseEnemy: (p) => monster(p),
  strongEnemy: (p) => monster(p, C.orange, C.orange2, 1),
  eliteEnemy: (p) => monster(p, C.purple, C.purple2, 2),
  bossEnemy(p) {
    monster(p, C.red, C.red2);
    // A crown.
    rect(p, 16, 9, 16, 4, C.gold);
    px(p, [[16, 7], [16, 8], [23, 6], [24, 6], [23, 7], [24, 7], [23, 8], [24, 8], [31, 7], [31, 8]], C.gold);
    rect(p, 16, 12, 16, 1, C.gold2);
  },
  chest(p) {
    rect(p, 10, 18, 28, 18, C.wood2);
    rect(p, 11, 19, 26, 16, C.wood);
    rect(p, 11, 15, 26, 4, C.wood2);
    rect(p, 10, 24, 28, 2, C.gold2);
    for (const x of [14, 32]) rect(p, x, 15, 2, 21, C.gold2);
    rect(p, 22, 23, 4, 5, C.gold);
    rect(p, 23, 25, 2, 2, C.dark);
  },
  blueSiphon(p) {
    // DEF traded for a blue key.
    shield(p);
    smallKey(p, C.sky, C.blue);
  },
  blueTrader(p) {
    // Yellow keys for a blue one.
    smallKey(p, C.gold, C.gold2, 10);
    smallKey(p, C.sky, C.blue, 26);
  },
  keyToHp(p) {
    // A yellow key traded for HP: a heart with a white cross on it.
    heart(p);
    rect(p, 22, 17, 4, 12, C.white);
    rect(p, 18, 21, 12, 4, C.white);
  },
  redKey: (p) => key(p, C.red, C.red2),
  redSiphon(p) {
    // ATK traded for a red key.
    sword(p);
    smallKey(p, C.red, C.red2);
  },
  woodenDoor(p) {
    // Any one key opens it, or a hero breaks it down: a plank door with a
    // pip of each key colour.
    door(p);
    rect(p, 17, 17, 2, 2, C.gold);
    rect(p, 23, 17, 2, 2, C.sky);
    rect(p, 29, 17, 2, 2, C.red);
  },
  torch(p) {
    rect(p, 22, 22, 4, 16, C.wood);
    rect(p, 20, 20, 8, 3, C.steel2);
    rect(p, 20, 12, 8, 8, C.orange);
    rect(p, 21, 9, 6, 4, C.orange);
    rect(p, 23, 7, 2, 2, C.orange);
    rect(p, 22, 13, 4, 6, C.gold);
    rect(p, 23, 11, 2, 2, C.gold);
  },
};

const CARDS = [["stairs", "STAIRS"], ["heal", "HEAL"], ["door", "DOOR"], ["yellowKey", "YELLOW KEY"], ["blueKey", "BLUE KEY"], ["monster", "MONSTER"], ["atkUp", "ATK UP"], ["defUp", "DEF UP"], ["keySiphon", "KEY SIPHON"],
  ["yellowDoor", "YELLOW DOOR"], ["heartDoor", "HEART DOOR"], ["weakEnemy", "WEAK ENEMY"], ["baseEnemy", "BASE ENEMY"], ["strongEnemy", "STRONG ENEMY"],
  ["eliteEnemy", "ELITE ENEMY"], ["bossEnemy", "BOSS ENEMY"], ["chest", "CHEST"], ["blueSiphon", "BK SIPHON"], ["blueTrader", "BK TRADER"], ["keyToHp", "YK TO HP"],
  ["redKey", "RED KEY"], ["redSiphon", "RK SIPHON"], ["torch", "TORCH"], ["woodenDoor", "WOODEN DOOR"]];
mkdirSync(OUT, { recursive: true });
for (const [id, name] of CARDS) {
  const p = canvas();
  // The plain border, one pixel in from the edge.
  rect(p, 0, 0, W, 1, C.border);
  rect(p, 0, H - 1, W, 1, C.border);
  rect(p, 0, 0, 1, H, C.border);
  rect(p, W - 1, 0, 1, H, C.border);
  rect(p, 4, 44, W - 8, 1, C.stone2);
  ICONS[id](p);
  nameLabel(p, name);
  save(`${id}.png`, p);
}
console.log(`Wrote ${CARDS.length} card stubs to ${OUT}`);
