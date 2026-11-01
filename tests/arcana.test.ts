// Arcana (docs/agents/arcana.md): bought and upgraded with Arcanite on the Gear
// page, held by a run, set off by their triggers; Ricochet Shot on arrows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA, ARCANUM_PRICES, arcanaOpen, arcanumBoost, decodeArcana, decodeArcanaRun, drawOptions, redrawOptions, rerollPrice, tickCooldowns, valuesAt } from "../src/arcana/arcana.ts";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { boon, rollOffer, BOON_IDS } from "../src/shrines.ts";
import { random } from "../src/random.ts";
import { volleyTurn, landsAt, leavesAt, volleyOver, type VolleyTurn } from "../src/volley.ts";
import { decodeItem } from "../src/mail/message.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const game = (arcanite = 0) => {
  const save = defaults();
  save.arcanite = arcanite;
  return new Game(save, random(5));
};

test("the Arcanite rename keeps what a save held", () => {
  const raw = { ...defaults(), ascensionShards: 42 } as Record<string, unknown>;
  delete raw.arcanite;
  assert.equal(decode(JSON.stringify(raw)).arcanite, 42);
  assert.deepEqual(decodeItem({ kind: "currency", currency: "shards", amount: 3 }), { kind: "currency", currency: "arcanite", amount: 3 });
});

test("the attribute tables hold the spec's ends and sizes", () => {
  const [mult, rebounds, chance] = ARCANA.ricochetShot.attributes;
  assert.deepEqual([mult.steps.length, mult.steps[0], mult.steps[31]], [32, [2, 0], [7961, 2469]]);
  assert.deepEqual([rebounds.steps.length, rebounds.steps[4]], [5, [5, 400]]);
  assert.deepEqual([chance.steps.length, chance.steps[1], chance.steps[15]], [16, [6.5, 8], [27.5, 260]]);
  assert.deepEqual(ARCANUM_PRICES, [5, 50, 150, 300, 800, 1250, 1750, 2400, 3000]);
});

test("rerolling costs a fifth of the next arcanum's price, whole at every price", () => {
  for (const [owned, price] of ARCANUM_PRICES.entries()) {
    const a = { owned: Object.fromEntries(Array.from({ length: owned }, (_, i) => [`x${i}`, [0, 0, 0]])) } as never;
    assert.ok(Number.isInteger(price / 5));
    assert.ok(rerollPrice(a) >= 1);
  }
  assert.equal(rerollPrice({ owned: {} }), 1);
});

test("every option left is as likely as any other, with no repeats", () => {
  const pool = ["a", "b", "c", "d", "e", "f"], seen: Record<string, number> = {}, rng = random(9);
  const rounds = 6000;
  for (let i = 0; i < rounds; i++) {
    const drawn = drawOptions(pool, 3, rng);
    assert.equal(new Set(drawn).size, 3);
    for (const d of drawn) seen[d] = (seen[d] ?? 0) + 1;
  }
  for (const id of pool) assert.ok(Math.abs(seen[id]! / rounds - 0.5) < 0.03, `${id}: ${seen[id]}`);
  assert.deepEqual(drawOptions(["a"], 3, rng), ["a"]);
});

test("a reroll gives a different set whenever there is one", () => {
  const rng = random(3), pool = ["a", "b", "c", "d"];
  for (let i = 0; i < 200; i++) {
    const now = drawOptions(pool, 3, rng), next = redrawOptions(pool, now, 3, rng);
    assert.notDeepEqual([...next].sort(), [...now].sort());
  }
});

test("the Arcana tab opens with Arcanite held, and stays open once spent", () => {
  const g = game();
  assert.equal(arcanaOpen(g.save), false);
  assert.equal(g.notices.waiting("gear"), false);
  g.save.arcanite = 5;
  assert.equal(arcanaOpen(g.save), true);
  g.save.arcanite = 0;
  g.save.profile.earned.arcanite = 5;
  assert.equal(arcanaOpen(g.save), true);
});

