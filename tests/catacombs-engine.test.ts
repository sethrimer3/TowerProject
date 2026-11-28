// The Catacombs' engine (src/catacombs/, docs/CATACOMBS.md): halls, spawns,
// strengths, the deep halls, turns, Magic levels, the clock and the save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { random, withStream } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { exportProfile, importProfile } from "../src/profile-file.ts";
import { seedAll } from "./catacombs-seed.ts";
import {
  BANK_GAP_MS, catacombTurn, CORRIDOR_ROW, decodeCatacombs, deepFactors, defaultCatacombs, enterCatacomb, hallCell, hallStrength,
  hallTargets, magician, ingotAmount, loreOnTile, magicLevel, movePoint, mxpForLevel, mxpToNext, newCarry, noPoints, pointsEarned,
  rollSlots, runTurns, setHaste, SIDE_TILES, SLOT_XS, spawnOdds, startRun, tick, undeadRewards, undeadStats, offlineSeconds, UNDEAD,
  type CatacombSave, type Slot,
} from "../src/catacombs/index.ts";

const fresh = (number = 1, seed = 7): CatacombSave => {
  const c = defaultCatacombs();
  seedAll(c, seed);
  enterCatacomb(c, number);
  return c;
};
const slot = (id: Slot["id"], strength: Slot["strength"] = "normal", hall = 1, number = 1): Slot => ({ id, strength, mhp: undeadStats(id, strength, hall, number).mhp });

test("a hall is a pinched corridor with the entrance, Lore and stairs on its middle row", () => {
  const row = Array.from({ length: 17 }, (_, x) => hallCell(1, x, CORRIDOR_ROW));
  assert.deepEqual(row, ["entrance", "floor", "slot", "floor", "slot", "floor", "slot", "floor", "lore", "floor", "slot", "floor", "slot", "floor", "slot", "floor", "stairs"]);
  for (const x of SLOT_XS) {
    assert.equal(hallCell(1, x, CORRIDOR_ROW - 1), "wall");
    assert.equal(hallCell(1, x, CORRIDOR_ROW + 1), "wall");
  }
  assert.equal(hallCell(1, 1, CORRIDOR_ROW - 1), "floor");
  for (let y = 0; y < 17; y++) if (y < 7 || y > 9) for (let x = 0; x < 17; x++) assert.equal(hallCell(1, x, y), "wall");
});

