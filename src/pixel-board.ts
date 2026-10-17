import type { KeyColor } from "./config.ts";
import type { EnemyStrength, Tile, Torch } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import type { Facing } from "./shown.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { sprite, type Sprite } from "./pixel-sprite.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import { tileHash } from "./ascii-glyphs.ts";

/** The Pixel Game theme's dungeon board: a dungeon in shaded, outlined pixel
 * art of our own, sixteen pixels to a tile. Warm flagstones underfoot in a
 * few patterns, slate walls seen from a little above (a brick face where the
 * wall stands over open ground, its top elsewhere) casting a shadow on the
 * floor below them, and every creature and thing an outlined sprite in two
 * or three tones: sprouts, bats, golems, wraiths and horned ogres for the
 * enemies, and a little caped adventurer for the hero.
 * Each sprite is baked once into a small canvas and drawn scaled without
 * smoothing, so its pixels stay hard at any zoom; where no canvas can be
 * made (tests), it is filled rectangle by rectangle instead. */

export const PIXEL = {
  /** The outline every sprite wears, and the dark between the walls. */
  out: "#1a1220",
  deep: "#120d17",
  speck: "#211a2a",
  mortar: "#2b2129",
  stone: "#5b4a46",
  stoneLight: "#6a5852",
  stoneDark: "#4e3f3c",
  crack: "#3a2e2f",
  pebble: "#7d6a60",
  capLight: "#5d5880",
  cap: "#3d3956",
  capDark: "#2e2b44",
  brickLight: "#8e89ab",
  brick: "#6b6789",
  brickDark: "#4b4766",
  shadow: "rgba(18, 13, 23, 0.45)",
  white: "#f4eee0",
  gold: "#f2b63d",
  goldLight: "#ffe08a",
  goldDark: "#b2711f",
  wood: "#8a5a35",
  woodLight: "#a87443",
  woodDark: "#5e3a24",
  iron: "#8c8a9a",
  ironDark: "#55536a",
  steel: "#d7dbe6",
  steelDark: "#9aa0b4",
  red: "#d8413a",
  redLight: "#ff7a5c",
  redDark: "#8e2430",
  blue: "#4c7fd9",
  blueLight: "#8fc2ff",
  blueDark: "#2d4c94",
  green: "#5fae45",
  greenLight: "#a6dd62",
  greenDark: "#3a7238",
  purple: "#6b4796",
  purpleLight: "#9572c2",
  purpleDark: "#432c63",
  glass: "#c9e6f0",
  skin: "#f0bb8a",
  skinDark: "#c98a63",
  hair: "#6a3e26",
  flame: "#ff9d2e",
  mark: "#ffe9a8",
} as const;

/** Keys and the locks they open, each in a light, a middle and a dark tone. */
const KEY_TONES: Record<KeyColor, readonly [string, string, string]> = {
  yellow: [PIXEL.goldLight, PIXEL.gold, PIXEL.goldDark],
  blue: [PIXEL.blueLight, PIXEL.blue, PIXEL.blueDark],
  red: [PIXEL.redLight, PIXEL.red, PIXEL.redDark],
};
const NO_KEY: readonly [string, string, string] = [PIXEL.steel, PIXEL.iron, PIXEL.ironDark];
const keyTones = (k: KeyColor | undefined) => (k ? KEY_TONES[k] ?? NO_KEY : NO_KEY);

/** A sprite and its colours, baked once into a canvas where one can be
 * made. */
type Art = { rows: Sprite; colors: Record<string, string>; baked?: CanvasImageSource | null };
const art = (rows: Sprite, colors: Record<string, string>): Art => ({ rows, colors });
/** Arts made on the fly (a key's colours), each kept once by name. */
const made = new Map<string, Art>();
const artOf = (name: string, rows: Sprite, colors: Record<string, string>) => {
  let a = made.get(name);
  if (!a) made.set(name, (a = art(rows, colors)));
  return a;
};

function bake(a: Art): CanvasImageSource | null {
  try {
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = a.rows[0].length;
    cv.height = a.rows.length;
    const g = cv.getContext("2d");
    // Only a real canvas: a stand-in (a test's) draws the sprite itself.
    if (typeof CanvasRenderingContext2D === "undefined" || !(g instanceof CanvasRenderingContext2D)) return null;
    sprite(g, a.rows, a.colors, 1, cv.width / 2, cv.height / 2);
    return cv;
  } catch {
    return null;
  }
}

