import { pixelOutline } from "./pixel-outline.ts";

/** The board's small props (crates, barrels, their wreckage, plants,
 * mushrooms, pebbles, webs and flowers) drawn at twice the world's pixel
 * density: each sprite pixel is half a world pixel, 48 a tile.
 * Each wears a solid black orthogonal outline generated from its own alpha,
 * also half a world pixel wide, so the rim always fits the sprite.
 * Sprites and outlines are rasterized once and cached; drawing is one blit. */

/** Pixels per world pixel. */
export const PROP_DENSITY = 2;

export type PropPixels = { width: number; height: number; data: Uint8ClampedArray };
type Rgb = readonly [number, number, number];
type Grid = { rows: readonly string[]; colors: Record<string, Rgb> };

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Letters to colours, shared by the hand-drawn props. */
const PLANT = {
  k: hex("#1b2a20"), d: hex("#283b2c"), m: hex("#3c5837"), g: hex("#668348"), l: hex("#a7bd75"), y: hex("#d2df9c"),
  b: hex("#382027"), r: hex("#693239"), c: hex("#a6544e"), p: hex("#d68a86"), w: hex("#eee0b7"), t: hex("#b28a52"), u: hex("#80603d"),
} as const;
const STONE = {
  k: hex("#1b2430"), d: hex("#293543"), e: hex("#3e4c59"), s: hex("#63717b"), h: hex("#8b9a9d"), w: hex("#b8c2bb"), m: hex("#3c5837"),
} as const;
/** Glowcaps follow GLOWCAP_LIGHT (136, 197, 219). */
const GLOW = {
  k: hex("#16303d"), e: hex("#315363"), c: hex("#54879a"), l: hex("#88c5db"), a: hex("#c8eef8"),
  s: hex("#8b9a9d"), w: hex("#eee0b7"), v: hex("#b8c2bb"), d: hex("#283b2c"), m: hex("#3c5837"),
} as const;

