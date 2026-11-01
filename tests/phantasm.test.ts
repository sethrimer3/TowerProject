// Phantasm (docs/agents/arcana.md): a cooldown's ghosts in a ring round the hero,
// each striking what it touches and disappearing until the next activation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA, ARCANUM_IDS, arcanumBoost } from "../src/arcana/arcana.ts";
import { COOLDOWN_CAP, ghostDirection, ghostOffset, inBlast, phantasmCooldown, phantasmEffects, stepPhantasm, touchesTile, validPhantasm } from "../src/arcana/phantasm.ts";
import { pointing } from "../src/exact.ts";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { decodeSettings, defaultSettings, SETTINGS } from "../src/save/settings.ts";
import { random } from "../src/random.ts";
import { ghostStrikes, landsAt, leavesAt, volleyOver, type VolleyTurn } from "../src/volley.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { startTrial } from "../src/proving-grounds/trial.ts";
import { decodeTrialArcana, trialArcanaTurn } from "../src/proving-grounds/trial-arcana.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 0, tier: 1, strength: "weak" };
const SPIN = phantasmEffects(null).spin, BLAST = phantasmEffects(null).blast;

/** A Tower run on an open floor holding `spots` enemies, holding Phantasm at `levels`, the hero at (4, 4). */
function arena(spots: readonly (readonly [number, number])[], levels: [number, number, number] = [0, 0, 0], hp = 1_000_000) {
  const save = defaults();
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save, random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const [x, y] of spots) w.cells.set(`${x},${y}`, { kind: "enemy", enemy: { ...brute, hp } });
  Object.assign(g.run.player, { x: 4, y: 4, attack: 100, defense: 0, hp: 100, maxHp: 100 });
  g.save.arcana.owned.phantasm = levels;
  return g;
}
/** A board of one enemy per spot, for `ghostStrikes` itself. */
function board(spots: readonly (readonly [number, number])[], hp = 1_000_000) {
  const cells = new Map<string, Tile>(spots.map(([x, y]) => [`${x},${y}`, { kind: "enemy", enemy: { ...brute, hp } }]));
  return {
    tile: (x: number, y: number): Tile => cells.get(`${x},${y}`) ?? { kind: "floor" },
    clear: (x: number, y: number) => void cells.delete(`${x},${y}`),
    wound: (x: number, y: number, damage: number) => {
      const t = cells.get(`${x},${y}`)!;
      t.enemy = { ...t.enemy!, hp: t.enemy!.hp - damage };
    },
    floorEnemies: () => [],
  } as unknown as VolleyTurn["board"];
}
const hero = { x: 4, y: 4, attack: 100, defense: 0, hp: 100, maxHp: 100 } as Player;
const rule = { boost: 10, blast: BLAST, spin: SPIN };

test("the catalog has the spec's tables", () => {
  const [mult, quantity, cooldown] = ARCANA.phantasm.attributes;
  assert.ok(ARCANUM_IDS.includes("phantasm"));
  assert.deepEqual([mult.name, mult.steps.length, mult.steps[0], mult.steps[1], mult.steps[18], mult.steps[22], mult.steps.at(-1)], ["ATK Mult", 36, [10, 0], [11, 5], [421, 254], [838, 540], [9219, 2228]]);
  assert.deepEqual(quantity.steps, [[3, 0], [4, 50], [5, 125], [6, 250]]);
  assert.deepEqual([cooldown.name, cooldown.steps.length, cooldown.steps[0], cooldown.steps[1], cooldown.steps[2], cooldown.steps.at(-1)], ["Cooldown", 16, [200, 0], [190, 8], [180, 24], [50, 232]]);
  assert.ok(ARCANA.phantasm.trigger.on === "cooldown");
});

test("its cooldown never goes under 37 turns, whatever lowers it", () => {
  assert.equal(COOLDOWN_CAP, 37);
  assert.equal(phantasmCooldown(50), 50);
  assert.equal(phantasmCooldown(50, { cooldown: 10 }), 40);
  assert.equal(phantasmCooldown(50, { cooldown: 13 }), 37);
  assert.equal(phantasmCooldown(50, { cooldown: 40 }), 37);
});