test("treasure rooms open by hall, each reachable from the corridor's middle", () => {
  const ingotsOn = (hall: number) => ["brass", "iron", "steel", "nickel"].filter((i) => Array.from({ length: 17 * 17 }, (_, k) => hallCell(hall, k % 17, Math.floor(k / 17))).includes(i as never));
  assert.deepEqual(ingotsOn(1), []);
  assert.deepEqual(ingotsOn(5), ["brass"]);
  assert.deepEqual(ingotsOn(10), ["brass", "iron"]);
  assert.deepEqual(ingotsOn(15), ["brass", "steel"]);
  assert.deepEqual(ingotsOn(20), ["brass", "iron", "nickel"]);
  assert.deepEqual(ingotsOn(60), ["brass", "iron", "steel", "nickel"]);
  // Each room's torch stands inside it, on its far edge; every hall has one up and right of the Lore.
  assert.equal(hallCell(5, 8, 3), "torch");
  assert.equal(hallCell(10, 8, 13), "torch");
  assert.equal(hallCell(15, 2, 4), "torch");
  assert.equal(hallCell(20, 2, 12), "torch");
  assert.equal(hallCell(5, 8, 2), "wall");
  for (const hall of [1, 5, 60]) assert.equal(hallCell(hall, 9, 7), "torch");
  assert.ok(!SIDE_TILES.some(([x, y]) => x === 9 && y === 7), "no potion lies on the Lore's torch");
  // Walking only the corridor's middle and the rooms, every Ingot is in reach.
  const open = (x: number, y: number) => { const k = hallCell(60, x, y); return k !== "wall" && k !== "torch" && k !== "slot"; };
  const seen = new Set<string>(), todo: [number, number][] = [[8, 8]];
  while (todo.length) {
    const [x, y] = todo.pop()!, key = `${x},${y}`;
    if (seen.has(key) || !open(x, y)) continue;
    seen.add(key);
    todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (const p of ["8,4", "8,12", "3,4", "3,12"]) assert.ok(seen.has(p), p);
});

test("an Ingot holds its nth room in the run times the number", () => {
  assert.equal(ingotAmount("brass", 5, 1), 1);
  assert.equal(ingotAmount("brass", 15, 1), 3);
  assert.equal(ingotAmount("iron", 30, 4), 12);
  assert.equal(ingotAmount("steel", 45, 2), 6);
  assert.equal(ingotAmount("nickel", 20, 9), 9);
});

test("targets run E1 to E3, Lore, the Ingots, E4 to E6, stairs, empty slots left out", () => {
  const slots = [slot("wisp"), null, slot("ghost"), null, null, slot("wisp")];
  assert.deepEqual(hallTargets(60, 2, slots).map((t) => t.kind === "enemy" ? `E${t.slot + 1}` : t.kind === "ingot" ? t.ingot : t.kind),
    ["E1", "E3", "lore", "brass", "steel", "iron", "nickel", "E6", "stairs"]);
  assert.equal(loreOnTile(1), 1);
  assert.equal(loreOnTile(3), 3.1);
});

test("Strong every 5th hall, Elite every 10th, a Boss every 25th, the Boss first", () => {
  assert.deepEqual([1, 5, 10, 15, 20, 25, 30, 50, 75, 100].map(hallStrength),
    [null, "strong", "elite", "strong", "elite", "boss", "elite", "boss", "boss", "boss"]);
});

test("the deep halls compound from the hall after each", () => {
  assert.deepEqual(deepFactors(400), { mhp: 1, mdef: 1 });
  assert.deepEqual(deepFactors(401), { mhp: 2, mdef: 1.5 });
  assert.deepEqual(deepFactors(601), { mhp: 4, mdef: 1.5 });
  const at1201 = deepFactors(1201);
  assert.equal(at1201.mhp, 64);
  assert.ok(Math.abs(at1201.mdef - 7.59375) < 1e-9);
  const past = deepFactors(2001);
  assert.equal(past.mhp, 1024);
  assert.ok(Math.abs(past.mdef - 38.443359375) < 1e-9);
});

test("an enemy's stats: base × the number's factor × strength × the deep halls", () => {
  assert.deepEqual(undeadStats("wisp", "normal", 1, 1), { mhp: 100, matk: 10, mdef: 0 });
  assert.deepEqual(undeadStats("ghost", "normal", 1, 2), { mhp: 1250, matk: 50, mdef: 25 });
  assert.deepEqual(undeadStats("ghost", "strong", 1, 1), { mhp: 312.5, matk: 12.5, mdef: 6.25 });
  assert.deepEqual(undeadStats("wisp", "boss", 1, 1), { mhp: 350, matk: 13, mdef: 0 });
  assert.deepEqual(undeadStats("ghost", "normal", 401, 1), { mhp: 500, matk: 10, mdef: 7.5 });
  assert.deepEqual(undeadRewards("ghost", "elite"), { mxp: 12, rarity: "uncommon", spirit: 4 });
});

test("spawn odds follow the designer's table by hall, each type from its first hall", () => {
  assert.deepEqual(spawnOdds(1), [{ id: "wisp", percent: 28.57 }, { id: "ghost", percent: 14.29 }]);
  assert.deepEqual(spawnOdds(10).map((o) => o.id), ["wisp", "ghost"]);
  assert.deepEqual(spawnOdds(11).map((o) => o.percent), [25.4, 12.7, 11.11]);
  assert.deepEqual(spawnOdds(24).map((o) => o.percent), [25.52, 10.94, 12.5]);
  assert.deepEqual(spawnOdds(25).map((o) => o.id), ["wisp", "ghost", "skeleton", "ghoul"]);
  assert.deepEqual(spawnOdds(49).map((o) => o.id), ["wisp", "ghost", "skeleton", "ghoul", "vampire"]);
  assert.equal(spawnOdds(80).map((o) => o.id).at(-1), "lich");
  assert.equal(spawnOdds(199).map((o) => o.id).at(-1), "lich");
  assert.equal(spawnOdds(200).map((o) => o.percent).at(-1), 2);
  assert.deepEqual(spawnOdds(5000).map((o) => o.percent), [13.5, 8.1, 9.72, 11.67, 14, 9.33, 6.67]);
  // Each type's first hall is where the table first gives it odds.
  for (const o of spawnOdds(600)) {
    const from = UNDEAD[o.id].from!;
    assert.ok(spawnOdds(from).some((p) => p.id === o.id) && !spawnOdds(from - 1).some((p) => p.id === o.id), o.id);
  }
});

test("set halls stand as the table says, lowest rarity first, the last at the hall's strength, drawing nothing", () => {
  const none = () => { throw new Error("a set hall draws"); };
  const ids = (hall: number) => rollSlots(hall, 1, none).map((s) => s!.id);
  assert.deepEqual(ids(45), Array(6).fill("wisp"));
  assert.deepEqual(ids(140), ["ghost", "ghost", "ghost", "ghost", "ghost", "vampire"]);
  assert.deepEqual(ids(195), ["wisp", "ghost", "ghost", "skeleton", "skeleton", "lich"]);
  assert.deepEqual(ids(395), ["ghost", "skeleton", "ghoul", "vampire", "lich", "demon"]);
  assert.deepEqual(ids(595), Array(6).fill("demon"));
  assert.deepEqual(rollSlots(100, 1, none).map((s) => s!.strength), ["normal", "normal", "normal", "normal", "normal", "boss"]);
  assert.equal(rollSlots(140, 1, none)[5]!.strength, "elite");
});

test("spawns roll each slot at the hall's odds, a lone Wisp when none roll", () => {
  const counts = { wisp: 0, ghost: 0, empty: 0 }, rng = random(99);
  const n = 4000;
  for (let i = 0; i < n; i++) for (const s of rollSlots(1, 1, rng).slice(0, 5)) counts[s ? s.id as "wisp" | "ghost" : "empty"]++;
  assert.ok(Math.abs(counts.wisp / (n * 5) - 0.2857) < 0.02, `wisp ${counts.wisp}`);
  assert.ok(Math.abs(counts.ghost / (n * 5) - 0.1429) < 0.02, `ghost ${counts.ghost}`);
  // Every hall has an enemy; a ranked hall's last slot is always one of its strength.
  for (let i = 0; i < 500; i++) {
    assert.ok(rollSlots(1, 1, rng).some((s) => s));
    assert.equal(rollSlots(25, 1, rng)[5]!.strength, "boss");
  }
  const none = rollSlots(1, 1, () => 0.99);
  assert.deepEqual(none.map((s) => s?.id ?? null), [null, null, null, null, null, "wisp"]);
});

test("the saved spawn stream carries on where it stopped and is seeded once", () => {
  const a = fresh(1, 123), b = fresh(1, 123);
  assert.deepEqual(a.run, b.run);
  assert.notEqual(a.rng.spawns, 123);
  const c = defaultCatacombs();
  withStream("catacombs", random(5), () => enterCatacomb(c, 1));
  const d = defaultCatacombs();
  withStream("catacombs", random(5), () => enterCatacomb(d, 1));
  assert.deepEqual(c, d);
});

test("entering: the same number keeps the run, another starts at Hall 1 there", () => {
  const c = fresh(2);
  c.run!.hall = 37;
  assert.equal(enterCatacomb(c, 2).hall, 37);
  assert.equal(enterCatacomb(c, 3).hall, 1);
  assert.equal(c.number, 3);
});

test("a turn dashes, then fights rounds with the hero striking first", () => {
  const c = fresh();
  c.run!.slots = [slot("wisp"), null, null, null, null, null];
  assert.deepEqual(catacombTurn(c), { kind: "dash", x: 1, y: 8 });
  // 10 MAtk into a Wisp's 100 MHP: ten rounds, the last unanswered.
  const round = { kind: "round", slot: 0, heroHit: 10, crit: false, strikes: 1 };
  for (let i = 0; i < 9; i++) assert.deepEqual(catacombTurn(c), { ...round, enemyHit: 10, killed: false });
  // The last round says what the Wisp paid, for the board's drops.
  assert.deepEqual(catacombTurn(c), { ...round, enemyHit: 0, killed: true, paid: { mxp: 1, spirit: 1, rarity: "common", mhp: 0 } });
  assert.equal(c.run!.hero.mhp, 910);
  assert.equal(c.mxp, 1);
  assert.equal(c.spirit.common, 1);
  const lore = catacombTurn(c);
  assert.equal(lore?.kind, "pickup");
  assert.deepEqual(c.run!.hero, { x: 8, y: 8, mhp: 910 });
  assert.deepEqual(catacombTurn(c), { kind: "descend", hall: 2 });
  assert.deepEqual(c.run!.hero, { x: 0, y: 8, mhp: 910 });
  assert.equal(c.best[1], 2);
});

test("Ingots are taken after E3, one turn each", () => {
  const c = fresh(3);
  c.run!.hall = 20;
  c.run!.slots = [null, null, null, null, null, null];
  const kinds = Array.from({ length: 5 }, () => { const e = catacombTurn(c)!; return e.kind === "pickup" ? (e.target.kind === "ingot" ? e.target.ingot : "lore") : e.kind; });
  assert.deepEqual(kinds, ["lore", "brass", "iron", "nickel", "descend"]);
  assert.deepEqual(c.ingots, { brass: 12, iron: 6, steel: 0, nickel: 3 });
});

test("an invincible enemy fights on until the hero falls, then a restart keeps what was earned", () => {
  const c = fresh();
  c.mxp = 5;
  c.spirit.rare = 2;
  c.run!.hall = 30;
  c.run!.slots = [slot("skeleton", "normal", 30), null, null, null, null, null];
  catacombTurn(c);
  let rounds = 0;
  while (!c.run!.fell) { const e = catacombTurn(c)!; assert.equal(e.kind, "round"); assert.equal((e as { heroHit: number }).heroHit, 0); rounds++; }
  assert.equal(rounds, 100);
  assert.deepEqual(catacombTurn(c), { kind: "restart", stalemate: false });
  assert.equal(c.run!.hall, 1);
  assert.equal(c.run!.hero.mhp, 1000);
  assert.equal(c.mxp, 5);
  assert.equal(c.spirit.rare, 2);
  assert.equal(c.number, 1);
});

test("when neither side can hurt the other the run restarts that same turn", () => {
  // Nothing raises MDef yet, so an undead without MAtk stands in.
  const matk = UNDEAD.skeleton.matk;
  UNDEAD.skeleton.matk = 0;
  try {
    const c = fresh();
    c.run!.hall = 30;
    c.run!.slots = [slot("skeleton", "normal", 30), null, null, null, null, null];
    catacombTurn(c);
    assert.deepEqual(catacombTurn(c), { kind: "restart", stalemate: true });
    assert.equal(c.run!.hall, 1);
  } finally { UNDEAD.skeleton.matk = matk; }
});

test("Magic levels: 200 × 1.2^(level − 1) MXP each, a point a level", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(mxpToNext), [200, 240, 288, 346, 415]);
  assert.equal(mxpForLevel(1), 0);
  assert.equal(mxpForLevel(2), 200);
  assert.equal(mxpForLevel(3), 440);
  assert.equal(magicLevel(0), 1);
  assert.equal(magicLevel(199), 1);
  assert.equal(magicLevel(200), 2);
  assert.equal(magicLevel(439), 2);
  assert.equal(magicLevel(440), 3);
  assert.equal(pointsEarned(440), 2);
});