/** Draws an art centred on (cx, cy) in tile space, `cell` units a pixel:
 * the baked canvas scaled without smoothing, or the sprite itself. */
function draw(c: CanvasRenderingContext2D, a: Art, cell = 1.5, cx = 12, cy = 12) {
  if (a.baked === undefined) a.baked = bake(a);
  const w = a.rows[0].length * cell, h = a.rows.length * cell;
  if (!a.baked) {
    sprite(c, a.rows, a.colors, cell, cx, cy);
    return;
  }
  const smoothing = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.drawImage(a.baked, cx - w / 2, cy - h / 2, w, h);
  c.imageSmoothingEnabled = smoothing;
}

/** A 16x16 grid of `fill`, with `paint` setting single pixels. */
function grid(fill: string, paint: (set: (x: number, y: number, ch: string) => void) => void): Sprite {
  const rows = Array.from({ length: 16 }, () => fill.repeat(16).split(""));
  paint((x, y, ch) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) rows[y][x] = ch;
  });
  return rows.map((r) => r.join(""));
}

/** A floor tile of flagstones: each slab ([x, y, w, h], wrapping round the
 * tile so its patterns meet their neighbours') lit along its top and left
 * and shaded along its bottom and right, with mortar between, cracks and
 * pebbles. */
function flagstones(slabs: readonly (readonly [number, number, number, number])[], cracks: readonly (readonly [number, number])[], pebbles: readonly (readonly [number, number])[]): Sprite {
  return grid("m", (set) => {
    for (const [x0, y0, w, h] of slabs) {
      for (let dy = 0; dy < h - 1; dy++) {
        for (let dx = 0; dx < w - 1; dx++) {
          const edge = dy === 0 || dx === 0 ? "b" : dy === h - 2 || dx === w - 2 ? "d" : "a";
          set((x0 + dx) % 16, (y0 + dy) % 16, edge);
        }
      }
    }
    for (const [x, y] of cracks) set(x, y, "c");
    for (const [x, y] of pebbles) set(x, y, "e");
  });
}
const FLOOR_COLORS = { m: PIXEL.mortar, a: PIXEL.stone, b: PIXEL.stoneLight, d: PIXEL.stoneDark, c: PIXEL.crack, e: PIXEL.pebble };
/** The floor's patterns, picked per tile by `tileHash`. */
const FLOORS: readonly Art[] = [
  // Four slabs, the lower pair offset.
  flagstones([[0, 0, 8, 8], [8, 0, 8, 8], [4, 8, 8, 8], [12, 8, 8, 8]], [[3, 3], [4, 4], [10, 12]], [[13, 4]]),
  // One great slab, cracked across.
  flagstones([[0, 0, 16, 16]], [[4, 4], [5, 5], [6, 5], [7, 6], [8, 7], [9, 7]], [[11, 11], [3, 12]]),
  // Courses of narrow stones.
  flagstones([[0, 0, 6, 6], [6, 0, 10, 6], [3, 6, 7, 5], [10, 6, 9, 5], [0, 11, 9, 5], [9, 11, 7, 5]], [[12, 2]], [[6, 8], [2, 13]]),
  // Two long slabs and two square ones.
  flagstones([[0, 0, 11, 6], [11, 0, 5, 11], [0, 6, 5, 10], [5, 6, 6, 10], [11, 11, 5, 5]], [[7, 9], [8, 10]], [[2, 2], [13, 14]]),
].map((rows) => art(rows, FLOOR_COLORS));

/** A wall's top, seen from above: slate with a few dark flecks. */
const CAP = art(grid("t", (set) => {
  for (const [x, y] of [[3, 2], [11, 5], [6, 9], [13, 12], [2, 13], [9, 14]] as const) set(x, y, "u");
  for (const [x, y] of [[4, 2], [12, 5], [7, 9]] as const) set(x, y, "v");
}), { t: PIXEL.cap, u: PIXEL.capDark, v: PIXEL.capLight });

/** A wall standing over open ground, seen from the front: a lit ledge along
 * its top, then courses of bricks, each lit along its top. */