test("pointing agrees with sine and cosine, in the same bits with no Math trig", () => {
  for (let d = -720; d <= 720; d += 0.37) {
    const { x, y } = pointing(d), r = (d * Math.PI) / 180;
    assert.ok(Math.abs(x - Math.sin(r)) < 1e-12 && Math.abs(y - Math.cos(r)) < 1e-12, `at ${d}`);
  }
  assert.deepEqual(pointing(0), { x: 0, y: 1 });
  assert.deepEqual(pointing(90), { x: 1, y: -0 });
  assert.deepEqual(pointing(180), { x: -0, y: -1 });
  const { sin, cos, tan } = Math;
  Math.sin = Math.cos = Math.tan = () => assert.fail("no Math trig");
  try {
    pointing(33.3);
    ghostOffset(ghostDirection(5, 1, 3, SPIN, 50));
  } finally {
    Object.assign(Math, { sin, cos, tan });
  }
});

test("the ghosts are evenly spaced and turn 1° a turn, a hundredth of that a tick", () => {
  assert.equal(ghostDirection(0, 0, 3, SPIN), 0);
  assert.equal(ghostDirection(0, 1, 3, SPIN), 12_000);
  assert.equal(ghostDirection(0, 2, 3, SPIN), 24_000);
  assert.equal(ghostDirection(0, 3, 6, SPIN), 18_000);
  assert.equal(ghostDirection(1, 0, 3, SPIN), 100);
  assert.equal(ghostDirection(4, 0, 3, SPIN, 50), 450);
  assert.equal(ghostDirection(360, 0, 3, SPIN), 0);
  const up = ghostOffset(0), right = ghostOffset(9000);
  assert.deepEqual([up.x, up.y], [0, 1], "one tile out, straight up the board");
  assert.ok(Math.abs(right.x - 1) < 1e-12 && Math.abs(right.y) < 1e-12);
});

test("a ghost touches a tile its body overlaps, and blasts by Euclidean distance", () => {
  assert.ok(touchesTile(0, 0));
  assert.ok(touchesTile(0.7, 0), "over the edge");
  assert.ok(!touchesTile(0.75, 0), "just short of it");
  assert.ok(touchesTile(0.67, 0.67), "round a corner");
  assert.ok(!touchesTile(0.68, 0.68));
  assert.ok(inBlast(0.06, 0.08, 0.1));
  assert.ok(!inBlast(0.08, 0.08, 0.1));
});

test("the cooldown brings the ghosts back, filling the gaps up to the Quantity", () => {
  const s: Parameters<typeof stepPhantasm>[0] = { timer: 2, ring: 4, ghosts: [1, 3] };
  assert.equal(stepPhantasm(s, { quantity: 4, turns: 200 }), false);
  assert.deepEqual(s.ghosts, [1, 3]);
  assert.equal(stepPhantasm(s, { quantity: 4, turns: 200 }), true);
  assert.deepEqual([s.ghosts, s.ring, s.timer, s.turns], [[0, 1, 2, 3], 4, 200, 2]);
  const upgraded: Parameters<typeof stepPhantasm>[0] = { timer: 1, ring: 3, ghosts: [2] };
  stepPhantasm(upgraded, { quantity: 5, turns: 200 });
  assert.deepEqual([upgraded.ghosts, upgraded.ring], [[0, 1, 2, 3, 4], 5], "evenly spaced anew");
});

test("a ghost at rest touching an enemy strikes it and disappears; the rest stay", () => {
  const b = board([[4, 5]]), s = { turns: 1, ring: 3, ghosts: [0, 1, 2] };
  const out = ghostStrikes({ board: b, wrap: 0, hero, beams: undefined }, rule, s);
  assert.deepEqual(s.ghosts, [1, 2]);
  assert.equal(out.shots.length, 1);
  const shot = out.shots[0]!;
  assert.deepEqual([shot.to, shot.tick, shot.damage, shot.phantasm], [{ x: 4, y: 5 }, 1, 1000, true]);
  assert.equal(foeHp(b, 4, 5), 1_000_000 - 1000);
  assert.deepEqual(out.struck.map((g) => [g.tick, g.direction]), [[1, 1]]);
});

