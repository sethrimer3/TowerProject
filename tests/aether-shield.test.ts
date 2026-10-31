import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import type { Enemy, Player } from "../src/entities.ts";
import { snap } from "../src/exact.ts";
import { bout, heroHpAfter, predict, shieldDuring, summarize } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import { shotDamage } from "../src/enemies/ranged.ts";
import { checkpoint, goalUnlocked } from "../src/goals.ts";
import { RESEARCH, researched } from "../src/progression/archives.ts";
import { REGROW_FLOOR, TRAINING, trainingCap, trainingCeiling } from "../src/progression/training.ts";
import { trainingGold } from "../src/progression/training-jobs.ts";
import { rowValue, trainingText } from "../src/progression/loadout.ts";
import { regrowNow, shieldCapacity } from "../src/hero-shield.ts";
import { silverPrice } from "../src/progression/run-training.ts";
import { TREES, skillAvailable, skillHidden } from "../src/progression/skill-trees.ts";
import { cost } from "../src/progression/upgrades.ts";
import { regenerateShield, resolveStep, BASE_RULES } from "../src/step-effects.ts";
import { drawShieldBubble, SHIELD_FORM_MS, SHIELD_POP_MS } from "../src/render/effects/shield-bubble.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 1000, maxHp: 1000, attack: 100, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 500, attack: 30, defense: 40, tier: 1, strength: "normal" };
const row = (id: "shieldHp" | "regrowShield") => TRAINING.find((t) => t.id === id)!;
const within1 = (actual: number, wanted: number, what: string) => assert.ok(Math.abs(actual / wanted - 1) < 0.01, `${what}: ${actual} is not about ${wanted}`);

/** A Tower run inside on an open 5×5 floor, with the Shield and `enemy` at (1, 0). */
function arena(enemy?: Enemy, edit?: (g: Game) => void) {
  const save = defaults();
  save.upgrades.aetherShield = save.upgrades.heroShield = 1;
  const g = new Game(save);
  edit?.(g);
  g.newRun({ seed: 7 });
  openFloor(g, enemy);
  Object.assign(g.run.player, { x: 0, y: 0 });
  return g;
}
/** Lays `g`'s open floor (again after undo, which rebuilds the real one). */
function openFloor(g: Game, enemy?: Enemy) {
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("4,4", { kind: "stairs" });
  if (enemy) w.cells.set("1,0", { kind: "enemy", enemy });
  w.torches = [];
}

test("the tree: Red Key under Blue Key, Thorns between Buy Quantity and Torch, and the Shield path off Torch, revealed by Aether Shield", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(["heroShield", "shieldThorns", "regrowShield", "shieldRegen"].map((id) => [at(id).x, at(id).y, at(id).requires]),
    [[70, 376, ["cardTorch"]], [70, 394, ["heroShield"]], [90, 376, ["heroShield"]], [90, 394, ["regrowShield"]]]);
  assert.deepEqual(["heroShield", "shieldThorns", "regrowShield", "shieldRegen"].map((id) => cost(id as "heroShield", 0)), [10, 15, 10, 15]);
  const breakthrough = TREES.find((t) => t.id === "breakthrough")!, node = (id: string) => breakthrough.nodes.find((n) => n.id === id)!;
  assert.deepEqual([node("aetherShield").requires, cost("aetherShield", 0)], [["inspirationUndos"], 5]);
  assert.deepEqual(node("undos").requires, ["aetherShield"], "Echoes of time follows it");
  assert.deepEqual([node("shieldLimitBreak").requires, cost("shieldLimitBreak", 0)], [["limitBreak2"], 5]);
  const upgrades = { ...defaults().upgrades, trainers: 1, questForKnowledge: 1 };
  assert.ok(skillHidden("heroShield", upgrades));
  for (const id of ["cardTorch", "thorns", "buyQuantity", "lifesteal", "archives"] as const) upgrades[id] = 1;
  assert.ok(!skillAvailable("heroShield", upgrades), "hidden until Aether Shield");
  upgrades.aetherShield = 1;
  assert.ok(skillAvailable("heroShield", upgrades));
});

