// The Catacombs' Magic skills, drops, MCrits, crosshairs, potions, abilities
// and Spirit upgrades (src/catacombs/, docs/CATACOMBS.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITIES, abilityUnlocked, buyUpgrade, castAbility, catacombTurn, decodeCatacombs, defaultCatacombs, defeat, DROPS, enterCatacomb,
  enterHall, GOLD_CROSSHAIR_FACTOR, magician, mxpForLevel, noGains, POTION_MHP, rollDrops, rollTaps, SIDE_TILES, SPIRIT_UPGRADES,
  strikesNow, takePotion, tapCrosshair, undeadStats, upgradePrice, type CatacombSave, type Slot,
} from "../src/catacombs/index.ts";
import { seedAll } from "./catacombs-seed.ts";

const fresh = (seed = 7): CatacombSave => {
  const c = defaultCatacombs();
  seedAll(c, seed);
  enterCatacomb(c, 1);
  return c;
};
const slot = (id: Slot["id"], strength: Slot["strength"] = "normal", hall = 1): Slot => ({ id, strength, mhp: undeadStats(id, strength, hall, 1).mhp });
/** A hall of one undead on E1, the hero beside it. */
const besideOne = (c: CatacombSave, s: Slot) => {
  c.run!.slots = [s, null, null, null, null, null];
  c.run!.hero.x = 1;
};

test("the Magician: each skill's three effects, Magic ATK +1 under Might's percent", () => {
  const c = defaultCatacombs();
  assert.deepEqual(magician(c), {
    mhp: 1000, matk: 10, mdef: 0, critChance: 0, critFactor: 1.5, armorPen: 0, armorPenPercent: 0,
    spiritGain: 1, mxpGain: 1, drops: { mxp: 0, loot: 0, speed: 0, mhp: 0 }, goldCrosshair: 0,
  });
  c.points = { might: 10, weaving: 4, resonance: 5, focus: 2, fortune: 3 };
  c.upgrades.matk = 5;
  assert.deepEqual(magician(c), {
    mhp: 1200, matk: 27.5, mdef: 0, critChance: 10, critFactor: 1.8, armorPen: 10, armorPenPercent: 6,
    spiritGain: 1.2, mxpGain: 1.1, drops: { mxp: 1.2, loot: 2.1, speed: 1.4, mhp: 0.6 }, goldCrosshair: 1.5,
  });
});

test("drops roll as a hall is made, each amount whole within its range, and none at 0%", () => {
  const c = fresh();
  c.points.fortune = 25;
  c.mxp = mxpForLevel(30);
  const seen = { mxp: new Set<number>(), loot: new Set<number>(), speed: new Set<number>(), mhp: new Set<number>() };
  let rolled = 0;
  for (let hall = 2; hall < 400; hall++) {
    for (const s of enterHall(c, hall, 1000).slots) {
      if (!s?.drops) continue;
      for (const [d, v] of Object.entries(s.drops) as [keyof typeof DROPS, number][]) {
        assert.ok(Number.isInteger(v) && v >= DROPS[d].lo && v <= DROPS[d].hi, `${d} ${v}`);
        seen[d].add(v);
        rolled++;
      }
    }
  }
  assert.ok(rolled > 20, `rolled ${rolled}`);
  assert.deepEqual([...seen.mxp].sort(), [3, 4, 5]);
  assert.equal(rollDrops([slot("wisp")], { mxp: 0, loot: 0, speed: 0, mhp: 0 }, () => { throw new Error("no draw at 0%"); })[0]!.drops, undefined);
  assert.deepEqual(rollDrops([slot("wisp")], { mxp: 100, loot: 0, speed: 0, mhp: 100 }, () => 0.999)[0]!.drops, { mxp: 5, mhp: 100 });
});