const FACE = art(grid("M", (set) => {
  for (let x = 0; x < 16; x++) {
    set(x, 0, "L");
    set(x, 1, "t");
    set(x, 2, "o");
  }
  for (let course = 0; course < 3; course++) {
    const top = 3 + course * 4;
    const offset = course % 2 ? 4 : 0;
    for (let x = 0; x < 16; x++) {
      if ((x + offset) % 8 === 7) continue;
      set(x, top, "h");
      set(x, top + 1, "k");
      set(x, top + 2, "k");
    }
  }
  for (let x = 0; x < 16; x++) set(x, 15, "D");
}), { L: PIXEL.capLight, t: PIXEL.cap, o: PIXEL.out, M: PIXEL.brickDark, h: PIXEL.brickLight, k: PIXEL.brick, D: PIXEL.out });

/** The deep dark between the walls, now and then a faint fleck. */
const SPECKS = art(grid(".", (set) => {
  set(4, 5, "s");
  set(11, 10, "s");
  set(12, 3, "s");
}), { s: PIXEL.speck });

/** The dark ground, then the floor, the wall faces and tops, and the shadow
 * a wall casts on the floor below it. World y grows upward, so the tile
 * under a wall on screen is y - 1. */
function drawPixelGround(f: FrameContext) {
  const c = f.c;
  c.fillStyle = PIXEL.deep;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    const wall = isWall(x, y);
    const h = tileHash(x, y);
    c.save();
    toTileSpace(c, f, x, y);
    if (!wall) {
      draw(c, FLOORS[h % FLOORS.length], 1.5);
      // The wall above throws its shadow across the top of the floor.
      if (isWall(x, y + 1)) {
        c.fillStyle = PIXEL.shadow;
        c.fillRect(0, 0, 24, 4.5);
      }
    } else if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) {
      if (h % 3 === 0) draw(c, SPECKS, 1.5);
    } else if (!isWall(x, y - 1)) {
      draw(c, FACE, 1.5);
    } else {
      draw(c, CAP, 1.5);
      // A lit rim along each side of the top that drops to open ground.
      c.fillStyle = PIXEL.capLight;
      if (!isWall(x, y + 1)) c.fillRect(0, 0, 24, 1.5);
      if (!isWall(x - 1, y)) c.fillRect(0, 0, 1.5, 24);
      if (!isWall(x + 1, y)) c.fillRect(22.5, 0, 1.5, 24);
    }
    c.restore();
  });
}

// --- Creatures, one for each strength (rank chevrons tell the rest) ---

/** Weak: a sprout, a round tuft of moss with a leaf on its head. */
const SPROUT: Sprite = [
  "....oo.oo....",
  "...oLLoLLo...",
  "....oLlLo....",
  ".....olo.....",
  "...ooooooo...",
  "..oGGGGGGGo..",
  ".oGHHGGGGGGo.",
  ".oGHGGGGGGGo.",
  "oGGGWoGGWoGGo",
  "oGGGooGGooGgo",
  "oGGGGGGGGGGgo",
  "oGGGGGooGGggo",
  ".ogGGGGGGggo.",
  "..ooooooooo..",
];
/** Normal: a cave bat, its wings spread. */
const BAT: Sprite = [
  "o.....o..o.....o",
  "oo...oBooBo...oo",
  "oPo..oBBBBo..oPo",
  "oPPooBRBBRBooPPo",
  "oPPPPBBBBBBPPPPo",
  "oPpPPBBWWBBPPpPo",
  "opPpPoBBBBoPpPpo",
  ".opopoBBBBopopo.",
  "..o.o.oBBo.o.o..",
  ".......oo.......",
];
/** Strong: a stone golem, eyes glowing in a boulder of a head. */
const GOLEM: Sprite = [
  "....oooooo....",
  "...oHHSSSSo...",
  "...oHYSSYDo...",
  "...oSSSSSDo...",
  ".oooooSDooooo.",
  "oHHSoSSSSoSSDo",
  "oHSSoSSSSoSSDo",
  "oSSDoSSSSoSDDo",
  "oSSDoSDSSoSDDo",
  "oDDooSSSDooDDo",
  ".oo.oSSoSDo.o.",
  "...oSSDoSSDo..",
  "...oooooooooo.",
];
/** Elite: a hooded wraith, two eyes in the dark of its hood. */
const WRAITH: Sprite = [
  "....oooo....",
  "...oCCCCo...",
  "..oCCCCCCo..",
  "..oCkkkkCo..",
  ".oCkEkkEkCo.",
  ".oCkkkkkkCo.",
  ".oCCkkkkCCo.",
  "oCCCCCCCCcCo",
  "oHCCCCCCCccC",
  "oHCCCCCCCcco",
  "oCCCCCCCCcco",
  ".oCCCCCCCco.",
  ".oCcoCCocCo.",
  "..oo.oo.oo..",
];
/** A boss: a horned ogre's head, tusks over its jaw. */
const OGRE: Sprite = [
  "o..............o",
  "oho..........oho",
  "ohho........ohho",
  ".ohhoooooooohho.",
  "..ohhKKKKKKhho..",
  "...oKKKKKKKKo...",
  "..oKKRRKKRRKKo..",
  "..oKKoRKKoRKKo..",
  "..oKKKKKKKKKko..",
  "..oKKKoKKoKKko..",
  "..oKmmmmmmmmko..",
  "..oKTmmmmmmTko..",
  "..oKTTKKKKTTko..",
  "...okKKKKKKko...",
  "....oooooooo....",
];
/** A Greater Boss wears a crown over its horns. */
const CROWN: Sprite = [
  "o..o..o..o",
  "oYoYooYoYo",
  "oYYYYYYYYo",
  "oYRYYYYRYo",
  "oooooooooo",
];

