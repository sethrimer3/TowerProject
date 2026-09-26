import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Game } from "../src/state.ts";
import { RoomWorld } from "../src/generation.ts";
import { defaults } from "../src/save.ts";
import { chooseStep } from "../src/automation.ts";
import type { Mode, Tile } from "../src/entities.ts";

// Characterization trace for the run bookkeeping around a step: undo, Revive,
// reloading a mode, room clears and their reward chests. Seeded Tower and
// Delve runs mix Automove and random moves with undos, reloads and cleared
// rooms, and every action's observable state is hashed against a golden file.
// Regenerate (only when a gameplay change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/undo-clear-trace.golden.json", import.meta.url);
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

/** Removes every enemy on the Tower floor, and its doors unless `keepDoors`,
 * so the next step clears it. */
function emptyRoom(g: Game, keepDoors: boolean) {
  if (!(g.world instanceof RoomWorld) || g.run.outside) return;
  const kinds = keepDoors ? ["enemy"] : ["enemy", "door"];
  for (const k of g.world.cells.keys()) {
    const [x, y] = k.split(",").map(Number);
    if (kinds.includes(g.world.tile(x, y).kind)) g.world.clear(x, y);
  }
}

/** Plants an enemy strong enough to kill beside the player and walks into it. */
function ambush(g: Game, [dx, dy]: readonly number[]) {
  const dest = g.world.step(g.run.player.x, g.run.player.y, dx, dy);
  if (!dest || g.run.outside || g.world.tile(dest.x, dest.y).kind !== "floor") return null;
  g.run.changes[`${dest.x},${dest.y}`] = { kind: "enemy", enemy: { name: "Ambusher", hp: 400, attack: 900, defense: 0, tier: 0 } };
  return g.move(dx, dy);
}

/** Plants a key, a door the player can open, or an enemy that hurts without
 * killing beside the player and walks onto it, so undo has damage and spent
 * keys to carry over. */
function tussle(g: Game, rng: () => number, [dx, dy]: readonly number[]) {
  const p = g.run.player, dest = g.world.step(p.x, p.y, dx, dy);
  if (!dest || g.run.outside || g.world.tile(dest.x, dest.y).kind !== "floor") return null;
  const held = COLORS.filter((c) => p.keys[c] > 0), roll = rng();
  const tile: Tile = roll < 0.4 ? { kind: "key", color: COLORS[Math.floor(rng() * 3)] }
    : roll < 0.7 && held.length ? { kind: "door", door: { type: "keys", keys: [held[0]], mode: "all" } }
    : { kind: "enemy", enemy: { name: "Brawler", hp: p.attack * 3, attack: p.defense + 1 + Math.floor(rng() * 4), defense: 0, tier: 0 } };
  g.run.changes[`${dest.x},${dest.y}`] = tile;
  return g.move(dx, dy);
}

/** Walks the route to the first clear chest on the floor, stopping early if a
 * step fails; returns how many steps were taken. */
function toChest(g: Game) {
  const chest = g.run.rewards?.[0];
  const route = chest && g.previewRoute(chest.x, chest.y);
  if (!route) return null;
  let taken = 0;
  for (const step of route) {
    if (!g.move(step.dx, step.dy)) break;
    taken++;
  }
  return taken;
}

function observe(g: Game, action: unknown, result: unknown) {
  const r = g.run, slice = g.save[g.mode];
  return canonical({
    action, result, message: g.message, summary: g.summary?.reason ?? null,
    player: r.player, height: r.height, floor: r.floor, outside: !!r.outside,
    damaged: r.damaged, keysSpent: r.keysSpent, rewards: r.rewards,
    worldRewards: g.world instanceof RoomWorld ? g.world.rewards : null,
    log: g.save.tower.log, shards: g.save.tower.shards, essence: g.save.delve.essence,
    gold: g.save.gold, reached: slice.reached, best: slice.best,
    history: slice.history.length, revival: slice.revival?.earned ?? null,
    changes: r.changes, floors: r.floors ?? null, route: g.route.length, auto: g.auto, paused: g.paused,
    blocked: g.blocked.until, brokenTorches: (g.world.torches ?? []).filter((t) => !t.active).length,
  });
}

function trace(mode: Mode, seed: number): string[] {
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
    save.upgrades.revive = 1;
    const g = new Game(save);
    g.switchMode(mode);
    g.newRun();
    const out: string[] = [];
    for (let i = 0; i < STEPS; i++) {
      let action: unknown, result: unknown;
      const roll = rng();
      if (g.summary) {
        // A fallen run is revived, or the summary is closed and the player
        // walks on from the forest, or a fresh run starts.
        action = "summary";
        if (roll < 0.4) result = g.undo();
        else if (roll < 0.8) g.summary = null;
        else result = (g.summary = null, g.newRun(), "new");
      } else if (roll < 0.15) {
        action = "undo";
        result = g.undo();
      } else if (roll < 0.2) {
        // Some reloads find the run saved under an older layout.
        action = "reload";
        if (roll < 0.165) g.run.layoutVersion = -1;
        g.loadMode();
      } else if (roll < 0.3) {
        action = "empty";
        emptyRoom(g, roll < 0.22);
      } else if (roll < 0.33) {
        // Forgetting the floor's clears lets it be cleared again.
        action = "forget";
        delete g.save.tower.log[g.run.height];
      } else if (roll < 0.36) {
        action = "ambush";
        result = ambush(g, DIRS[Math.floor(rng() * 4)]);
      } else if (roll < 0.38) {
        // Undo from the pause menu lifts the pause.
        action = "paused undo";
        g.paused = true;
        result = g.undo();
        if (!result) g.paused = false;
      } else if (roll < 0.44) {
        action = "tussle";
        result = tussle(g, rng, DIRS[Math.floor(rng() * 4)]);
      } else if (roll < 0.62) {
        action = "chest";
        result = toChest(g);
      } else if (roll < 0.7) {
        const step = chooseStep(g);
        action = step;
        result = step ? g.move(step.dx, step.dy) : null;
      } else {
        const [dx, dy] = DIRS[Math.floor(rng() * 4)];
        action = { dx, dy };
        result = g.move(dx, dy);
      }
      out.push(createHash("sha256").update(observe(g, action, result)).digest("hex").slice(0, 12));
    }
    return out;
  } finally {
    Math.random = realRandom;
    (crypto as any).getRandomValues = realValues;
    performance.now = realNow;
  }
}

const SCENARIOS: [Mode, number][] = [
  ["tower", 11], ["tower", 12], ["tower", 13], ["tower", 16], ["tower", 17], ["tower", 18], ["delve", 14], ["delve", 15],
];

test("undo, revive, reloads and room clears match the recorded trace", () => {
  const actual = Object.fromEntries(SCENARIOS.map(([m, s]) => [`${m}:${s}`, trace(m, s)]));
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