test("Shield HP: 20% and 0.1% a rank, 100% at 800, 200% at 1,800 with its Limit Break, and its research multiplies it", () => {
  const save = defaults();
  save.upgrades.heroShield = 1;
  assert.equal(shieldCapacity(save, { shieldHp: 0 }, 1000), 200);
  assert.equal(shieldCapacity(save, { shieldHp: 1 }, 1000), 201);
  assert.equal(shieldCapacity(save, { shieldHp: 800 }, 1000), 1000);
  assert.equal(shieldCapacity(save, { shieldHp: 1800 }, 1000), 2000);
  assert.equal(trainingCap(row("shieldHp"), save.upgrades), 800);
  assert.equal(trainingCap(row("shieldHp"), { ...save.upgrades, shieldLimitBreak: 1 }), 1800);
  assert.equal(trainingCeiling(row("shieldHp")), 1800);
  save.archives.levels.shieldHp = 50;
  assert.equal(researched(save.archives, "shieldHpPercent"), 200);
  assert.equal(shieldCapacity(save, { shieldHp: 1800 }, 1000), 4000, "+2% of the trained value a level");
  assert.equal(shieldCapacity(defaults(), {}, 1000), 0, "nothing without the skill");
});

test("Regrow Shield: 1,200 turns, 2 fewer a rank, 600 at 300, and 10 fewer a research level, never below the floor", () => {
  const save = defaults();
  assert.equal(regrowNow(save, {}), 1200, "1,200 before the skill");
  save.upgrades.regrowShield = 1;
  assert.equal(regrowNow(save, { regrowShield: 1 }), 1198);
  assert.equal(regrowNow(save, { regrowShield: 300 }), 600);
  assert.equal(trainingCap(row("regrowShield"), save.upgrades), 300);
  save.archives.levels.regrowShield = 20;
  assert.equal(regrowNow(save, { regrowShield: 300 }), 400);
  assert.equal(rowValue(save, "regrowShield", 0, { mode: "tower" }).value, 1000, "the tab shows it too");
  assert.equal(trainingText(600, "wholeTurns"), "600 turns");
  save.archives.levels.regrowShield = 0;
  assert.equal(REGROW_FLOOR, 150);
});

test("the training prices run through the asked-for anchors", () => {
  const gold = (id: "shieldHp" | "regrowShield", n: number) => trainingGold(row(id), n - 1);
  for (const [n, want] of [[1, 8e6], [100, 1.9e9], [200, 8.5e9], [300, 39e9], [800, 2.35e12], [1300, 64e12], [1800, 3.21e15]] as const) within1(gold("shieldHp", n), want, `Shield HP ${n}`);
  for (const [n, want] of [[1, 16e6], [50, 1.84e9], [100, 12.69e9], [200, 740e9], [300, 40e12]] as const) within1(gold("regrowShield", n), want, `Regrow Shield ${n}`);
  assert.equal(silverPrice("shieldHp", 0), 150);
  assert.equal(silverPrice("regrowShield", 0), 300);
  assert.ok(silverPrice("shieldHp", 1799) > silverPrice("shieldHp", 1798), "Silver prices every rank up to 1,800");
});

test("the research runs through the asked-for levels, Gold and time", () => {
  const hp = RESEARCH.shieldHp.levels, regrow = RESEARCH.regrowShield.levels, regen = RESEARCH.shieldRegen.levels, thorns = RESEARCH.shieldThorns.levels;
  assert.deepEqual([hp.length, regrow.length, regen.length, thorns.length], [50, 20, 5, 5]);
  for (const [n, want] of [[1, 1e9], [2, 1.2e9], [5, 1.81e9], [6, 2.02e9], [10, 2.94e9], [25, 9.39e9], [50, 48.61e9]] as const) within1(hp[n - 1]!.gold, want, `Shield HP ${n}`);
  assert.deepEqual(hp.slice(0, 6).map((l) => Math.round(l.hours * 60)), [333, 337, 346, 359, 379, 405]);
  for (const [n, want] of [[1, 1.6e9], [2, 1.91e9], [3, 2.23e9], [4, 2.61e9], [5, 3.04e9], [10, 6.65e9], [15, 13.89e9], [20, 26.33e9]] as const) assert.equal(regrow[n - 1]!.gold, want, `Regrow ${n}`);
  for (const [n, want] of [[1, 49980], [6, 272940], [7, 334260], [20, 3619380]] as const) assert.equal(Math.round(regrow[n - 1]!.hours * 3600), want);
  assert.deepEqual(regen.map((l) => l.gold), [1e9, 2e9, 3e9, 4e9, 5e9]);
  assert.deepEqual(regen.map((l) => Math.round(l.hours * 3600)), [99960, 120060, 141360, 167880, 207120]);
  assert.deepEqual(thorns.map((l) => l.gold), [1e9, 2e9, 3e9, 4e9, 5e9]);
  regen.forEach((l, i) => assert.ok(Math.abs(thorns[i]!.hours / l.hours - 1.036 ** i) < 1e-4, `Thorns ${i + 1} is 3.6% steeper, compounded`));
  for (const levels of [hp, regrow, regen, thorns]) for (let i = 1; i < levels.length; i++) assert.ok(levels[i]!.gold > levels[i - 1]!.gold && levels[i]!.hours > levels[i - 1]!.hours);
});