const foeHp = (b: VolleyTurn["board"], x: number, y: number) => b.tile(x, y).enemy?.hp;

test("no ghost strikes what it doesn't touch", () => {
  // Below the hero, between the first ghost's way and the others'.
  const b = board([[4, 3], [4, 7]]), s = { turns: 1, ring: 2, ghosts: [0] };
  const out = ghostStrikes({ board: b, wrap: 0, hero, beams: undefined }, rule, s);
  assert.deepEqual([out.shots, s.ghosts], [[], [0]]);
});

test("every tile the ghost's body overlaps is in its blast, however small", () => {
  // At 45° the ghost sits on the corner of three tiles.
  const b = board([[5, 5], [5, 4], [4, 5], [3, 3]]), s = { turns: 1, ring: 1, ghosts: [0] };
  const out = ghostStrikes({ board: b, wrap: 0, hero, beams: undefined }, rule, { ...s, turns: 46 });
  assert.deepEqual(out.shots.map((o) => `${o.to.x},${o.to.y}`).sort(), ["4,5", "5,4", "5,5"]);
  assert.equal(foeHp(b, 3, 3), 1_000_000);
});

test("a wider blast reaches enemies past the tiles it touches, walls or no walls", () => {
  const b = board([[4, 5], [4, 6], [6, 5]]), s = { turns: 1, ring: 1, ghosts: [0] };
  const out = ghostStrikes({ board: b, wrap: 0, hero, beams: undefined }, { ...rule, blast: 1.01 }, s);
  assert.deepEqual(out.shots.map((o) => `${o.to.x},${o.to.y}`).sort(), ["4,5", "4,6"], "the ghost is at (4, 5): (4, 6) is 1 away, (6, 5) is 2");
});

test("the walk counts: a ghost meets an enemy partway through the hero's step", () => {
  // The hero steps right from (3, 4); a ghost riding straight up, from (3, 5), touches (4, 5) a quarter of the way.
  const b = board([[4, 5]]), s = { turns: 1, ring: 1, ghosts: [0] };
  const out = ghostStrikes({ board: b, wrap: 0, hero, from: { x: 3, y: 4 }, beams: undefined }, rule, s);
  assert.equal(out.shots.length, 1);
  const tick = out.shots[0]!.tick;
  assert.ok(tick >= 24 && tick <= 26, `at tick ${tick}`);
  assert.ok(Math.abs(out.struck[0]!.x - 3.25) < 0.02 && Math.abs(out.struck[0]!.y - 5) < 0.01, "where it was as it struck");
});

test("round the Delve's wrap, a ghost strikes across the seam", () => {
  const b = board([[0, 4]]), s = { turns: 1, ring: 4, ghosts: [1] };
  const out = ghostStrikes({ board: b, wrap: 17, hero: { ...hero, x: 16 }, beams: undefined }, rule, s);
  assert.equal(out.shots.length, 1);
});

test("Overseer's beams multiply a strike", () => {
  const b = board([[4, 5]]), s = { turns: 1, ring: 1, ghosts: [0] };
  const out = ghostStrikes({ board: b, wrap: 0, hero, beams: { count: 1, width: 30, bonus: 8, turns: 0 } }, rule, s);
  assert.equal(out.shots[0]!.damage, 8000);
});

test("a ghost's shot lands the moment it strikes, with no flight", () => {
  const volley = { at: 1000, ms: 200, shots: [{ by: "hero" as const, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, damage: 1, tick: 50, phantasm: true as const }] };
  assert.equal(landsAt(volley, volley.shots[0]!), 1100);
  assert.equal(leavesAt(volley, volley.shots[0]!), 1100);
  assert.ok(volleyOver(volley, 1100) && !volleyOver(volley, 1099));
});

