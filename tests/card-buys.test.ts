import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode } from "../src/save/save.ts";
import { CARD_RARITY_WEIGHTS } from "../src/cards/rarity.ts";
import { buyCards, buyOne, buysLeft, CARD_BUY_GEMS, decodeCardBuys, defaultCardBuys, rarityOn, type CardBuysSave } from "../src/cards/buys.ts";
import { CARD_LEVEL_XP } from "../src/cards/levels.ts";
import { CARD_TREES, cardMaxLevel, levelIn, type CardOpened } from "../src/cards/trees.ts";
import { stampProfile } from "../src/save/profile.ts";
import { random } from "../src/random.ts";
import type { CardId } from "../src/cards/cards.ts";
import { playedSave } from "./first-skills.ts";

/** A stream that returns `numbers` in turn. */
const numbers = (...n: number[]) => () => n.shift() ?? 0;
/** Every level card buys can open on `card`'s nodes of the rarities given, opened. */
function opened(card: CardId, rarities: string[]): Record<string, number> {
  return Object.fromEntries(CARD_TREES[card]!.filter((n) => rarities.includes(n.rarity)).map((n) => [n.id, n.max - n.levels]));
}
const xpTo = (n: number) => CARD_LEVEL_XP.slice(0, n).reduce((a, b) => a + b, 0);

test("the rarities' chances: 60%, 32%, 6%, 1.5% and 0.5%", () => {
  assert.deepEqual(CARD_RARITY_WEIGHTS, { common: 6000, uncommon: 3200, rare: 600, epic: 150, legendary: 50 });
  assert.deepEqual(CARD_BUY_GEMS, { 1: 20, 10: 200 });
});

test("the buys left are every level the deck's trees can still open", () => {
  assert.equal(buysLeft({}, ["stairs", "door", "key", "monster"]), 50 + 50 + 50 + 50);
  assert.equal(buysLeft({}, ["blueSiphon"]), 0, "a card without a tree takes none");
  assert.equal(buysLeft({}, ["heartDoor", "woodenDoor"]), 100, "HEART and WOODEN DOOR open to 60 each");
  assert.equal(buysLeft({}, ["archer", "fastEnemy", "flyingEnemy"]), 150, "ARCHER, FAST and FLYING ENEMY open to 60 each");
  assert.equal(buysLeft({ stairs: { floorGold: 5, overhealMax: 2 } }, ["stairs"]), 43);
});

test("a buy opens a sealed node of its rarity first, at one level, then raises one with room", () => {
  const m = defaultCardBuys();
  const legendary = buyOne(m, ["stairs"], numbers(0.9999, 0, 0))!;
  assert.deepEqual(legendary, { card: "stairs", rarity: "legendary", node: "overhealMax", cap: 1, fresh: true, maxLevel: { before: 10, after: 11 }, look: { before: "common", after: "legendary" } });
  const next = buyOne(m, ["stairs"], numbers(0.9999, 0, 0))!;
  assert.equal(next.node, "stairSkip", "the other sealed one");
  assert.equal(next.fresh, true);
  const raise = buyOne(m, ["stairs"], numbers(0.9999, 0, 0.99))!;
  assert.deepEqual([raise.node, raise.cap, raise.fresh], ["stairSkip", 2, false], "both open: one raised");
  const common = buyOne(m, ["stairs"], numbers(0, 0, 0))!;
  assert.deepEqual([common.rarity, common.node, common.cap, common.fresh], ["common", "floorGold", 6, false]);
  assert.deepEqual(m.opened, { stairs: { overhealMax: 1, stairSkip: 2, floorGold: 1 } });
});

test("a card whose nodes of the rarity drawn are full takes the next rarer it has room in, else the rarest commoner", () => {
  assert.equal(rarityOn({ atkUp: opened("atkUp", ["uncommon", "rare", "epic", "legendary"]) }, "atkUp", "uncommon"), "common", "ATK UP has room in its commons only");
  const full: CardOpened = { stairs: opened("stairs", ["common", "uncommon"]) };
  assert.equal(rarityOn(full, "stairs", "common"), "rare");
  assert.equal(rarityOn(full, "stairs", "uncommon"), "rare");
  assert.equal(rarityOn(full, "stairs", "epic"), "epic");
  const top: CardOpened = { stairs: opened("stairs", ["uncommon", "rare", "epic", "legendary"]) };
  assert.equal(rarityOn(top, "stairs", "legendary"), "common");
  assert.equal(rarityOn({ stairs: opened("stairs", ["common", "uncommon", "rare", "epic", "legendary"]) }, "stairs", "rare"), null);
});

test("a buy picks among the deck's cards with room, leaving full ones out, until none has any", () => {
  const every = ["common", "uncommon", "rare", "epic", "legendary"];
  const m: CardBuysSave = { rng: null, opened: { atkUp: opened("atkUp", every) } };
  assert.equal(buyOne(m, ["atkUp", "monster"], numbers(0, 0, 0))!.card, "monster", "ATK UP is full");
  const all: CardBuysSave = { rng: null, opened: { atkUp: opened("atkUp", every) } };
  assert.equal(buyOne(all, ["atkUp"], numbers(0, 0, 0)), null);
  const uncommon = buyOne({ rng: null, opened: { atkUp: opened("atkUp", ["uncommon"]) } }, ["atkUp", "torch", "stairs"], numbers(0.7, 0, 0))!;
  assert.deepEqual([uncommon.card, uncommon.rarity], ["torch", "uncommon"], "the rarity drawn goes to a card with room in it");
  const bought: CardBuysSave = { rng: 5, opened: {} };
  assert.equal(buyCards(bought, ["atkUp"], 60, () => 0).length, 50, "no more than the tree holds");
  assert.equal(cardMaxLevel(bought.opened, "atkUp"), 60);
  assert.equal(buysLeft(bought.opened, ["atkUp"]), 0);
});