/** Hand-drawn props, 24 × 24 (twelve world pixels), rooted at (12, 20). */
export const PROP_GRIDS = {
  tuft: { colors: PLANT, rows: [
    "........................",
    "........................",
    "........................",
    "........................",
    "..............l.........",
    ".........l....gl........",
    ".........gl..mg....l....",
    "....l....mg..mg...gl....",
    "....gl...mgl.mg..gg.....",
    ".....g...mmg.mgl.gm..l..",
    ".....mg..dmg.mgg.gm.gl..",
    "..l..mg..dmgdmmg.gmgg...",
    "..gl.dmg.dmgdmmggmmg....",
    "...g.dmgddmgdmmgmmg..l..",
    "...mg.dmgdmmdmmgmmg.gg..",
    "....mgdmmdmmdmmmmgggm...",
    "....dmmdmmdmmdmmdmgmm...",
    ".....dmmdmmdmmdmmdmm....",
    "......ddmdmmdmmdmmd.....",
    ".......dddddddddddd.....",
    "........kkkkkkkkkk......",
    "........................",
    "........................",
    "........................",
  ] },
  fern: { colors: PLANT, rows: [
    "........................",
    "........................",
    "........................",
    "...........l............",
    "...........gl...........",
    "..........mgl...........",
    ".....ll...mgg......ll...",
    "....lgg...mgg.....ggl...",
    "...lgg...mgg.l...ggm....",
    "...gg.l..mgglg..ggm.l...",
    "..mg.lg.mgggg..ggm.gl...",
    "..m..gg.mggg..gmm.gg....",
    "..l..mgg.mgg.gm..ggm.l..",
    ".lgg..mgmmggggm.ggm.gl..",
    ".mgggl.mmmgggmmgmm.gg...",
    "...mmggmdmggmmgmmggm....",
    ".....mmmddmgmmmmmm......",
    "........ddmmgmd.........",
    "..........dmmd..........",
    "..........ddd...........",
    "...........d............",
    "........................",
    "........................",
    "........................",
  ] },
  sprout: { colors: PLANT, rows: [
    "........................",
    "........................",
    "..............mggl......",
    ".............mgllyl.....",
    "..mggl......mgllllg.....",
    ".mglllg....mggllllg.....",
    ".mglllgg...mgggllgm.....",
    ".mggllggm..mggggggm.....",
    "..mggggggm.dmgggggm.....",
    "...mmggggmmdmmggmm......",
    ".....mmmmgddmmmm........",
    "..........dmd...........",
    "..........dmd...........",
    "..........dgd...........",
    "..........dmd...........",
    "..........dmd...........",
    ".........ddmdd..........",
    ".......buurrrbb.........",
    "......burrcrrrbb........",
    "......brrcccrrrb........",
    ".......bbbbbbbb.........",
    "........................",
    "........................",
    "........................",
  ] },
  mushrooms: { colors: PLANT, rows: [
    "........................",
    "........................",
    "..........rrrr..........",
    "........rrcccprr........",
    ".......rccpwpccrr.......",
    "......rcccppcccccr......",
    ".....rcwccccccpccr......",
    ".....rccccccwcccccr.....",
    ".....rrcccccccccrrr.....",
    "......rrrrrrrrrrrb......",
    "........bwwwwtb.........",
    "...rrr...wwwwt...rrrr...",
    "..rccpr..wwwwt..rcpccr..",
    ".rcwccrr.wwwwt.rrccwccr.",
    ".rrcccrr.wwwwt.rrccccrr.",
    "..brrrb..wwwwt..brrrrb..",
    "....wt...wwwwt....wt....",
    "....wt..wwwwwtt...wt....",
    "...mwtm.mwwwwtm..mwtm...",
    "..mggggmgggmggmmggggm...",
    "...mmdmmmdmmdmmmdmmm....",
    "........................",
    "........................",
    "........................",
  ] },
  pebbles: { colors: STONE, rows: [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    ".........hhw............",
    "........hwwhhs..........",
    ".......hwhhhsse.........",
    ".......hhhhssee.........",
    "......shhhssseed........",
    "......sshssseedd..hw....",
    ".....esssseeeddk.hwhs...",
    "..hw.eessseedddkhhhsse..",
    ".hwhseeeeedddkkhhssseed.",
    ".hhsseddddkkk.ssssseedd.",
    "shssseedk.....essseeddk.",
    "sssseeddk.....eeeeedddk.",
    "eeeeeddkk......kddddkk..",
    ".kkddkkk.......mkkkkkm..",
    "...mm........mmm........",
    "........................",
    "........................",
    "........................",
  ] },
  "env-glowcap-small": { colors: GLOW, rows: [
    "........................",
    "........................",
    "..........ccll..........",
    "........ccllalle........",
    ".......clllaalllce......",
    "......cllcllllcllce.....",
    ".....cllcccllccllcce....",
    ".....clccllllllcclce....",
    "....eccccllccllccccee...",
    "....eeccccccccccccce....",
    ".....eekkkkkkkkkkee.....",
    "..........wwws..........",
    "..........wwws..........",
    "..........wwvs..........",
    "..........wwvs..........",
    "..........wwvs..........",
    "..........wwvs..........",
    ".........wwwvss.........",
    "......m.mwwwvssm.m......",
    ".....mmdmmmmmmmmmmm.....",
    "......ddmmdmmdmmdd......",
    "........................",
    "........................",
    "........................",
  ] },
  "env-glowcap-pair": { colors: GLOW, rows: [
    "........................",
    "........................",
    "......ccll..............",
    "....ccllalle............",
    "...clllaalllce..........",
    "..cllcllllcllce.........",
    "..clccllllllcce.........",
    ".eccccllccllccee........",
    ".eekkkkkkkkkkkee........",
    "......wwws..............",
    "......wwvs......ccl.....",
    "......wwvs....ccllale...",
    "......wwvs...clllallce..",
    "......wwvs...clccllcce..",
    "......wwvs..eeccccccee..",
    "......wwvs...eekkkkee...",
    "......wwvs......wvs.....",
    "......wwvs......wvs.....",
    ".....mwwvsm.....wvsm....",
    "....mmmmmmmmm.mmmmmmm...",
    ".....ddmmdmmddmmdmmd....",
    "........................",
    "........................",
    "........................",
  ] },
  "env-glowcap-cluster": { colors: GLOW, rows: [
    "........................",
    "........................",
    "........................",
    "..........ccll..........",
    "........ccllalle........",
    ".......clllaalllce......",
    "......cllcllllcllce.....",
    "......clccllllllcce.....",
    ".....eccccllccllccee....",
    ".....eekkkkkkkkkkkee....",
    "...cl.....wwvs.....cl...",
    ".ccllle...wwvs...clalle.",
    ".clalce...wwvs...cllllce",
    "eccccce...wwvs..eccccce.",
    ".eekkee...wwvs...eekkee.",
    "...wvs....wwvs.....wvs..",
    "...wvs....wwvs.....wvs..",
    "...wvs...mwwvsm....wvs..",
    "..mwvsm.mmmmmmmmm.mwvsm.",
    ".mmmmmmmmmdmmdmmmmmmmmm.",
    "..ddmmdmmdmmddmmdmmdmd..",
    "........................",
    "........................",
    "........................",
  ] },
  web: { colors: { w: hex("#eee0b7"), v: hex("#b8c2bb"), s: hex("#8b9a9d") }, rows: [
    "wwwwwwwwwwwwwwwwwwwwwwww",
    "wvv...v.....v....v...ss.",
    "wv.v..v.....v....v.ss...",
    "w.v.vvv.....v...vss.....",
    "w..v..vv....v..ss.......",
    "w...v.v.vv..vss.........",
    "wvvvvvv...vvvs..........",
    "w.....vv..vsv...........",
    "w......v.vs.v...........",
    "w.......vvs..v..........",
    "w.......vsvv..v.........",
    "wvvvvvvvs...vvv.........",
    "w......sv...............",
    "w.....s..v..............",
    "w....s....v.............",
    "w...s......v............",
    "w..s.......v............",
    "w.s.....................",
    "wss.....................",
    "ws......................",
    "w.......................",
    "s.......................",
    "s.......................",
    "........................",
  ] },
  "crate-broken": { colors: { a: hex("#b28a52"), b: hex("#80603d"), c: hex("#493a2c"), d: hex("#29251f"), r: hex("#693239") }, rows: [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "..........aa............",
    ".........abb............",
    "........abbc............",
    ".......abbcd.....a......",
    "......abbcd.....ab......",
    ".....abbcd.....abc......",
    "....aabcd.....abbc..aa..",
    "...abbcd..aa.abbcd.abb..",
    "..abbcd..abbcabbcd.abc..",
    "..dddd..abbbcbbcd.abbc..",
    "..aaaaaabbbbcccd..abcd..",
    ".abbbbbbbbbbbcd.aabbcd..",
    ".abbbbbrbbbbbcd.abbbcd..",
    ".bccccccccccccd.abccd...",
    "..ddddddddddddd..dddd...",
    "........................",
    "........................",
    "........................",
  ] },
  "barrel-broken": { colors: { a: hex("#b28a52"), b: hex("#80603d"), c: hex("#493a2c"), d: hex("#29251f"), h: hex("#8b9a9d"), s: hex("#63717b"), e: hex("#3e4c59") }, rows: [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    ".......ab...............",
    "......abb.....ab........",
    "......abc....abbc.......",
    ".....abbc....abbc.......",
    ".....abbc....abbc..ab...",
    ".....hssse..abbcd.abbc..",
    "....abbcd...hssse.abbc..",
    "...hhssssee.abbcd.abbc..",
    "..abbbbbbbcdabbcd.hsse..",
    "..abbbbbbbbcdbbcd.abbcd.",
    "..abbbbbbbbcdddd..abbcd.",
    "..bcccccccccd......dddd.",
    "...dddddddddd...........",
    "........................",
    "........................",
    "........................",
  ] },
} satisfies Record<string, Grid>;

