import { potionShade, type EnemyStrength, type Tile, type Torch, type KeyColor } from "./entities.ts";
import type { Facing } from "./shown.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { tileHash } from "./ascii-glyphs.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import { blobPath, handPath, heartPath, line, shape as doodleShape, spray, stroke as doodleStroke, type Pt } from "./doodle-board.ts";
import { vignette } from "./themed-art.ts";

/** The Murk Game theme's dungeon board: Doodle's gloomy twin, the same
 * hurried mouse in the same simple paint program, but after dark. Dusky
 * violet paper underfoot with a crack, a puddle or a dead tuft here and
 * there, the rock poured black, the walls along open ground slate bricks
 * outlined in thick black brush strokes with a cobweb strung in a corner
 * now and then, and the whole board fading into the dark at its edges.
 * Flat, muted fills each landing a little off their outlines as in Doodle,
 * with pale eyes that shine out of the dark: a little sad ghost, plum bats,
 * a hooded shade and a one-eyed lump of a boss for the enemies, a heap of
 * dull coins for treasure, candles for torches, and a glum stick figure in
 * a scarf with a sword for the hero. */

export const MURK = {
  ink: "#0d0b12",
  /** Open ground: dusky violet paper. */
  floor: "#3b3647",
  /** Pencil marks on it. */
  pencil: "#5e5770",
  /** The rock, poured black. */
  rock: "#141119",
  /** The bricks along open ground, and the mortar between them. */
  brick: "#4d475c",
  mortar: "#29252f",
  /** Pale things that shine out of the dark: eyes, ghosts, cobwebs. */
  bone: "#e4dccb",
  chalk: "#a9a2bb",
  plum: "#5b3a78",
  violet: "#8a6cb8",
  moss: "#6f8a4e",
  sickly: "#9fb86a",
  dusk: "#3d5a8a",
  blue: "#4a86d8",
  blood: "#a8243a",
  red: "#d0384a",
  ember: "#d9702a",
  candle: "#f0c040",
  gold: "#c9a040",
  wood: "#5a3a24",
  rust: "#7a4a2a",
  keys: { yellow: "#e8c040", blue: "#4a86d8", red: "#d0384a" } as Record<KeyColor, string>,
} as const;
const keyColor = (k: KeyColor | undefined) => (k ? MURK.keys[k] ?? MURK.bone : MURK.bone);

/** Doodle's fill-then-outline and brush stroke, in Murk's ink. */
const shape = (c: CanvasRenderingContext2D, path: () => void, color: string | null, width = 1.6) => doodleShape(c, path, color, width, MURK.ink);
const stroke = (c: CanvasRenderingContext2D, pts: readonly Pt[], seed: number, color: string = MURK.ink, width = 1.6) => doodleStroke(c, pts, seed, color, width);

/** Two pale eyes with black dots in them, drooping at their outer corners
 * when `sad`, glaring under brows when not. */
function paleEyes(c: CanvasRenderingContext2D, x: number, y: number, gap: number, size: number, seed: number, sad: boolean, color: string = MURK.bone) {
  shape(c, () => {
    c.arc(x - gap, y, size, 0, Math.PI * 2);
    c.moveTo(x + gap + size, y);
    c.arc(x + gap, y, size, 0, Math.PI * 2);
  }, color, 0.8);
  c.beginPath();
  c.arc(x - gap + (sad ? -0.3 : 0.4), y + 0.4, size * 0.45, 0, Math.PI * 2);
  c.moveTo(x + gap + size, y);
  c.arc(x + gap + (sad ? 0.3 : -0.4), y + 0.4, size * 0.45, 0, Math.PI * 2);
  c.fillStyle = MURK.ink;
  c.fill();
  const lift = sad ? 1 : -1;
  stroke(c, [[x - gap - size - 0.6, y - size - 0.4 + lift], [x - gap + size * 0.6, y - size - 0.8 - lift]], seed, MURK.ink, 1);
  stroke(c, [[x + gap + size + 0.6, y - size - 0.4 + lift], [x + gap - size * 0.6, y - size - 0.8 - lift]], seed + 1, MURK.ink, 1);
}

/** Dusky paper over the whole board, the rock poured black wherever it
 * lies deep, and slate bricks wherever rock touches open ground, edged in
 * the brush along the sides that face it. */
