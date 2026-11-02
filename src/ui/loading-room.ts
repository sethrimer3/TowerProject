/** The loading screen's little tower room: a random 13 × 13 floor, walled,
 * split into chambers by inner walls with doorways, doors and their keys,
 * a few monsters, potions and gems, stairs on the outer wall and the hero at
 * the entrance, which builds itself up piece by piece as the game loads.
 * Each piece has a moment (`at`, in [0, 1)) in the build; `paintRoom` draws
 * the room as it stands at build time `t`, every piece easing in over `EASE`.
 * Presentation only, not a Tower floor: it never touches the save or a game
 * random stream, and draws from its own seeded hash. */

export const SIZE = 13;
/** Art pixels a tile. */
export const TILE = 6;
/** How long, in build time, a piece takes to settle. */
export const EASE = 0.08;
/** Art pixels above the room the walls fall in from. */
const DROP = 5;
/** The canvas's size in art pixels. */
export const ROOM_W = SIZE * TILE, ROOM_H = SIZE * TILE + DROP;

export type KeyColor = "yellow" | "blue" | "red";
export type PieceKind = "floor" | "wall" | "door" | "stairs" | "key" | "monster" | "potion" | "gem" | "hero";
export type Piece = { kind: PieceKind; x: number; y: number; at: number; color?: KeyColor | "red" | "blue" | "green" | "violet" };
export type Palette = { floor: string; wall: string; seam: string; accent: string };
export type Room = { pieces: Piece[]; palette: Palette; entrance: [number, number]; stairs: [number, number] };

/** The Tower's area palettes (render/themes.ts), so the room looks like one of its floors. */
const PALETTES: Palette[] = [
  { floor: "#191e28", wall: "#485362", seam: "#242d39", accent: "#a69b83" },
  { floor: "#14291f", wall: "#3f6350", seam: "#21392a", accent: "#82b85b" },
  { floor: "#30251a", wall: "#876444", seam: "#483422", accent: "#d4ad72" },
  { floor: "#162c3a", wall: "#56869c", seam: "#294656", accent: "#b0e8ed" },
  { floor: "#301c20", wall: "#70423d", seam: "#40282c", accent: "#ec9255" },
  { floor: "#271d38", wall: "#65517f", seam: "#392b4b", accent: "#c49de9" },
  { floor: "#122e30", wall: "#3c7775", seam: "#224748", accent: "#77c9b5" },
  { floor: "#302334", wall: "#76566b", seam: "#473448", accent: "#dea5b8" },
];

/** A small seeded stream (mulberry32). */
function hashStream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Cell = "wall" | "floor" | "door" | "stairs";
const key = (x: number, y: number) => y * SIZE + x;