test("points move freely within those earned and each skill's cap, and apply on the next turn", () => {
  const c = fresh();
  assert.equal(movePoint(c, "might", 1), false);
  c.mxp = mxpForLevel(3);
  assert.equal(movePoint(c, "might", 1), true);
  assert.equal(movePoint(c, "weaving", 1), true);
  assert.equal(movePoint(c, "focus", 1), false);
  assert.equal(movePoint(c, "focus", -1), false);
  const m = magician(c);
  assert.deepEqual({ mhp: m.mhp, matk: m.matk, mdef: m.mdef }, { mhp: 1050, matk: 11.11, mdef: 0 });
  // Weaving's 1% MCrit chance out, so the hit is plain.
  movePoint(c, "weaving", -1);
  c.run!.slots = [slot("wisp"), null, null, null, null, null];
  catacombTurn(c);
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 11.11);
  // MHP above the new maximum is capped; a point put back heals nothing.
  c.run!.hero.mhp = 1020;
  catacombTurn(c);
  assert.equal(c.run!.hero.mhp, 990);
  // A skill takes no more than its cap.
  c.mxp = mxpForLevel(80);
  c.points = noPoints();
  for (let i = 0; i < 30; i++) movePoint(c, "fortune", 1);
  assert.equal(c.points.fortune, 25);
});