test("its dots and lesson wait until the Arcana tab shows, and the lesson for every other", () => {
  const g = game(5);
  g.newRun({ outside: true });
  for (const k of Object.keys(g.save.tutorials)) g.save.tutorials[k as keyof typeof g.save.tutorials] = true;
  g.save.tutorials.arcana = false;
  assert.equal(g.notices.waiting("gear"), true);
  assert.equal(g.notices.waiting("arcana"), true);
  assert.equal(g.boardLesson, "arcana");
  g.save.tutorials.gear = false;
  g.save.upgrades.pocketMoney = 0;
  assert.equal(g.notices.shown("arcana"), true);
  assert.equal(g.notices.waiting("arcana"), false);
  assert.equal(g.notices.shown("arcana"), false);
  assert.notEqual(g.boardLesson, "arcana");
});

test("buying pays the price and keeps the choice until it is bought", () => {
  const g = game(4);
  assert.equal(g.arcana.price, 5);
  const offer = g.arcana.offer();
  assert.deepEqual(offer, ["ricochetShot"]);
  assert.equal(g.arcana.buy("ricochetShot"), "short");
  assert.deepEqual(g.save.arcana.owned, {});
  g.save.arcanite = 7;
  assert.deepEqual(decodeArcana(JSON.parse(JSON.stringify(g.save.arcana))).offer, offer, "the choice survives a reload");
  assert.equal(g.arcana.buy("ricochetShot"), "done");
  assert.equal(g.save.arcanite, 2);
  assert.deepEqual(g.save.arcana.owned.ricochetShot, [0, 0, 0]);
  assert.equal(g.arcana.price, null, "nothing left to buy: no button");
  assert.equal(g.arcana.canReroll, false, "a reroll could change nothing");
  assert.equal(g.arcana.reroll(), "refused");
});

test("the choices draw from their own saved stream, seeded once", () => {
  const g = game(5);
  assert.equal(g.save.arcana.rng, null);
  g.arcana.offer();
  const seed = g.save.arcana.rng;
  assert.equal(typeof seed, "number");
  assert.equal(g.save.arcana.rolls, 1);
  assert.equal(decodeArcana(g.save.arcana).rng, seed);
});

test("upgrading pays each level's cost, up to the top", () => {
  const g = game(10_000);
  g.save.arcana.owned.ricochetShot = [0, 0, 0];
  assert.equal(g.arcana.upgrade("ricochetShot", 1), "done");
  assert.equal(g.save.arcanite, 10_000 - 30);
  for (const cost of [75, 150, 400]) assert.equal(g.arcana.upgrade("ricochetShot", 1), "done", String(cost));
  assert.equal(g.arcana.upgrade("ricochetShot", 1), "refused", "at Max");
  assert.deepEqual(valuesAt("ricochetShot", g.save.arcana.owned.ricochetShot!), [2, 5, 5]);
  g.save.arcanite = 0;
  assert.equal(g.arcana.upgrade("ricochetShot", 0), "short");
});

test("the saved arcana decode defensively", () => {
  assert.deepEqual(decodeArcana({ owned: { ricochetShot: [99, 0, 0], gone: [0, 0, 0] }, offer: ["gone", "ricochetShot"], rng: -1, rolls: "x" }), { owned: {}, offer: ["ricochetShot"], rng: null, rolls: 0 });
  assert.deepEqual(decodeArcana({ owned: { ricochetShot: [1, 2, 3] }, offer: ["ricochetShot"], rng: 7, rolls: 2 }), { owned: { ricochetShot: [1, 2, 3] }, offer: [], rng: 7, rolls: 2 });
  assert.deepEqual(decodeArcanaRun({ toggles: 41, off: ["ricochetShot", "gone"], timers: { ricochetShot: 0 } }), { toggles: 0, off: ["ricochetShot"], timers: {} });
});

