import { givePowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { CARD_IDS, CARDS, type CardId } from "../src/cards/cards.ts";
import { CARD_POWERS, powerBonus, powerLevel, powersOf, type PowerStat } from "../src/cards/powers.ts";
import { CARD_RARITIES, firstLevelOf, rarityAt } from "../src/cards/rarity.ts";
import { CARD_LEVEL_XP, MAX_CARD_XP, cardMaxLevel, decodeCardAscension, levelIn, nextAscension, readyToAscend } from "../src/cards/levels.ts";
import { boostedSkip, LEVEL_SKIP_BOOST_CAP } from "../src/enemies/level-skips.ts";
import { doorGold, withDoorOdds } from "../src/doors.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { currencyRows } from "../src/ui/currencies-dialog.ts";
import { statsRows } from "../src/ui/stats-dialog.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Tile } from "../src/entities.ts";
import { playedSave } from "./first-skills.ts";

/** The XP that reaches level `n`. */
const xpTo = (n: number) => CARD_LEVEL_XP.slice(0, n).reduce((a, b) => a + b, 0);
const foe = (strength: Enemy["strength"]): Enemy => ({ name: "rat", hp: 10, attack: 1, defense: 0, tier: 1, strength });

test("each card with powers has a base power and one of each rarity from common to mythic, every stat a known one", () => {
  const known = new Set(Object.keys(powerBonus(undefined)));
  for (const [card, powers] of Object.entries(CARD_POWERS) as [CardId, (typeof CARD_POWERS)[CardId]][]) {
    assert.ok(card in CARDS, card);
    assert.deepEqual([...new Set(powers!.map((p) => p.rarity))], CARD_RARITIES, `${card}: base, then each rarity in order`);
    for (const p of powers!) for (const stat of Object.keys(p.stats)) assert.ok(known.has(stat), `${card}'s ${p.name}: ${stat}`);
  }
  assert.equal(powersOf("archer").filter((p) => p.rarity === "mythic").length, 2, "ARCHER's mythic holds two powers");
  // The cards without powers yet still level and ascend.
  assert.deepEqual(CARD_IDS.filter((id) => !powersOf(id).length).sort(), ["angelWings", "blueSiphon", "flyingEnemy", "keySiphon", "redSiphon"]);
});

test("a card's level makes its rarity, ten levels a rarity, and each power rises through its own ten", () => {
  assert.deepEqual([0, 1, 10, 11, 20, 21, 31, 41, 50, 51, 60].map(rarityAt), ["base", "common", "common", "uncommon", "uncommon", "rare", "epic", "legendary", "legendary", "mythic", "mythic"]);
  assert.deepEqual(CARD_RARITIES.map(firstLevelOf), [0, 1, 11, 21, 31, 41, 51]);
  const [base, common, uncommon] = powersOf("stairs");
  assert.deepEqual([0, 1, 9, 10, 60].map((l) => powerLevel(base!, l)), [0, 1, 9, 10, 60], "the base power: every level");
  assert.deepEqual([0, 1, 10, 25].map((l) => powerLevel(common!, l)), [0, 1, 10, 10], "common: levels 1 to 10");
  assert.deepEqual([10, 11, 15, 20, 60].map((l) => powerLevel(uncommon!, l)), [0, 1, 5, 10, 10], "uncommon: levels 11 to 20");
  assert.deepEqual(powerBonus({ stairs: 15 }), { ...powerBonus(undefined), floorHeal: 15, silverBonus: 10, stairSkip: 10 });
});

test("a card stops at the last level of its rarity, ready to ascend once it holds the next level's XP, and ascending costs Rubies and Gems", () => {
  const s = defaults();
  s.cardXp.door = xpTo(10);
  assert.deepEqual([levelIn(s, "door").level, cardMaxLevel(s.cardAscension, "door"), readyToAscend(s, "door")], [10, 10, false], "at 10, short of 11's XP");
  s.cardXp.door = xpTo(12) + 5;
  assert.deepEqual([levelIn(s, "door").level, readyToAscend(s, "door")], [10, true], "the XP keeps gathering past the cap");
  assert.deepEqual(nextAscension(s, "door"), { rarity: "uncommon", rubies: 10, gems: 100, skill: "ascendUncommon" });
  const g = new Game(s);
  assert.deepEqual(g.cards.ascend("door"), { refused: "locked" }, "not before Card Ascension - Uncommon");
  g.save.upgrades.ascendUncommon = 1;
  assert.deepEqual(g.cards.ascend("door"), { refused: "short" });
  g.save.rubies = 25;
  g.save.gems = 99;
  assert.deepEqual(g.cards.ascend("door"), { refused: "shortGems" });
  assert.deepEqual([g.save.rubies, g.save.gems], [25, 99], "nothing paid when short");
  g.save.gems = 130;
  assert.deepEqual(g.cards.ascend("door"), { rarity: "uncommon" });
  assert.equal(g.save.gems, 30);
  assert.deepEqual([g.save.rubies, g.save.cardAscension.door, levelIn(g.save, "door").level], [15, 1, 12], "it climbs at once on the XP it held");
  assert.deepEqual(g.cardLevelUps.map((u) => u.level), [11, 12]);
  assert.deepEqual(g.cards.ascend("door"), { refused: "notReady" }, "not again until level 20");
  assert.deepEqual([2, 3, 4, 5].map((n) => nextAscension({ cardXp: {}, cardAscension: { door: n - 1 } }, "door")!.rubies), [100, 1_000, 10_000, 100_000]);
  assert.deepEqual([2, 3, 4, 5].map((n) => nextAscension({ cardXp: {}, cardAscension: { door: n - 1 } }, "door")!.gems), [200, 300, 400, 500]);
  assert.equal(nextAscension({ cardXp: {}, cardAscension: { door: 5 } }, "door"), null, "none past mythic");
  const top = defaults();
  top.cardXp.door = MAX_CARD_XP;
  top.cardAscension.door = 5;
  assert.deepEqual([levelIn(top, "door").level, readyToAscend(top, "door")], [60, false], "level 60: MAX");
});

test("Dev mode's free purchases ascend for nothing", () => {
  const s = defaults();
  s.cardXp.key = xpTo(11);
  s.settings.freePurchases = true;
  s.upgrades.ascendUncommon = 1;
  const g = new Game(s);
  assert.deepEqual(g.cards.ascend("key"), { rarity: "uncommon" });
  assert.deepEqual([g.save.rubies, g.save.gems], [0, 0]);
});

test("a held card's level gained inside a run counts at once: its powers by enemy reach the hero", () => {
  const s = playedSave();
  s.hand = [...s.hand.filter((c) => c !== "monster"), "monster"];
  s.cardXp.monster = xpTo(5);
  const g = new Game(s);
  g.newRun({ seed: 7 });
  assert.equal(g.run.handLevels?.monster, 5);
  assert.deepEqual(g.run.player.foeAttack, { monster: 15 }, "ENEMY's base power: 3% a level");
  g.gainCardXp("monster", CARD_LEVEL_XP[5]!);
  assert.equal(g.run.handLevels?.monster, 6);
  assert.deepEqual(g.run.player.foeAttack, { monster: 18 });
  assert.equal(decode(JSON.stringify(g.save)).tower.run!.handLevels?.monster, 6, "it saves");
  // A card the run doesn't hold changes nothing inside it.
  g.gainCardXp("door", 100_000);
  assert.equal(g.run.handLevels?.door, s.hand.includes("door") ? levelIn(g.save, "door").level : undefined);
});

test("a boss or Greater Boss drops the tier's Rubies, and BOSS ENEMY's Boss Rubies more, a fraction a fixed chance", () => {
  const purse = (tier: number, given: Partial<Record<PowerStat, number>> = {}) => {
    const g = new Game(defaults());
    g.newRun({ seed: 7 });
    g.run.tier = tier;
    g.run.handLevels = givePowers({ bossEnemy: given });
    return { g, purse: new RunPurse(g.save, g.mode, g.run, () => 0.5) };
  };
  const one = purse(1);
  assert.equal(one.purse.enemyLoot(foe("boss"), 1, 1).rubies, 1);
  assert.equal(one.purse.enemyLoot(foe("greaterBoss"), 2, 1).rubies, 1);
  assert.equal(one.purse.enemyLoot(foe("elite"), 3, 1).rubies, 0);
  assert.equal(one.purse.enemyLoot(foe("boss"), 1, 1).rubies, 0, "once a kill");
  assert.deepEqual([one.g.save.rubies, one.g.save.profile.earned.rubies], [2, 2]);
  assert.equal(purse(9).purse.enemyLoot(foe("boss"), 1, 1).rubies, 9, "Tower IX's");
  assert.equal(purse(3, { bossRubies: 2 }).purse.enemyLoot(foe("boss"), 1, 1).rubies, 5);
  let extra = 0;
  for (let x = 0; x < 400; x++) extra += purse(1, { bossRubies: 0.2 }).purse.enemyLoot(foe("boss"), x, 0).rubies - 1;
  assert.ok(extra > 50 && extra < 110, `about a fifth of 400: ${extra}`);
});

test("STAIRS' Ruby Chance pays the tier's Rubies on a floor new to the run, rolled by the floor", () => {
  const climb = (chance: number) => {
    const g = new Game(playedSave());
    g.newRun({ seed: 11 });
    g.run.handLevels = givePowers({ stairs: { floorRuby: chance } });
    for (let f = 0; f < 30; f++) (g as unknown as { findFloorRubies(f: number, at: { x: number; y: number }): void }).findFloorRubies(f, { x: 0, y: 0 });
    return g.save.rubies;
  };
  assert.equal(climb(0), 0);
  assert.equal(climb(100), 30, "one a floor in Tower I");
  assert.equal(climb(50), climb(50), "the same floors pay each time");
});

test("STAIRS' Enemy Skip raises both Level Skip chances, up to 80%", () => {
  assert.equal(boostedSkip(1000, 0), 1000);
  assert.equal(boostedSkip(1000, 10), 1100);
  assert.equal(boostedSkip(7500, 10), LEVEL_SKIP_BOOST_CAP);
  assert.equal(boostedSkip(9000, 10), 9000, "a chance past the cap stays");
});

test("TORCH's Torch Loot pays Gold and Silver for each torch put out", () => {
  const torchRun = (given: Partial<Record<PowerStat, number>>) => {
    const g = new Game(playedSave());
    g.newRun({ seed: 7 });
    g.run.handLevels = givePowers({ torch: given });
    const w = g.world as RoomWorld;
    w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "floor" }]]);
    w.torches = [{ x: 1, y: 0, active: true }] as RoomWorld["torches"];
    Object.assign(g.run.player, { x: 0, y: 0 });
    const gold = g.save.gold, silver = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return [g.save.gold - gold, (g.run.silver ?? 0) - silver];
  };
  const [plainGold, plainSilver] = torchRun({}), [gold, silver] = torchRun({ torchGold: 5, torchSilver: 5 });
  assert.ok(gold > plainGold, `${gold} > ${plainGold}`);
  assert.equal(plainSilver, 0);
  assert.ok(silver > 0);
});

