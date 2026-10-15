import type { KeyColor } from "./config.ts";
import type { EnemyStrength, Tile, Torch } from "./entities.ts";
import type { Facing } from "./state.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import type { ThemedBoard } from "./themed-boards.ts";
import { tileHash } from "./ascii-glyphs.ts";
import { rankChevrons } from "./rank-chevrons.ts";

/** The Doodle Game theme's dungeon board: a dungeon drawn with a mouse in a
 * simple paint program. White paper underfoot with a pencil mark here and
 * there, the rock poured full of grey with the bucket and dusted with the
 * spray can, the walls along open ground grey bricks outlined in thick
 * black brush strokes that never quite run straight. Everything is flat
 * colour from a small bright palette, each fill landing a little off its
 * outline as a hurried hand leaves it: green blobs, purple spiders, orange
 * box monsters, ghosts and a horned boss for the enemies, a yellow star for
 * treasure, and a smiling stick figure with a sword for the hero. */

export const DOODLE = {
  ink: "#000000",
  paper: "#ffffff",
  /** The rock, poured with the bucket. */
  rock: "#808080",
  /** The bricks along open ground. */
  brick: "#c0c0c0",
  pencil: "#a0a0a0",
  red: "#ff0000",
  maroon: "#800000",
  orange: "#ff8000",
  yellow: "#ffff00",
  lime: "#00ff00",
  green: "#008000",
  cyan: "#00ffff",
  teal: "#008080",
  blue: "#0000ff",
  sky: "#0080ff",
  purple: "#800080",
  magenta: "#ff00ff",
  pink: "#ff80c0",
  brown: "#804000",
  tan: "#ffc080",
  keys: { yellow: "#ffff00", blue: "#0080ff", red: "#ff0000" } as Record<KeyColor, string>,
} as const;
const keyColor = (k: KeyColor | undefined) => (k ? DOODLE.keys[k] ?? DOODLE.paper : DOODLE.paper);

/** A small stream of numbers from a seed, so a stroke wobbles the same way
 * every frame. */
export function wobbler(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

export type Pt = readonly [number, number];

/** A path through `pts` as a hand drags a mouse along it: each straight
 * run bent a little at its middle, by `amount` units at most. */
export function handPath(c: CanvasRenderingContext2D, pts: readonly Pt[], seed: number, closed = false, amount = 0.9) {
  const r = wobbler(seed);
  c.moveTo(pts[0][0] + r() * amount * 0.6, pts[0][1] + r() * amount * 0.6);
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    c.quadraticCurveTo((ax + bx) / 2 + r() * amount * 2, (ay + by) / 2 + r() * amount * 2, bx + r() * amount * 0.6, by + r() * amount * 0.6);
  }
  if (closed) c.closePath();
}
/** A lumpy ring round (cx, cy), as a circle drawn freehand. */
export function blobPath(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number, lumps = 0.08) {
  const r = wobbler(seed), n = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = 1 + r() * lumps * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  c.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  c.closePath();
}

/** Fills a shape a little off where it is outlined, the way a hurried
 * fill lands, then outlines it in the brush. */
export function shape(c: CanvasRenderingContext2D, path: () => void, color: string | null, width = 1.6, ink: string = DOODLE.ink) {
  if (color) {
    c.save();
    c.translate(0.7, 0.5);
    c.beginPath();
    path();
    c.fillStyle = color;
    c.fill();
    c.restore();
  }
  if (width > 0) {
    c.beginPath();
    path();
    line(c, ink, width);
  }
}
/** Strokes the current path in the round brush. */
export function line(c: CanvasRenderingContext2D, color: string, width: number) {
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = width;
  c.strokeStyle = color;
  c.stroke();
}
export function stroke(c: CanvasRenderingContext2D, pts: readonly Pt[], seed: number, color: string = DOODLE.ink, width = 1.6) {
  c.beginPath();
  handPath(c, pts, seed);
  line(c, color, width);
}
/** Dots of the spray can round (cx, cy). */
export function spray(c: CanvasRenderingContext2D, cx: number, cy: number, radius: number, dots: number, seed: number, color: string) {
  const r = wobbler(seed);
  c.fillStyle = color;
  for (let i = 0; i < dots; i++) {
    const a = (r() + 0.5) * Math.PI * 2, d = Math.sqrt(r() + 0.5) * radius;
    c.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.7, 0.7);
  }
}
/** Two dot eyes, cross eyebrows over them when `angry`. */
function eyes(c: CanvasRenderingContext2D, x: number, y: number, gap: number, seed: number, angry = false, size = 1.1) {
  c.beginPath();
  c.arc(x - gap, y, size, 0, Math.PI * 2);
  c.moveTo(x + gap + size, y);
  c.arc(x + gap, y, size, 0, Math.PI * 2);
  c.fillStyle = DOODLE.ink;
  c.fill();
  if (!angry) return;
  stroke(c, [[x - gap - 2, y - 2.6], [x - gap + 1.6, y - 1.4]], seed, DOODLE.ink, 1.1);
  stroke(c, [[x + gap + 2, y - 2.6], [x + gap - 1.6, y - 1.4]], seed + 1, DOODLE.ink, 1.1);
}