function ground(f: FrameContext) {
  const c = f.c;
  c.fillStyle = MURK.floor;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    const h = tileHash(x, y);
    c.save();
    toTileSpace(c, f, x, y);
    if (!isWall(x, y)) floor(c, h);
    else if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) rock(c, h);
    else bricks(c, (dx, dy) => !isWall(x + dx, y + dy), h);
    c.restore();
  });
}

/** Open ground: dusky paper, with something on a few tiles (a crack, a
 * puddle, a dead tuft, a tiny skull now and then). */
function floor(c: CanvasRenderingContext2D, h: number) {
  const k = h % 17, x = 5 + ((h >>> 4) % 14), y = 5 + ((h >>> 9) % 14);
  if (k === 0) stroke(c, [[x - 4, y - 1], [x - 1, y + 1], [x + 1, y - 1.5], [x + 4, y + 1]], h, MURK.ink, 0.8);
  else if (k === 1) shape(c, () => blobPath(c, x, y, 3.4, 1.6, h, 0.12), MURK.dusk, 0.7);
  else if (k === 2) stroke(c, [[x - 2, y + 1.5], [x - 2.5, y - 1.5], [x - 0.5, y + 1.5], [x + 0.5, y - 2.5], [x + 1.2, y + 1.5], [x + 2.8, y - 1]], h, MURK.rust, 0.8);
  else if (k === 3 && (h >>> 14) % 3 === 0) {
    shape(c, () => blobPath(c, x, y, 2.2, 2, h, 0.04), MURK.bone, 0.7);
    c.fillStyle = MURK.ink;
    c.fillRect(x - 1.2, y - 0.6, 0.9, 0.9);
    c.fillRect(x + 0.3, y - 0.6, 0.9, 0.9);
  }
  else if (k === 4) spray(c, x, y, 1.8, 7, h, MURK.pencil);
}

/** Deep rock: poured flat black, a puff of the spray can in it here and
 * there. */
function rock(c: CanvasRenderingContext2D, h: number) {
  c.fillStyle = MURK.rock;
  c.fillRect(-0.3, -0.3, 24.6, 24.6);
  if (h % 3 === 0) spray(c, 4 + (h >>> 5) % 16, 4 + (h >>> 11) % 16, 4, 14, h, "#2b2633");
}

/** A wall along open ground: slate bricks in rows, each brick's line drawn
 * by hand, a thick black brush line along each side that faces open
 * ground, and now and then a cobweb in the corner over open ground. */
function bricks(c: CanvasRenderingContext2D, open: (dx: number, dy: number) => boolean, h: number) {
  c.fillStyle = MURK.brick;
  c.fillRect(-0.3, -0.3, 24.6, 24.6);
  const shift = (h & 1) * 6;
  for (let row = 0; row < 3; row++) {
    const y = row * 8;
    stroke(c, [[0, y + 8], [24, y + 8]], h + row, MURK.mortar, 0.9);
    for (let bx = (row % 2 ? 6 : 0) + shift; bx < 24; bx += 12) if (bx > 0) stroke(c, [[bx, y], [bx, y + 8]], h + row * 7 + bx, MURK.mortar, 0.9);
  }
  // World y grows upward, so the tile below (-1) is this tile's bottom edge.
  const below = open(0, -1);
  if (open(0, 1)) stroke(c, [[0, 0.8], [24, 0.8]], h + 11, MURK.ink, 2.4);
  if (below) stroke(c, [[0, 23.2], [24, 23.2]], h + 12, MURK.ink, 2.4);
  if (open(-1, 0)) stroke(c, [[0.8, 0], [0.8, 24]], h + 13, MURK.ink, 2.4);
  if (open(1, 0)) stroke(c, [[23.2, 0], [23.2, 24]], h + 14, MURK.ink, 2.4);
  if (below && h % 5 === 0) cobweb(c, h);
}

/** A cobweb strung across a bottom corner: three spokes and the threads
 * sagging between them. */