/** The room of `seed`: the same seed always builds the same room. */
export function loadingRoom(seed: number): Room {
  const rand = hashStream(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const grid: Cell[] = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    return x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? "wall" : "floor";
  });
  const mid = (SIZE - 1) / 2, entrance: [number, number] = [mid, SIZE - 1];
  grid[key(...entrance)] = "floor";

  // Inner walls by recursive division: walls on even rows and columns, each
  // with one doorway on an odd one, so every chamber stays connected.
  const walls: { cells: [number, number][]; gap: [number, number] }[] = [];
  const divide = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 3 && h < 3) return;
    if (depth >= 2 && (w * h <= 15 || rand() < 0.3)) return;
    const across = h > w || (h === w && rand() < 0.5);
    const evens = (a: number, b: number) => Array.from({ length: Math.max(0, (b - a) / 2) }, (_, k) => a + 1 + k * 2);
    const odds = (a: number, b: number) => Array.from({ length: (b - a) / 2 + 1 }, (_, k) => a + k * 2);
    // No wall down the entrance's column to the bottom: it would shut the way in.
    const lines = across ? evens(y0, y1) : evens(x0, x1).filter(x => x !== mid || y1 !== SIZE - 2);
    if (!lines.length) return;
    const at = pick(lines), gapAt = pick(across ? odds(x0, x1) : odds(y0, y1));
    const cells: [number, number][] = [];
    const span = across ? [x0 - 1, x1 + 1] : [y0 - 1, y1 + 1];
    for (let s = span[0] + 1; s < span[1]; s++) {
      const c: [number, number] = across ? [s, at] : [at, s];
      if (s === gapAt) continue;
      grid[key(...c)] = "wall";
      cells.push(c);
    }
    // Grow each wall from a random end.
    if (rand() < 0.5) cells.reverse();
    walls.push({ cells, gap: across ? [gapAt, at] : [at, gapAt] });
    if (across) {
      divide(x0, y0, x1, at - 1, depth + 1);
      divide(x0, at + 1, x1, y1, depth + 1);
    } else {
      divide(x0, y0, at - 1, y1, depth + 1);
      divide(at + 1, y0, x1, y1, depth + 1);
    }
  };
  divide(1, 1, SIZE - 2, SIZE - 2, 0);

  // Each doorway is left open, held by a monster or shut by a coloured door.
  const doors: { at: [number, number]; color: KeyColor }[] = [];
  const guards: [number, number][] = [];
  for (const wall of walls) {
    const r = rand();
    if (r < 0.45) {
      const color = pick(["yellow", "yellow", "blue", "red"] as const);
      grid[key(...wall.gap)] = "door";
      doors.push({ at: wall.gap, color });
    } else if (r < 0.7) guards.push(wall.gap);
  }

  /** The floor reachable from the entrance, through doors in `open`. */
  const reach = (open: Set<number>) => {
    const seen = new Map<number, number>([[key(...entrance), 0]]), queue: [number, number][] = [entrance];
    for (let q = 0; q < queue.length; q++) {
      const [x, y] = queue[q];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen.has(k)) continue;
        const c = grid[k];
        if (c === "wall" || c === "stairs" || (c === "door" && !open.has(k))) continue;
        seen.set(k, seen.get(key(x, y))! + 1);
        queue.push([nx, ny]);
      }
    }
    return seen;
  };

  const taken = new Set<number>([key(...entrance), key(mid, SIZE - 2), ...guards.map(g => key(...g))]);
  const free = (cells: Iterable<number>) => [...cells].filter(k => grid[k] === "floor" && !taken.has(k));
  const items: Piece[] = [];
  const place = (kind: PieceKind, cells: number[], color?: Piece["color"]) => {
    if (!cells.length) return false;
    const k = pick(cells);
    taken.add(k);
    items.push({ kind, x: k % SIZE, y: Math.floor(k / SIZE), at: 0, ...(color ? { color } : {}) });
    return true;
  };

  // Every door's key lies where the doors opened so far let the hero reach,
  // nearest door first, so the room can always be solved.
  const open = new Set<number>();
  const firstReach = reach(new Set(doors.map(d => key(...d.at))));
  doors.sort((a, b) => (firstReach.get(key(...a.at)) ?? 0) - (firstReach.get(key(...b.at)) ?? 0));
  for (const door of doors) {
    place("key", free(reach(open).keys()), door.color);
    open.add(key(...door.at));
  }

  // The stairs: on the outer wall, beside the floor furthest from the entrance.
  const all = reach(open);
  let stairs: [number, number] = [mid, 0], best = -1;
  for (let s = 1; s < SIZE - 1; s++)
    for (const [wx, wy, ix, iy] of [[s, 0, s, 1], [0, s, 1, s], [SIZE - 1, s, SIZE - 2, s]] as const) {
      const d = all.get(key(ix, iy));
      if (d === undefined) continue;
      const score = d + rand() * 3;
      if (score > best) { best = score; stairs = [wx, wy]; }
    }
  grid[key(...stairs)] = "stairs";

  for (const g of guards) items.push({ kind: "monster", x: g[0], y: g[1], at: 0, color: pick(["green", "red", "violet"] as const) });
  const count = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  for (let n = count(1, 3); n > 0; n--) place("monster", free(all.keys()), pick(["green", "red", "violet", "blue"] as const));
  for (let n = count(1, 2); n > 0; n--) place("potion", free(all.keys()), pick(["red", "blue"] as const));
  for (let n = count(0, 2); n > 0; n--) place("gem", free(all.keys()), pick(["red", "blue"] as const));

  // The build: the floor spreads in from the entrance, the outer wall rises
  // round it, the inner walls grow one by one, then the doors, the stairs,
  // what lies about the room and, last, the hero.
  const pieces: Piece[] = [];
  const far = 2 * (SIZE - 1);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = Math.abs(x - entrance[0]) + Math.abs(y - entrance[1]);
      pieces.push({ kind: "floor", x, y, at: 0.24 * d / far + rand() * 0.02 });
    }
  // Round the ring both ways from the entrance, meeting at the top.
  const ring: [number, number][] = [];
  for (let x = mid - 1; x >= 0; x--) ring.push([x, SIZE - 1]);
  for (let y = SIZE - 2; y >= 0; y--) ring.push([0, y]);
  for (let x = 1; x <= mid; x++) ring.push([x, 0]);
  ring.forEach(([x, y], i) => {
    const at = 0.16 + 0.24 * i / ring.length;
    pieces.push({ kind: "wall", x, y, at });
    if (x !== mid || y !== 0) pieces.push({ kind: "wall", x: SIZE - 1 - x, y, at });
  });
  for (const p of pieces) if (p.kind === "wall" && p.x === stairs[0] && p.y === stairs[1]) p.kind = "stairs";
  walls.forEach((wall, w) => wall.cells.forEach(([x, y], i) => {
    pieces.push({ kind: "wall", x, y, at: 0.42 + 0.26 * (w + i / Math.max(1, wall.cells.length)) / Math.max(1, walls.length) });
  }));
  doors.forEach((d, i) => pieces.push({ kind: "door", x: d.at[0], y: d.at[1], at: 0.69 + 0.04 * i / Math.max(1, doors.length), color: d.color }));
  for (const p of pieces) if (p.kind === "stairs") p.at = Math.max(p.at, 0.74);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items.forEach((item, i) => pieces.push({ ...item, at: 0.77 + 0.12 * i / Math.max(1, items.length) }));
  pieces.push({ kind: "hero", x: entrance[0], y: entrance[1], at: 0.92 - EASE / 2 });
  return { pieces, palette: pick(PALETTES), entrance, stairs };
}