test("Arcanum Damage's formula", () => {
  assert.equal(arcanumBoost(3, undefined), 3);
  // 3 × 2 (equipment) × (1 + 2 × 0.5) × (1 + 4 × 0.25 × 0.5)
  assert.equal(arcanumBoost(3, { chance: 50, factor: 2, superCrit: { chance: 25, factor: 4 } }, 2), 3 * 2 * 2 * 1.5);
});

test("a cooldown restarts the moment it runs out, whatever the arcanum is doing", () => {
  const timers = {}, active = [{ id: "ricochetShot" as const, turns: 3 }];
  assert.deepEqual([tickCooldowns(active, timers), tickCooldowns(active, timers), tickCooldowns(active, timers), tickCooldowns(active, timers)], [[], [], ["ricochetShot"], []]);
});

test("a run holds what is owned, in either mode, none in the forest", () => {
  const g = game();
  g.save.arcana.owned.ricochetShot = [1, 0, 2];
  g.newRun({ outside: true });
  assert.deepEqual(g.arcana.held, []);
  g.newRun();
  assert.deepEqual(g.arcana.held, [{ id: "ricochetShot", levels: [1, 0, 2], lent: false }]);
  assert.deepEqual(g.arcana.ricochet(), { boost: 3, rebounds: 1, chance: 8 });
  g.save.delve.run = null;
  g.switchMode("delve");
  assert.equal(g.arcana.held.length, 1);
});

test("toggling: forty a run, off stops it and forgets its cooldown, undo gives none back, a new run gives them all", () => {
  const g = game();
  g.save.arcana.owned.ricochetShot = [0, 0, 0];
  g.newRun();
  g.save.tower.runArcana.timers.ricochetShot = 2;
  assert.equal(g.arcana.toggle("ricochetShot"), true);
  assert.equal(g.arcana.isOn("ricochetShot"), false);
  assert.equal(g.arcana.ricochet(), undefined);
  assert.deepEqual(g.save.tower.runArcana.timers, {});
  for (let i = 1; i < 40; i++) assert.equal(g.arcana.toggle("ricochetShot"), true);
  assert.equal(g.arcana.togglesLeft, 0);
  assert.equal(g.arcana.toggle("ricochetShot"), false);
  g.newRun();
  assert.equal(g.arcana.togglesLeft, 40);
  assert.equal(g.arcana.isOn("ricochetShot"), true);
});

// --- Ricochet Shot in the volley ---

const foe = (hp: number, defense = 0): Enemy => ({ strength: "normal", name: "Foe", hp, attack: 0, defense, tier: 1 } as Enemy);
function stubBoard(tiles: Record<string, Tile>, list = true) {
  const at = (x: number, y: number): Tile => tiles[`${x},${y}`] ?? { kind: "floor" };
  return {
    tiles,
    tile: at,
    clear(x: number, y: number) { delete tiles[`${x},${y}`]; },
    wound(x: number, y: number, damage: number) {
      const t = at(x, y);
      tiles[`${x},${y}`] = { ...t, enemy: { ...t.enemy!, hp: t.enemy!.hp - damage }, wound: (t.wound ?? 0) + damage };
    },
    ...(list ? { floorEnemies: () => Object.keys(tiles).map((k) => { const [x, y] = k.split(",").map(Number); return { x: x!, y: y! }; }) } : {}),
  } as unknown as VolleyTurn["board"] & { tiles: Record<string, Tile> };
}
const hero = (attack = 10): Player => ({ x: 5, y: 5, hp: 100, maxHp: 100, attack, defense: 0, keys: {} } as unknown as Player);
function shootOnce(board: VolleyTurn["board"], ricochet: VolleyTurn["ricochet"], seed = 1, shooter = hero()) {
  return volleyTurn({ board, wrap: 0, floorOf: () => 1, hero: shooter, seed, volleys: { turn: 1 }, archer: true, ranks: defaults(), ...(ricochet ? { ricochet } : {}) });
}
const SURE = { boost: 3, rebounds: 2, chance: 100 };