test("claiming Tower VIII's floor 10 Goal reveals the Shield HP and Regrow Shield labs; Regen and Thorns need only their skills", () => {
  assert.deepEqual(checkpoint(8, 10)?.reward, { kind: "unlock", unlock: "aetherShield" });
  const save = defaults();
  save.upgrades.archives = save.upgrades.heroShield = save.upgrades.regrowShield = save.upgrades.shieldRegen = save.upgrades.shieldThorns = 1;
  assert.ok(!goalUnlocked(save, "aetherShield"));
  const needs = (id: "shieldHp" | "regrowShield" | "shieldRegen" | "shieldThorns") => RESEARCH[id].requires;
  assert.ok(needs("shieldHp").some((r) => "goalUnlock" in r && r.goalUnlock === "aetherShield"));
  assert.ok(needs("regrowShield").some((r) => "goalUnlock" in r && r.goalUnlock === "aetherShield"));
  assert.ok(!needs("shieldRegen").some((r) => "goalUnlock" in r));
  assert.ok(!needs("shieldThorns").some((r) => "goalUnlock" in r));
});

test("a strike comes off the shroud, then the shield, then HP, and predict, bout and the step agree", () => {
  const fighter = hero({ shroud: 20, shield: 100, shieldMax: 100, attack: 90 });
  const fight = bout(fighter, brute), last = fight.strikes.filter((s) => s.by === "enemy");
  assert.equal(last[0]!.shrouded, 20);
  assert.equal(last[0]!.shielded, 10, "30 ATK, less the shroud's 20");
  const r = predict(fighter, brute);
  assert.equal(r.damage, snap(1000 - heroHpAfter(fight, 1000)));
  assert.equal(r.shieldAfter, shieldDuring(fight, 100, Infinity));
  const step = resolveStep(fighter, { kind: "enemy", enemy: brute }, BASE_RULES);
  assert.ok(!step.blocked);
  assert.equal(step.player.hp, heroHpAfter(fight, 1000));
  assert.equal(step.player.shield, r.shieldAfter);
});

test("the shield breaks on the strike that spends it, and the rest gets through", () => {
  const fight = bout(hero({ shield: 40, shieldMax: 100, attack: 45 }), { ...brute, hp: 50 });
  const strikes = fight.strikes.filter((s) => s.by === "enemy");
  assert.equal(strikes.filter((s) => s.shieldBroke).length, 1);
  const broke = strikes.find((s) => s.shieldBroke)!;
  assert.ok(broke.damage > 0 && broke.shielded! < struckOf(broke), "what it couldn't hold reaches HP");
  assert.ok(summarize(fight, 0).strikes.some((s) => s.shieldBroke), "summary rounds keep it");
});
const struckOf = (s: { damage: number; shielded?: number }) => s.damage + (s.shielded ?? 0);

test("thorns: none on the shield by default, Shield Thorns' share with it, and the whole once the shield is down", () => {
  const big = { ...brute, hp: 2000 };
  const none = bout(hero({ thorns: 10, shield: 100, shieldMax: 100, attack: 60 }), big).strikes.filter((s) => s.by === "enemy");
  assert.ok(!none[0]!.thorns, "no thorns off the shield");
  const firstDown = none.findIndex((s) => s.shieldBroke);
  assert.ok(firstDown >= 0 && none[firstDown + 1]!.thorns === 200, "the whole thorns once it is down");
  const some = bout(hero({ thorns: 10, shieldThorns: 5, shield: 100, shieldMax: 100, attack: 60 }), big).strikes.filter((s) => s.by === "enemy");
  assert.equal(some[0]!.thorns, 10, "5% of the 200 thorns");
  assert.ok(some[0]!.damage === 0);
  assert.equal(bout(hero({ thorns: 10, attack: 60 }), big).strikes.find((s) => s.by === "enemy")!.thorns, 200, "as ever without a shield");
});