function cobweb(c: CanvasRenderingContext2D, h: number) {
  c.save();
  if (h & 2) {
    c.translate(24, 0);
    c.scale(-1, 1);
  }
  const spokes: Pt[] = [[1.5, 14], [7, 17.5], [10.5, 22.8]];
  for (const [i, p] of spokes.entries()) stroke(c, [[1.2, 22.8], p], h + 20 + i, MURK.chalk, 0.6);
  for (const k of [0.45, 0.8]) {
    const pts = spokes.map(([x, y]) => [1.2 + (x - 1.2) * k, 22.8 + (y - 22.8) * k] as Pt);
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      c.quadraticCurveTo((ax + bx) / 2 + 0.8, (ay + by) / 2 + 0.6, bx, by);
    }
    line(c, MURK.chalk, 0.5);
  }
  c.restore();
}

/** A weak enemy: a little ghost, a pale sheet with a wavy hem, hollow sad
 * eyes and a small round mouth. */
function ghost(c: CanvasRenderingContext2D) {
  shape(c, () => {
    c.moveTo(5.5, 20.5);
    c.quadraticCurveTo(4.5, 6.5, 12, 6.5);
    c.quadraticCurveTo(19.5, 6.5, 18.5, 20.5);
    c.quadraticCurveTo(17, 18.5, 15.3, 20.8);
    c.quadraticCurveTo(13.6, 18.5, 12, 20.8);
    c.quadraticCurveTo(10.4, 18.5, 8.7, 20.8);
    c.quadraticCurveTo(7, 18.5, 5.5, 20.5);
    c.closePath();
  }, MURK.bone, 1.4);
  shape(c, () => {
    blobPath(c, 9.5, 12, 1.4, 1.8, 201, 0.05);
    blobPath(c, 14.5, 12, 1.4, 1.8, 202, 0.05);
  }, MURK.ink, 0);
  stroke(c, [[7.4, 9.6], [10, 10.4]], 203, MURK.ink, 0.9);
  stroke(c, [[16.6, 9.6], [14, 10.4]], 204, MURK.ink, 0.9);
  shape(c, () => blobPath(c, 12, 16, 0.9, 1.1, 205, 0.05), MURK.ink, 0);
}

/** A normal or strong enemy: a plum bat, scalloped wings spread, yellow
 * eyes and two little fangs; a strong one larger. */
function bat(c: CanvasRenderingContext2D, k: number) {
  c.save();
  c.translate(12, 13);
  c.scale(k, k);
  for (const side of [-1, 1]) {
    shape(c, () => {
      c.moveTo(side * 3, -2.5);
      c.quadraticCurveTo(side * 7, -6.5, side * 10.5, -3.5);
      c.quadraticCurveTo(side * 9.5, 0, side * 10, 2.5);
      c.quadraticCurveTo(side * 8, 1, side * 6.8, 3.2);
      c.quadraticCurveTo(side * 5, 1.5, side * 3, 3);
      c.closePath();
    }, MURK.plum, 1.3);
  }
  shape(c, () => {
    blobPath(c, 0, 0.5, 4, 4.4, 211);
    c.moveTo(-3.2, -2.5);
    c.lineTo(-2.4, -6.2);
    c.lineTo(-0.9, -3.6);
    c.moveTo(3.2, -2.5);
    c.lineTo(2.4, -6.2);
    c.lineTo(0.9, -3.6);
  }, MURK.plum, 1.4);
  paleEyes(c, 0, -0.2, 1.6, 1.15, 212, false, MURK.candle);
  c.beginPath();
  c.moveTo(-1.4, 2.4);
  c.lineTo(-0.9, 3.9);
  c.lineTo(-0.4, 2.4);
  c.moveTo(0.4, 2.4);
  c.lineTo(0.9, 3.9);
  c.lineTo(1.4, 2.4);
  c.fillStyle = MURK.bone;
  c.fill();
  c.restore();
}

/** An elite: a hooded shade, a ragged cloak and a black hood with two
 * yellow eyes glowing in it. */
