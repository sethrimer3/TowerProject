import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CHUNK, START_X, UNGUARDED_LOOT_CHANCE, WIDTH, type KeyColor } from "../src/config.ts";
import { point, type Tile } from "../src/entities.ts";
import {
  RoomWorld,
  World,
  chooseTorchSpots,
  generate,
  generateDelveMap,
  random,
  reachable,
  rollUnguardedLoot,
  torchesForSeed,
  validate,
} from "../src/generation.ts";
import { region } from "../src/delve/labyrinth.ts";

// Characterization hashes of the world boards in generation.ts: the legacy
// chunk validator on seeded synthetic chunks and real ones, flood fills,
// torch spots and torches, the Delve World's and Tower RoomWorld's tiles,
// steps, crossings, upkeep and torch breaking, and the unguarded loot roll.
// Regenerate (only when a change to them is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/world-boards.golden.json", import.meta.url);

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

const COLORS: KeyColor[] = ["yellow", "blue", "red"];
const DOORS: Tile[] = [
  { kind: "door", color: "yellow" },
  { kind: "door", color: "yellow" },
  { kind: "door", color: "blue" },
  { kind: "door", color: "red" },
  { kind: "door", door: { type: "keys", keys: ["yellow", "blue"], mode: "all" } },
  { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } },
  { kind: "door", door: { type: "fullHp" } },
];

/** A seeded chunk shaped like the old generator's: a spine up START_X with
 * side branches (some wrapping round the edge) behind doors, keys scattered
 * about, and now and then a flaw the validator should notice. */
function syntheticChunk(seed: number) {
  const rnd = random(seed);
  const base = Math.floor(rnd() * 4) * CHUNK;
  const cells = new Map<string, Tile>();
  const floors: string[] = [];
  const put = (x: number, y: number, t: Tile) => {
    const k = point((x + WIDTH) % WIDTH, y);
    cells.set(k, t);
    if (t.kind === "floor") floors.push(k);
  };
  for (let y = base; y < base + CHUNK; y++) put(START_X, y, { kind: "floor" });
  const branches = Math.floor(rnd() * 5);
  for (let b = 0; b < branches; b++) {
    const y = base + 1 + Math.floor(rnd() * (CHUNK - 2)), dir = rnd() < 0.5 ? -1 : 1, len = 2 + Math.floor(rnd() * 16);
    for (let i = 1; i <= len; i++) {
      const gated = (i === 1 && rnd() < 0.7) || (i === 4 && rnd() < 0.3) || (i === 15 && rnd() < 0.4) || rnd() < 0.06;
      put(START_X + dir * i, y, gated ? { ...DOORS[Math.floor(rnd() * DOORS.length)] } : { kind: "floor" });
    }
  }
  if (rnd() < 0.25) put(START_X, base + 2 + Math.floor(rnd() * (CHUNK - 4)), { ...DOORS[Math.floor(rnd() * DOORS.length)] });
  const keys = Math.floor(rnd() * 7);
  for (let i = 0; i < keys && floors.length; i++)
    cells.set(floors[Math.floor(rnd() * floors.length)], { kind: "key", color: COLORS[Math.floor(rnd() * 3)] });
  if (rnd() < 0.3) cells.set(floors[Math.floor(rnd() * floors.length)], { kind: "enemy" });
  const flaw = rnd();
  if (flaw < 0.12) for (let y = base + 3; y <= base + 6; y++) put(START_X - 1, y, { kind: "floor" });
  else if (flaw < 0.2) put(2, base + 10, { kind: "floor" });
  else if (flaw < 0.26) cells.delete(point(START_X, base + CHUNK - 1));
  return { cells, base };
}

function validation(group: number) {
  const out: unknown[] = [];
  for (let i = 0; i < 80; i++) {
    const { cells, base } = syntheticChunk(group * 1000 + i);
    const blocked = new Set([...cells].filter(([, t]) => t.kind === "door").map(([k]) => k));
    out.push(validate(cells, base), reachable(cells, point(START_X, base)).size, [...reachable(cells, point(START_X, base), blocked)]);
    // The same chunk listed back to front, so inner doors come before outer ones.
    out.push(validate(new Map([...cells].reverse()), base));
  }
  for (let index = 0; index < 4; index++) {
    const cells = generate(group, index);
    out.push(validate(cells, index * CHUNK), reachable(cells, point(START_X, index * CHUNK)).size);
  }
  return digest(out);
}

const FIXTURES: Tile["kind"][] = ["door", "stairs", "stairsDown", "oneway", "key", "enemy", "potion"];

/** A small walled board of rooms with fixtures (doors, stairs, gates, items)
 * scattered through it. */
function roomBoard(seed: number) {
  const rnd = random(seed);
  const cells = new Map<string, Tile>();
  const W = 8 + Math.floor(rnd() * 10), H = 6 + Math.floor(rnd() * 8);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const r = rnd();
      const kind: Tile["kind"] = edge || r < 0.18 ? "wall" : r < 0.3 ? FIXTURES[Math.floor(rnd() * FIXTURES.length)] : "floor";
      cells.set(point(x, y), { kind });
    }
  return { cells, W, H };
}

function torchSpots(seed: number) {
  const delve = generateDelveMap(seed, 2);
  const tower = new RoomWorld(seed, seed % 7, {}).cells;
  const boards = Array.from({ length: 30 }, (_, i) => {
    const { cells, W, H } = roomBoard(seed * 100 + i);
    return chooseTorchSpots(cells, { xMin: 1, xMax: W - 2, yMin: 1, yMax: H - 2, seed: seed + i });
  });
  return digest([
    boards,
    chooseTorchSpots(delve, { xMin: 1, xMax: WIDTH - 2, yMin: 0, yMax: 200, seed }),
    chooseTorchSpots(delve, { xMin: 3, xMax: 20, yMin: 10, yMax: 60, seed: seed ^ 5 }),
    chooseTorchSpots(tower, { xMin: 1, xMax: 15, yMin: 1, yMax: 15, seed }),
    torchesForSeed(seed),
  ]);
}