const SPROUT_ART = art(SPROUT, { o: PIXEL.out, L: PIXEL.greenLight, l: PIXEL.greenDark, G: PIXEL.green, H: PIXEL.greenLight, g: PIXEL.greenDark, W: PIXEL.white });
const BAT_ART = art(BAT, { o: PIXEL.out, B: PIXEL.purple, P: PIXEL.purpleLight, p: PIXEL.purpleDark, R: PIXEL.red, W: PIXEL.white });
const GOLEM_ART = art(GOLEM, { o: PIXEL.out, S: PIXEL.iron, H: PIXEL.steel, D: PIXEL.ironDark, Y: PIXEL.gold });
const WRAITH_ART = art(WRAITH, { o: PIXEL.out, C: PIXEL.blueDark, c: "#1f3466", H: PIXEL.blue, k: PIXEL.out, E: "#7ff6ff" });
const OGRE_ART = art(OGRE, { o: PIXEL.out, h: "#e8dcc0", K: "#7f9a5a", k: "#55703f", R: PIXEL.red, m: PIXEL.redDark, T: PIXEL.white });
const GREATER_OGRE_ART = art(OGRE, { o: PIXEL.out, h: PIXEL.goldLight, K: PIXEL.red, k: PIXEL.redDark, R: PIXEL.goldLight, m: PIXEL.out, T: PIXEL.white });
const CROWN_ART = art(CROWN, { o: PIXEL.out, Y: PIXEL.gold, R: PIXEL.red });

/** Each strength's creature and how many tile units a pixel. */
const CREATURE: Record<EnemyStrength, { art: Art; cell: number; cy: number }> = {
  weak: { art: SPROUT_ART, cell: 1.25, cy: 13 },
  normal: { art: BAT_ART, cell: 1.35, cy: 12 },
  strong: { art: GOLEM_ART, cell: 1.45, cy: 12.5 },
  elite: { art: WRAITH_ART, cell: 1.45, cy: 12.5 },
  boss: { art: OGRE_ART, cell: 1.45, cy: 12.5 },
  greaterBoss: { art: GREATER_OGRE_ART, cell: 1.45, cy: 13.5 },
};

/** A Ranged enemy's arrow and a Fast enemy's double chevron. */
const RANGED_MARK = art(["oooo.", "oWWWo", "ooWWo", "oWoWo", "oooo."].map((r) => r), { o: PIXEL.out, W: PIXEL.mark });
const FAST_MARK = art(["ooooooo", "oWooWoo", "ooWooWo", "oWooWoo", "ooooooo"], { o: PIXEL.out, W: PIXEL.mark });

// --- Things ---