function shade(c: CanvasRenderingContext2D) {
  shape(c, () => handPath(c, [[12, 2.5], [17.5, 7.5], [19, 21.5], [16.5, 19.5], [14.5, 22], [12, 19.8], [9.5, 22], [7.5, 19.5], [5, 21.5], [6.5, 7.5]], 220, true, 0.4), MURK.plum, 1.6);
  shape(c, () => blobPath(c, 12, 9.5, 3.8, 3.6, 221, 0.06), MURK.ink, 0);
  c.beginPath();
  c.arc(10.5, 9.4, 0.95, 0, Math.PI * 2);
  c.moveTo(14.45, 9.4);
  c.arc(13.5, 9.4, 0.95, 0, Math.PI * 2);
  c.fillStyle = MURK.candle;
  c.fill();
  // Its thin pale hands, held out of the sleeves.
  stroke(c, [[7.5, 14.5], [4.5, 15.5], [3, 14.5]], 222, MURK.bone, 1.1);
  stroke(c, [[16.5, 14.5], [19.5, 15.5], [21, 14.5]], 223, MURK.bone, 1.1);
}

/** A boss: a big one-eyed lump on stubby tentacles, sickly green with a
 * crooked grin; a Greater Boss's blood red wearing a bent crown. */
function lump(c: CanvasRenderingContext2D, greater: boolean) {
  const body = greater ? MURK.blood : MURK.moss;
  for (const [i, x] of [5, 9.5, 14.5, 19].entries()) stroke(c, [[x, 18], [x + (i % 2 ? 1 : -1), 21], [x + (i % 2 ? -0.5 : 0.5), 23]], 230 + i, MURK.ink, 2);
  shape(c, () => blobPath(c, 12, 13.5, 9.5, 8, 234, 0.07), body, 1.8);
  // One big pale eye, its pupil a slit.
  shape(c, () => blobPath(c, 12, 11.5, 4, 3.4, 235, 0.04), MURK.bone, 1.2);
  shape(c, () => handPath(c, [[12, 8.8], [12.9, 11.5], [12, 14.2], [11.1, 11.5]], 236, true, 0.1), MURK.ink, 0);
  stroke(c, [[7, 7.8], [10.5, 8.4], [14, 7.6], [17, 8.4]], 237, MURK.ink, 1.1);
  // A crooked grin with a few teeth.
  stroke(c, [[6.5, 17], [9, 18.4], [12, 17.6], [15, 18.6], [17.5, 16.8]], 238, MURK.ink, 1.2);
  c.beginPath();
  for (const [tx, ty] of [[9, 18.4], [13.8, 18.1]] as const) {
    c.moveTo(tx - 0.9, ty);
    c.lineTo(tx, ty + 1.8);
    c.lineTo(tx + 0.9, ty);
  }
  c.fillStyle = MURK.bone;
  c.fill();
  if (greater) shape(c, () => handPath(c, [[7.5, 6.5], [6.5, 1.5], [9.5, 3.8], [12, 0.8], [14.2, 3.4], [17.8, 0.5], [16.5, 6]], 239, true, 0.3), MURK.gold, 1.2);
}

/** How each strength is drawn: four creatures, which the rank chevrons
 * tell apart. */
const ENEMIES: Record<EnemyStrength, (c: CanvasRenderingContext2D) => void> = {
  weak: ghost,
  normal: (c) => bat(c, 0.9),
  strong: (c) => bat(c, 1.1),
  elite: shade,
  boss: (c) => lump(c, false),
  greaterBoss: (c) => lump(c, true),
};