test("a beaten undead pays its drops: MXP and Spirit factors, attacks at double speed, MHP up to the maximum", () => {
  const c = fresh(), gains = noGains();
  c.points = { might: 0, weaving: 0, resonance: 5, focus: 2, fortune: 0 };
  c.mxp = mxpForLevel(8);
  const mxp = c.mxp;
  c.run!.hero.mhp = 990;
  c.run!.slots[0] = { ...slot("ghost", "strong"), drops: { mxp: 4, loot: 3, speed: 50, mhp: 40 } };
  defeat(c, 0, gains);
  assert.equal(c.mxp, mxp + 26.4, "6 × 1.1 × 4");
  assert.equal(c.spirit.uncommon, 7.2, "2 × 1.2 × 3");
  assert.equal(c.speed, 50);
  assert.equal(gains.speed, 50);
  assert.equal(c.run!.hero.mhp, 1000);
  assert.equal(c.run!.slots[0], null);
});

test("attack speed: a Speed Drop's attacks strike twice a round, kept through a fall", () => {
  const c = fresh();
  c.speed = 2;
  besideOne(c, slot("ghost"));
  assert.equal(strikesNow(c), 2);
  const e = catacombTurn(c) as { heroHit: number; strikes: number };
  assert.deepEqual([e.heroHit, e.strikes], [10, 2]);
  assert.equal(c.speed, 1);
  c.run!.fell = true;
  catacombTurn(c);
  assert.equal(c.speed, 1);
  // Renewing Rush adds a strike more: attack speed adds.
  c.buffs.rush = 1;
  assert.equal(strikesNow(c), 3);
});

test("MCrits multiply MAtk before MDef, and Armor Penetration takes percent then flat from MDef", () => {
  const c = fresh();
  c.mxp = mxpForLevel(80);
  c.points.weaving = 50;
  c.points.fortune = 25;
  besideOne(c, slot("ghost"));
  // 100% MCrit: 10 × 1.5 − 5 MDef.
  const e = catacombTurn(c) as { heroHit: number; crit: boolean };
  assert.deepEqual([e.heroHit, e.crit], [10, true]);
  c.points = { might: 0, weaving: 0, resonance: 1, focus: 10, fortune: 0 };
  // MDef 5 × 70% − 2 = 1.5.
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 8.5);
});

test("crosshairs: rolled each turn on undead without one, a free hit when tapped, gold ×3", () => {
  const c = fresh(3);
  let turns = 0;
  while (!c.run!.slots.some((s) => s?.mark) && turns++ < 500) rollTaps(c);
  const i = c.run!.slots.findIndex((s) => s?.mark), s = c.run!.slots[i]!, before = s.mhp, at = { ...c.run!.hero };
  assert.equal(s.mark, "crosshair", "no gold without Fortune");
  const event = tapCrosshair(c, i)!;
  assert.equal(event.hit, Math.max(0, 10 - undeadStats(s.id, "normal", 1, 1).mdef));
  assert.equal(s.mhp, before - event.hit);
  assert.equal(s.mark, undefined);
  assert.deepEqual(c.run!.hero, at, "a tap is no turn");
  assert.equal(tapCrosshair(c, i), null, "spent");
  const g = fresh();
  g.run!.slots[0] = { ...slot("wisp"), mark: "gold" };
  const gold = tapCrosshair(g, 0)!;
  assert.deepEqual([gold.hit, gold.gold], [10 * GOLD_CROSSHAIR_FACTOR, true]);
  // Fortune makes some gold.
  const f = fresh(5);
  f.mxp = mxpForLevel(30);
  f.points.fortune = 25;
  let golds = 0;
  for (let k = 0; k < 4000; k++) {
    for (const s of f.run!.slots) if (s) delete s.mark;
    rollTaps(f);
    golds += f.run!.slots.filter((s) => s?.mark === "gold").length;
  }
  assert.ok(golds > 0, "gold crosshairs at 12.5%");
});