/** White paper over the whole board, the rock poured grey wherever it lies
 * deep, and grey bricks wherever rock touches open ground, edged in the
 * brush along the sides that face it. */
function ground(f: FrameContext) {
  const c = f.c;
  c.fillStyle = DOODLE.paper;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    const h = tileHash(x, y);
    c.save();
    toTileSpace(c, f, x, y);
    if (!isWall(x, y)) paper(c, h);
    else if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) rock(c, h);
    else bricks(c, (dx, dy) => !isWall(x + dx, y + dy), h);
    c.restore();
  });
}

/** Open ground: bare paper, with a pencil mark on a few tiles (a dot, a
 * tuft of grass, a little cross). */
function paper(c: CanvasRenderingContext2D, h: number) {
  const k = h % 13, x = 4 + ((h >>> 4) % 16), y = 4 + ((h >>> 9) % 16);
  if (k === 0) stroke(c, [[x - 2, y + 1], [x - 1, y - 2], [x, y + 1], [x + 1, y - 2.5], [x + 2, y + 1]], h, DOODLE.green, 0.9);
  else if (k === 1) {
    stroke(c, [[x - 1.5, y], [x + 1.5, y]], h, DOODLE.pencil, 0.8);
    stroke(c, [[x, y - 1.5], [x, y + 1.5]], h + 1, DOODLE.pencil, 0.8);
  }
  else if (k === 2) spray(c, x, y, 1.6, 6, h, DOODLE.pencil);
}

/** Deep rock: poured flat grey, a puff of the spray can in it here and
 * there. */
function rock(c: CanvasRenderingContext2D, h: number) {
  c.fillStyle = DOODLE.rock;
  c.fillRect(-0.3, -0.3, 24.6, 24.6);
  if (h % 3 === 0) spray(c, 4 + (h >>> 5) % 16, 4 + (h >>> 11) % 16, 4, 14, h, "#505050");
}

/** A wall along open ground: grey bricks in rows, each brick's line drawn
 * by hand, and a thick black brush line along each side that faces open
 * ground. */
function bricks(c: CanvasRenderingContext2D, open: (dx: number, dy: number) => boolean, h: number) {
  c.fillStyle = DOODLE.brick;
  c.fillRect(-0.3, -0.3, 24.6, 24.6);
  const shift = (h & 1) * 6;
  for (let row = 0; row < 3; row++) {
    const y = row * 8;
    stroke(c, [[0, y + 8], [24, y + 8]], h + row, "#606060", 0.9);
    for (let bx = (row % 2 ? 6 : 0) + shift; bx < 24; bx += 12) if (bx > 0) stroke(c, [[bx, y], [bx, y + 8]], h + row * 7 + bx, "#606060", 0.9);
  }
  // World y grows upward, so the tile above (+1) is this tile's top edge.
  if (open(0, 1)) stroke(c, [[0, 0.8], [24, 0.8]], h + 11, DOODLE.ink, 2.4);
  if (open(0, -1)) stroke(c, [[0, 23.2], [24, 23.2]], h + 12, DOODLE.ink, 2.4);
  if (open(-1, 0)) stroke(c, [[0.8, 0], [0.8, 24]], h + 13, DOODLE.ink, 2.4);
  if (open(1, 0)) stroke(c, [[23.2, 0], [23.2, 24]], h + 14, DOODLE.ink, 2.4);
}