/** One tile's contents in tile space (24x24). */
const contents = contentsFrom({
  enemy(c, t) {
    const e = t.enemy, strength = e?.strength ?? "normal";
    (ENEMIES[strength] ?? ENEMIES.normal)(c);
    rankChevrons(c, strength, MURK.red, MURK.ink);
    // A Ranged enemy's arrow at the top right, and a Fast enemy's
    // speed lines there, or below the arrow when it has both.
    if (e?.ranged) {
      stroke(c, [[17, 6], [22, 1]], 60, MURK.bone, 1.2);
      stroke(c, [[18.5, 1], [22, 1], [22, 4.5]], 61, MURK.bone, 1.2);
    }
    const fy = e?.ranged ? 7 : 0;
    if (e?.fast) for (let i = 0; i < 3; i++) stroke(c, [[17 + i * 0.6, 1.5 + fy + i * 1.6], [22, 1.5 + fy + i * 1.6]], 62 + i, MURK.chalk, 1);
  },
  key(c, t) {
    // An old key in the key's colour: a ring, a shaft and two teeth.
    const color = keyColor(t.color);
    shape(c, () => handPath(c, [[11, 11], [20, 11], [20, 13.5], [19, 13.5], [19, 16], [17, 16], [17, 13.5], [15.5, 13.5], [15.5, 15], [13.5, 15], [13.5, 13.5], [11, 13.5]], 70, true, 0.2), color, 1.3);
    shape(c, () => blobPath(c, 7.5, 12.2, 4.4, 4.4, 71), color, 1.5);
    shape(c, () => c.arc(7.5, 12.2, 1.6, 0, Math.PI * 2), MURK.floor, 1.1);
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "wood") {
      // Rotten planks nailed across with a big X.
      shape(c, () => handPath(c, [[3, 3], [21, 3], [21, 21], [3, 21]], 80, true, 0.4), MURK.rust, 1.6);
      for (const y of [9, 15]) stroke(c, [[3, y], [21, y]], 81 + y, MURK.wood, 1);
      stroke(c, [[4, 4], [20, 20]], 82, MURK.ink, 2.2);
      stroke(c, [[20, 4], [4, 20]], 83, MURK.ink, 2.2);
      return;
    }
    if (rule?.type === "fullHp") {
      // A dark door with a red heart on it.
      doorFrame(c, MURK.plum);
      heart(c);
      return;
    }
    doorFrame(c, MURK.wood);
    // A band across the door per key it takes, in that key's colour.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const n = Math.max(1, keys.length);
    for (let i = 0; i < n; i++) {
      const y = 12 - (n - 1) * 2 + i * 4 - 1.5;
      shape(c, () => handPath(c, [[5.5, y], [18.5, y], [18.5, y + 3], [5.5, y + 3]], 90 + i, true, 0.25), keyColor(keys[i]), 1);
    }
    if (rule?.type === "keys" && rule.heart) shape(c, () => heartPath(c, 12, 15.5, 0.32), MURK.red, 0.9);
  },
  potion(c, t) {
    // A round flask on a cork: red, the percent potion blue, a bubble rising.
    const color = potionShade(t) === "red" ? MURK.red : MURK.blue;
    shape(c, () => blobPath(c, 12, 15, 6.5, 6, 100), MURK.mortar, 0);
    shape(c, () => {
      c.moveTo(6, 15);
      c.quadraticCurveTo(12, 13, 18, 15);
      c.quadraticCurveTo(18, 21, 12, 21);
      c.quadraticCurveTo(6, 21, 6, 15);
    }, color, 0);
    shape(c, () => handPath(c, [[10, 9], [10, 5], [14, 5], [14, 9]], 101, false, 0.2), MURK.mortar, 1.3);
    shape(c, () => blobPath(c, 12, 15, 6.5, 6, 100), null, 1.6);
    shape(c, () => handPath(c, [[10, 2.5], [14, 2.5], [14, 5], [10, 5]], 102, true, 0.2), MURK.rust, 1.1);
    shape(c, () => c.arc(13.5, 11.5, 0.9, 0, Math.PI * 2), null, 0.6);
    c.fillStyle = MURK.bone;
    c.fillRect(8.5, 16, 1.5, 2.5);
  },
  attack(c) {
    // A notched sword: a grey blade, a dull gold guard and a dark grip.
    shape(c, () => handPath(c, [[11, 15], [11, 3.5], [12, 1.5], [13, 3.5], [13, 8], [12.3, 8.8], [13, 9.6], [13, 15]], 110, true, 0.15), MURK.chalk, 1.3);
    shape(c, () => handPath(c, [[7, 15], [17, 15], [17, 17], [7, 17]], 111, true, 0.2), MURK.gold, 1.2);
    shape(c, () => handPath(c, [[11, 17], [13, 17], [13, 22], [11, 22]], 112, true, 0.15), MURK.wood, 1.2);
  },
  defense(c) {
    // A battered shield: dusk blue, a pale cross on it, a crack.
    shape(c, () => {
      c.moveTo(4.5, 4.5);
      c.quadraticCurveTo(12, 2, 19.5, 4.5);
      c.quadraticCurveTo(20, 16, 12, 21.5);
      c.quadraticCurveTo(4, 16, 4.5, 4.5);
    }, MURK.dusk, 1.6);
    stroke(c, [[12, 5], [12, 18]], 120, MURK.bone, 2.2);
    stroke(c, [[6.5, 10], [17.5, 10]], 121, MURK.bone, 2.2);
    stroke(c, [[16.5, 4], [15, 7], [16.5, 8.5]], 122, MURK.ink, 0.9);
  },
  reward: paintChest,
  openedChest: paintChest,
  treasure(c) {
    // A heap of dull gold coins, one glinting.
    for (const [i, [x, y]] of ([[7.5, 18], [16.5, 18], [12, 17.5], [9.5, 13.5], [14.5, 13.5], [12, 9.5]] as const).entries()) {
      shape(c, () => blobPath(c, x, y, 4, 2.6, 140 + i, 0.04), MURK.gold, 1.3);
      stroke(c, [[x - 1.6, y - 0.2], [x + 1.6, y - 0.2]], 150 + i, MURK.rust, 0.7);
    }
    stroke(c, [[16.5, 6], [16.5, 10]], 147, MURK.bone, 0.9);
    stroke(c, [[14.5, 8], [18.5, 8]], 148, MURK.bone, 0.9);
  },
  stairs(c) {
    // Steps going up to the right, drawn as one zigzag line, the space
    // under them filled slate, a pale line on each step's tread.
    shape(c, () => handPath(c, [[2.5, 21.5], [2.5, 17], [8, 17], [8, 12], [13.5, 12], [13.5, 7], [19, 7], [19, 2.5], [21.5, 2.5], [21.5, 21.5]], 150, true, 0.25), MURK.brick, 1.6);
    for (const [i, [x, y]] of ([[3.5, 18], [9, 13], [14.5, 8], [19.8, 3.5]] as const).entries()) stroke(c, [[x, y], [x + 3.5, y]], 155 + i, MURK.chalk, 0.8);
  },
  oneway(c) {
    // A fat sickly green arrow pointing the one way it goes.
    shape(c, () => handPath(c, [[12, 2.5], [21, 12], [16, 12], [16, 21.5], [8, 21.5], [8, 12], [3, 12]], 160, true, 0.3), MURK.sickly, 1.6);
  },
});
/** A reward chest, shut or opened (`reward`, `openedChest`). */
function paintChest(c: CanvasRenderingContext2D, t: Tile) {
  // A dark chest with a dull gold lock; its lid thrown back and nothing
  // in it but a cobweb once emptied.
  if (t.kind === "openedChest") {
    shape(c, () => handPath(c, [[4, 4], [20, 4], [20, 10], [4, 10]], 130, true, 0.3), MURK.wood, 1.4);
    shape(c, () => handPath(c, [[3.5, 11], [20.5, 11], [20.5, 21], [3.5, 21]], 131, true, 0.3), MURK.wood, 1.6);
    shape(c, () => handPath(c, [[5.5, 12.5], [18.5, 12.5], [18.5, 14.5], [5.5, 14.5]], 132, true, 0.2), MURK.ink, 0);
    stroke(c, [[6, 12.8], [9, 14.2], [12, 12.8]], 136, MURK.chalk, 0.5);
    return;
  }
  shape(c, () => handPath(c, [[3.5, 8], [20.5, 8], [20.5, 21], [3.5, 21]], 133, true, 0.3), MURK.wood, 1.6);
  shape(c, () => {
    c.moveTo(3.5, 8);
    c.quadraticCurveTo(12, 1, 20.5, 8);
    c.closePath();
  }, MURK.wood, 1.6);
  stroke(c, [[3.5, 12], [20.5, 12]], 134, MURK.ink, 1.2);
  shape(c, () => handPath(c, [[10, 10], [14, 10], [14, 15], [10, 15]], 135, true, 0.2), MURK.gold, 1.2);
}