test("predict and bout end alike across the shield's combinations", () => {
  for (const shield of [1, 25, 100, 400, 5000]) for (const thorns of [0, 2, 10]) for (const shieldThorns of [0, 3, 50]) for (const lifesteal of [0, 5]) for (const parry of [0, 25]) for (const shroud of [0, 15]) for (const fast of [false, true]) for (const armorBreak of [0, 5]) {
    const p = hero({ shield, shieldMax: 400, attack: 70, hp: 700, ...(thorns ? { thorns } : {}), ...(shieldThorns ? { shieldThorns } : {}), ...(lifesteal ? { lifesteal } : {}), ...(parry ? { parry } : {}), ...(shroud ? { shroud } : {}), ...(armorBreak ? { armorBreak } : {}) });
    const e: Enemy = { ...brute, attack: 45, hp: 900, ...(fast ? { fast: true } : {}) };
    const label = JSON.stringify({ shield, thorns, shieldThorns, lifesteal, parry, shroud, fast, armorBreak });
    const r = predict(p, e), fight = bout(p, e), after = heroHpAfter(fight, p.hp);
    if (r.hpAfter !== undefined) assert.equal(r.hpAfter, after, label);
    else if (r.survivable) assert.equal(snap(p.hp - r.damage), after, label);
    else assert.equal(after, 0, label);
    if (r.survivable) {
      assert.equal(r.turns, fight.strikes.filter((s) => s.by === "hero").length, label);
      assert.equal(r.shieldAfter, shieldDuring(fight, shield, Infinity), label);
    }
  }
});

test("the forecast counts the shield: no crit in reach, it equals predict; a shield covering the fight costs no HP", () => {
  const p = hero({ shield: 100000, shieldMax: 100000, attack: 90 }), rule = { chance: 40, factor: 2 };
  const f = forecast(p, brute, rule);
  assert.equal(f.expected, 0);
  assert.equal(f.survive, 1);
  const smaller = forecast(hero({ shield: 30, shieldMax: 30, attack: 90 }), brute, rule), none = forecast(hero({ attack: 90 }), brute, rule);
  assert.ok(smaller.expected < none.expected, "less than without one");
  assert.ok(Math.abs(none.expected - smaller.expected - 30) < 1e-6, "by what it holds, in a fight that spends it");
  const thorny = forecast(hero({ shield: 60, shieldMax: 60, attack: 90, thorns: 5, hp: 5000, maxHp: 5000 }), { ...brute, hp: 5000 }, rule);
  const without = forecast(hero({ attack: 90, thorns: 5, hp: 5000, maxHp: 5000 }), { ...brute, hp: 5000 }, rule);
  assert.ok(thorny.turns >= without.turns, "strikes on the shield cost no thorns, so the fight lasts at least as long");
});

test("a shot comes off the shield too, and door tolls never do", () => {
  const p = hero({ shield: 50, shieldMax: 50 }), archer: Enemy = { ...brute, attack: 80 };
  assert.deepEqual(shotDamage(p, archer), { damage: 30, shrouded: 0, shielded: 50 });
  const door = resolveStep(hero({ hp: 500, shield: 50, shieldMax: 50 }), { kind: "door", door: { type: "wood", durability: 30 } }, BASE_RULES);
  assert.ok(!door.blocked);
  assert.deepEqual([door.player.hp, door.player.shield], [470, 50]);
});

test("Shield Regen gives a standing shield its share of the step's Regen, up to max, and nothing while it is down", () => {
  const rules = { ...BASE_RULES, regen: 10, shieldRegen: 5 };
  assert.equal(regenerateShield(50, 100, rules), 50.5);
  assert.equal(regenerateShield(99.9, 100, rules), 100);
  assert.equal(regenerateShield(0, 100, rules), 0);
  assert.equal(regenerateShield(120, 100, rules), 120, "one above max keeps what it has");
  assert.equal(regenerateShield(50, 100, { ...BASE_RULES, regen: 10 }), 50, "none without research");
  const step = resolveStep(hero({ shield: 50, shieldMax: 100 }), { kind: "floor" }, rules);
  assert.ok(!step.blocked);
  assert.equal(step.player.shield, 50.5);
});

test("a run starts with the shield full; none is carried without the skill", () => {
  const g = arena();
  assert.deepEqual([g.run.player.shield, g.run.player.shieldMax], [20, 20], "20% of 100 HP");
  const plain = new Game(defaults());
  plain.newRun({ seed: 7 });
  assert.ok(!("shield" in plain.run.player) && !("shieldMax" in plain.run.player) && !("shieldThorns" in plain.run.player));
});

