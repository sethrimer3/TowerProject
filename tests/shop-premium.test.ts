import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import { OFFERS, offer, premiumOffer, type OfferId } from "../src/shop/offers.ts";
import { priceOf } from "../src/shop/discounts.ts";
import { ARCHIVISTS, nextArchivistPrice } from "../src/progression/archives.ts";
import { trainingSlots } from "../src/progression/training-jobs.ts";
import { premiumArchivists } from "../src/shop/entitlements.ts";
import { RELICS } from "../src/economy/relics.ts";
import { relicAmount, relicText, relicTotals } from "../src/economy/relic-effects.ts";
import { floorChances } from "../src/environments.ts";

/** Noon GMT on some day, a real timestamp. */
const NOON = 20_500 * DAY_MS + DAY_MS / 2;
/** Buys real-money offer `id` as the store confirms it. */
const buy = (g: Game, id: OfferId) => assert.equal(g.shop.buy(id, NOON, true), null, id);

test("every real-money offer pays 16 VIP Points for each dollar of its base price", () => {
  const vip = Object.fromEntries(OFFERS.flatMap((o) => (o.price.kind === "money" ? [[o.id, o.price.vip]] : [])));
  assert.deepEqual(vip, {
    shards300: 480, shards750: 960, researcher: 160, trainer: 160, stellar: 160, adFree: 160, coins2: 160, coins3: 480,
    gems250: 80, gems550: 160, gems1150: 320, gems2500: 640, gems7500: 1600, pass1: 160, pass2: 320, pass3: 480, eventBoost: 160,
  });
});

test("a purchase pays its price's VIP Points; the half-price Ad-Disable pays 80; free claims pay none", () => {
  const g = new Game(defaults());
  buy(g, "gems550");
  buy(g, "gems250");
  assert.equal(g.save.vip, 240);
  assert.equal(g.shop.buy("dailyGems", NOON), null);
  assert.equal(g.save.vip, 240, "the Daily Free Gems pay none");
  g.save.ads.discountUntil = NOON + DAY_MS;
  assert.deepEqual(priceOf(g.save, offer("adFree")!, NOON), { kind: "money", sku: "ad_free_half", label: "$4.95", vip: 80 });
  buy(g, "adFree");
  assert.equal(g.save.vip, 320, "$4.95 pays 80");
  assert.equal(g.shop.buy("gems250", NOON, false), "unpaid", "an unconfirmed payment pays nothing");
  assert.equal(g.save.vip, 320);
});

test("VIP Points are saved, never negative, and outlast Erase All", () => {
  const g = new Game(defaults());
  buy(g, "gems7500");
  assert.equal(decode(JSON.stringify(g.save)).vip, 1600);
  assert.equal(decode(JSON.stringify({ ...g.save, vip: -5 })).vip, 0);
  g.eraseAll();
  assert.equal(g.save.vip, 1600);
});

test("the Premium Offers come one at a time, in order, until none is left", () => {
  const g = new Game(defaults());
  assert.equal(premiumOffer(g.save)?.id, "researcher");
  buy(g, "researcher");
  assert.equal(premiumOffer(g.save)?.id, "trainer");
  buy(g, "trainer");
  assert.equal(premiumOffer(g.save)?.id, "stellar");
  buy(g, "stellar");
  assert.equal(premiumOffer(g.save), undefined);
  assert.equal(g.shop.buy("stellar", NOON, true), "limit", "each is bought once");
  assert.equal(g.save.vip, 480);
});

test("Extra Researcher adds an archivist beside those Gems hire, and its relic speeds research", () => {
  const g = new Game(defaults());
  g.save.gems = 100;
  assert.ok(g.research.hire() || !g.research.open, "hire one with Gems where the Archives are open");
  const before = g.save.archives.slots.length, price = nextArchivistPrice(g.save.archives);
  buy(g, "researcher");
  assert.equal(g.save.archives.slots.length, before + 1);
  assert.equal(nextArchivistPrice(g.save.archives, premiumArchivists(g.save)), price, "the Gem prices go on where they were");
  assert.ok(g.save.relics.includes("shop.researcher"));
  assert.equal(relicAmount(g.save, "researchSpeed"), 5);
  // All Gem archivists can still be hired, and the save keeps the extra slot.
  g.save.archives.slots.length = 0;
  for (let i = 0; i < ARCHIVISTS.maximum + 1; i++) g.save.archives.slots.push({ autoContinue: false });
  assert.equal(decode(JSON.stringify(g.save)).archives.slots.length, ARCHIVISTS.maximum + 1);
});