const KEY: Sprite = [
  ".oooo.........",
  "oHHKKo........",
  "oHooKKoooooooo",
  "oKo.oKKKKKKKKo",
  "oKoooKkkkkkkko",
  "okkkkooookookk",
  ".oooo....oo.oo",
];
const HEART: Sprite = [
  ".ooo...ooo.",
  "oRHRo.oRRRo",
  "oHRRRoRRRro",
  "oRRRRRRRRro",
  "oRRRRRRRRro",
  ".oRRRRRRro.",
  "..oRRRRro..",
  "...oRRro...",
  "....oro....",
  ".....o.....",
];
const FLASK: Sprite = [
  "...oooo...",
  "...oCCo...",
  "...oCco...",
  "...oGGo...",
  "..oGGGGo..",
  ".oGLLLLGo.",
  "oGWLLLLlGo",
  "oGWLLLLlGo",
  "oGLLLLllGo",
  ".oGllllGo.",
  "..oooooo..",
];
const SWORD: Sprite = [
  "...........ooo",
  "..........oWWo",
  ".........oWWwo",
  "........oWWwo.",
  ".......oWWwo..",
  "......oWWwo...",
  ".oo..oWWwo....",
  "oYYooWWwo.....",
  ".oYYWWwo......",
  "..oYYwo.......",
  "..oBYYYo......",
  ".oBoooYYo.....",
  "oBo....oo.....",
  "oo............",
];
const SHIELD: Sprite = [
  "oooooooooooo",
  "oMMMMMMMMMMo",
  "oMFFFFfffffo",
  "oMFFFFffffMo",
  "oMFFYYYYffMo",
  "oMFFYYYYffMo",
  "oMFFFFffffMo",
  ".oMFFFfffMo.",
  ".oMFFFfffMo.",
  "..oMFFffMo..",
  "...oMFfMo...",
  "....oMMo....",
  ".....oo.....",
];
const CHEST: Sprite = [
  "..oooooooooo..",
  ".oWWWWWWWWWWo.",
  "oWYWWWWWWWWYWo",
  "oYYYYYYYYYYYYo",
  "oWYWWWooWWWYWo",
  "oWYWWoYYoWWYWo",
  "owYwwoYYowwYwo",
  "owYwwwoowwwYwo",
  "owYwwwwwwwwYwo",
  "oYYYYYYYYYYYYo",
  "oooooooooooooo",
];
const OPENED_CHEST: Sprite = [
  ".oooooooooooo.",
  "oWWWWWWWWWWWWo",
  "oYYYYYYYYYYYYo",
  "oooooooooooooo",
  "oYkkkkkkkkkkYo",
  "oWYkkkkkkkkYWo",
  "owYwwwwwwwwYwo",
  "owYwwwwwwwwYwo",
  "owYwwwwwwwwYwo",
  "oYYYYYYYYYYYYo",
  "oooooooooooooo",
];
const COINS: Sprite = [
  ".oooooo.......",
  "oHYYYYYo......",
  "oyyyyyyo......",
  "oHYYYYYo......",
  "oyyyyyyoooooo.",
  "oHYYYYYoHYYYYo",
  "oyyyyyyoyyyyyo",
  "oHYYYYYoHYYYYo",
  "oyyyyyyoyyyyyo",
  ".oooooo.ooooo.",
];
const STAIRS: Sprite = [
  "oooooooooooooooo",
  "oSkkkkkkkkkkkkSo",
  "oSkkkkkkkkkkkkSo",
  "oSooooooooooooSo",
  "oSttttttttttttSo",
  "oSddddddddddddSo",
  "oSooooooooooooSo",
  "oSttttttttttttSo",
  "oSddddddddddddSo",
  "oSooooooooooooSo",
  "oSttttttttttttSo",
  "oSttttttttttttSo",
  "oSddddddddddddSo",
  "oSooooooooooooSo",
  "oSSSSSSSSSSSSSSo",
  "oooooooooooooooo",
];
/** A one-way gate: a floor plate with an arrow worn into it. */
const ARROW: Sprite = [
  "oooooooooooo",
  "oPPPPooPPPPo",
  "oPPPoWWoPPPo",
  "oPPoWWWWoPPo",
  "oPoWWWWWWoPo",
  "oPooooWWoooo",
  "oPPPPoWWoPPo",
  "oPPPPoWWoPPo",
  "oPPPPoooopPo",
  "oppppppppppo",
  "oooooooooooo",
];
const TORCH_FRAMES: readonly Sprite[] = [
  ["...oo...", "..oYo...", "..oYOo..", ".oYOOo..", ".oYORo..", "oYOORRo.", ".oORRo..", "..oBBo..", "oooBBooo", "oIIBBIIo", "oooBBooo", "..oBBo..", "..oooo.."],
  ["....oo..", "...oYo..", "..oOYo..", "..oOOYo.", "..oROYo.", ".oRROOYo", "..oRROo.", "..oBBo..", "oooBBooo", "oIIBBIIo", "oooBBooo", "..oBBo..", "..oooo.."],
];
const SNUFFED: Sprite = ["........", "...g....", "....g...", "...g....", "........", "........", "........", "..oBBo..", "oooBBooo", "oIIBBIIo", "oooBBooo", "..oBBo..", "..oooo.."];

