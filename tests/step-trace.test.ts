import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { chooseStep } from "../src/automation.ts";
import { decisions } from "../src/delve/automove.ts";
import type { DoorRule, Mode, Tile } from "../src/entities.ts";

// Characterization trace for stepping rules: seeded runs mix Automove steps,
// random (sometimes non-forced) moves and route previews, and every step's
// observable state is hashed against a golden file. Regenerate (only when a
// gameplay change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/step-trace.golden.json", import.meta.url);
const STEPS = 400;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]] as const;
const COLORS = ["yellow", "blue", "red"] as const;
/** Rare interactions (treasure, multi-key and heart doors, odd potions) seldom
 * come up in generated boards, so the trace plants them beside the player. */
function plantable(rng: () => number): Tile {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const kind = pick(["treasure", "potion", "potion", "key", "attack", "defense", "enemy", "door", "door", "door"] as const);
  if (kind === "potion") return { kind, amount: pick([undefined, 10, 60, 500]) };
  if (kind === "key") return { kind, color: pick(COLORS) };
  if (kind === "enemy")
    return { kind, enemy: { name: "Planted", hp: 5 + Math.floor(rng() * 60), attack: Math.floor(rng() * 40), defense: Math.floor(rng() * 14), tier: 0 } };
  if (kind === "door")
    return { kind, door: pick<DoorRule>([
      { type: "keys", keys: [pick(COLORS)], mode: "all" },
      { type: "keys", keys: ["yellow", "blue"], mode: "all" },
      { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" },
      { type: "fullHp" },
    ]) };
  return { kind };
}
function plant(g: Game, rng: () => number) {
  const [dx, dy] = DIRS[Math.floor(rng() * 4)];
  const dest = g.world.step(g.run.player.x, g.run.player.y, dx, dy);
  if (!dest || g.world.tile(dest.x, dest.y).kind !== "floor") return;
  g.run.changes[`${dest.x},${dest.y}`] = plantable(rng);
}

function observe(g: Game, action: unknown, result: unknown, preview: unknown) {
  const r = g.run;
  const materials = Object.values(g.save.materials).reduce((a, b) => a + b, 0);
  return canonical({
    action, result, preview, message: g.message, decisions: decisions.get(g), summary: g.summary?.reason ?? null,
    player: r.player, kills: r.kills, treasures: r.treasures, height: r.height, floor: r.floor,
    outside: !!r.outside, damaged: r.damaged, keysSpent: r.keysSpent, rewards: r.rewards,
    gold: g.save.gold, xp: g.save.xp, materials, looted: Object.keys(g.save[g.mode].lootedTiles).length,
    history: g.save[g.mode].history.length, changes: Object.keys(r.changes).length,
  });
}

function trace(mode: Mode, seed: number, smartAi: boolean): string[] {
  const rng = mulberry32(seed);
  const realRandom = Math.random;
  const realValues = crypto.getRandomValues;
  Math.random = rng;
  (crypto as any).getRandomValues = (arr: Uint32Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(rng() * 2 ** 32);
    return arr;
  };
  try {
    const save = defaults();
    save.upgrades.delve = 1;
    if (smartAi) Object.assign(save.upgrades, { aiMemory: 2, aiEvaluation: 4, aiLookahead: 2 });
    const g = new Game(save);
    g.switchMode(mode);
    g.newRun();
    const out: string[] = [];
    for (let i = 0; i < STEPS; i++) {
      if (g.summary) {
        g.summary = null;
        g.newRun();
      }
      if (!g.run.outside && rng() < 0.15) plant(g, rng);
      const p = g.run.player;
      // Real routes come from pathfinding and never cross walls.
      const route = Array.from({ length: 2 + Math.floor(rng() * 6) }, () => ({
        x: p.x + Math.floor(rng() * 7) - 3, y: p.y + Math.floor(rng() * 7) - 3,
      })).filter((s) => g.world.tile(s.x, s.y).kind !== "wall");
      const preview = g.previewRouteEffects(route);
      let action: unknown, result: unknown;
      const roll = rng();
      if (roll < 0.6) {
        const step = chooseStep(g);
        action = step;
        result = step ? g.move(step.dx, step.dy) : null;
      } else {
        const [dx, dy] = DIRS[Math.floor(rng() * 4)];
        const force = roll > 0.8;
        action = { dx, dy, force };
        result = g.move(dx, dy, force);
      }
      out.push(createHash("sha256").update(observe(g, action, result, preview)).digest("hex").slice(0, 12));
    }
    return out;
  } finally {
    Math.random = realRandom;
    (crypto as any).getRandomValues = realValues;
  }
}

const SCENARIOS: [Mode, number, boolean][] = [
  ["tower", 1, false], ["tower", 2, true], ["tower", 3, false], ["tower", 4, true],
  ["delve", 5, false], ["delve", 6, true], ["delve", 7, false], ["delve", 8, true],
];

test("stepping, previews and Automove match the recorded trace", () => {
  const actual = Object.fromEntries(SCENARIOS.map(([m, s, ai]) => [`${m}:${s}:${ai ? "smart" : "basic"}`, trace(m, s, ai)]));
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

test("the trace exercises every interaction", () => {
  // Guards the corpus itself: if generation changes starve it of fights,
  // doors or pickups, the trace above would stop protecting those rules.
  const seen = new Set<string>();
  const realMove = Game.prototype.move;
  Game.prototype.move = function (this: Game, dx: number, dy: number, ...rest: any[]) {
    const dest = this.world.step(this.run.player.x, this.run.player.y, dx, dy);
    if (dest) seen.add(this.world.tile(dest.x, dest.y).kind);
    return realMove.call(this, dx, dy, ...rest);
  } as typeof realMove;
  try {
    for (const [m, s, ai] of SCENARIOS) trace(m, s, ai);
  } finally {
    Game.prototype.move = realMove;
  }
  for (const kind of ["enemy", "door", "key", "potion", "attack", "defense", "treasure", "stairs"])
    assert.ok(seen.has(kind), `trace never steps onto ${kind}`);
});