test("runTurns sums gains across several runs", () => {
  const c = fresh(1, 3);
  const { gains } = runTurns(c, 20_000);
  assert.equal(gains.turns, 20_000);
  assert.ok(gains.restarts >= 1, "the hero falls and starts over");
  assert.equal(gains.falls, gains.restarts);
  assert.equal(c.mxp, gains.mxp);
  const spirit = Object.values(gains.spirit).reduce((x, y) => x + y, 0);
  assert.ok(gains.kills >= 1 && spirit >= gains.kills, "each kill drops a Spirit or more");
  assert.deepEqual(c.spirit, gains.spirit);
  assert.ok(gains.lore >= gains.halls);
});

test("the clock: a turn a second, haste paid from the bank, gaps banked", () => {
  const c = defaultCatacombs(), carry = newCarry();
  assert.deepEqual(tick(c.clock, 1_000_000, carry), { real: 0, hasted: 0, banked: 0, slowed: false });
  assert.equal(tick(c.clock, 1_000_999, carry).real, 0);
  assert.equal(tick(c.clock, 1_001_000, carry).real, 1);
  assert.equal(tick(c.clock, 1_003_500, carry).real, 2);
  // A long gap banks its whole seconds, leaving the remainder to count on.
  assert.equal(offlineSeconds(c.clock, 1_003_000 + BANK_GAP_MS + 5_400), 15);
  assert.deepEqual(tick(c.clock, 1_003_000 + BANK_GAP_MS + 5_400, carry), { real: 0, hasted: 0, banked: 15, slowed: false });
  assert.equal(c.clock.bank, 15);
  // ×5: four hasted turns a second besides the real one.
  setHaste(c.clock, 5, carry);
  let now = 1_003_000 + BANK_GAP_MS + 5_400, real = 0, hasted = 0, slowed = false;
  for (let i = 0; i < 100 && !slowed; i++) { now += 100; const d = tick(c.clock, now, carry); real += d.real; hasted += d.hasted; slowed = d.slowed; }
  assert.equal(hasted, 15);
  assert.equal(c.clock.bank, 0);
  assert.equal(c.clock.haste, 1);
  assert.ok(real >= 3 && real <= 4, `real ${real}`);
  setHaste(c.clock, 100);
  assert.equal(c.clock.haste, 1, "no haste with nothing banked");
});