test("broken, it regrows turn by turn and reforms full; undo and a reload keep the countdown", () => {
  const g = arena({ ...brute, hp: 1, attack: 1, defense: 0 }), p = () => g.run.player;
  g.save.upgrades.inspirationUndos = 1;
  p().shield = 0;
  assert.equal(g.run.shieldRegrow, undefined);
  g.move(1, 0);
  assert.deepEqual(g.run.shieldRegrow, { left: 1199, of: 1200 }, "the step that found it spent starts the count, and counts");
  g.move(0, 1);
  assert.deepEqual(g.run.shieldRegrow, { left: 1198, of: 1200 });
  const saved = decode(JSON.stringify(g.save));
  assert.deepEqual(saved.tower.run!.shieldRegrow, { left: 1198, of: 1200 });
  assert.equal(saved.tower.run!.player.shield, 0);
  assert.ok(g.undo());
  assert.deepEqual(g.run.shieldRegrow, { left: 1199, of: 1200 }, "undo takes a turn back");
  g.run.shieldRegrow = { left: 1, of: 1200 };
  openFloor(g);
  g.move(0, 1);
  assert.equal(g.run.shieldRegrow, undefined);
  assert.equal(p().shield, 20);
  assert.ok(g.shieldFormedAt > -Infinity);
});

test("more capacity mid-run comes with the shield to fill it, unless it is down", () => {
  const g = arena(), p = () => g.run.player;
  p().shield = 10;
  g.save.training.shieldHp = 100;
  g.move(0, 1);
  assert.equal(p().shieldMax, 30, "30% of 100 HP");
  assert.equal(p().shield, 20, "it gains what its most gained");
  g.run.shieldRegrow = { left: 50, of: 100 };
  p().shield = 0;
  g.save.training.shieldHp = 200;
  g.move(0, 1);
  assert.deepEqual([p().shieldMax, p().shield], [40, 0], "not while it is down");
});

test("the hand plays real floors with a shield as without one, and a real fight breaks it", () => {
  const climb = (shield: boolean) => {
    const save = defaults();
    for (const id of ["cardDoorKey", "cardEnemy", "autoClimb", "combatStance", "buildout", "trainers"] as const) save.upgrades[id] = 1;
    if (shield) save.upgrades.aetherShield = save.upgrades.heroShield = 1;
    save.training.hp = 300;
    const g = new Game(save);
    g.newRun({ seed: 11 });
    const broke: number[] = [];
    if (shield) g.run.player.shield = 1;
    g.run.hand = ["monster", "stairs"];
    for (let turn = 0; turn < 400 && g.playing; turn++) {
      g.autoTurn();
      if (shield && g.run.shieldRegrow && !broke.length) broke.push(turn);
    }
    return { g, broke, places: [g.run.player.x, g.run.player.y, g.run.height] };
  };
  const plain = climb(false), shielded = climb(true);
  assert.ok(plain.g.run.height > 0, "the hand climbs without a shield");
  assert.equal(shielded.broke.length, 1, "a real fight broke it");
  assert.ok(shielded.g.run.height >= plain.g.run.height, "and it climbs at least as far");
});

test("the bubble draws nothing with no shield, and its animations end", () => {
  const calls: string[] = [], c = new Proxy({}, { get: (_, k) => (k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => calls.push(String(k))), set: () => true }) as unknown as CanvasRenderingContext2D;
  const f = { c, now: 1000, playerX: 0, playerY: 0, look: { reduceMotion: false } } as never as Parameters<typeof drawShieldBubble>[0];
  assert.ok(SHIELD_POP_MS > 0 && SHIELD_FORM_MS > SHIELD_POP_MS);
  drawShieldBubble(f, { up: false, brokeAt: -Infinity, formedAt: -Infinity });
  assert.equal(calls.length, 0);
  drawShieldBubble(f, { up: true, brokeAt: -Infinity, formedAt: -Infinity });
  assert.ok(calls.includes("arc"), "a bubble while it stands");
  calls.length = 0;
  drawShieldBubble(f, { up: false, brokeAt: 900, formedAt: -Infinity });
  assert.ok(calls.includes("arc"), "the pop");
  calls.length = 0;
  drawShieldBubble(f, { up: false, brokeAt: 1000 - SHIELD_POP_MS, formedAt: -Infinity });
  assert.equal(calls.length, 0, "the pop ends");
  drawShieldBubble(f, { up: false, brokeAt: 1100, formedAt: -Infinity });
  assert.ok(calls.includes("arc"), "it stands until the strike that breaks it lands");
  calls.length = 0;
  drawShieldBubble(f, { up: true, brokeAt: -Infinity, formedAt: 1000 - 700 });
  assert.ok(calls.includes("fillRect"), "sparkles once it is full size");
});