test("a crosshair that beats the undead being fought sends the hero on next turn", () => {
  const c = fresh();
  c.run!.slots = [{ ...slot("wisp"), mhp: 5, mark: "crosshair" }, slot("wisp"), null, null, null, null];
  c.run!.hero.x = 1;
  assert.equal(tapCrosshair(c, 0)!.killed, true);
  assert.equal(c.mxp, 1);
  assert.deepEqual(catacombTurn(c), { kind: "dash", x: 3, y: 8 });
});

test("potions lie on free side tiles, restore 10 MHP when tapped, and are lost with the hall", () => {
  const c = fresh(11);
  for (let k = 0; k < 2000 && c.run!.potions.length < 3; k++) rollTaps(c);
  assert.equal(c.run!.potions.length, 3);
  for (const [x, y] of c.run!.potions) assert.ok(SIDE_TILES.some(([sx, sy]) => sx === x && sy === y), `${x},${y}`);
  assert.equal(new Set(c.run!.potions.map((p) => p.join())).size, 3);
  const [x, y] = c.run!.potions[0]!;
  c.run!.hero.mhp = 980;
  assert.deepEqual(takePotion(c, x, y), { kind: "potion", x, y, mhp: POTION_MHP });
  assert.equal(c.run!.hero.mhp, 980 + POTION_MHP);
  assert.equal(c.run!.potions.length, 2);
  assert.equal(takePotion(c, 8, 8), null);
  c.run!.hero.mhp = 999;
  takePotion(c, ...c.run!.potions[0]!);
  assert.equal(c.run!.hero.mhp, 1000, "never past the maximum");
  c.run!.slots = [null, null, null, null, null, null];
  c.run!.target = 1;
  catacombTurn(c);
  assert.equal(c.run!.hall, 2);
  assert.ok(c.run!.potions.length <= 1, "a new hall starts with none but this turn's");
});

test("abilities: locked until bought, a charge spent and back after its cooldown, Auto casts when ready", () => {
  const c = fresh();
  assert.equal(castAbility(c, "surge"), false, "locked");
  c.upgrades.unlock = 1;
  assert.ok(abilityUnlocked(c, "surge") && !abilityUnlocked(c, "rush"));
  assert.equal(castAbility(c, "surge"), true);
  assert.deepEqual(c.abilities.surge, { charges: 0, cooldown: 60, auto: false });
  assert.equal(c.buffs.surge, 5);
  assert.equal(castAbility(c, "surge"), false, "no charge");
  for (let i = 0; i < 59; i++) catacombTurn(c);
  assert.equal(c.abilities.surge.cooldown, 1);
  catacombTurn(c);
  assert.deepEqual(c.abilities.surge, { charges: 1, cooldown: 0, auto: false });
  c.abilities.surge.auto = true;
  c.buffs.surge = 0;
  catacombTurn(c);
  assert.equal(c.abilities.surge.charges, 0, "cast by itself");
  assert.equal(c.abilities.surge.cooldown, 60);
});

test("Spell Surge: +20% MAtk and +100% MCrit damage for 5 attacks", () => {
  const c = fresh();
  c.upgrades.unlock = 1;
  besideOne(c, slot("ghost"));
  castAbility(c, "surge");
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 12 - 5);
  assert.equal(c.buffs.surge, 4);
  c.mxp = mxpForLevel(80);
  c.points.weaving = 50;
  c.points.fortune = 25;
  // 100% MCrit: 12 × (1.5 + 1) − 5.
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 25);
  for (let i = 0; i < 3; i++) catacombTurn(c);
  assert.equal(c.buffs.surge, 0);
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 10, "back to plain: 10 × 1.5 − 5");
});

test("Renewing Rush: 50 MHP on cast, never past the maximum, and a strike more for 5 attacks", () => {
  const c = fresh();
  c.upgrades.unlock = 2;
  c.run!.hero.mhp = 900;
  castAbility(c, "rush");
  assert.equal(c.run!.hero.mhp, 950);
  besideOne(c, slot("ghost"));
  assert.equal((catacombTurn(c) as { strikes: number }).strikes, 2);
  c.abilities.rush.charges = 1;
  c.run!.hero.mhp = 990;
  castAbility(c, "rush");
  assert.equal(c.run!.hero.mhp, 1000);
});