test("Extra Trainer adds a trainer, and its relic speeds trainers and raises XP", () => {
  const g = new Game(defaults()), slots = trainingSlots(g.save);
  buy(g, "trainer");
  assert.equal(trainingSlots(g.save), slots + 1);
  assert.equal(relicAmount(g.save, "trainerSpeed"), 5);
  assert.equal(relicAmount(g.save, "xp"), 10);
  assert.equal(relicText(RELICS["shop.trainer"]!), "Trainers work 5% faster · XP earned +10%");
  assert.deepEqual(relicTotals(g.save.relics).map((t) => t.count), [1, 1], "each bonus totalled on its own line");
});

test("Stellar Bundle pays 500 Gems and its relic raises Stellar Floors and Stellar Gems", () => {
  const g = new Game(defaults());
  buy(g, "stellar");
  assert.equal(g.save.gems, 500);
  assert.equal(relicAmount(g.save, "stellarFloor"), 1);
  assert.equal(relicAmount(g.save, "stellarGem"), 1);
  assert.equal(RELICS["shop.stellar"]!.rarity, "legendary");
});

test("what the Premium Offers gave comes back on load and after Erase All", () => {
  const g = new Game(defaults());
  for (const id of ["researcher", "trainer", "stellar"] as const) buy(g, id);
  const save = JSON.parse(JSON.stringify(g.save));
  save.relics = [];
  save.archives.slots = [{ autoContinue: false }];
  const back = decode(JSON.stringify(save));
  assert.deepEqual([...back.relics].sort(), ["shop.researcher", "shop.stellar", "shop.trainer"]);
  assert.equal(back.archives.slots.length, ARCHIVISTS.start + 1);
  g.eraseAll();
  assert.deepEqual([...g.save.relics].sort(), ["shop.researcher", "shop.stellar", "shop.trainer"]);
  assert.equal(g.save.archives.slots.length, ARCHIVISTS.start + 1);
  assert.equal(trainingSlots(g.save), trainingSlots(defaults()) + 1);
  assert.equal(g.save.gems, 0, "the Gems were spent progress");
});

test("the relics' Stellar Floor chance adds points of its own, without Aurum Bloom", () => {
  const g = new Game(defaults());
  g.newRun();
  assert.equal(g.environments.stellarFloor ?? 0, 0);
  buy(g, "stellar");
  assert.equal(g.environments.stellarFloor, 1, "+1 point, Aurum Bloom not held");
  assert.deepEqual(floorChances({ seed: 1, stellarFloor: 2 }, { bonus: 2, chance: 3, stellar: 4 }, 1.5), { seed: 1, treasureFloor: undefined, goldenFloor: 3, stellarFloor: 7.5 }, "added to the run's and Aurum Bloom's");
  assert.notEqual(g.goldContext.stellar, undefined, "the Gold bonuses list the Stellar Floor");
});

test("the relics' Stellar Gem chance adds its points to a Golden Gem's Stellar Gem Chance only", () => {
  const g = new Game(defaults());
  g.newRun();
  buy(g, "stellar");
  const finder = g.gemFinder as unknown as { kindOf(from: string, x: number, y: number): string };
  const host = (g.gemFinder as unknown as { host: { powerBonus: Record<string, number> } }).host;
  // No Golden Gem chance: every Gem stays plain, the relic notwithstanding.
  const kinds = new Set(Array.from({ length: 200 }, (_, i) => finder.kindOf("chance", i % 15, Math.floor(i / 15))));
  assert.deepEqual([...kinds], ["plain"]);
  // Every Gem golden and no Stellar Gem Chance of the tree's: the relic's 1 point alone turns some stellar.
  Object.defineProperty(host, "powerBonus", { value: { ...host.powerBonus, goldenGem: 100, stellarGem: 0 }, configurable: true });
  const rolled = Array.from({ length: 2000 }, (_, i) => finder.kindOf("chance", i % 40, Math.floor(i / 40)));
  const stellar = rolled.filter((k) => k === "stellar").length;
  assert.ok(stellar > 0 && stellar < 60, `about 1% stellar: ${stellar}`);
  assert.ok(rolled.every((k) => k !== "plain"));
});
