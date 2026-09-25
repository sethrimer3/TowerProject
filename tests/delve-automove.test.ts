import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { World, LAYOUT_VERSION } from "../src/generation.ts";
import { chooseDelveStep, decisions } from "../src/delve/automove.ts";

// Characterization trace of Delve Automove: seeded runs where Automove takes
// every step, at each combination of AI upgrades that changes its behaviour and
// with strong and fragile characters. Every step's choice, the reported
// decisions and the resulting player are hashed, and a checkpoint is kept every
// CHECKPOINT steps so a failure names where the run first diverged. Regenerate
// (only when a change to Automove is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/delve-automove.golden.json", import.meta.url);
const STEPS = 500;
const CHECKPOINT = 50;

type Level = { aiMemory: number; aiEvaluation: number; aiLookahead: number };
const LEVELS: Record<string, Level> = {
  naive: { aiMemory: 0, aiEvaluation: 0, aiLookahead: 0 },
  recall: { aiMemory: 1, aiEvaluation: 2, aiLookahead: 1 },
  mixed: { aiMemory: 2, aiEvaluation: 1, aiLookahead: 2 },
  wary: { aiMemory: 0, aiEvaluation: 3, aiLookahead: 3 },
  full: { aiMemory: 2, aiEvaluation: 4, aiLookahead: 4 },
};
const CHARACTERS = {
  strong: { hp: 400, attack: 14, defense: 4, keys: 1 },
  fragile: { hp: 90, attack: 9, defense: 1, keys: 0 },
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function trace(seed: number, level: Level, who: typeof CHARACTERS.strong): string[] {
  const rng = mulberry32(seed);
  const realRandom = Math.random;
  const realValues = crypto.getRandomValues;
  Math.random = rng;
  (crypto as any).getRandomValues = (arr: Uint32Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(rng() * 2 ** 32);
    return arr;
  };
  try {
    const g = new Game(defaults());
    Object.assign(g.save.upgrades, { delve: 1, auto: 1 }, level);
    g.switchMode("delve");
    Object.assign(g.run, { seed, outside: false, layoutVersion: LAYOUT_VERSION, changes: {}, height: 0, delveMilestone: 0, floor: 0 });
    Object.assign(g.run.player, { x: 15, y: 0, hp: who.hp, maxHp: who.hp, attack: who.attack, defense: who.defense, keys: { yellow: who.keys, blue: 0, red: 0 } });
    g.world = new World(seed, g.run.changes);
    const run = g.run, h = createHash("sha256"), out: string[] = [];
    for (let i = 1; i <= STEPS; i++) {
      const step = chooseDelveStep(g);
      const moved = step ? g.move(step.dx, step.dy) : null;
      h.update(JSON.stringify({ step, moved, decisions: decisions.get(g), player: run.player, milestone: run.delveMilestone, height: run.height }));
      if (i % CHECKPOINT === 0) out.push(h.copy().digest("hex").slice(0, 12));
      if (!step || !moved || g.run !== run) {
        out.push(`ended at ${i}: ${!step ? "stuck" : !moved ? "blocked" : g.summary?.dead ? "died" : "ended"} ${h.digest("hex").slice(0, 12)}`);
        break;
      }
    }
    return out;
  } finally {
    Math.random = realRandom;
    (crypto as any).getRandomValues = realValues;
  }
}

function record() {
  const out: Record<string, string[]> = {};
  for (const [name, level] of Object.entries(LEVELS))
    for (const [kind, who] of Object.entries(CHARACTERS))
      for (const seed of [1001, 20260925]) out[`${name} ${kind} ${seed}`] = trace(seed, level, who);
  return out;
}

test("Delve Automove makes the recorded choices", () => {
  const actual = record();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  assert.deepStrictEqual(Object.keys(actual), Object.keys(expected));
  for (const [name, checkpoints] of Object.entries(actual)) {
    const first = checkpoints.findIndex((c, i) => c !== expected[name][i]);
    const where = first < 0 ? -1 : (first + 1) * CHECKPOINT;
    assert.deepStrictEqual(checkpoints, expected[name], `${name} diverges by step ${where}`);
  }
});