/** A weak enemy: a little green blob with dot eyes and a wobbly smile. */
function blob(c: CanvasRenderingContext2D) {
  shape(c, () => {
    c.moveTo(5, 20);
    c.quadraticCurveTo(4, 9, 12, 9);
    c.quadraticCurveTo(20, 9, 19, 20);
    c.closePath();
  }, DOODLE.lime);
  eyes(c, 12, 14, 2.4, 3);
  stroke(c, [[10, 17], [12, 18], [14, 17]], 5, DOODLE.ink, 1);
}

/** A normal or strong enemy: a purple spider, a round body on eight stick
 * legs, angry; a strong one larger. */
function spider(c: CanvasRenderingContext2D, k: number) {
  c.save();
  c.translate(12, 14);
  c.scale(k, k);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = -3 + i * 2.2;
      stroke(c, [[side * 3, y], [side * 7, y - 3 + i], [side * 9.5, y + 2 + i * 0.8]], 20 + i * 2 + side, DOODLE.ink, 1.2);
    }
  }
  shape(c, () => blobPath(c, 0, 0, 5.2, 4.6, 7), DOODLE.purple, 1.4);
  // Its eyes white with black dots, its brows angry.
  shape(c, () => { c.arc(-2, -0.8, 1.6, 0, Math.PI * 2); c.moveTo(3.6, -0.8); c.arc(2, -0.8, 1.6, 0, Math.PI * 2); }, DOODLE.paper, 0.7);
  c.beginPath();
  c.arc(-1.7, -0.5, 0.7, 0, Math.PI * 2);
  c.moveTo(2.9, -0.5);
  c.arc(2.2, -0.5, 0.7, 0, Math.PI * 2);
  c.fillStyle = DOODLE.ink;
  c.fill();
  stroke(c, [[-4, -3.6], [-0.6, -2.4]], 31, DOODLE.ink, 1);
  stroke(c, [[4, -3.6], [0.6, -2.4]], 32, DOODLE.ink, 1);
  c.restore();
}

/** An elite: an orange box monster, a square body on stick legs with
 * stick arms raised, a jagged mouth and angry eyes. */
function boxMonster(c: CanvasRenderingContext2D) {
  stroke(c, [[9, 18], [8, 22.5]], 40, DOODLE.ink, 1.4);
  stroke(c, [[15, 18], [16, 22.5]], 41, DOODLE.ink, 1.4);
  stroke(c, [[6, 12], [2.5, 8], [2, 5]], 42, DOODLE.ink, 1.4);
  stroke(c, [[18, 12], [21.5, 8], [22, 5]], 43, DOODLE.ink, 1.4);
  shape(c, () => handPath(c, [[5.5, 6], [18.5, 6.5], [18, 18.5], [6, 18]], 44, true, 0.6), DOODLE.orange, 1.6);
  eyes(c, 12, 10.5, 3, 45, true);
  shape(c, () => handPath(c, [[7.5, 14], [9, 16], [10.5, 14], [12, 16], [13.5, 14], [15, 16], [16.5, 14]], 46, false, 0.2), null, 1.1);
}

/** A boss: a big blue beast's head, horns and jagged teeth, angry; a
 * Greater Boss's red and wearing a yellow crown. */
function beast(c: CanvasRenderingContext2D, greater: boolean) {
  const body = greater ? DOODLE.red : DOODLE.sky;
  shape(c, () => handPath(c, [[5, 9], [2.5, 2.5], [8.5, 6.5]], 50, true, 0.4), DOODLE.paper, 1.3);
  shape(c, () => handPath(c, [[19, 9], [21.5, 2.5], [15.5, 6.5]], 51, true, 0.4), DOODLE.paper, 1.3);
  shape(c, () => blobPath(c, 12, 13.5, 9, 8.5, 52), body, 1.8);
  eyes(c, 12, 11, 3.6, 53, true, 1.3);
  shape(c, () => {
    c.moveTo(6.5, 16);
    c.quadraticCurveTo(12, 22, 17.5, 16);
    c.closePath();
  }, DOODLE.ink, 0);
  c.beginPath();
  for (const tx of [8.5, 11.5, 14.5]) {
    c.moveTo(tx - 1.2, 16.3);
    c.lineTo(tx, 18.6);
    c.lineTo(tx + 1.2, 16.3);
  }
  c.fillStyle = DOODLE.paper;
  c.fill();
  if (greater) shape(c, () => handPath(c, [[7, 6], [7, 0.8], [9.5, 3.5], [12, 0.3], [14.5, 3.5], [17, 0.8], [17, 6]], 54, true, 0.3), DOODLE.yellow, 1.2);
}