test("in a run: the first activation waits out the cooldown, then a strike at Arcanum Damage pays its kill", () => {
  const g = arena([[5, 5]], [0, 0, 15], 500);
  for (let i = 0; i < 49; i++) {
    assert.ok(g.move(i % 2 ? 1 : -1, 0));
    assert.equal(g.run.phantasm?.ghosts, undefined, `turn ${i + 1}`);
  }
  assert.equal(g.run.phantasm!.timer, 1);
  // Back to (4, 4): the first ghost, by now 49° round, reaches (5, 5) on the way.
  assert.ok(g.move(1, 0));
  assert.equal(g.run.phantasm!.timer, 50);
  assert.deepEqual(g.run.phantasm!.ghosts, [1, 2]);
  assert.equal(g.world.tile(5, 5).kind, "floor", "felled at 1,000 damage");
  assert.match(g.message, /Phantasm/);
});

test("Arcanum Damage averages crits, as the card shows", () => {
  const g = arena([]);
  const held = g.arcana.held.find((h) => h.id === "phantasm")!;
  assert.deepEqual(g.arcana.cardValue(held), { damage: 100 * arcanumBoost(10, g.crit) });
  assert.equal(g.arcana.phantasmRule()!.boost, arcanumBoost(10, g.crit));
  const crit = { chance: 50, factor: 2, superCrit: { chance: 10, factor: 5 } };
  assert.equal(arcanumBoost(10, crit), 10 * (1 + 2 * 0.5) * (1 + 5 * 0.1 * 0.5));
});

test("undo takes back the ghosts with what they struck, and the hidden toggle only hides", () => {
  const g = arena([[5, 5]]);
  g.run.phantasm = { timer: 100, turns: 1, ring: 3, ghosts: [0, 1, 2] };
  const before = g.world.tile(5, 5).enemy!.hp, changes = structuredClone(g.run.changes);
  g.save.settings.phantasmDamage = false;
  assert.ok(g.move(1, 0));
  assert.ok((g.volley?.shots ?? []).every((s) => !s.phantasm), "hidden");
  assert.deepEqual(g.run.phantasm!.ghosts, [1, 2]);
  assert.ok(g.world.tile(5, 5).enemy!.hp < before, "struck all the same");
  g.undo();
  assert.deepEqual(g.run.phantasm, { timer: 100, turns: 1, ring: 3, ghosts: [0, 1, 2] });
  assert.deepEqual(g.run.changes, changes);
});

test("from the turn's last tick, only what touches the ring where the hero ended strikes", () => {
  // What stepped up to the hero, with the step over: nothing along the way counts.
  const b = board([[4, 5]]), s = { turns: 1, ring: 1, ghosts: [0] };
  const out = ghostStrikes({ board: b, wrap: 0, hero, beams: undefined }, rule, s, 100);
  assert.deepEqual(out.shots.map((o) => o.tick), [100]);
  assert.equal(s.ghosts, undefined);
});

test("shown, a strike joins the turn's volley, and the board keeps where it was", () => {
  const g = arena([[5, 5]]);
  g.run.phantasm = { timer: 100, turns: 1, ring: 3, ghosts: [0, 1, 2] };
  assert.ok(g.move(1, 0));
  const shot = g.volley!.shots.find((s) => s.phantasm)!;
  assert.deepEqual(shot.to, { x: 5, y: 5 });
  assert.equal(g.ghostFx.length, 1);
  assert.ok(g.ghostFx[0]!.at > g.volley!.at, "shown the moment it struck");
});

test("switching it off loses the ghosts and the cooldown; back on, it starts over", () => {
  const g = arena([]);
  g.run.phantasm = { timer: 5, turns: 9, ring: 3, ghosts: [0, 1] };
  assert.ok(g.arcana.toggle("phantasm"));
  assert.deepEqual(g.run.phantasm, { turns: 9 });
  assert.equal(g.phantasms, undefined);
  assert.ok(g.arcana.toggle("phantasm"));
  const held = g.arcana.held.find((h) => h.id === "phantasm")!;
  assert.deepEqual(g.arcana.cooldown(held), { left: 200, turns: 200 });
});