test("WOODEN DOOR's Transmute Gold to Wood makes a Gold Door a Wooden Door that still pays the Gold Door's Gold", () => {
  const gold: Tile = { kind: "door", color: "yellow", door: { type: "keys", keys: ["yellow"], mode: "all" } };
  const made = withDoorOdds(gold, 3, 4, 9, { skeleton: 0, lockPick: 0, toWood: 100 }, () => 12);
  assert.deepEqual(made, { kind: "door", door: { type: "wood", durability: 12, gold: doorGold(gold) } });
  assert.equal(doorGold(made), doorGold(gold));
  const blue: Tile = { kind: "door", color: "blue", door: { type: "keys", keys: ["blue"], mode: "all" } };
  assert.equal(withDoorOdds(blue, 3, 4, 9, { skeleton: 0, lockPick: 0, toWood: 100 }, () => 12), blue, "only a Gold Door");
});

test("Rubies and the cards' ascensions save; Rubies show in the purse once had, and the Stats table counts them", () => {
  const s = defaults();
  s.rubies = 42;
  s.cardAscension = { door: 2, key: 9 as number };
  const d = decode(JSON.stringify({ ...s, cardAscension: { door: 2, key: 9, nope: 1, stairs: 1.5 } }));
  assert.equal(d.rubies, 42);
  assert.deepEqual(d.cardAscension, { door: 2 });
  assert.deepEqual(decodeCardAscension(null), {});
  const g = new Game(defaults());
  assert.ok(!currencyRows(g).some((r) => r.id === "rubies"), "not before the first Ruby");
  g.save.rubies = 3;
  g.save.profile.earned.rubies = 3;
  assert.deepEqual(currencyRows(g).find((r) => r.id === "rubies")?.value, "3");
  assert.deepEqual(statsRows(g.save.profile).find(([label]) => label === "Rubies earned"), ["Rubies earned", "3"]);
});