test("a ricochet springs to the closest other enemies, however far, at Arcanum Damage less DEF", () => {
  const board = stubBoard({ "6,5": { kind: "enemy", enemy: foe(1000) }, "6,8": { kind: "enemy", enemy: foe(100, 5) }, "6,7": { kind: "enemy", enemy: foe(100) }, "6,50": { kind: "enemy", enemy: foe(100) } });
  const out = shootOnce(board, SURE), bounced = out.shots.filter((s) => s.ricochet);
  assert.ok(out.shots.filter((s) => !s.ricochet).length >= 1);
  const first = bounced.slice(0, 2);
  assert.deepEqual(first.map((s) => [s.from, s.to, s.damage]), [[{ x: 6, y: 5 }, { x: 6, y: 7 }, 30], [{ x: 6, y: 5 }, { x: 6, y: 8 }, 25]]);
  assert.equal(board.tiles["6,50"]!.enemy!.hp, 100, "only as many as its rebounds, closest first");
});

test("a ricochet never sets off another: each springs from the enemy the arrow struck", () => {
  const board = stubBoard({ "6,5": { kind: "enemy", enemy: foe(1000) }, "6,7": { kind: "enemy", enemy: foe(1000) }, "6,9": { kind: "enemy", enemy: foe(1000) }, "6,11": { kind: "enemy", enemy: foe(1000) } });
  const bounced = shootOnce(board, { boost: 1, rebounds: 1, chance: 100 }).shots.filter((s) => s.ricochet);
  assert.deepEqual(bounced.map((s) => [s.from, s.to]), [[{ x: 6, y: 5 }, { x: 6, y: 7 }]]);
  assert.equal(board.tiles["6,9"]!.wound, undefined);
});

test("a ricochet that fells its target pays as a kill, and shows it until it lands", () => {
  const board = stubBoard({ "6,5": { kind: "enemy", enemy: foe(1000) }, "6,7": { kind: "enemy", enemy: foe(30) } });
  const out = shootOnce(board, SURE), kill = out.kills.find((k) => k.ricochet);
  assert.deepEqual(kill?.at, { x: 6, y: 7 });
  assert.equal(board.tiles["6,7"], undefined);
  assert.ok(out.shots.find((s) => s.ricochet)?.fell);
});

test("it triggers on a hit that does no damage, and not at 0% or with no other enemy", () => {
  // Armor Break aims an arrow at an enemy it can't hurt.
  const armored = stubBoard({ "6,5": { kind: "enemy", enemy: foe(100, 1000) }, "6,50": { kind: "enemy", enemy: foe(100) } });
  const out = shootOnce(armored, SURE, 1, { ...hero(), armorBreak: 1 });
  assert.equal(out.shots.find((s) => !s.ricochet)?.damage, 0);
  assert.deepEqual(out.shots.filter((s) => s.ricochet).map((s) => s.damage), [30]);
  assert.equal(shootOnce(stubBoard({ "6,5": { kind: "enemy", enemy: foe(1000) }, "6,7": { kind: "enemy", enemy: foe(100) } }), { ...SURE, chance: 0 }).shots.filter((s) => s.ricochet).length, 0);
  assert.equal(shootOnce(stubBoard({ "6,5": { kind: "enemy", enemy: foe(1000) } }), SURE).shots.filter((s) => s.ricochet).length, 0);
});

test("its chance is near what it says, and each roll fixed", () => {
  let fired = 0;
  const rounds = 2000;
  for (let seed = 0; seed < rounds; seed++) {
    const out = shootOnce(stubBoard({ "6,5": { kind: "enemy", enemy: foe(1e9) }, "6,7": { kind: "enemy", enemy: foe(1e9) } }), { boost: 1, rebounds: 1, chance: 25 }, seed);
    if (out.shots.some((s) => s.ricochet)) fired++;
    const again = shootOnce(stubBoard({ "6,5": { kind: "enemy", enemy: foe(1e9) }, "6,7": { kind: "enemy", enemy: foe(1e9) } }), { boost: 1, rebounds: 1, chance: 25 }, seed);
    assert.equal(out.shots.length, again.shots.length);
  }
  assert.ok(Math.abs(fired / rounds - 0.25) < 0.05, String(fired));
});