/** One flower, 16 × 16 (eight world pixels), petals in `p`/`q`, rooted at (8, 8). */
const FLOWER_ROWS = [
  "................",
  "................",
  "................",
  "......pp........",
  ".....pqqp.pp....",
  "....pqqqqpqqp...",
  "....pqqyyqqqp...",
  ".....pqyyqqp....",
  "....pqqqqqqp....",
  "....pqqppqqqp...",
  ".....pp.gm.pp...",
  "........gm......",
  "......lggm......",
  ".......mgmll....",
  "........m.......",
  "................",
] as const;
/** Petals (dark, light) by FLOWER_SPRITES' order: cyan, violet, rose, gold. */
const FLOWER_PETALS: readonly (readonly [string, string])[] = [
  ["#5d9fb5", "#a4dcec"], ["#6b4d7c", "#a881bc"], ["#b4605d", "#ecaaa4"], ["#c59a54", "#f0d293"],
];

function fromGrid({ rows, colors }: Grid): PropPixels {
  const height = rows.length, width = rows[0].length, data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      const i = (y * width + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  });
  return { width, height, data };
}

export type PropGridId = keyof typeof PROP_GRIDS;
export const gridProp = (id: PropGridId) => fromGrid(PROP_GRIDS[id] as Grid);
export const flowerProp = (color: number) => {
  const [dark, light] = FLOWER_PETALS[color % FLOWER_PETALS.length];
  return fromGrid({ rows: FLOWER_ROWS, colors: { p: hex(dark), q: hex(light), y: hex("#fff6d2"), g: PLANT.g, m: PLANT.m, l: PLANT.l } });
};