/** The hero: a little adventurer in a blue tunic and a red cape, sword at
 * the side, side on (looking right), facing us, and from behind. */
const HERO_SIDE: Sprite = [
  "...oooo.....",
  "..oHHHHo....",
  ".oHHHHHHo...",
  ".oHHSSSSo...",
  ".oHSSSoSo...",
  "..oSSSSSo...",
  ".oRRRRRo....",
  "oRoTTTTTo.o.",
  "oRoTTTTSooWo",
  "oRobbbbbooWo",
  ".ooTTtTTooWo",
  "..oTToTTo.o.",
  "..oBBoBBo...",
  "..ooooooo...",
];
const HERO_FRONT: Sprite = [
  "...oooooo...",
  "..oHHHHHHo..",
  ".oHHHHHHHHo.",
  ".oHSSSSSSHo.",
  ".oSSoSSoSSo.",
  "..oSSSSSSo..",
  ".oRRRRRRRRo.",
  "oSoTTTTTToSo",
  "oSoTTTTTToWo",
  ".oobbbbbbooW",
  "..oTTttTTooW",
  "..oTToTTTo..",
  "..oBBooBBo..",
  "..oooooooo..",
];
const HERO_BACK: Sprite = [
  "...oooooo...",
  "..oHHHHHHo..",
  ".oHHHHHHHHo.",
  ".oHHHHHHHHo.",
  ".oHHHHHHHHo.",
  "..oHHHHHHo..",
  ".oRRRRRRRRo.",
  "oSoRRRRRRoSo",
  "oSoRRRRRRoSo",
  ".ooRRrrRRoo.",
  "..oRrRRrRo..",
  "..oTToTTTo..",
  "..oBBooBBo..",
  "..oooooooo..",
];
const HERO_COLORS = { o: PIXEL.out, H: PIXEL.hair, S: PIXEL.skin, R: PIXEL.red, r: PIXEL.redDark, T: PIXEL.blue, t: PIXEL.blueDark, b: PIXEL.woodDark, B: PIXEL.woodDark, W: PIXEL.steel };
const HERO = { side: art(HERO_SIDE, HERO_COLORS), front: art(HERO_FRONT, HERO_COLORS), back: art(HERO_BACK, HERO_COLORS) };

const HEART_ART = art(HEART, { o: PIXEL.out, R: PIXEL.red, H: PIXEL.redLight, r: PIXEL.redDark });
const SWORD_ART = art(SWORD, { o: PIXEL.out, W: PIXEL.steel, w: PIXEL.steelDark, Y: PIXEL.gold, B: PIXEL.wood });
const SHIELD_ART = art(SHIELD, { o: PIXEL.out, M: PIXEL.steel, F: PIXEL.blue, f: PIXEL.blueDark, Y: PIXEL.gold });
const CHEST_ART = art(CHEST, { o: PIXEL.out, W: PIXEL.woodLight, w: PIXEL.wood, Y: PIXEL.gold });
const OPENED_ART = art(OPENED_CHEST, { o: PIXEL.out, W: PIXEL.woodLight, w: PIXEL.wood, Y: PIXEL.goldDark, k: PIXEL.deep });
const COINS_ART = art(COINS, { o: PIXEL.out, Y: PIXEL.gold, H: PIXEL.goldLight, y: PIXEL.goldDark });
const STAIRS_ART = art(STAIRS, { o: PIXEL.out, S: PIXEL.cap, k: PIXEL.deep, t: PIXEL.stoneLight, d: PIXEL.stoneDark });
const ARROW_ART = art(ARROW, { o: PIXEL.out, P: PIXEL.stoneLight, p: PIXEL.stoneDark, W: PIXEL.mark });
const TORCH_ARTS = TORCH_FRAMES.map((rows) => art(rows, { o: PIXEL.out, Y: PIXEL.goldLight, O: PIXEL.flame, R: PIXEL.red, B: PIXEL.wood, I: PIXEL.iron }));
const SNUFFED_ART = art(SNUFFED, { o: PIXEL.out, g: PIXEL.iron, B: PIXEL.woodDark, I: PIXEL.ironDark });
const potionArt = (red: boolean) =>
  artOf(red ? "potion-red" : "potion", FLASK, { o: PIXEL.out, C: PIXEL.wood, c: PIXEL.woodDark, G: PIXEL.glass, W: PIXEL.white, L: red ? PIXEL.red : PIXEL.blue, l: red ? PIXEL.redDark : PIXEL.blueDark });
