// The Catacombs' Magic skills, drops, MCrits, crosshairs, potions, abilities
// and Spirit upgrades (src/catacombs/, docs/CATACOMBS.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITIES, abilityUnlocked, buyUpgrade, castAbility, catacombTurn, decodeCatacombs, defaultCatacombs, defeat, DROPS, enterCatacomb,
  enterHall, GOLD_CROSSHAIR_FACTOR, magician, mxpForLevel, noGains, POTION_MHP, rollDrops, rollTaps, SIDE_TILES, SPIRIT_UPGRADES,
  strikesNow, takePotion, tapCrosshair, undeadStats, upgradePrice, isUnlocked, pendingLesson, lootFactor, noUpgrades, UNLOCK_HALL, upgradeOpen,
  maxHall, abilityBrief, cooldownOf, type CatacombSave, type Slot,
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
    spiritGain: 1, mxpGain: 1, drops: { mxp: 0, loot: 0, speed: 0, mhp: 0 }, lootGain: 0, goldCrosshair: 0,
  });
  c.points = { might: 10, weaving: 4, resonance: 5, focus: 2, fortune: 3 };
  c.upgrades.matk = 5;
  assert.deepEqual(magician(c), {
    mhp: 1200, matk: 27.5, mdef: 0, critChance: 10, critFactor: 1.8, armorPen: 10, armorPenPercent: 6,
    spiritGain: 1.2, mxpGain: 1.1, drops: { mxp: 1.2, loot: 2.1, speed: 1.4, mhp: 0.6 }, lootGain: 0, goldCrosshair: 1.5,
  });
});

test("the Spirit upgrades' stats: MHP, MAtk, Pierce, MXP Gain, MCrits, Max MHP and its Drop, Loot Drop Gain", () => {
  const c = defaultCatacombs();
  c.upgrades = { ...noUpgrades(), mhp: 3, matk: 2, pierce: 4, mxp: 5, crit: 4, vitality: 2, matk2: 3, loot: 2 };
  const m = magician(c);
  // 1,000 + 3 × 10 + 2 × 20; 10 + 2 + 3 × 2.
  assert.deepEqual([m.mhp, m.matk, m.armorPen], [1070, 18, 4]);
  assert.deepEqual([m.critChance, m.critFactor, m.mxpGain, m.drops.mhp, m.lootGain], [1, 1.54, 1.1, 0.1, 0.6]);
  // A skill's MXP gain and MXP Gain's are different kinds: they multiply.
  c.mxp = mxpForLevel(30);
  c.points.focus = 2;
  assert.equal(magician(c).mxpGain, 1.21);
  // A Loot Drop's factor gains Loot Drop Gain on top of its amount; no Drop stays ×1.
  assert.deepEqual([lootFactor(m, 3), lootFactor(m, undefined)], [3.6, 1]);
  // Pierce takes MDef off the undead struck: a Ghost's 5 MDef, 4 of it pierced.
  const f = fresh();
  f.upgrades.pierce = 4;
  besideOne(f, slot("ghost"));
  assert.equal((catacombTurn(f) as { heroHit: number }).heroHit, 9);
  // A Loot Drop pays its amount and the gain: a Wisp's 1 Spirit × (2 + 0.6).
  const l = fresh();
  l.upgrades.loot = 2;
  l.run!.slots = [{ ...slot("wisp"), mhp: 1, drops: { loot: 2 } }, null, null, null, null, null];
  l.run!.hero.x = 1;
  catacombTurn(l);
  assert.equal(l.spirit.common, 2.6);
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

test("MCrits multiply what gets past MDef, and Armor Penetration takes percent then flat from MDef", () => {
  const c = fresh();
  c.mxp = mxpForLevel(80);
  c.points.weaving = 50;
  c.points.fortune = 25;
  besideOne(c, slot("ghost"));
  // 100% MCrit: (10 − 5 MDef) × 1.5.
  const e = catacombTurn(c) as { heroHit: number; crit: boolean };
  assert.deepEqual([e.heroHit, e.crit], [7.5, true]);
  c.points = { might: 0, weaving: 0, resonance: 1, focus: 10, fortune: 0 };
  // MDef 5 × 70% − 2 = 1.5.
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 8.5);
});

test("crosshairs: none before Zap, then rolled each turn on undead without one, a free hit when tapped, gold ×3", () => {
  const c = fresh(3);
  const seed = c.rng.crosshairs;
  for (let k = 0; k < 200; k++) rollTaps(c);
  assert.ok(!c.run!.slots.some((s) => s?.mark) && c.rng.crosshairs === seed, "no crosshair, nor a draw, before Zap");
  c.upgrades.unlock = 3;
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
  f.upgrades.unlock = 3;
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

test("potions: none before Spirit Potion, then they lie on free side tiles, restore 10 MHP when tapped, and are lost with the hall", () => {
  const c = fresh(11), seed = c.rng.potions;
  for (let k = 0; k < 200; k++) rollTaps(c);
  assert.deepEqual([c.run!.potions.length, c.rng.potions], [0, seed], "no potion, nor a draw, before Spirit Potion");
  c.upgrades.unlock = 1;
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
  c.upgrades.unlock = 1;
  assert.equal(castAbility(c, "surge"), false, "locked: the first unlock is Spirit Potion");
  c.upgrades.unlock = 2;
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
  c.upgrades.unlock = 2;
  besideOne(c, slot("ghost"));
  castAbility(c, "surge");
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 12 - 5);
  assert.equal(c.buffs.surge, 4);
  c.mxp = mxpForLevel(80);
  c.points.weaving = 50;
  c.points.fortune = 25;
  // 100% MCrit: (12 − 5) × (1.5 + 1).
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 17.5);
  for (let i = 0; i < 3; i++) catacombTurn(c);
  assert.equal(c.buffs.surge, 0);
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 7.5, "back to plain: (10 − 5) × 1.5");
});

