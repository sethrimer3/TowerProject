import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { xpForLevel } from "../src/config.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { workLeft } from "../src/training-jobs.ts";
import { DAY_MS, confirmServerTime, estimatedServerTime, gmtDay, untilNextDay } from "../src/shop/clock.ts";
import { BOOST_FOREVER, goldFactor, permanentBoost } from "../src/shop/entitlements.ts";
import { HISTORY_KEPT } from "../src/shop/ledger.ts";
import { OFFERS, offer, type ShopOffer } from "../src/shop/offers.ts";
import { purchase, refusal, soldOut, timesBought } from "../src/shop/transactions.ts";

/** Noon GMT on some day, a real timestamp. */
const NOON = 20_500 * DAY_MS + DAY_MS / 2;
const gemOffer = (amount: number): ShopOffer => ({
  id: "gems250", name: "Test", category: "gems", item: { kind: "currency", currency: "gems", amount: 10 }, quantity: 1,
  price: { kind: "currency", currency: "gold", amount }, rarity: "common", purchaseLimit: 2, effects: [], tags: [],
});

test("the catalog: one-time packs, the daily Gems, the Gem packs and the Premium Passes at their default prices", () => {
  const shown = OFFERS.map((o) => [o.id, o.price.kind === "money" ? o.price.label : o.price.kind]);
  assert.deepEqual(shown, [
    ["shardPack", "store"], ["adFree", "$9.95"], ["coins2", "$9.95"], ["coins3", "$29.95"], ["dailyGems", "free"],
    ["gems250", "$4.99"], ["gems550", "$9.99"], ["gems1150", "$19.99"], ["gems2500", "$39.99"], ["gems7500", "$99.99"],
    ["pass1", "$9.99"], ["pass2", "$19.99"], ["pass3", "$29.99"],
  ]);
  for (const id of ["adFree", "coins2", "coins3", "pass1", "pass2", "pass3"]) assert.equal(offer(id)!.purchaseLimit, 1, id);
});

test("the daily Gems are claimed once a GMT day, on the server's time", () => {
  const g = new Game(defaults()), daily = offer("dailyGems")!;
  assert.equal(g.buyOffer("dailyGems", NOON), null);
  assert.equal(g.save.gems, 25);
  assert.equal(g.buyOffer("dailyGems", NOON + 1000), "limit");
  assert.equal(g.buyOffer("dailyGems", (gmtDay(NOON) + 1) * DAY_MS - 1), "limit", "the last moment of the day");
  assert.ok(soldOut(g.save, daily, NOON));
  assert.equal(g.buyOffer("dailyGems", (gmtDay(NOON) + 1) * DAY_MS), null, "00:00 GMT starts a new day");
  assert.equal(g.save.gems, 50);
  assert.equal(timesBought(g.save, daily, (gmtDay(NOON) + 1) * DAY_MS), 1);
});

test("the Shop's clock never moves back, and estimates only from the last confirmed time", () => {
  const clock = { server: 0, local: 0 };
  assert.equal(estimatedServerTime(clock, 5), 5, "the device's time before any confirmation");
  confirmServerTime(clock, NOON, 1000);
  confirmServerTime(clock, NOON - DAY_MS, 2000);
  assert.deepEqual(clock, { server: NOON, local: 1000 }, "an older answer is ignored");
  assert.equal(estimatedServerTime(clock, 61_000), NOON + 60_000);
  assert.equal(estimatedServerTime(clock, 0), NOON, "a device clock gone back adds nothing");
  assert.equal(untilNextDay(NOON), DAY_MS / 2);
});

test("a purchase is all or nothing: refused, it changes nothing", () => {
  const save = defaults(), o = gemOffer(100);
  save.gold = 99;
  const before = JSON.stringify(save);
  assert.equal(purchase(save, o, NOON), "short");
  assert.equal(JSON.stringify(save), before);
  save.gold = 250;
  const t = purchase(save, o, NOON);
  assert.deepEqual(t, { at: NOON, offer: "gems250", item: "10 Gems", price: "100 Gold" });
  assert.deepEqual([save.gold, save.gems, save.shop.counts.gems250], [150, 10, { n: 1, day: gmtDay(NOON) }]);
});

test("purchase limits, start and end times, requirements and store links refuse a purchase", () => {
  const save = defaults();
  save.gold = 1000;
  const o = gemOffer(1);
  assert.equal(typeof purchase(save, o, NOON), "object");
  assert.equal(typeof purchase(save, o, NOON), "object");
  assert.equal(purchase(save, o, NOON + DAY_MS), "limit", "not a daily offer: the limit holds for good");
  assert.equal(refusal(save, { ...gemOffer(1), startTime: NOON + 1 }, NOON), "notStarted");
  assert.equal(refusal(save, { ...gemOffer(1), endTime: NOON }, NOON), "expired", "never buyable once over, whatever the page shows");
  assert.equal(refusal(save, { ...gemOffer(1), requires: [{ kind: "tier", mode: "tower", tier: 8 }] }, NOON), "locked");
  assert.equal(refusal(save, offer("shardPack")!, NOON), "storeLink");
  assert.equal(refusal(save, { ...gemOffer(1), purchaseLimit: null }, NOON), null);
});