// ---------------------------------------------------------------- crates and barrels

/** Crate and barrel woods by tone: highlight, light, mid, dark, seam. */
const WOODS: readonly (readonly string[])[] = [
  ["#d2a46c", "#a67a4c", "#81593a", "#583b24", "#2e1e12"],
  ["#c6a57a", "#9a7a55", "#765a3e", "#4f3a27", "#2a1d12"],
  ["#bb8c5c", "#8e6440", "#6c4a2f", "#4a311e", "#26170d"],
];
const IRON = { hi: hex("#a9b2b5"), mid: hex("#6f7378"), lo: hex("#3e4c59") };

class Canvas {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
  set(x: number, y: number, c: Rgb) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
  }
  clear(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[(y * this.width + x) * 4 + 3] = 0;
  }
}

/** A crate seen from the front and a little above: a planked lid, then a
 * framed front face braced corner to corner, filling its box exactly. */
export function crateProp(w: number, h: number, tone: number): PropPixels {
  const W = Math.max(6, Math.round(w * PROP_DENSITY)), H = Math.max(6, Math.round(h * PROP_DENSITY));
  const [hi, light, mid, dark, seam] = WOODS[tone % WOODS.length].map(hex), cv = new Canvas(W, H);
  const lid = Math.max(3, Math.round(H * 0.3)), frame = W >= 16 ? 2 : 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c: Rgb;
    if (y < lid) {
      // Lid planks run left to right; the front edge catches the light.
      c = y === lid - 1 ? seam : (y % 3 === 2 ? mid : light);
      if (y === 0 || x === 0) c = hi;
      if (x === W - 1) c = mid;
    } else {
      const fy = y - lid, FH = H - lid, onFrame = x < frame || x >= W - frame || fy < frame || fy >= FH - frame;
      if (onFrame) c = x >= W - frame || fy >= FH - frame ? mid : light;
      else {
        // Panel: dark planks with seams, crossed by a brace from bottom left to top right.
        const ix = x - frame, iy = fy - frame, iw = W - 2 * frame, ih = FH - 2 * frame;
        const brace = Math.round(ih - 1 - (ix * (ih - 1)) / Math.max(1, iw - 1));
        if (Math.abs(iy - brace) <= (iw >= 14 ? 1 : 0)) c = iy === brace - 1 || (iw < 14 && iy === brace) ? light : mid;
        else c = ix % 4 === 3 ? seam : dark;
      }
      if (fy === 0) c = seam;
    }
    cv.set(x, y, c);
  }
  return cv;
}

/** A barrel: an oval lid over a round, staved body held by two iron hoops,
 * its corners rounded in square steps. */