test("the card's bar reads its cooldown from the run", () => {
  const g = arena([]);
  g.run.phantasm = { timer: 12 };
  assert.deepEqual(g.arcana.cooldown(g.arcana.held.find((h) => h.id === "phantasm")!), { left: 12, turns: 200 });
  assert.deepEqual(g.arcana.turn(), [], "its cooldown is its own");
});

test("the save keeps a well-formed ring and drops a bad one", () => {
  assert.ok(validPhantasm({}));
  assert.ok(validPhantasm({ timer: 5, turns: 3, ring: 3, ghosts: [0, 2] }));
  for (const bad of [{ ghosts: [0] }, { ring: 3 }, { ring: 3, ghosts: [] }, { ring: 3, ghosts: [3] }, { ring: 3, ghosts: [1, 1] }, { ring: 3, ghosts: [0.5] }, { timer: 0 }, 5])
    assert.ok(!validPhantasm(bad), JSON.stringify(bad));
  const g = arena([]);
  g.run.phantasm = { timer: 5, turns: 3, ring: 3, ghosts: [0, 2] };
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.phantasm, g.run.phantasm);
  (g.run as { phantasm?: unknown }).phantasm = { ring: 3 };
  assert.equal(decode(JSON.stringify(g.save)).tower.run!.phantasm, undefined);
});

test("the settings: damage shows by default, alpha 0.5, kept to its steps", () => {
  const d = defaultSettings();
  assert.equal(d.phantasmDamage, true);
  assert.equal(d.phantasmAlpha, 0.5);
  assert.equal(SETTINGS.phantasmAlpha.min, 0);
  assert.equal(SETTINGS.phantasmAlpha.max, 1);
  for (const [saved, kept] of [[0, 0], [1, 1], [0.35, 0.35], [0.33, 0.35], [-3, 0], [9, 1], ["x", 0.5]] as const) assert.equal(decodeSettings({ phantasmAlpha: saved }).phantasmAlpha, kept);
  assert.equal(decodeSettings({ brightness: 23 }).brightness, 23, "a whole-number range stays as it was");
});

test("in a trial: the ring's own state, striking what it touches as the turn ends", () => {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  base.save.arcana.owned.phantasm = [0, 0, 15];
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, "light-elemental");
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  assert.ok(state.arcana?.spells?.phantasm);
  assert.equal(state.arcana.spells.phantasm.turns, 50);
  state.room = "arena";
  Object.assign(state.player, { x: 2, y: 12 });
  Object.assign(state, { status: "active", bossHp: 10_000 });
  Object.assign(state.elemental, { x: 2, y: 13, incorporeal: false });
  state.arcana.phantasm = { timer: 1 };
  trialArcanaTurn(state, { message: "" });
  // Ghost 0 rides straight up, onto the boss; 1 and 2 ride clear of it.
  assert.equal(state.arcana.phantasm.timer, 50);
  assert.deepEqual(state.arcana.phantasm.ghosts, [1, 2]);
  assert.equal(state.bossHp, 10_000 - 100 * state.arcana.spells.phantasm.boost);
  const strike = state.arcana.strikes!.find((k) => k.kind === "phantasm")!;
  assert.deepEqual(strike.to, { x: 2, y: 13 });
  // An incorporeal boss can't be struck, so the ghosts wait.
  state.elemental.incorporeal = true;
  Object.assign(state.elemental, { x: 3, y: 12 });
  trialArcanaTurn(state, { message: "" });
  assert.deepEqual(state.arcana.phantasm.ghosts, [1, 2]);
  session.sync();
  assert.equal(session.game.run.phantasm, state.arcana.phantasm, "the card reads the attempt's");
  const back = decodeTrialArcana(JSON.parse(JSON.stringify(state.arcana)));
  assert.deepEqual(back?.phantasm, state.arcana.phantasm, "saved with the attempt");
});