test("buys carry on the profile's stream: seeded once, never rewound, the same buys bought one at a time or together", () => {
  const cards: CardId[] = ["stairs", "door", "key", "monster"];
  const together: CardBuysSave = { rng: 123, opened: {} }, apart: CardBuysSave = { rng: 123, opened: {} };
  const ten = buyCards(together, cards, 10, () => 0.5);
  const ones = Array.from({ length: 10 }, () => buyCards(apart, cards, 1, () => 0.9)[0]);
  assert.deepEqual(ones, ten);
  assert.deepEqual(apart, together);
  assert.notEqual(together.rng, 123);
  const fresh = defaultCardBuys();
  buyCards(fresh, cards, 1, () => 0.25);
  assert.equal(typeof fresh.rng, "number", "seeded at the first buy when the profile wasn't");
  const save = playedSave();
  assert.equal(save.cardBuys.rng, null);
  stampProfile(save, 1000);
  const seeded = save.cardBuys.rng;
  assert.equal(typeof seeded, "number", "seeded as the profile is made");
  stampProfile(save, 2000);
  assert.equal(save.cardBuys.rng, seeded, "and never again");
});

test("ten thousand buys land near the rarities' chances", () => {
  const counts: Record<string, number> = {};
  const rng = random(42);
  for (let i = 0; i < 10_000; i++) {
    const r = buyOne({ rng: null, opened: {} }, ["stairs"], rng)!.rarity;
    counts[r] = (counts[r] ?? 0) + 1;
  }
  assert.ok(counts.common > 5700 && counts.common < 6300, `common ${counts.common}`);
  assert.ok(counts.uncommon > 2950 && counts.uncommon < 3450, `uncommon ${counts.uncommon}`);
  assert.ok(counts.rare > 500 && counts.rare < 700, `rare ${counts.rare}`);
});

test("a deck of mostly common-only trees still draws the rarer rarities at their chances", () => {
  const cards: CardId[] = ["stairs", "heal", "door", "key", "monster", "atkUp", "defUp", "chest", "torch"];
  const counts: Record<string, number> = {}, seeds = random(7);
  let allCommon = 0;
  for (let p = 0; p < 500; p++) {
    const m = defaultCardBuys(), seed = seeds();
    const buys = Array.from({ length: 10 }, () => buyCards(m, cards, 1, () => seed)[0]!);
    for (const buy of buys) counts[buy.rarity] = (counts[buy.rarity] ?? 0) + 1;
    if (buys.every((b) => b.rarity === "common")) allCommon++;
  }
  assert.ok(counts.common > 2850 && counts.common < 3150, `common ${counts.common} of 5,000`);
  assert.ok(counts.uncommon > 1450 && counts.uncommon < 1750, `uncommon ${counts.uncommon} of 5,000`);
  assert.ok(counts.rare > 220 && counts.rare < 380, `rare ${counts.rare} of 5,000`);
  assert.ok(allCommon < 15, `${allCommon} of 500 profiles' first ten buys all common`);
});

test("the Game's desk buys for Gems, asks for them when short, refuses past what the deck can take, and banked XP turns into levels", () => {
  const save = playedSave();
  save.cardXp = { stairs: xpTo(12) };
  const g = new Game(save);
  g.newRun({ outside: true, seed: 1 });
  assert.equal(levelIn(g.save, "stairs").level, 10, "held at max level 10");
  assert.equal(g.cardBuys.refusal(1), "short");
  assert.equal(g.cardBuys.buy(1), "short");
  g.save.gems = 25;
  const buys = g.cardBuys.buy(1);
  assert.ok(Array.isArray(buys) && buys.length === 1);
  assert.equal(g.save.gems, 5);
  const left = g.cardBuys.left;
  g.save.gems = 1e6;
  g.save.cardBuys.opened = { stairs: opened("stairs", ["common", "uncommon", "rare", "epic", "legendary"]), door: opened("door", ["common", "uncommon", "rare", "epic", "legendary"]), key: opened("key", ["common", "uncommon", "rare", "epic", "legendary"]) };
  assert.ok(left > 0);
  assert.equal(g.cardBuys.left, 50, "ENEMY's alone");
  assert.equal(levelIn(g.save, "stairs").level, 12, "the XP gathered past the cap");
  g.save.cardBuys.opened.monster = opened("monster", ["common", "uncommon", "rare", "epic"]);
  assert.equal(g.cardBuys.left, 5, "ENEMY's legendary node");
  assert.equal(g.cardBuys.refusal(10), "full");
  assert.equal(g.cardBuys.refusal(1), null);
});

test("the save keeps the stream and the levels opened, within each node's room", () => {
  const save = playedSave();
  save.cardBuys = { rng: 77, opened: { stairs: { floorGold: 3, overhealMax: 2 } } };
  assert.deepEqual(decode(JSON.stringify(save)).cardBuys, save.cardBuys);
  assert.deepEqual(decodeCardBuys({ rng: -1, opened: { stairs: { floorGold: 6, nope: 1, goldBonus: 1.5, stairSkip: 5 }, archer: { a: 1 }, bogus: {} } }), { rng: null, opened: { stairs: { stairSkip: 5 } } });
  assert.deepEqual(decodeCardBuys("x"), defaultCardBuys());
});