const keyArt = (k: KeyColor | undefined) => {
  const [light, mid, dark] = keyTones(k);
  return artOf(`key-${k ?? "none"}`, KEY, { o: PIXEL.out, H: light, K: mid, k: dark });
};

/** A wooden door in a stone frame, banded in iron. */
const DOOR = art(grid("o", (set) => {
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) set(x, y, "S");
  for (let y = 3; y < 15; y++) {
    for (let x = 3; x < 13; x++) set(x, y, x % 3 === 2 ? "w" : "W");
  }
  for (let x = 3; x < 13; x++) set(x, 2, "o");
  for (let y = 2; y < 15; y++) {
    set(2, y, "o");
    set(13, y, "o");
  }
  for (let x = 1; x < 15; x++) set(x, 15, "o");
  set(1, 1, "s");
  for (let x = 2; x < 15; x++) set(x, 1, "s");
}), { o: PIXEL.out, S: PIXEL.cap, s: PIXEL.capLight, W: PIXEL.wood, w: PIXEL.woodDark });
/** A Wooden Door: planks barred by a brace, nailed. */
const PLANKS = art(grid(".", (set) => {
  for (let y = 1; y < 15; y++) {
    for (let x = 1; x < 15; x++) set(x, y, x % 4 === 0 ? "o" : x % 4 === 1 ? "L" : "W");
  }
  for (let x = 0; x < 16; x++) {
    set(x, 0, "o");
    set(x, 15, "o");
  }
  for (let y = 0; y < 16; y++) {
    set(0, y, "o");
    set(15, y, "o");
  }
  // The brace, from the bottom left to the top right.
  for (let i = 1; i < 15; i++) {
    set(i, 15 - i, "B");
    set(i, 14 - i, "B");
    set(i, 16 - i, "o");
    set(i, 13 - i, "o");
  }
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]] as const) set(x, y, "N");
}), { o: PIXEL.out, W: PIXEL.wood, L: PIXEL.woodLight, B: PIXEL.woodDark, N: PIXEL.iron });
/** A Heart Door: a stone slab with a heart cut into it. */
const HEART_SLAB = art(grid("o", (set) => {
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) set(x, y, y === 1 || x === 1 ? "s" : y === 14 || x === 14 ? "d" : "S");
}), { o: PIXEL.out, S: PIXEL.cap, s: PIXEL.capLight, d: PIXEL.capDark });

/** A key's lock bar across a door: a band in its colour, lit along the top,
 * a keyhole in the middle. */
function lockBar(c: CanvasRenderingContext2D, k: KeyColor, y: number, h: number) {
  const [light, mid, dark] = keyTones(k);
  c.fillStyle = PIXEL.out;
  c.fillRect(3, y - 1.5, 18, h + 3);
  c.fillStyle = mid;
  c.fillRect(4.5, y, 15, h);
  c.fillStyle = light;
  c.fillRect(4.5, y, 15, 1.5);
  c.fillStyle = dark;
  c.fillRect(4.5, y + h - 1.5, 15, 1.5);
  c.fillStyle = PIXEL.out;
  c.fillRect(10.5, y + h / 2 - 1.5, 3, 3);
}