test("decoding keeps a good save and drops what doesn't fit", () => {
  const c = fresh(4, 11);
  c.mxp = mxpForLevel(4);
  c.points.might = 2;
  c.spirit.epic = 3;
  c.ingots.steel = 8;
  c.clock = { lastTurnAt: 123, bank: 45, haste: 10 };
  runTurns(c, 50);
  assert.deepEqual(decodeCatacombs(JSON.parse(JSON.stringify(c))), c);
  assert.deepEqual(decodeCatacombs(undefined), defaultCatacombs());
  const bad = JSON.parse(JSON.stringify(c));
  bad.run.target = 99;
  bad.number = 12;
  bad.clock.haste = 7;
  bad.points.might = 50;
  const d = decodeCatacombs(bad);
  assert.equal(d.run, null);
  assert.equal(d.number, 1);
  assert.equal(d.clock.haste, 1);
  assert.deepEqual(d.points, noPoints());
  startRun(d);
  assert.equal(d.run!.hall, 1);
});

test("the save keeps the Catacombs, and the profile file all of them but the run", () => {
  const save = defaults();
  enterCatacomb(save.catacombs, 2);
  save.catacombs.mxp = 300;
  save.catacombs.ingots.iron = 4;
  const back = decode(JSON.stringify(save));
  assert.deepEqual(back.catacombs, save.catacombs);
  const file = JSON.parse(exportProfile(save, 0));
  assert.equal(file.towers.catacombs.run, null);
  assert.equal(file.towers.catacombs.mxp, 300);
  const imported = importProfile(exportProfile(save, 0));
  assert.ok("save" in imported);
  assert.equal(imported.save.catacombs.run, null);
  assert.equal(imported.save.catacombs.ingots.iron, 4);
});