/** A Delve World walked through its first areas: tiles and steps over a
 * window (walls, wrap, one-way gates), crossings, upkeep and torches. */
function delveWorld(seed: number) {
  const changes: Record<string, Tile> = {};
  const w = new World(seed, changes);
  const out: unknown[] = [];
  const rnd = random(seed * 31);
  for (let m = 0; m < 3; m++) {
    const r = region(seed, w.milestone);
    const tiles: string[] = [], steps: unknown[] = [];
    for (let y = r.minY - 3; y <= r.maxY + 3; y++)
      for (let x = -1; x <= WIDTH; x++) {
        tiles.push(w.tile(x, y).kind);
        if (x >= 0 && x < WIDTH && (x + y) % 3 === 0)
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) steps.push(w.step(x, y, dx, dy));
      }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * WIDTH), y = r.minY + Math.floor(rnd() * (r.maxY - r.minY + 1));
      if (rnd() < 0.5) w.clear(x, y);
      else changes[point(x, y)] = { kind: "oneway" };
    }
    // Rows open on one edge only, and diagonal steps onto one-way gates.
    const edgeY = r.minY + 1 + m;
    changes[point(0, edgeY)] = { kind: "floor" };
    changes[point(WIDTH - 1, edgeY)] = { kind: "wall" };
    changes[point(WIDTH - 1, edgeY + 1)] = { kind: "floor" };
    changes[point(0, edgeY + 1)] = { kind: "wall" };
    for (const y of [edgeY, edgeY + 1]) steps.push(w.step(0, y, -1, 0), w.step(WIDTH - 1, y, 1, 0));
    changes[point(START_X, r.minY + 4)] = { kind: "oneway" };
    for (const [dx, dy] of [[1, 1], [-1, 1], [0, 1], [1, -1]]) steps.push(w.step(START_X - dx, r.minY + 4 - dy, dx, dy));
    const torches = w.torches;
    const broken = torches.slice(0, 3).map((t) => [w.breakTorchAt(t.x, t.y), w.breakTorchAt(t.x, t.y)]);
    out.push(digest(tiles), digest(steps), w.cross(r.gate.x + 1, r.gate.y), w.cross(r.gate.x, r.gate.y + 1), w.depth(START_X, r.minY + 2));
    out.push(w.cross(r.gate.x, r.gate.y), w.milestone, digest(torches), broken, w.breakTorchAt(-5, -5));
    // Chunks far from the player are dropped.
    const at = Math.floor((r.gate.y + 1) / CHUNK);
    for (const d of [3, 4, 5]) w.tile(START_X, (at + d) * CHUNK);
    w.maintain(r.gate.y + 1);
    out.push(w.floor, [...w.chunks.keys()].sort((a, b) => a - b), digest(changes));
  }
  return digest(out);
}

/** Tower rooms: every tile and step, with changes and reward chests. */
function towerRooms(seed: number) {
  const out: unknown[] = [];
  for (const room of [0, 3, 10, 27]) {
    const changes: Record<string, Tile> = { "4,4": { kind: "potion" }, "9,2": { kind: "floor" } };
    const w = new RoomWorld(seed, room, changes);
    w.rewards = [{ x: 5, y: 5, tier: "bronze" }, { x: 4, y: 4, tier: "gold" }] as RoomWorld["rewards"];
    w.clear(8, 1);
    const tiles: unknown[] = [], steps: unknown[] = [];
    for (let y = -1; y <= 17; y++)
      for (let x = -1; x <= 17; x++) {
        tiles.push(w.tile(x, y));
        for (const [dx, dy] of [[1, 0], [0, -1]]) steps.push(w.step(x, y, dx, dy));
      }
    const t = w.torches[0];
    out.push(digest(tiles), digest(steps), digest(w.torches), t ? [w.breakTorchAt(t.x, t.y), w.breakTorchAt(t.x, t.y)] : null, w.breakTorchAt(0, 0));
  }
  return digest(out);
}

function loot() {
  const out: unknown[] = [];
  for (const at of [UNGUARDED_LOOT_CHANCE, UNGUARDED_LOOT_CHANCE * 0.999]) out.push(rollUnguardedLoot(() => at));
  for (let i = 0; i < 400; i++) {
    const values = [(i % 20) / 20000 * (i % 3 ? 1 : 100), (i * 37 % 100) / 100];
    out.push(rollUnguardedLoot(() => values.shift() ?? 0));
  }
  return digest(out);
}

test("world boards, torches and the chunk validator match the golden", () => {
  const actual: Record<string, unknown> = {};
  for (let g = 1; g <= 8; g++) actual[`validate ${g}`] = validation(g);
  for (const seed of [1, 7, 42]) actual[`torch spots ${seed}`] = torchSpots(seed);
  for (const seed of [1, 7, 42, 99, 500, 1234]) actual[`delve ${seed}`] = delveWorld(seed);
  for (const seed of [1, 7, 42]) actual[`tower ${seed}`] = towerRooms(seed);
  actual.loot = loot();

  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + "\n");
  assert.ok(existsSync(GOLDEN), "golden missing; run with UPDATE_GOLDEN=1");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  for (const key of Object.keys(golden)) assert.deepEqual(actual[key], golden[key], `${key} diverges`);
  assert.deepEqual(Object.keys(actual), Object.keys(golden));
});