/** One tile's contents in tile space (24x24). */
const paintPixelContents = contentsFrom({
  enemy(c, t) {
    const e = t.enemy;
    const strength = e?.strength ?? "normal";
    const look = CREATURE[strength] ?? CREATURE.normal;
    draw(c, look.art, look.cell, 12, look.cy);
    if (strength === "greaterBoss") draw(c, CROWN_ART, 1.2, 12, 3.5);
    rankChevrons(c, strength, PIXEL.mark, PIXEL.out, 1, 1);
    if (e?.ranged) draw(c, RANGED_MARK, 1, 21, 3.5);
    if (e?.fast) draw(c, FAST_MARK, 1, 20.5, 21.5);
  },
  key(c, t) {
    draw(c, keyArt(t.color), 1.4);
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      draw(c, HEART_SLAB, 1.5);
      paintPixelHeart(c, 1.2);
      return;
    }
    if (rule?.type === "wood") {
      draw(c, PLANKS, 1.5);
      return;
    }
    // A door with a lock bar for each key it takes.
    draw(c, DOOR, 1.5);
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const h = keys.length > 2 ? 3 : 4.5;
    const gap = 18 / Math.max(1, keys.length);
    keys.forEach((k, i) => lockBar(c, k, 5.25 + gap * i + gap / 2 - h / 2, h));
    if (rule?.type === "keys" && rule.heart) draw(c, HEART_ART, 0.75, 18.5, 18.5);
  },
  potion(c, t) {
    draw(c, potionArt(t.color === "red"), 1.6);
  },
  attack(c) {
    draw(c, SWORD_ART, 1.4);
  },
  defense(c) {
    draw(c, SHIELD_ART, 1.4);
  },
  reward(c) {
    draw(c, CHEST_ART, 1.5, 12, 13);
  },
  openedChest(c) {
    draw(c, OPENED_ART, 1.5, 12, 13);
  },
  treasure(c) {
    draw(c, COINS_ART, 1.4, 12, 13);
  },
  stairs(c) {
    draw(c, STAIRS_ART, 1.5);
  },
  oneway(c) {
    draw(c, ARROW_ART, 1.6);
  },
});

/** The Heart Door's heart. */
function paintPixelHeart(c: CanvasRenderingContext2D, cell = 1.6) {
  draw(c, HEART_ART, cell);
}

/** A torch: an iron sconce with a flame flickering between two frames, a
 * curl of smoke once put out. */
function paintPixelTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  if (!t.active) {
    draw(c, SNUFFED_ART, 1.5);
    return;
  }
  const frame = f.look.reduceMotion ? 0 : Math.floor(f.now / 180 + t.x * 3 + t.y) % 2;
  draw(c, TORCH_ARTS[frame], 1.5);
}

/** The hero, turned the way it last stepped (world y grows upward, the
 * screen's down): side on, mirrored when it went left, its back going up
 * the screen and its face going down. */
function paintPixelHero(c: CanvasRenderingContext2D, facing: Facing = { dx: 1, dy: 0 }) {
  if (facing.dx < 0) {
    c.translate(24, 0);
    c.scale(-1, 1);
  }
  const a = facing.dy > 0 ? HERO.back : facing.dy < 0 ? HERO.front : HERO.side;
  draw(c, a, 1.5, 12, 12.5);
}

export const PIXEL_BOARD: ThemedBoard = {
  ground: drawPixelGround, contents: paintPixelContents, heart: (c) => paintPixelHeart(c),
  torch: paintPixelTorch, hero: paintPixelHero,
};

/** Every sprite the board draws, for a test to check each is a rectangle. */
export const PIXEL_SPRITES: readonly Sprite[] = [
  ...FLOORS.map((a) => a.rows), CAP.rows, FACE.rows, SPECKS.rows,
  SPROUT, BAT, GOLEM, WRAITH, OGRE, CROWN, RANGED_MARK.rows, FAST_MARK.rows,
  KEY, HEART, FLASK, SWORD, SHIELD, CHEST, OPENED_CHEST, COINS, STAIRS, ARROW, ...TORCH_FRAMES, SNUFFED,
  HERO_SIDE, HERO_FRONT, HERO_BACK, DOOR.rows, PLANKS.rows, HEART_SLAB.rows,
];