export function barrelProp(w: number, h: number, tone: number): PropPixels {
  const W = Math.max(6, Math.round(w * PROP_DENSITY)), H = Math.max(8, Math.round(h * PROP_DENSITY));
  const [hi, light, mid, dark, seam] = WOODS[tone % WOODS.length].map(hex), cv = new Canvas(W, H);
  const lid = Math.max(3, Math.round(H * 0.22)), hoops = [lid + 1, H - 4];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c: Rgb;
    if (y < lid) {
      c = y === lid - 1 ? seam : (x + y) % 5 === 0 ? mid : light;
      if (y === 0) c = hi;
    } else {
      // Staves: lit on the left, shaded to the right, a seam every third pixel.
      const t = x / (W - 1);
      c = t < 0.18 ? light : t < 0.55 ? mid : t < 0.85 ? dark : seam;
      if (x % 3 === 1 && x > 0 && x < W - 1) c = c === light ? mid : c === mid ? dark : seam;
      if (x === 1) c = hi;
      if (y === H - 1) c = seam;
      if (hoops.includes(y)) c = t < 0.25 ? IRON.hi : t < 0.7 ? IRON.mid : IRON.lo;
      else if (hoops.some(r => y === r + 1)) c = seam;
    }
    cv.set(x, y, c);
  }
  // Round the corners in square steps: the outline stays orthogonal.
  const cut = W >= 14 ? 2 : 1;
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) {
    for (let k = 0; k < cut; k++) cv.clear(cx + sx * k, cy);
    if (cut > 1) cv.clear(cx, cy + sy);
  }
  return cv;
}

// ---------------------------------------------------------------- drawing

type Baked = { sprite: HTMLCanvasElement; outlined: HTMLCanvasElement };
const baked = new Map<string, Baked | null>();

function toCanvas(px: PropPixels, pad: number) {
  const cv = document.createElement("canvas");
  cv.width = px.width + 2 * pad; cv.height = px.height + 2 * pad;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(cv.width, cv.height);
  if (pad) {
    const alpha = new Uint8ClampedArray(px.width * px.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = px.data[i * 4 + 3];
    image.data.set(pixelOutline(alpha, px.width, px.height, "solid"));
    for (let y = 0; y < px.height; y++) for (let x = 0; x < px.width; x++) {
      const s = (y * px.width + x) * 4;
      if (!px.data[s + 3]) continue;
      image.data.set(px.data.subarray(s, s + 4), ((y + pad) * cv.width + x + pad) * 4);
    }
  } else image.data.set(px.data);
  ctx.putImageData(image, 0, 0);
  return cv;
}

function bake(key: string, make: () => PropPixels): Baked | null {
  if (baked.has(key)) return baked.get(key)!;
  if (typeof document === "undefined") return null;
  const px = make(), sprite = toCanvas(px, 0), outlined = toCanvas(px, 1);
  const entry = sprite && outlined ? { sprite, outlined } : null;
  if (baked.size >= 512) baked.clear();
  baked.set(key, entry);
  return entry;
}

/** Draws a prop with its top left at (x, y) in world pixels, `w` × `h` world
 * pixels, its outline half a world pixel outside that box. False without a DOM. */
function draw(c: CanvasRenderingContext2D, entry: Baked | null, x: number, y: number, outline: boolean) {
  if (!entry) return false;
  const s = 1 / PROP_DENSITY, img = outline ? entry.outlined : entry.sprite, o = outline ? s : 0;
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(img, x - o, y - o, img.width * s, img.height * s);
  c.restore();
  return true;
}

export const drawGridProp = (c: CanvasRenderingContext2D, id: PropGridId, x: number, y: number, outline = true) =>
  draw(c, bake(`grid:${id}`, () => gridProp(id)), x, y, outline);
export const drawFlowerProp = (c: CanvasRenderingContext2D, color: number, x: number, y: number, outline = true) =>
  draw(c, bake(`flower:${color}`, () => flowerProp(color)), x, y, outline);
export const drawBoxProp = (c: CanvasRenderingContext2D, kind: "crate" | "barrel", tone: number, x: number, y: number, w: number, h: number, outline = true) =>
  draw(c, bake(`${kind}:${w}x${h}:${tone}`, () => (kind === "barrel" ? barrelProp : crateProp)(w, h, tone)), x, y, outline);