/** How each strength is drawn: four creatures, which the rank chevrons
 * tell apart. */
const ENEMIES: Record<EnemyStrength, (c: CanvasRenderingContext2D) => void> = {
  weak: blob,
  normal: (c) => spider(c, 0.9),
  strong: (c) => spider(c, 1.1),
  elite: boxMonster,
  boss: (c) => beast(c, false),
  greaterBoss: (c) => beast(c, true),
};

/** One tile's contents in tile space (24x24). */
function contents(c: CanvasRenderingContext2D, t: Tile) {
  switch (t.kind) {
    case "enemy": {
      const e = t.enemy, strength = e?.strength ?? "normal";
      (ENEMIES[strength] ?? ENEMIES.normal)(c);
      rankChevrons(c, strength, DOODLE.red, DOODLE.ink);
      // A Ranged enemy's arrow at the top right, and a Fast enemy's
      // speed lines there, or below the arrow when it has both.
      if (e?.ranged) {
        stroke(c, [[17, 6], [22, 1]], 60, DOODLE.ink, 1.2);
        stroke(c, [[18.5, 1], [22, 1], [22, 4.5]], 61, DOODLE.ink, 1.2);
      }
      const fy = e?.ranged ? 7 : 0;
      if (e?.fast) for (let i = 0; i < 3; i++) stroke(c, [[17 + i * 0.6, 1.5 + fy + i * 1.6], [22, 1.5 + fy + i * 1.6]], 62 + i, DOODLE.blue, 1);
      return;
    }
    case "key": {
      // A key in the key's colour: a ring, a shaft and two teeth.
      const color = keyColor(t.color);
      shape(c, () => handPath(c, [[11, 11], [20, 11], [20, 13.5], [19, 13.5], [19, 16], [17, 16], [17, 13.5], [15.5, 13.5], [15.5, 15], [13.5, 15], [13.5, 13.5], [11, 13.5]], 70, true, 0.2), color, 1.3);
      shape(c, () => blobPath(c, 7.5, 12.2, 4.4, 4.4, 71), color, 1.5);
      shape(c, () => c.arc(7.5, 12.2, 1.6, 0, Math.PI * 2), DOODLE.paper, 1.1);
      return;
    }
    case "door": {
      const rule = t.door;
      if (rule?.type === "wood") {
        // Planks nailed across with a big X.
        shape(c, () => handPath(c, [[3, 3], [21, 3], [21, 21], [3, 21]], 80, true, 0.4), DOODLE.tan, 1.6);
        for (const y of [9, 15]) stroke(c, [[3, y], [21, y]], 81 + y, DOODLE.brown, 1);
        stroke(c, [[4, 4], [20, 20]], 82, DOODLE.brown, 2.2);
        stroke(c, [[20, 4], [4, 20]], 83, DOODLE.brown, 2.2);
        return;
      }
      if (rule?.type === "fullHp") {
        // A pink door with a red heart on it.
        doorFrame(c, DOODLE.pink);
        heart(c);
        return;
      }
      doorFrame(c, DOODLE.brown);
      // A band across the door per key it takes, in that key's colour.
      const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
      const n = Math.max(1, keys.length);
      for (let i = 0; i < n; i++) {
        const y = 12 - (n - 1) * 2 + i * 4 - 1.5;
        shape(c, () => handPath(c, [[5.5, y], [18.5, y], [18.5, y + 3], [5.5, y + 3]], 90 + i, true, 0.25), keyColor(keys[i]), 1);
      }
      if (rule?.type === "keys" && rule.heart) shape(c, () => heartPath(c, 12, 15.5, 0.32), DOODLE.red, 0.9);
      return;
    }
    case "potion": {
      // A round flask on a cork: blue, the red potion red.
      const color = t.color === "red" ? DOODLE.red : DOODLE.blue;
      shape(c, () => blobPath(c, 12, 15, 6.5, 6, 100), DOODLE.paper, 0);
      shape(c, () => {
        c.moveTo(6, 15);
        c.quadraticCurveTo(12, 13, 18, 15);
        c.quadraticCurveTo(18, 21, 12, 21);
        c.quadraticCurveTo(6, 21, 6, 15);
      }, color, 0);
      shape(c, () => handPath(c, [[10, 9], [10, 5], [14, 5], [14, 9]], 101, false, 0.2), DOODLE.paper, 1.3);
      shape(c, () => blobPath(c, 12, 15, 6.5, 6, 100), null, 1.6);
      shape(c, () => handPath(c, [[10, 2.5], [14, 2.5], [14, 5], [10, 5]], 102, true, 0.2), DOODLE.tan, 1.1);
      c.fillStyle = DOODLE.paper;
      c.fillRect(8.5, 16, 1.5, 2.5);
      return;
    }
    case "attack":
      // A sword: a grey blade, a brown cross guard and grip.
      shape(c, () => handPath(c, [[11, 15], [11, 3.5], [12, 1.5], [13, 3.5], [13, 15]], 110, true, 0.15), DOODLE.brick, 1.3);
      shape(c, () => handPath(c, [[7, 15], [17, 15], [17, 17], [7, 17]], 111, true, 0.2), DOODLE.yellow, 1.2);
      shape(c, () => handPath(c, [[11, 17], [13, 17], [13, 22], [11, 22]], 112, true, 0.15), DOODLE.brown, 1.2);
      return;
    case "defense":
      // A shield: blue, a yellow cross on it.
      shape(c, () => {
        c.moveTo(4.5, 4.5);
        c.quadraticCurveTo(12, 2, 19.5, 4.5);
        c.quadraticCurveTo(20, 16, 12, 21.5);
        c.quadraticCurveTo(4, 16, 4.5, 4.5);
      }, DOODLE.blue, 1.6);
      stroke(c, [[12, 5], [12, 18]], 120, DOODLE.yellow, 2.2);
      stroke(c, [[6.5, 10], [17.5, 10]], 121, DOODLE.yellow, 2.2);
      return;
    case "reward":
    case "openedChest": {
      // A brown chest with a yellow lock; its lid thrown back and nothing
      // in it once emptied.
      if (t.kind === "openedChest") {
        shape(c, () => handPath(c, [[4, 4], [20, 4], [20, 10], [4, 10]], 130, true, 0.3), DOODLE.brown, 1.4);
        shape(c, () => handPath(c, [[3.5, 11], [20.5, 11], [20.5, 21], [3.5, 21]], 131, true, 0.3), DOODLE.brown, 1.6);
        shape(c, () => handPath(c, [[5.5, 12.5], [18.5, 12.5], [18.5, 14.5], [5.5, 14.5]], 132, true, 0.2), DOODLE.ink, 0);
        return;
      }
      shape(c, () => handPath(c, [[3.5, 8], [20.5, 8], [20.5, 21], [3.5, 21]], 133, true, 0.3), DOODLE.brown, 1.6);
      shape(c, () => {
        c.moveTo(3.5, 8);
        c.quadraticCurveTo(12, 1, 20.5, 8);
        c.closePath();
      }, DOODLE.brown, 1.6);
      stroke(c, [[3.5, 12], [20.5, 12]], 134, DOODLE.ink, 1.2);
      shape(c, () => handPath(c, [[10, 10], [14, 10], [14, 15], [10, 15]], 135, true, 0.2), DOODLE.yellow, 1.2);
      return;
    }
    case "treasure":
      // A fat yellow star.
      shape(c, () => {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 4.2 : 10;
          if (i === 0) c.moveTo(12 + Math.cos(a) * r, 12.5 + Math.sin(a) * r);
          else c.lineTo(12 + Math.cos(a) * r, 12.5 + Math.sin(a) * r);
        }
        c.closePath();
      }, DOODLE.yellow, 1.6);
      spray(c, 19, 5, 2.4, 8, 140, DOODLE.orange);
      return;
    case "stairs":
      // Steps going up to the right, drawn as one zigzag line, the space
      // under them filled grey.
      shape(c, () => handPath(c, [[2.5, 21.5], [2.5, 17], [8, 17], [8, 12], [13.5, 12], [13.5, 7], [19, 7], [19, 2.5], [21.5, 2.5], [21.5, 21.5]], 150, true, 0.25), DOODLE.brick, 1.6);
      return;
    case "oneway":
      // A fat lime arrow pointing the one way it goes.
      shape(c, () => handPath(c, [[12, 2.5], [21, 12], [16, 12], [16, 21.5], [8, 21.5], [8, 12], [3, 12]], 160, true, 0.3), DOODLE.lime, 1.6);
      return;
  }
}