test("a real-money offer is granted only once the store confirms payment, or free in Dev", () => {
  const g = new Game(defaults());
  assert.equal(g.buyOffer("gems550", NOON), "unpaid");
  assert.equal(g.save.gems, 0);
  assert.equal(g.buyOffer("gems550", NOON, true), null);
  assert.equal(g.save.gems, 550);
  g.save.settings.freePurchases = true;
  assert.equal(g.buyOffer("gems7500", NOON), null);
  assert.equal(g.save.gems, 8050);
  assert.deepEqual(g.save.shop.history.map((t) => t.price), ["$9.99", "Dev: free"]);
});

test("one-time packs are bought once, kept by an erase, and multiply every Gold banked", () => {
  const g = new Game(defaults());
  for (const id of ["coins2", "coins3", "adFree"] as const) assert.equal(g.buyOffer(id, NOON, true), null, id);
  assert.equal(g.buyOffer("coins2", NOON, true), "limit");
  assert.equal(goldFactor(g.save), 9, "1.5 × 2 × 3");
  g.eraseAll();
  assert.deepEqual(g.save.entitlements, ["coins2", "coins3", "adFree"]);
  assert.equal(g.save.trainingBoostUntil, BOOST_FOREVER);
  // A kill's 2 Gold, ×9, in a run inside.
  const h = new Game({ ...defaults(), entitlements: g.save.entitlements });
  h.save.settings.devMode = true;
  h.run.height = 10;
  (h.world as RoomWorld).cells = new Map<string, any>([["0,0", { kind: "floor" }],
    ["1,0", { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 1, strength: "strong" } }]]);
  Object.assign(h.run.player, { x: 0, y: 0 });
  assert.ok(h.stepManually(1, 0));
  assert.equal(h.save.gold, 18);
  assert.ok(h.gains.some((gain) => gain.text === "+18 Gold"));
});

test("Ad-Disable runs the trainers' ×2 boost for good, ranks already training included", () => {
  const g = new Game(defaults());
  g.save.upgrades.trainers = 1;
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(10);
  g.save.gold = 10_000;
  let now = 1_790_000_000_000;
  g.clock = () => now;
  // Max HP's first rank takes 15 s; 10 s are left after 5.
  assert.ok(g.training.trainWithGold("hp"));
  now += 5000;
  const left = g.training.left("hp");
  assert.equal(g.buyOffer("adFree", NOON, true), null);
  assert.ok(permanentBoost(g.save));
  assert.equal(g.save.trainingBoostUntil, BOOST_FOREVER);
  assert.equal(g.save.trainingJobs[0].completesAt, now + left / 2, "what was left goes twice as fast");
  assert.equal(workLeft(g.save.trainingJobs[0].completesAt, g.save.trainingBoostUntil, now), left);
  assert.equal(g.training.claimBoost(), false, "no more to claim");
  const back = decode(JSON.stringify(g.save));
  assert.equal(back.trainingBoostUntil, BOOST_FOREVER);
  back.trainingBoostUntil = 0;
  assert.equal(decode(JSON.stringify(back)).trainingBoostUntil, BOOST_FOREVER, "the entitlement keeps it on");
});

test("the Shop's save decodes field by field and keeps only the latest history", () => {
  const save = defaults();
  save.entitlements = ["coins3"];
  for (let i = 0; i < HISTORY_KEPT + 5; i++) purchase(save, { ...gemOffer(0), purchaseLimit: null }, NOON + i);
  assert.equal(save.shop.history.length, HISTORY_KEPT);
  const raw = JSON.parse(JSON.stringify(save));
  raw.entitlements.push("nope", "coins3");
  raw.shop.counts.bogus = { n: 1, day: 1 };
  raw.shop.counts.dailyGems = { n: -1, day: 1 };
  raw.shop.history.push({ at: 1, offer: "bogus", item: "x", price: "y" });
  raw.shop.clock = { server: "soon", local: 7 };
  const d = decode(JSON.stringify(raw));
  assert.deepEqual(d.entitlements, ["coins3"]);
  assert.deepEqual(Object.keys(d.shop.counts), ["gems250"]);
  assert.equal(d.shop.history.length, HISTORY_KEPT);
  assert.equal(d.shop.history.at(-1)!.at, NOON + HISTORY_KEPT + 4);
  assert.deepEqual(d.shop.clock, { server: 0, local: 7 });
  assert.deepEqual(decode(JSON.stringify({ ...raw, shop: "x", entitlements: 3 })).shop, defaults().shop);
});