test("the ad prize that gave card draws gives 10 Rubies", async () => {
  const { AD_PRIZES } = await import("../src/ads/series.ts");
  assert.ok(AD_PRIZES.some((p) => p.kind === "rubies" && p.amount === 10));
});

test("a card's ascensions count toward the Deck tab's dot only while it can pay, with its Card Ascension skill owned", () => {
  const g = new Game(playedSave());
  g.save.cardXp.door = xpTo(11);
  const seen = g.notices.deckCount();
  g.save.rubies = 10;
  g.save.gems = 100;
  assert.equal(g.notices.deckCount(), seen, "not before Card Ascension - Uncommon");
  g.save.upgrades.ascendUncommon = 1;
  assert.equal(g.notices.deckCount(), seen + 1);
  g.save.gems = 99;
  assert.equal(g.notices.deckCount(), seen, "not while short of Gems");
});

test("each rarity's ascension waits on its own Card Ascension skill", () => {
  const g = new Game(defaults());
  g.save.rubies = 1_000_000;
  g.save.gems = 1_500;
  const skills = ["ascendUncommon", "ascendRare", "ascendEpic", "ascendLegendary", "ascendMythic"] as const;
  for (const [i, skill] of skills.entries()) {
    g.save.cardXp.door = xpTo(10 * (i + 1) + 1);
    assert.deepEqual(g.cards.ascend("door"), { refused: "locked" }, skill);
    g.save.upgrades[skill] = 1;
    assert.equal("rarity" in g.cards.ascend("door"), true, skill);
  }
  assert.deepEqual([g.save.cardAscension.door, g.save.gems], [5, 0], "100 + 200 + 300 + 400 + 500 Gems");
});