/** A door in its frame: a slab of `color` with a yellow knob. */
function doorFrame(c: CanvasRenderingContext2D, color: string) {
  shape(c, () => {
    c.moveTo(3.5, 22);
    c.lineTo(3.5, 7);
    c.quadraticCurveTo(12, -1, 20.5, 7);
    c.lineTo(20.5, 22);
    c.closePath();
  }, color, 1.6);
  shape(c, () => c.arc(17.5, 17.5, 1.3, 0, Math.PI * 2), DOODLE.yellow, 0.9);
}

export function heartPath(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
  c.moveTo(x, y + 16 * k);
  c.bezierCurveTo(x - 10 * k, y + 9 * k, x - 7 * k, y, x, y + 4 * k);
  c.bezierCurveTo(x + 7 * k, y, x + 10 * k, y + 9 * k, x, y + 16 * k);
}
/** The Heart Door's heart on its own, as its toll rises off the door: a
 * red heart outlined in the brush. */
function heart(c: CanvasRenderingContext2D) {
  shape(c, () => heartPath(c, 12, 5, 0.8), DOODLE.red, 1.5);
}

/** A torch: a brown stick in a grey bracket, a scribbled orange and yellow
 * flame on it that flickers between two drawings while lit; a curl of
 * grey smoke once put out. */
