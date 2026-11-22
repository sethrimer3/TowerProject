// The Familiars' art, drawn pixel by pixel in the kit's 27-colour palette on
// native grids: five round young beasts of three frames each, their speckled
// eggs (whole, and split on a zig-zag), what their effects scatter, and the
// burn and stun icons an enemy wears.
//
//   node tools/prepare-familiar-sprites.mjs --sheet <file.png>   draws only a contact sheet, for review
//   node tools/prepare-familiar-sprites.mjs                      writes the PNGs and registers them
//
// Edit the shapes and rerun, then `npm run sprites:atlas`.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./ui-atlas-png.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)), out = join(root, "public/assets/style");
const C = {
  ink: "0c1016", night: "1b2430", slate: "3e4c59", steel: "63717b", stone: "8b9a9d", silver: "b8c2bb",
  umber: "29251f", bark: "493a2c", brown: "80603d", tan: "b28a52", gold: "e1bb78", cream: "eee0b7",
  wine: "382027", maroon: "693239", red: "a6544e", pink: "d68a86",
  abyss: "16303d", deep: "315363", teal: "54879a", cyan: "88c5db", purple: "80608e",
};
/** Each familiar's ramp: shade, base, light. */
const RAMP = {
  dragon: [C.maroon, C.red, C.pink],
  slime: [C.teal, C.cyan, C.cream],
  wolf: [C.bark, C.brown, C.tan],
  falcon: [C.tan, C.gold, C.cream],
  wisp: [C.slate, C.purple, C.pink],
};

// --- Drawing ---