test("without Ricochet Shot a volley is untouched", () => {
  const out = shootOnce(stubBoard({ "6,5": { kind: "enemy", enemy: foe(1000) }, "6,7": { kind: "enemy", enemy: foe(100) } }), undefined);
  assert.equal(out.shots.some((s) => s.ricochet), false);
});

test("its line strikes as the arrow lands and flashes 0.1s", () => {
  const shot = { by: "hero" as const, from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, damage: 1, tick: 50 };
  const volley = { at: 1000, ms: 200, shots: [shot, { ...shot, ricochet: true as const }] };
  assert.equal(landsAt(volley, volley.shots[1]!), landsAt(volley, shot));
  assert.equal(leavesAt(volley, volley.shots[1]!), landsAt(volley, shot));
  assert.equal(volleyOver(volley, landsAt(volley, shot) + 99), false);
  assert.equal(volleyOver(volley, landsAt(volley, shot) + 100), true);
});

// --- The Shrine boon ---

const shrineGame = () => {
  const g = game();
  g.save.archives.levels.unlockShrines = 1;
  g.newRun();
  const run = g.run as { maxHeight: number; shrine?: unknown };
  run.maxHeight = 200;
  return g;
};
const offering = (g: Game) => {
  const run = g.run as { shrine?: unknown };
  run.shrine = { picked: [], rolls: 0, offer: ["unlockArcanum", "attack"] };
};

test("the boon offers only while an arcanum is left to lend", () => {
  assert.equal(boon("unlockArcanum").kind, "spell");
  const owner = (owned: object) => ({ ...defaults(), arcana: { owned } });
  const offered = (owned: object) => {
    const seen = new Set<string>(), o = owner(owned);
    for (let seed = 0; seed < 300; seed++) for (const id of rollOffer(seed, { picked: [], rolls: 0 }, o)) seen.add(id);
    return seen.has("unlockArcanum");
  };
  assert.equal(offered({}), true);
  assert.equal(offered({ ricochetShot: [0, 0, 0] }), false);
  assert.ok(BOON_IDS.includes("unlockArcanum"));
});

test("picking it asks which arcanum; taken, it lasts the climb at first levels and costs nothing", () => {
  const g = shrineGame();
  offering(g);
  assert.equal(g.shrine.pick("unlockArcanum"), true);
  assert.deepEqual(g.shrine.choosing, ["ricochetShot"]);
  assert.ok(g.shrine.unspent >= 1, "the choice waits like a boon");
  assert.deepEqual(g.shrine.offer(), [], "no other offer until it is chosen");
  assert.deepEqual(g.arcana.held, []);
  assert.equal(g.shrine.choose("ricochetShot"), true);
  assert.deepEqual(g.shrine.arcana, ["ricochetShot"]);
  assert.deepEqual(g.arcana.held, [{ id: "ricochetShot", levels: [0, 0, 0], lent: true }]);
  assert.deepEqual(g.save.arcana.owned, {}, "lent, not bought");
  g.newRun({ outside: true });
  assert.deepEqual(g.arcana.held, []);
});

test("Auto Pick takes the arcanum's first option too", () => {
  const g = shrineGame();
  g.save.archives.levels.autoPickBoons = 1;
  g.save.shrines.autoPick = true;
  g.shrine.autoPick();
  offering(g);
  g.shrine.pick("unlockArcanum");
  assert.deepEqual(g.shrine.arcana, ["ricochetShot"]);
  assert.deepEqual(g.shrine.choosing, []);
});