// ── Drawing ──────────────────────────────────────────────────────────────
const OUTLINE = "#0b0907";
const COLORS: Record<string, [string, string, string]> = {
  // Main, highlight, shadow.
  yellow: ["#e8be35", "#fff0a0", "#9c7414"],
  blue: ["#4c86e0", "#a9cdff", "#25488c"],
  red: ["#d8433f", "#ffa392", "#87201f"],
  green: ["#58b04a", "#b6ee8a", "#2b6a2a"],
  violet: ["#9b62d4", "#dcb4ff", "#56307e"],
};
/** Sprites four art pixels square: c main, h highlight, d shadow, o outline,
 * s skin, b brown. Drawn with a black outline round them. */
const SPRITES: Record<string, string[]> = {
  key: ["hc..", "c.cc", "cc.c", "...."],
  monster: [".cc.", "chcc", "ococ", "cccc"],
  potion: [".bb.", ".hc.", "chcc", "cccd"],
  gem: [".hc.", "hccc", "cccd", ".cd."],
  hero: [".bb.", ".ss.", "hcch", ".d.d"],
};

const ease = (p: number) => 1 - (1 - p) ** 3;
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Draws `room` at build time `t` onto `canvas` (`ROOM_W` × `ROOM_H`). */
export function paintRoom(canvas: HTMLCanvasElement, room: Room, t: number) {
  if (canvas.width !== ROOM_W) { canvas.width = ROOM_W; canvas.height = ROOM_H; }
  const c = canvas.getContext("2d")!, pal = room.palette;
  c.clearRect(0, 0, ROOM_W, ROOM_H);
  c.save();
  c.translate(0, DROP);
  const progress = (p: Piece) => Math.max(0, Math.min(1, (t - p.at) / EASE));
  const walls = new Map<number, number>();
  for (const p of room.pieces) if (p.kind === "wall") walls.set(key(p.x, p.y), progress(p));
  const wallAt = (x: number, y: number) => walls.get(key(x, y)) ?? 0;
  const fill = (colour: string, x: number, y: number, w = 1, h = 1) => { c.fillStyle = colour; c.fillRect(x, y, w, h); };

  // The floor, growing in from each tile's middle, shadowed under the walls.
  for (const p of room.pieces) {
    if (p.kind !== "floor") continue;
    const e = ease(progress(p));
    if (e <= 0) continue;
    const inset = Math.round((1 - e) * TILE / 2), x = p.x * TILE, y = p.y * TILE;
    c.globalAlpha = e;
    fill(pal.floor, x + inset, y + inset, TILE - 2 * inset, TILE - 2 * inset);
    if (inset === 0) {
      fill(pal.seam, x + TILE - 1, y, 1, TILE);
      fill(pal.seam, x, y + TILE - 1, TILE, 1);
      if (((p.x * 7 + p.y * 13) % 5) === 0) fill(shade(pal.floor, 0.12), x + 2, y + 2);
      const above = wallAt(p.x, p.y - 1);
      if (above > 0) { c.globalAlpha = e * ease(above) * 0.7; fill(OUTLINE, x, y, TILE, 2); }
    }
  }
  c.globalAlpha = 1;

  // Walls fall into place, stairs with them; doors drop in after.
  const blocks = room.pieces.filter(p => p.kind === "wall" || p.kind === "stairs" || p.kind === "door").sort((a, b) => a.y - b.y);
  for (const p of blocks) {
    const e = ease(progress(p));
    if (e <= 0) continue;
    const x = p.x * TILE, y = p.y * TILE - Math.round((1 - e) * DROP);
    c.globalAlpha = Math.min(1, e * 1.5);
    if (p.kind === "wall") {
      fill(pal.wall, x, y, TILE, TILE);
      if (wallAt(p.x, p.y - 1) < 1) fill(shade(pal.wall, 0.3), x, y, TILE, 1);
      if (wallAt(p.x, p.y + 1) < 1) fill(shade(pal.wall, -0.45), x, y + TILE - 2, TILE, 2);
      if (wallAt(p.x - 1, p.y) < 1) fill(shade(pal.wall, 0.12), x, y + 1, 1, TILE - 3);
      if (wallAt(p.x + 1, p.y) < 1) fill(shade(pal.wall, -0.25), x + TILE - 1, y + 1, 1, TILE - 3);
    } else if (p.kind === "stairs") {
      fill(OUTLINE, x, y, TILE, TILE);
      fill(shade(pal.accent, 0.25), x, y, TILE, 2);
      fill(pal.accent, x + 1, y + 2, TILE - 1, 2);
      fill(shade(pal.accent, -0.35), x + 2, y + 4, TILE - 2, 2);
    } else {
      const [main, light, dark] = COLORS[p.color!];
      fill(OUTLINE, x, y, TILE, TILE);
      fill(main, x + 1, y + 1, TILE - 2, TILE - 2);
      fill(light, x + 1, y + 1, TILE - 3, 1);
      fill(dark, x + TILE - 2, y + 1, 1, TILE - 2);
      fill(OUTLINE, x + 3, y + 3);
    }
  }

  // What lies about the room hops into place.
  for (const p of room.pieces) {
    const art = SPRITES[p.kind];
    if (!art) continue;
    const e = ease(progress(p));
    if (e <= 0) continue;
    const [main, light, dark] = COLORS[p.color ?? (p.kind === "hero" ? "blue" : "red")];
    const hop = Math.round(Math.sin(Math.min(1, e) * Math.PI) * 3 + (1 - e) * 2);
    const x = p.x * TILE + 1, y = p.y * TILE + 1 - hop;
    c.globalAlpha = Math.min(1, e * 1.5);
    const tone: Record<string, string> = { c: main, h: light, d: dark, o: OUTLINE, s: "#f0c49a", b: "#7a4a26" };
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
      art.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch !== ".") fill(OUTLINE, x + rx + ox, y + ry + oy); }));
    art.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch !== ".") fill(tone[ch], x + rx, y + ry); }));
  }
  c.globalAlpha = 1;
  c.restore();
}