const canvas = (width, height = width) => ({ width, height, px: new Array(width * height).fill(null) });
const set = (g, x, y, color) => {
  if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.px[y * g.width + x] = color;
};
const ellipse = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const polygon = (...p) => (x, y) => {
  let inside = false;
  const px = x + 0.5, py = y + 0.5;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if (p[i][1] > py !== p[j][1] > py && px < ((p[j][0] - p[i][0]) * (py - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  return inside;
};
const any = (...shapes) => (x, y) => shapes.some((s) => s(x, y));
const mirror = (shape) => (x, y) => shape(x, y) || shape(23 - x, y);
/** A part: a dark outline round it, then its fill, lit from the upper left and shaded at the lower right. */
function part(g, shape, [shade, base, light], outline = C.ink) {
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++)
      if (!shape(x, y) && (shape(x - 1, y) || shape(x + 1, y) || shape(x, y - 1) || shape(x, y + 1))) set(g, x, y, outline);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++)
      if (shape(x, y)) set(g, x, y, !shape(x + 1, y + 1) || !shape(x, y + 2) ? shade : !shape(x - 1, y - 2) && !shape(x - 2, y - 1) ? light : base);
}
/** A flat patch, no outline. */
function patch(g, shape, color) {
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (shape(x, y)) set(g, x, y, color);
}
/** Pixels from rows of keys, `.` leaving what is under them. */
function stamp(g, x, y, rows, keys) {
  rows.forEach((row, dy) => [...row].forEach((k, dx) => k !== "." && set(g, x + dx, y + dy, keys[k])));
}
const FACE = { k: C.ink, w: C.cream, p: C.pink, r: C.red, g: C.gold, t: C.tan, c: C.teal };
/** Two big eyes with a glint, their left edges at `left` and `right`. */
function eyes(g, left, right, y) {
  for (const x of [left, right]) stamp(g, x, y, ["kwk", "kkk", "kkk", ".k."], FACE);
}
function blush(g, left, right, y, key = "p") {
  for (const x of [left, right]) stamp(g, x, y, [key + key], FACE);
}

// --- The young beasts, by frame: 0, 1 and 2, shown 1, 2, 3, 2 ---

const BEASTS = {
  dragon(frame) {
    const g = canvas(24), lift = [0, 1, 0][frame], r = RAMP.dragon, tip = [6, 9, 12][frame];
    part(g, mirror(polygon([9, 14], [5, tip - 1], [1, tip - 2], [1, tip + 5.5], [2.5, tip + 3], [4, tip + 6], [5.5, tip + 3.5], [9, 18])), [C.wine, C.maroon, C.red]);
    patch(g, mirror(polygon([8, 14.5], [2, tip], [2, tip + 1.5], [4, tip + 3])), C.tan);
    part(g, polygon([13, 18], [18, 21], [20, [17, 18, 17][frame]], [21, 20], [18, 23], [12, 21]), r);
    part(g, ellipse(12, 18 - lift, 5.3, 4.6), r);
    patch(g, ellipse(12, 19 - lift, 2.8, 2.7), C.gold);
    for (const y of [18, 20]) patch(g, (x, py) => py === y - lift && x >= 10 && x <= 13, C.tan);
    part(g, mirror(polygon([7, 6 - lift], [7.5, 1.5 - lift], [10.5, 5 - lift])), [C.tan, C.gold, C.cream]);
    part(g, ellipse(12, 9 - lift, 6.4, 5.6), r);
    patch(g, ellipse(12, 12.6 - lift, 3.6, 2.2), C.pink);
    eyes(g, 7, 14, 6 - lift);
    blush(g, 6, 16, 10 - lift);
    stamp(g, 10, 11 - lift, ["r..r", "....", "kkkk", ".ww."], FACE);
    part(g, mirror(ellipse(9, 22 - lift, 1.7, 1.2)), [C.maroon, C.red, C.red]);
    return g;
  },
  slime(frame) {
    const g = canvas(24), squash = [1, 0, -1][frame], r = RAMP.slime, top = 8 + squash;
    part(g, polygon([11, top + 1], [12, top - 2], [8.5, top - 2], [12, top - 6.5], [15.5, top - 6.5], [13, top - 3.8], [16, top - 3.8], [12.5, top + 1]), [C.gold, C.gold, C.cream]);
    part(g, any(ellipse(12, 15 + squash / 2, 8 + squash * 0.7, 7 - squash), ellipse(12, 19.5, 9 + squash * 0.6, 2.8)), r);
    patch(g, ellipse(8, 11 + squash, 1.6, 1.1), C.cream);
    eyes(g, 7, 14, 13 + squash);
    blush(g, 5, 17, 17 + squash);
    stamp(g, 10, 17 + squash, ["k..k", ".kk."], FACE);
    stamp(g, [4, 5, 4][frame], [7, 8, 9][frame], [".g", "gg", "g."], FACE);
    stamp(g, 19, [10, 8, 7][frame], ["g.", "gg", ".g"], FACE);
    return g;
  },
  wolf(frame) {
    const g = canvas(24), bob = [0, 1, 0][frame], r = RAMP.wolf, wag = [17, 19, 21][frame];
    part(g, polygon([14, 19], [17, 18], [wag, 12], [wag + 2, 15], [19, 21], [15, 22]), r);
    patch(g, ellipse(wag + 0.6, 14, 1.2, 1.3), C.cream);
    part(g, ellipse(12, 18.5 - bob, 5.2, 4.3), r);
    patch(g, polygon([9, 16 - bob], [15, 16 - bob], [12, 21.5 - bob]), C.cream);
    part(g, mirror(polygon([5.5, 9 - bob], [5.5 + [0, 0, -1][frame], 1.5 - bob], [10.5, 5 - bob])), r);
    patch(g, mirror(polygon([6.8, 6.5 - bob], [6.8, 4 - bob], [8.8, 5.6 - bob])), C.pink);
    part(g, any(ellipse(12, 10 - bob, 6.7, 5.4), mirror(polygon([7, 9 - bob], [4.5, 13 - bob], [9, 14 - bob]))), r);
    patch(g, mirror(ellipse(9.5, 12.6 - bob, 2.6, 1.9)), C.cream);
    patch(g, ellipse(12, 12.8 - bob, 3, 2), C.cream);
    eyes(g, 7, 14, 7 - bob);
    stamp(g, 10, 11 - bob, ["kkkk", ".kk.", ".rr."], FACE);
    part(g, mirror(ellipse(9, 22, 1.8, 1.2)), [C.tan, C.cream, C.cream]);
    return g;
  },
  falcon(frame) {
    const g = canvas(24), lift = [0, 1, 0][frame], r = RAMP.falcon, tip = [5, 10, 16][frame];
    part(g, mirror(polygon([9, 12], [5, tip], [1, tip], [1.5, tip + 3], [3, tip + 3.5], [4.5, tip + 5.5], [9, 18])), [C.brown, C.tan, C.gold]);
    part(g, polygon([9, 18 - lift], [8.5, 23], [12, 21.5], [15.5, 23], [15, 18 - lift]), [C.brown, C.tan, C.gold]);
    part(g, ellipse(12, 16.5 - lift, 5.2, 5), r);
    patch(g, ellipse(12, 17 - lift, 3.1, 3.3), C.cream);
    for (const [x, y] of [[10, 16], [13, 16], [11, 18], [14, 18], [12, 20]]) set(g, x, y - lift, C.tan);
    part(g, polygon([10, 5 - lift], [10.5, 1 - lift], [12.5, 3 - lift], [14.5, 2 - lift], [14, 5 - lift]), r);
    part(g, ellipse(12, 8.5 - lift, 6, 5.2), r);
    // A falcon's dark cap and cheek stripes, over a short hooked beak.
    patch(g, (x, y) => ellipse(12, 8.5 - lift, 6, 5.2)(x, y) && y + 0.5 < 5.6 - lift, C.tan);
    patch(g, mirror(ellipse(8.6, 9.2 - lift, 2.5, 3.2)), C.cream);
    eyes(g, 7, 14, 7 - lift);
    stamp(g, 8, 11 - lift, ["t", "t"], { t: C.brown });
    stamp(g, 15, 11 - lift, ["t", "t"], { t: C.brown });
    stamp(g, 10, 10 - lift, ["oyyo", "oyko", ".ok.", "..k."], { k: C.ink, y: C.gold, o: C.brown });
    stamp(g, 9, 22 - lift, ["kt..tk"], FACE);
    return g;
  },
  wisp(frame) {
    const g = canvas(24), lift = [0, 1, 0][frame], r = RAMP.wisp, sway = [-2, 0, 2][frame];
    part(g, polygon([8, 14 - lift], [16, 14 - lift], [15, 18], [12 + sway, 22.5], [10.5, 18.5]), r);
    part(g, polygon([7, 9 - lift], [9.5 + sway / 2, 4 - lift], [12 + sway, 1.5 - lift], [13, 5 - lift], [17, 9 - lift]), r);
    part(g, ellipse(12, 11.5 - lift, 7, 6.2), r);
    patch(g, ellipse(12, 12.5 - lift, 5.2, 4.4), C.pink);
    patch(g, ellipse(12, 12.5 - lift, 4.2, 3.6), C.cream);
    eyes(g, 8, 13, 10 - lift);
    blush(g, 7, 15, 14 - lift);
    stamp(g, 11, 14 - lift, ["kk"], FACE);
    stamp(g, 3, [17, 15, 13][frame], [".p.", "pwp", ".p."], FACE);
    stamp(g, 18, [13, 15, 17][frame], [".p.", "pwp", ".p."], FACE);
    return g;
  },
};
const IDS = Object.keys(BEASTS);
const SPECKS = {
  dragon: [C.wine, C.gold], slime: [C.deep, C.cream], wolf: [C.umber, C.cream], falcon: [C.brown, C.cream], wisp: [C.night, C.pink],
};

// --- The eggs ---

/** The crack's column on each row: a zig-zag down the middle. */
const crack = (y) => 12 + [0, 1, 2, 1, 0, -1, -2, -1][y % 8];
function egg(id) {
  const g = canvas(24), shell = (x, y) => (y + 0.5 < 13.5 ? ellipse(12, 13.5, 8, 11.8)(x, y) : ellipse(12, 13.5, 8, 8.8)(x, y));
  part(g, shell, RAMP[id]);
  const [dark, pale] = SPECKS[id];
  for (const [x, y, size] of [[9, 5, 1], [14, 6, 2], [6, 11, 2], [11, 10, 1], [16, 12, 1], [9, 15, 2], [14, 16, 1], [17, 17, 1], [7, 18, 1], [12, 19, 2]])
    patch(g, (px, py) => px >= x && px < x + size && py >= y && py < y + (size > 1 ? 2 : 1) && shell(px, py), dark);
  for (const [x, y] of [[11, 4], [8, 8], [15, 9], [13, 13], [7, 15], [16, 15], [10, 18]]) set(g, x, y, pale);
  return g;
}
/** An egg's half on the zig-zag, its broken edge inked; both halves keep the whole's canvas, so they lie on it exactly. */
function half(whole, side) {
  const g = canvas(24);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const color = whole.px[y * 24 + x], at = crack(y);
      if (!color || (side === "left" ? x >= at : x < at)) continue;
      set(g, x, y, x === (side === "left" ? at - 1 : at) ? C.ink : color);
    }
  return g;
}