test("Renewing Rush: 50 MHP on cast, never past the maximum, and a strike more for 5 attacks", () => {
  const c = fresh();
  c.upgrades.unlock = 4;
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

test("Arcane Barrage: every undead also takes 20% of a hit past its MDef for 5 attacks, and the beaten pay", () => {
  const c = fresh();
  c.upgrades.unlock = 5;
  c.run!.slots = [slot("ghost"), slot("wisp"), null, null, { ...slot("wisp"), mhp: 2 }, null];
  c.run!.hero.x = 1;
  castAbility(c, "barrage");
  const e = catacombTurn(c) as { heroHit: number; barrage: { slot: number; hit: number; killed: boolean }[] };
  // The target: 10 − 5, then the barrage's 20% of that.
  assert.equal(e.heroHit, 6);
  assert.deepEqual(e.barrage, [{ slot: 1, hit: 2, killed: false }, { slot: 4, hit: 2, killed: true, paid: { mxp: 1, spirit: 1, rarity: "common", mhp: 0 } }]);
  assert.equal(c.run!.slots[1]!.mhp, 98);
  assert.equal(c.run!.slots[4], null);
  assert.equal(c.spirit.common, 1);
  assert.equal(c.buffs.barrage, 4);
});

test("Spirit upgrades: Unlock Ability's five unlocks, the rest each in its rarity and levels", () => {
  const c = defaultCatacombs();
  assert.deepEqual(SPIRIT_UPGRADES.unlock.prices.map((p) => `${p.amount} ${p.rarity}`), ["10 common", "20 uncommon", "100 common", "75 rare", "150 epic"]);
  const levels = Object.fromEntries(Object.entries(SPIRIT_UPGRADES).map(([id, u]) => [id, `${u.prices.length} ${u.prices[0]!.rarity}`]));
  assert.deepEqual(levels, {
    unlock: "5 common", mhp: "35 common", matk: "25 uncommon", pierce: "25 uncommon", mxp: "25 uncommon",
    crit: "25 uncommon", vitality: "20 rare", matk2: "20 rare", loot: "10 rare", surge: "15 rare",
  });
  // Spell Surge's follows 600 × 1.2^(level − 1).
  assert.deepEqual(SPIRIT_UPGRADES.surge.prices.map((p) => p.amount), [600, 720, 864, 1037, 1244, 1493, 1792, 2150, 2580, 3096, 3715, 4458, 5350, 6420, 7704]);
  assert.equal(buyUpgrade(c, "unlock"), false, "short");
  c.spirit.common = 15;
  assert.equal(buyUpgrade(c, "unlock"), true);
  assert.equal(c.spirit.common, 5);
  assert.ok(isUnlocked(c, "potion") && !abilityUnlocked(c, "surge"));
  assert.deepEqual(upgradePrice(c, "unlock"), { rarity: "uncommon", amount: 20 });
  c.spirit.uncommon = 70;
  assert.equal(buyUpgrade(c, "matk"), true);
  assert.equal(magician(c).matk, 11);
  assert.deepEqual(upgradePrice(c, "matk"), { rarity: "uncommon", amount: 60 });
  c.upgrades.unlock = 5;
  assert.equal(upgradePrice(c, "unlock"), null, "maxed");
  assert.equal(ABILITIES.rush.cooldown, 120);
});

test("Spirit upgrades open by the deepest hall reached in any Catacomb, and can't be bought before", () => {
  assert.deepEqual(UNLOCK_HALL, { pierce: 5, mxp: 9, crit: 13, vitality: 17, matk2: 21, loot: 23, surge: 25 });
  const c = defaultCatacombs();
  c.spirit.uncommon = 1000;
  assert.equal(maxHall(c), 0);
  assert.ok(upgradeOpen(c, "unlock") && upgradeOpen(c, "mhp") && upgradeOpen(c, "matk") && !upgradeOpen(c, "pierce"));
  assert.equal(buyUpgrade(c, "pierce"), false, "locked");
  c.best = { 1: 4, 3: 5 };
  assert.equal(maxHall(c), 5);
  assert.ok(upgradeOpen(c, "pierce") && !upgradeOpen(c, "mxp"));
  assert.equal(buyUpgrade(c, "pierce"), true);
  // Reaching a hall records it.
  const f = fresh();
  f.run!.slots = [null, null, null, null, null, null];
  f.run!.target = 1;
  catacombTurn(f);
  assert.equal(maxHall(f), 2);
});

test("Spell Surge's upgrade: +2% to its MAtk and MCrit damage and a turn off its cooldown a level, Spell Surge alone", () => {
  const c = fresh();
  c.upgrades.unlock = 5;
  c.upgrades.surge = 5;
  assert.deepEqual([cooldownOf(c, "surge"), cooldownOf(c, "rush")], [55, 120]);
  assert.equal(abilityBrief(c, "surge"), "Next 5 attacks: +30% MAtk and +110% MCrit damage.");
  assert.equal(abilityBrief(c, "rush"), ABILITIES.rush.brief);
  besideOne(c, slot("ghost"));
  castAbility(c, "surge");
  assert.equal(c.abilities.surge.cooldown, 55);
  // 10 × 1.3 − 5.
  assert.equal((catacombTurn(c) as { heroHit: number }).heroHit, 8);
  assert.equal(magician(c).matk, 10, "the Magician's own MAtk is untouched");
});

test("Spirit Potion's and Zap's lessons wait once unlocked, one at a time, until dismissed", () => {
  const c = defaultCatacombs();
  assert.equal(pendingLesson(c), null);
  c.upgrades.unlock = 1;
  assert.equal(pendingLesson(c), "potion");
  c.upgrades.unlock = 3;
  assert.equal(pendingLesson(c), "potion", "the first unlocked first");
  c.taught.push("potion");
  assert.equal(pendingLesson(c), "zap");
  c.taught.push("zap");
  assert.equal(pendingLesson(c), null);
  assert.deepEqual(decodeCatacombs({ taught: ["zap", "surge", 3] }).taught, ["zap"]);
  assert.deepEqual([decodeCatacombs({ hideMaxed: true }).hideMaxed, decodeCatacombs({ hideMaxed: 1 }).hideMaxed], [true, false]);
});

test("decoding keeps the drops, marks, potions, abilities, buffs and upgrades, and drops what doesn't fit", () => {
  const c = fresh();
  c.run!.slots[0] = { ...slot("wisp"), drops: { mxp: 4, speed: 77 }, mark: "gold" };
  c.run!.potions = [[1, 7], [15, 9]];
  c.speed = 12;
  c.upgrades = { ...noUpgrades(), unlock: 2, matk: 7, loot: 3 };
  c.taught = ["potion"];
  c.abilities.rush = { charges: 0, cooldown: 33, auto: true };
  c.buffs.barrage = 3;
  c.mxp = 12.5;
  c.spirit.common = 3.75;
  assert.deepEqual(decodeCatacombs(JSON.parse(JSON.stringify(c))), c);
  const bad = JSON.parse(JSON.stringify(c));
  bad.run.slots[0].drops = { mxp: 9, speed: 77 };
  bad.run.slots[0].mark = "red";
  bad.run.potions = [[8, 8], [1, 7], [1, 7]];
  bad.upgrades = { unlock: 6, matk: 7, loot: 11 };
  bad.abilities.rush.cooldown = 500;
  const d = decodeCatacombs(bad);
  assert.deepEqual(d.run!.slots[0]!.drops, { speed: 77 });
  assert.equal(d.run!.slots[0]!.mark, undefined);
  assert.deepEqual(d.run!.potions, [[1, 7]]);
  assert.deepEqual(d.upgrades, { ...noUpgrades(), matk: 7 });
  assert.equal(d.abilities.rush.cooldown, 0);
});