/** A door in its frame: a slab of `color` with planks drawn in and a dull
 * gold ring for a handle. */
function doorFrame(c: CanvasRenderingContext2D, color: string) {
  shape(c, () => {
    c.moveTo(3.5, 22);
    c.lineTo(3.5, 7);
    c.quadraticCurveTo(12, -1, 20.5, 7);
    c.lineTo(20.5, 22);
    c.closePath();
  }, color, 1.6);
  stroke(c, [[9, 4.5], [9, 21.5]], 170, MURK.ink, 0.6);
  stroke(c, [[15, 4.5], [15, 21.5]], 171, MURK.ink, 0.6);
  shape(c, () => c.arc(17.5, 17.5, 1.3, 0, Math.PI * 2), null, 1);
}

/** The Heart Door's heart on its own, as its toll rises off the door: a
 * red heart outlined in the brush. */
function heart(c: CanvasRenderingContext2D) {
  shape(c, () => heartPath(c, 12, 5, 0.8), MURK.red, 1.5);
}

/** A torch: a stub of a pale candle dripping wax, on a dark iron dish, a
 * small yellow flame on it that flickers between two drawings while lit;
 * a thin curl of smoke once put out. */
function torch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  shape(c, () => handPath(c, [[7, 20], [17, 20], [15.5, 22], [8.5, 22]], 180, true, 0.15), MURK.mortar, 1.2);
  shape(c, () => handPath(c, [[10, 12], [14, 12], [14, 20], [10, 20]], 181, true, 0.15), MURK.bone, 1.2);
  stroke(c, [[13.2, 12.5], [13.4, 15.5]], 182, MURK.chalk, 1);
  if (!t.active) {
    stroke(c, [[12, 11], [10.5, 8.5], [13, 6.5], [11, 4], [12.5, 2]], 183, MURK.chalk, 1);
    return;
  }
  stroke(c, [[12, 12], [12, 10.5]], 184, MURK.ink, 0.8);
  const frame = f.look.reduceMotion ? 0 : Math.floor(f.now / 220 + t.x * 3 + t.y) & 1;
  const lean = frame ? 0.9 : -0.9;
  shape(c, () => {
    c.moveTo(9.8, 10.6);
    c.quadraticCurveTo(9.5, 6.5, 12 + lean, 3.5);
    c.quadraticCurveTo(14.5, 6.5, 14.2, 10.6);
    c.closePath();
  }, MURK.ember, 1.1);
  shape(c, () => {
    c.moveTo(11, 10.4);
    c.quadraticCurveTo(11, 8.4, 12 + lean * 0.5, 6.5);
    c.quadraticCurveTo(13, 8.4, 13, 10.4);
    c.closePath();
  }, MURK.candle, 0);
}

