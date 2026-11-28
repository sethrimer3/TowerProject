// The Catacomb's and a trial's boards sound and raise what a run's does
// (render/catacomb-board.ts, proving-grounds/trial-fx.ts): which cue each
// event plays, and when.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CatacombBoard } from "../src/render/catacomb-board.ts";
import { TrialFx } from "../src/proving-grounds/trial-fx.ts";
import { startTrial, trialStep } from "../src/proving-grounds/trial.ts";
import { THUNDERBOLT_FALL_MS } from "../src/volley.ts";
import type { Cue } from "../src/sound.ts";
import type { CatacombRun } from "../src/catacombs/state.ts";

/** A board whose cues land in a list, each with its delay. */
function listening() {
  const heard: [Cue, number][] = [];
  return { heard, cue: (cue: Cue, delay = 0) => { heard.push([cue, delay]); } };
}
const run = { hall: 1, slots: [], target: 0, hero: { x: 1, y: 8, mhp: 100 }, potions: [] } as unknown as CatacombRun;
const paid = { mxp: 1, spirit: 1, rarity: "common" as const, mhp: 0 };

test("a Catacomb round strikes and is answered, a kill falls, the stairs and pickups sound as a run's", () => {
  const { heard, cue } = listening(), board = new CatacombBoard({} as HTMLCanvasElement, cue);
  board.turn(run, { kind: "round", slot: 0, heroHit: 10, enemyHit: 5, killed: false, crit: false, strikes: 1 }, 1000, false);
  assert.deepEqual(heard, [["punch", 0], ["punch", 220]]);
  heard.length = 0;
  board.turn(run, { kind: "round", slot: 0, heroHit: 10, enemyHit: 0, killed: true, crit: true, strikes: 1, paid }, 2000, false);
  assert.deepEqual(heard, [["punch", 0], ["bodyFall", 0]], "a beaten undead never answers");
  heard.length = 0;
  board.turn(run, { kind: "pickup", target: { kind: "lore", x: 8, y: 8, amount: 1 } as never }, 3000, false);
  board.turn({ ...run, hero: { ...run.hero, x: 16 } }, { kind: "descend", hall: 2 }, 4000, false);
  assert.deepEqual(heard, [["key", 0], ["stoneSteps", 0]]);
});

test("a tapped crosshair zaps at once and its kill falls as the bolt lands; a potion sounds as a run's", () => {
  const { heard, cue } = listening(), board = new CatacombBoard({} as HTMLCanvasElement, cue);
  board.tapped({ kind: "crosshair", slot: 2, hit: 30, crit: true, gold: true, killed: true, paid }, 1000, run.hero);
  board.tapped({ kind: "potion", x: 3, y: 7, mhp: 10 }, 2000, run.hero);
  assert.deepEqual(heard, [["lightningZap", 0], ["bodyFall", THUNDERBOLT_FALL_MS], ["potion", 0]]);
});

test("a trial's Keymaster mimic struck and beaten sounds as a run's fight, and a new attempt starts quiet", () => {
  const { heard, cue } = listening(), fx = new TrialFx(cue);
  const s = startTrial({ maxHp: 1000, attack: 10, defense: 0 }, "manual", [], 12, 1, "keymaster");
  for (let i = 0; i < 4; i++) trialStep(s, 0, 1);
  fx.observe(s, 0);
  assert.deepEqual(heard, [], "the first look raises nothing");
  // A mimic takes a strike, then falls; the hero loses HP to a bite.
  const mimic = s.keymaster!.mimics[0]!;
  // The hero stands beside it, as a strike needs.
  s.player.x = mimic.x - 1; s.player.y = mimic.y; s.steps++; fx.observe(s, 50);
  mimic.hp -= 3; s.player.hp -= 7; s.steps++;
  fx.observe(s, 100);
  assert.deepEqual(heard, [["punch", 0]]);
  heard.length = 0;
  s.keymaster!.mimics = s.keymaster!.mimics.filter((m) => m !== mimic); s.steps++;
  fx.observe(s, 200);
  assert.deepEqual(heard, [["punch", 0], ["bodyFall", 0]]);
  heard.length = 0;
  fx.observe(startTrial({ maxHp: 1000, attack: 10, defense: 0 }, "manual", [], 12, 1, "keymaster"), 300);
  assert.deepEqual(heard, []);
});

test("a trial's walk steps and climbs as a run's, and the Light Elemental struck answers a moment later", () => {
  const { heard, cue } = listening(), fx = new TrialFx(cue);
  const s = startTrial({ maxHp: 1000, attack: 10, defense: 0 }, "manual", [], 12, 1);
  fx.observe(s, 0);
  for (let i = 1; i <= 4; i++) { trialStep(s, 0, 1); fx.observe(s, i * 1000); }
  assert.deepEqual(heard, [["step", 0], ["step", 0], ["step", 0], ["stoneSteps", 0]]);
  heard.length = 0;
  // Beside the elemental, the hero strikes it; its radiance answers.
  s.player.x = s.elemental.x; s.player.y = s.elemental.y - 1; s.steps++; fx.observe(s, 5000);
  const hp = s.player.hp;
  trialStep(s, 0, 1);
  fx.observe(s, 6000);
  assert.ok(s.player.hp < hp);
  assert.deepEqual(heard, [["punch", 0], ["punch", 220]]);
  assert.ok(fx.lean(6100, false).hero.dy > 0, "the hero leans into its strike");
  assert.equal(fx.lean(6100, true).hero.dy, 0, "but not under Reduce motion");
});