test("Arcane Barrage: every undead also takes 20% MAtk for 5 attacks, and the beaten pay", () => {
  const c = fresh();
  c.upgrades.unlock = 3;
  c.run!.slots = [slot("ghost"), slot("wisp"), null, null, { ...slot("wisp"), mhp: 2 }, null];
  c.run!.hero.x = 1;
  castAbility(c, "barrage");
  const e = catacombTurn(c) as { heroHit: number; barrage: { slot: number; hit: number; killed: boolean }[] };
  // The target: 10 − 5, then the barrage's 2 − 5 MDef, nothing.
  assert.equal(e.heroHit, 5);
  assert.deepEqual(e.barrage, [{ slot: 1, hit: 2, killed: false }, { slot: 4, hit: 2, killed: true }]);
  assert.equal(c.run!.slots[1]!.mhp, 98);
  assert.equal(c.run!.slots[4], null);
  assert.equal(c.spirit.common, 1);
  assert.equal(c.buffs.barrage, 4);
});

test("Spirit upgrades: Unlock Ability in three rarities, Magic ATK +1 in 25 levels", () => {
  const c = defaultCatacombs();
  assert.deepEqual(SPIRIT_UPGRADES.unlock.prices.map((p) => `${p.amount} ${p.rarity}`), ["10 uncommon", "75 rare", "150 epic"]);
  assert.equal(SPIRIT_UPGRADES.matk.prices.length, 25);
  assert.deepEqual(SPIRIT_UPGRADES.matk.prices.slice(0, 4).map((p) => p.amount), [50, 60, 72, 86]);
  assert.equal(buyUpgrade(c, "unlock"), false, "short");
  c.spirit.uncommon = 70;
  assert.equal(buyUpgrade(c, "unlock"), true);
  assert.equal(c.spirit.uncommon, 60);
  assert.ok(abilityUnlocked(c, "surge"));
  assert.deepEqual(upgradePrice(c, "unlock"), { rarity: "rare", amount: 75 });
  assert.equal(buyUpgrade(c, "matk"), true);
  assert.equal(magician(c).matk, 11);
  assert.deepEqual(upgradePrice(c, "matk"), { rarity: "uncommon", amount: 60 });
  c.upgrades.unlock = 3;
  assert.equal(upgradePrice(c, "unlock"), null, "maxed");
  assert.equal(ABILITIES.rush.cooldown, 120);
});

test("decoding keeps the drops, marks, potions, abilities, buffs and upgrades, and drops what doesn't fit", () => {
  const c = fresh();
  c.run!.slots[0] = { ...slot("wisp"), drops: { mxp: 4, speed: 77 }, mark: "gold" };
  c.run!.potions = [[1, 7], [15, 9]];
  c.speed = 12;
  c.upgrades = { unlock: 2, matk: 7 };
  c.abilities.rush = { charges: 0, cooldown: 33, auto: true };
  c.buffs.barrage = 3;
  c.mxp = 12.5;
  c.spirit.common = 3.75;
  assert.deepEqual(decodeCatacombs(JSON.parse(JSON.stringify(c))), c);
  const bad = JSON.parse(JSON.stringify(c));
  bad.run.slots[0].drops = { mxp: 9, speed: 77 };
  bad.run.slots[0].mark = "red";
  bad.run.potions = [[8, 8], [1, 7], [1, 7]];
  bad.upgrades = { unlock: 4, matk: 7 };
  bad.abilities.rush.cooldown = 500;
  const d = decodeCatacombs(bad);
  assert.deepEqual(d.run!.slots[0]!.drops, { speed: 77 });
  assert.equal(d.run!.slots[0]!.mark, undefined);
  assert.deepEqual(d.run!.potions, [[1, 7]]);
  assert.deepEqual(d.upgrades, { unlock: 0, matk: 7 });
  assert.equal(d.abilities.rush.cooldown, 0);
});
