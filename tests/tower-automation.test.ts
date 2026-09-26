import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Game } from "../src/state.ts";
import { RoomWorld } from "../src/generation.ts";
import { defaults } from "../src/save.ts";
import { chooseStep } from "../src/automation.ts";
import { isDeadlocked } from "../src/analysis.ts";
import type { Mode } from "../src/entities.ts";

// Characterization trace for Tower automation: the step `chooseStep` picks
// and whether `isDeadlocked` calls the run stuck, recorded on every step of
// seeded runs (some starting in the forest) whose player swings between strong
// and fragile, holds keys or none, is sometimes stranded on a bare floor or
// walked back down a floor, and whose floors are sometimes stripped of
// pickups. The deadlock search's trips through stairs into other visited
// floors are pinned by tests/tower-overhaul.test.ts. Regenerate (only when an
// automation change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/tower-automation.golden.json", import.meta.url);
const STEPS = 500;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]] as const;
const PICKUPS = ["potion", "attack", "defense", "key", "treasure"];

/** Clears the floor's pickups, and its enemies or doors when asked. */
function strip(g: Game, kinds: string[]) {
  if (!(g.world instanceof RoomWorld) || g.run.outside) return;
  for (const k of g.world.cells.keys()) {
    const [x, y] = k.split(",").map(Number);
    if (kinds.includes(g.world.tile(x, y).kind)) g.world.clear(x, y);
  }
}

/** Sets the player strong, fragile, or somewhere between, with or without keys. */
function reroll(g: Game, rng: () => number) {
  const p = g.run.player, roll = rng();
  if (roll < 0.1) Object.assign(p, { hp: 1, maxHp: 10, attack: 1, defense: 0 });
  else if (roll < 0.7) Object.assign(p, { hp: 5000, maxHp: 5000, attack: 400, defense: 400 });
  else Object.assign(p, { hp: 20 + Math.floor(rng() * 200), attack: 5 + Math.floor(rng() * 30), defense: Math.floor(rng() * 20) });
  if (p.hp > p.maxHp) p.maxHp = p.hp;
  const keys = rng() < 0.5 ? 0 : 1 + Math.floor(rng() * 3);
  p.keys = { yellow: keys, blue: rng() < 0.5 ? 0 : keys, red: rng() < 0.7 ? 0 : 1 };
}

/** Walks the route to the floor's stairs down, so the floor below has been
 * visited and a later deadlock check can search it. */
function descend(g: Game) {
  if (!(g.world instanceof RoomWorld) || g.run.outside) return;
  for (const k of g.world.cells.keys()) {
    const [x, y] = k.split(",").map(Number);
    if (g.world.tile(x, y).kind !== "stairsDown") continue;
    for (const step of g.previewRoute(x, y) ?? []) if (!g.move(step.dx, step.dy)) return;
    return;
  }
}

/** Leaves the player too weak to fight, with no keys, on a floor with no
 * pickups: whether the run is stuck then depends on the other floors. */
function strand(g: Game) {
  if (g.run.height < 1) return;
  strip(g, PICKUPS);
  Object.assign(g.run.player, { hp: 1, maxHp: 10, attack: 1, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } });
}

function trace(mode: Mode, seed: number, outside: boolean): string[] {
  const rng = mulberry32(seed);
  const realRandom = Math.random;
  const realValues = crypto.getRandomValues;
  const realNow = performance.now;
  Math.random = rng;
  (crypto as any).getRandomValues = (arr: Uint32Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(rng() * 2 ** 32);
    return arr;
  };
  performance.now = () => 1000;
  try {
    const save = defaults();
    save.upgrades.delve = 1;
    const g = new Game(save);
    g.switchMode(mode);
    g.newRun(outside);
    const out: string[] = [];
    for (let i = 0; i < STEPS; i++) {
      if (g.summary) {
        g.summary = null;
        g.newRun(rng() < 0.5);
      }
      const roll = rng();
      if (roll < 0.08) reroll(g, rng);
      else if (roll < 0.11) strip(g, PICKUPS);
      else if (roll < 0.13) strip(g, [...PICKUPS, "enemy", "door"]);
      else if (roll < 0.15) delete g.run.rewards;
      else if (roll < 0.18) strand(g);
      else if (roll < 0.19) descend(g);
      const step = chooseStep(g);
      const dead = mode === "tower" && !g.run.outside ? isDeadlocked(g.run) : null;
      const record = JSON.stringify({ step, dead, at: g.run.player, h: g.run.height, outside: !!g.run.outside });
      out.push(createHash("sha256").update(record).digest("hex").slice(0, 12));
      if (step && rng() < 0.75) g.move(step.dx, step.dy);
      else {
        const [dx, dy] = DIRS[Math.floor(rng() * 4)];
        g.move(dx, dy);
      }
    }
    return out;
  } finally {
    Math.random = realRandom;
    (crypto as any).getRandomValues = realValues;
    performance.now = realNow;
  }
}

const SCENARIOS: [Mode, number, boolean][] = [
  ["tower", 31, false], ["tower", 32, false], ["tower", 33, true], ["tower", 34, false],
  ["tower", 35, true], ["tower", 36, false], ["delve", 37, true], ["delve", 38, true],
];

test("Tower automation's steps and deadlock calls match the recorded trace", () => {
  const actual = Object.fromEntries(SCENARIOS.map(([m, s, o]) => [`${m}:${s}${o ? ":outside" : ""}`, trace(m, s, o)]));
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual) + "\n");
    return;
  }
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  for (const [name, steps] of Object.entries(actual)) {
    const first = steps.findIndex((h, i) => h !== expected[name]?.[i]);
    assert.equal(first, -1, `${name} diverges at step ${first}`);
  }
});