// --- What effects scatter, and the icons ---

const KEYS = { k: C.ink, r: C.maroon, R: C.red, o: C.tan, y: C.gold, w: C.cream, c: C.cyan, t: C.teal, s: C.silver, S: C.stone, b: C.brown, p: C.purple, P: C.pink };
const pixels = (rows) => {
  const g = canvas(rows[0].length, rows.length);
  stamp(g, 0, 0, rows, KEYS);
  return g;
};
const strip = (frames) => {
  const g = canvas(frames[0].width * frames.length, frames[0].height);
  frames.forEach((f, i) => f.px.forEach((color, at) => color && set(g, i * f.width + (at % f.width), Math.floor(at / f.width), color)));
  return g;
};
const FLAMES = [
  [".....k......", "....kRk.....", "....kRRk....", "...kRooRk...", "...kRoyRk.k.", "..kRRoyRkkRk", "..kRoyyoRRk.", ".kRRoywyoRk.", ".kRoyywyoRk.", "..kRoywyRk..", "...kRooRk...", "....kkkk...."],
  ["......k.....", ".....kRk....", "....kRRk....", "...kRRoRk...", "..kRRooRk...", "..kRoyoRRk..", ".kRRoyyoRk..", ".kRoywyoRRk.", ".kRoywwyoRk.", "..kRoywoRk..", "...kRooRk...", "....kkkk...."],
  ["....k.......", "...kRk......", "...kRRk.....", ".k.kRoRk....", "kRkkRoyRk...", ".kRRooyRk...", "..kRoyyoRk..", ".kRoywyoRRk.", ".kRoywyyoRk.", "..kRywyoRk..", "...kRooRk...", "....kkkk...."],
];
const EFFECTS = {
  "familiar-flame": strip(FLAMES.map(pixels)),
  "familiar-bolt": pixels([".....kkk", "....kck.", "...kck..", "..kwck..", ".kwcckk.", ".kkkwck.", "...kck..", "..kck...", "..kk....", ".kk....."]),
  "familiar-sparkle": pixels(["....y....", "....y....", "...ywy...", "..ywwwy..", "yywwwwwyy", "..ywwwy..", "...ywy...", "....y....", "....y...."]),
  "familiar-sword": pixels(["......kkk", ".....kwsk", "....kwsk.", "...kwsk..", ".kkwsk...", ".kyyk....", "..kyyk...", ".kbkkk...", "kyk......", ".k......."]),
  "familiar-mote": pixels(["..p..", ".pPp.", "pPwPp", ".pPp.", "..p.."]),
  "familiar-burn": pixels(["....k...", "...kRk..", "..kRok..", ".kRoyRk.", "kRoyyoRk", "kRywwyRk", ".kRyyRk.", "..kkkk.."]),
  // Two dizzy stars, tilted apart.
  "familiar-stun": pixels(["..k.....k..", ".kyk...kyk.", "kywyk.kywyk", ".kyk.k.kyk.", "..k.kyk.k..", "...kywyk...", "....kyk....", ".....k....."]),
};