function torch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  shape(c, () => handPath(c, [[10.5, 12], [13.5, 12], [13, 21], [11, 21]], 170, true, 0.15), DOODLE.brown, 1.2);
  if (!t.active) {
    stroke(c, [[12, 11], [10.5, 8.5], [13, 6.5], [11, 4], [12.5, 2]], 171, DOODLE.pencil, 1.2);
    return;
  }
  const frame = f.look.reduceMotion ? 0 : Math.floor(f.now / 180 + t.x * 3 + t.y) & 1;
  const lean = frame ? 1.2 : -1.2;
  shape(c, () => {
    c.moveTo(8, 11.5);
    c.quadraticCurveTo(7.5, 6.5, 12 + lean, 2);
    c.quadraticCurveTo(16.5, 6.5, 16, 11.5);
    c.closePath();
  }, DOODLE.orange, 1.3);
  shape(c, () => {
    c.moveTo(10, 11.2);
    c.quadraticCurveTo(10, 8, 12 + lean * 0.6, 5.5);
    c.quadraticCurveTo(14, 8, 14, 11.2);
    c.closePath();
  }, DOODLE.yellow, 0);
}

/** The hero: a stick figure with a round yellow smiling face, a sword in
 * its forward hand, turned the way it last stepped sideways. */
function hero(c: CanvasRenderingContext2D, facing: Facing) {
  c.save();
  if (facing.dx < 0) {
    c.translate(24, 0);
    c.scale(-1, 1);
  }
  // The sword, held out in front.
  stroke(c, [[16, 15], [20.5, 4.5]], 180, DOODLE.pencil, 1.8);
  stroke(c, [[14.5, 13.2], [19, 15.4]], 181, DOODLE.brown, 1.6);
  // Body, arms and legs.
  stroke(c, [[11, 11], [11, 17]], 182, DOODLE.ink, 1.6);
  stroke(c, [[6.5, 15], [11, 12.5], [16, 14.5]], 183, DOODLE.ink, 1.5);
  stroke(c, [[7.5, 22.5], [11, 17], [14.5, 22.5]], 184, DOODLE.ink, 1.6);
  // The head: a yellow face, a dot eye and a smile looking ahead.
  shape(c, () => blobPath(c, 11.5, 6.5, 4.6, 4.4, 185, 0.05), DOODLE.yellow, 1.5);
  c.beginPath();
  c.arc(11.4, 5.4, 0.75, 0, Math.PI * 2);
  c.moveTo(14.6, 5.4);
  c.arc(14, 5.4, 0.75, 0, Math.PI * 2);
  c.fillStyle = DOODLE.ink;
  c.fill();
  c.beginPath();
  c.arc(12.7, 6.9, 2.2, 0.25, Math.PI - 0.5);
  line(c, DOODLE.ink, 1);
  c.restore();
}

export const DOODLE_BOARD: ThemedBoard = { ground, contents, heart, torch, hero };
