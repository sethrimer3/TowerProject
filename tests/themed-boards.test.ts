// Hashes the same on every OS should a board ever draw with Math.pow.
import "./portable-math.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Enemy, EnemyStrength, Tile, Torch } from "../src/entities.ts";
import type { FrameContext } from "../src/render-frame.ts";

// Characterization hashes of every Game theme's board: each board's every
// canvas call and property write while it paints each kind of tile contents
// (every enemy strength, Ranged, Fast and Shielded, keys and doors of each
// colour and rule, potions, shards, chests, stairs, one-way gates), the
// Heart Door's heart, lit and spent torches, the hero facing each way, and
// the ground and what goes over it, with motion on and reduced. The canvases
// the boards bake their sprites on record too. Regenerate (only when a
// change to a board's art is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/themed-boards.golden.json", import.meta.url);

let hash: Hash = createHash("sha256");
let canvasIds = 0;
const note = (line: string) => void hash.update(line + "\n");
const show = (a: unknown): string =>
  a instanceof Object && "data" in a ? "img" : Array.isArray(a) ? `[${a.map(show).join(",")}]` : String(a);

/** A 2D context that logs every call and property write to `hash`. */
function recorder(name: string, extra: Record<string, unknown> = {}): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { ...extra };
  return new Proxy(state, {
    get: (_, key: string) => {
      if (key in state) return state[key];
      if (key === "toString") return () => name;
      if (key === "measureText") return (text: string) => (note(`${name}.measureText(${text})`), { width: text.length * 10 });
      if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (key === "createImageData" || key === "getImageData")
        return (...a: number[]) => {
          const [w, h] = key === "createImageData" ? a : a.slice(2);
          return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        };
      if (key === "createLinearGradient" || key === "createRadialGradient" || key === "createPattern")
        return (...a: unknown[]) => {
          const label = `${name}.${key}(${a.map(show).join(",")})`;
          note(label);
          return { addColorStop: (at: number, colour: string) => note(`${label}.stop(${at},${colour})`), setTransform: () => note(`${label}.setTransform`), toString: () => label };
        };
      return (...args: unknown[]) => note(`${name}.${key}(${args.map(show).join(",")})`);
    },
    set: (_, key: string, value) => {
      state[key] = value;
      note(`${name}.${key}=${show(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class FakeCanvas {
  readonly name = `cv${canvasIds++}`;
  private w = 300;
  private h = 150;
  private ctx: CanvasRenderingContext2D | null = null;
  get width() { return this.w; }
  set width(v: number) { this.w = v; note(`${this.name}.width=${v}`); }
  get height() { return this.h; }
  set height(v: number) { this.h = v; note(`${this.name}.height=${v}`); }
  toString() { return this.name; }
  getContext() { return (this.ctx ??= recorder(`${this.name}ctx`, { canvas: this })); }
}
(globalThis as { document?: unknown }).document = {
  createElement: () => new FakeCanvas(),
  fonts: { load: () => Promise.resolve([]), check: () => true },
};
// The boards read the DOM as their modules load, so they load after it.
const { THEMED_BOARDS } = await import("../src/themed-boards.ts");

const STRENGTHS: EnemyStrength[] = ["weak", "normal", "strong", "elite", "boss", "greaterBoss"];
const enemy = (strength: EnemyStrength, more: Partial<Enemy> = {}): Tile => ({
  kind: "enemy", enemy: { name: "goblin", hp: 10, attack: 3, defense: 1, tier: 2, strength, ...more },
});
/** Every kind of tile contents a board paints, in the variants it tells apart. */
const CONTENTS: Tile[] = [
  ...STRENGTHS.flatMap((s) => [enemy(s), enemy(s, { ranged: true }), enemy(s, { fast: true }), enemy(s, { ranged: true, fast: true })]),
  enemy("normal", { shielded: true }), enemy("strong", { name: "Wraith", tier: 0 }), { ...enemy("normal"), wound: 4 }, { kind: "enemy" },
  { kind: "key" }, { kind: "key", color: "yellow" }, { kind: "key", color: "blue" }, { kind: "key", color: "red" },
  { kind: "door" }, { kind: "door", color: "yellow" }, { kind: "door", color: "blue" }, { kind: "door", color: "red" },
  { kind: "door", door: { type: "keys", keys: ["blue"], mode: "all" } },
  { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "all" } },
  { kind: "door", door: { type: "keys", keys: ["yellow", "red"], mode: "any" } },
  { kind: "door", door: { type: "keys", keys: ["red"], mode: "all", heart: true } },
  { kind: "door", door: { type: "fullHp" } }, { kind: "door", door: { type: "wood", durability: 12 } },
  { kind: "potion" }, { kind: "potion", color: "red" }, { kind: "potion", color: "blue" }, { kind: "potion", amount: 35 },
  { kind: "attack" }, { kind: "attack", amount: 2 }, { kind: "defense" }, { kind: "defense", amount: 2 },
  { kind: "reward" }, { kind: "reward", tier: "silver" }, { kind: "reward", tier: "gold" },
  { kind: "openedChest" }, { kind: "openedChest", tier: "gold" },
  { kind: "treasure" }, { kind: "stairs" }, { kind: "oneway" }, { kind: "floor" }, { kind: "wall" },
];

/** A 7x7 board: rock round the edge, open ground inside with a wall jutting
 * in, and contents on some tiles. */
const SIZE = 7;
const cells = new Map<string, Tile>();
for (let x = -1; x <= SIZE; x++)
  for (let y = -1; y <= SIZE; y++) {
    const edge = x <= 0 || y <= 0 || x >= SIZE - 1 || y >= SIZE - 1;
    cells.set(`${x},${y}`, { kind: edge || (x === 3 && y === 2) ? "wall" : "floor" });
  }
cells.set("2,4", enemy("elite"));
cells.set("4,4", { kind: "key", color: "blue" });
cells.set("4,1", { kind: "stairs" });
const world = { tile: (x: number, y: number) => cells.get(`${x},${y}`) ?? { kind: "wall" } };
const walls = [...cells].filter(([, t]) => t.kind === "wall").map(([k]) => k.split(",").map(Number) as [number, number]);
const TORCHES: Torch[] = [
  { x: 1, y: 3, lightRadius: 4, baseIntensity: 1, active: true },
  { x: 5, y: 5, lightRadius: 4, baseIntensity: 1, active: false },
];

function frame(c: CanvasRenderingContext2D, reduceMotion: boolean, now: number): FrameContext {
  const look = { mode: "tower", height: 12, seed: 7, outside: false, entranceX: 3, spritesOff: false, reduceMotion, area1: false, themed: null };
  return {
    left: 0, bottom: 0, n: SIZE, s: 24, c, now, dt: 0.016, dpr: 1, width: SIZE * 24, playerX: 2, playerY: 2,
    heroFacing: { dx: 1, dy: 0 }, world, look, darkness: 0, torches: TORCHES, walls, glows: [],
  } as unknown as FrameContext;
}

/** The hash of everything `look`'s board draws. */
function drawn(look: keyof typeof THEMED_BOARDS): string {
  hash = createHash("sha256");
  canvasIds = 0;
  const board = THEMED_BOARDS[look], c = recorder("board");
  CONTENTS.forEach((t, i) => {
    note(`-- contents ${i} ${JSON.stringify(t)}`);
    board.contents(c, t);
  });
  note("-- heart");
  board.heart(c);
  for (const facing of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
    note(`-- hero ${facing.dx},${facing.dy}`);
    board.hero(c, facing);
  }
  for (const [reduce, now] of [[false, 1234], [false, 5678], [true, 1234]] as const) {
    const f = frame(c, reduce, now);
    note(`-- ground ${reduce} ${now}`);
    board.ground(f);
    for (const t of TORCHES) {
      note(`-- torch ${t.x},${t.y}`);
      board.torch(c, f, t);
    }
    note(`-- over ${reduce} ${now}`);
    board.over?.(f);
  }
  return hash.digest("hex").slice(0, 24);
}

test("every Game theme's board draws as the golden records", () => {
  const got = Object.fromEntries((Object.keys(THEMED_BOARDS) as (keyof typeof THEMED_BOARDS)[]).map((look) => [look, drawn(look)]));
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + "\n");
  assert.deepEqual(got, JSON.parse(readFileSync(GOLDEN, "utf8")));
});