/** Every PNG, by its id in the style manifest. */
function sprites() {
  const all = {};
  for (const id of IDS) {
    const frames = [0, 1, 2].map(BEASTS[id]), whole = egg(id);
    all[`familiar-${id}`] = strip(frames);
    all[`familiar-${id}-icon`] = frames[1];
    all[`familiar-egg-${id}`] = whole;
    all[`familiar-egg-${id}-left`] = half(whole, "left");
    all[`familiar-egg-${id}-right`] = half(whole, "right");
  }
  return { ...all, ...EFFECTS };
}

const rgba = (hex) => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
function png(g) {
  const bytes = Buffer.alloc(g.width * g.height * 4);
  g.px.forEach((color, i) => color && bytes.set(rgba(color), i * 4));
  return encodePng(g.width, g.height, bytes);
}

// --- The contact sheet ---

/** A row a familiar (its frames, egg, halves parted over it, and at board
 * size), then the effects, and both icons on a real enemy at play size. */
function sheet(all) {
  const ZOOM = 6, CELL = 24 * ZOOM + 12, width = CELL * 8 + 12, height = CELL * 7 + 12, g = canvas(width, height);
  g.px.fill("293543");
  const draw = (sprite, x, y, zoom, from = 0, w = sprite.width) => {
    for (let py = 0; py < sprite.height * zoom; py++)
      for (let px = 0; px < w * zoom; px++) {
        const color = sprite.px[Math.floor(py / zoom) * sprite.width + from + Math.floor(px / zoom)];
        if (color) set(g, Math.floor(x + px), Math.floor(y + py), color);
      }
  };
  IDS.forEach((id, row) => {
    const y = 12 + row * CELL, at = (col) => 12 + col * CELL, name = `familiar-${id}`;
    for (let f = 0; f < 3; f++) draw(all[name], at(f), y, ZOOM, f * 24, 24);
    draw(all[`familiar-egg-${id}`], at(3), y, ZOOM);
    const middle = at(4) + CELL / 2;
    draw(all[`${name}-icon`], middle, y, ZOOM);
    draw(all[`familiar-egg-${id}-left`], middle - 54, y, ZOOM);
    draw(all[`familiar-egg-${id}-right`], middle + 54, y, ZOOM);
    // At a phone's tile size, and twice it.
    draw(all[`${name}-icon`], at(6) + 70, y + 20, 2);
    draw(all[`${name}-icon`], at(7) + 20, y + 30, 1);
  });
  let x = 12;
  for (const id of Object.keys(EFFECTS)) {
    const sprite = all[id];
    draw(sprite, x, 12 + 5 * CELL, 5);
    x += sprite.width * 5 + 22;
  }
  const source = decodePng(readFileSync(join(out, "slime.png"))), foe = canvas(24);
  for (let i = 0; i < foe.px.length; i++)
    if (source.pixels[i * 4 + 3]) foe.px[i] = source.pixels.subarray(i * 4, i * 4 + 3).toString("hex");
  let left = 12;
  for (const zoom of [6, 3, 2, 1, 0.5]) {
    const y = 12 + 6 * CELL;
    draw(foe, left, y, zoom);
    draw(all["familiar-burn"], left + 8 * zoom, y, zoom);
    draw(all["familiar-stun"], left + 6 * zoom, y + 16 * zoom, zoom);
    left += 24 * zoom + 24;
  }
  return g;
}

const at = process.argv.indexOf("--sheet"), all = sprites();
if (at >= 0) {
  const file = process.argv[at + 1];
  if (!file) throw new Error("--sheet needs a file to write");
  writeFileSync(file, png(sheet(all)));
  console.log(`Drew the contact sheet to ${file}.`);
} else {
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  for (const [id, g] of Object.entries(all)) {
    writeFileSync(join(out, `${id}.png`), png(g));
    manifest.assets[id] = { file: `${id}.png`, width: g.width, height: g.height };
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Prepared ${Object.keys(all).length} familiar sprites.`);
}