/** The hero: a stick figure with a round pale face, a flat glum mouth and
 * a red scarf trailing behind, a sword in its forward hand, turned the way
 * it last stepped sideways. */
function hero(c: CanvasRenderingContext2D, facing: Facing) {
  c.save();
  if (facing.dx < 0) {
    c.translate(24, 0);
    c.scale(-1, 1);
  }
  // The sword, held out in front.
  stroke(c, [[16, 15], [20.5, 4.5]], 190, MURK.chalk, 1.8);
  stroke(c, [[14.5, 13.2], [19, 15.4]], 191, MURK.gold, 1.6);
  // Body, arms and legs, in pale chalk so they show against the dark.
  stroke(c, [[11, 11], [11, 17]], 192, MURK.bone, 1.6);
  stroke(c, [[6.5, 15], [11, 12.5], [16, 14.5]], 193, MURK.bone, 1.5);
  stroke(c, [[7.5, 22.5], [11, 17], [14.5, 22.5]], 194, MURK.bone, 1.6);
  // The scarf, wound round the neck and trailing behind.
  shape(c, () => handPath(c, [[8.5, 10.5], [13.5, 10.5], [10, 12.3], [5, 13.8], [4, 12.2]], 195, true, 0.2), MURK.red, 1);
  // The head: a pale face, two dot eyes and a flat mouth looking ahead.
  shape(c, () => blobPath(c, 11.5, 6.5, 4.6, 4.4, 196, 0.05), MURK.bone, 1.5);
  c.beginPath();
  c.arc(11.6, 5.8, 0.75, 0, Math.PI * 2);
  c.moveTo(14.75, 5.8);
  c.arc(14, 5.8, 0.75, 0, Math.PI * 2);
  c.fillStyle = MURK.ink;
  c.fill();
  stroke(c, [[11.8, 8.4], [14.2, 8.1]], 197, MURK.ink, 0.9);
  c.restore();
}

/** The board fades into the dark at its edges. */
function over(f: FrameContext) {
  vignette(f, 0.3, "rgba(13, 11, 18, 0)", "rgba(13, 11, 18, 0.55)");
}

export const MURK_BOARD: ThemedBoard = { ground, contents, heart, torch, hero, over };
