import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import {
  AD_PRIZES, AD_SERIES_LENGTH, ADS_PER_PRIZE, addAdGold, adGoldFactor, allClaimed, claimPrize, decodeAds, defaultAds, prizesReached, prizeWaiting,
  recordWatch, refreshAds, resetAt, weekEnd,
} from "../src/ads/series.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import { offer } from "../src/shop/offers.ts";
import { purchase } from "../src/shop/transactions.ts";
import { priceOf } from "../src/shop/discounts.ts";
import { goldMultipliers } from "../src/economy/gold-multipliers.ts";

const HOUR = 3_600_000;
// Wednesday 11 November 2026, 12:00 GMT.
const WED = Date.UTC(2026, 10, 11, 12);
const NEXT_MONDAY = Date.UTC(2026, 10, 16);

test("the week turns on Monday at 00:00 GMT", () => {
  assert.equal(weekEnd(WED), NEXT_MONDAY);
  assert.equal(weekEnd(NEXT_MONDAY - 1), NEXT_MONDAY);
  assert.equal(weekEnd(NEXT_MONDAY), NEXT_MONDAY + 7 * DAY_MS, "a moment into Monday waits for the next one");
  assert.equal(new Date(weekEnd(WED)).getUTCDay(), 1);
});

test("every fifth ad reaches the next prize, and a full bar counts no more", () => {
  const s = defaultAds();
  const reached: number[] = [];
  for (let i = 0; i < AD_SERIES_LENGTH + 3; i++) {
    const r = recordWatch(s, WED);
    if (r !== null) reached.push(r);
  }
  assert.deepEqual(reached, AD_PRIZES.map((_, i) => i));
  assert.equal(s.watched, AD_SERIES_LENGTH);
  assert.equal(prizesReached(s), AD_PRIZES.length);
  assert.equal(ADS_PER_PRIZE, 5);
});

test("prizes are claimed by pressing them, once each, only once reached", () => {
  const s = defaultAds();
  for (let i = 0; i < 7; i++) recordWatch(s, WED);
  assert.ok(prizeWaiting(s, 0));
  assert.equal(prizeWaiting(s, 1), false);
  assert.equal(claimPrize(s, 1, WED), null, "not reached");
  assert.deepEqual(claimPrize(s, 0, WED), AD_PRIZES[0]);
  assert.equal(claimPrize(s, 0, WED), null, "already claimed");
});

test("the bar never resets while unfilled, and resets the week after its last prize is claimed", () => {
  const s = defaultAds();
  for (let i = 0; i < 12; i++) recordWatch(s, WED);
  refreshAds(s, WED + 30 * DAY_MS);
  assert.equal(s.watched, 12, "an unfilled bar carries over the weeks");
  for (let i = 0; i < AD_SERIES_LENGTH; i++) recordWatch(s, WED);
  AD_PRIZES.forEach((_, i) => claimPrize(s, i, WED));
  assert.ok(allClaimed(s));
  assert.equal(resetAt(s), NEXT_MONDAY);
  refreshAds(s, NEXT_MONDAY - 1);
  assert.equal(s.watched, AD_SERIES_LENGTH, "full until the week turns");
  assert.equal(recordWatch(s, NEXT_MONDAY - 1), null);
  assert.equal(recordWatch(s, NEXT_MONDAY), null, "the first ad of the new week starts the bar again");
  assert.equal(s.watched, 1);
  assert.equal(s.claimed, 0);
});

test("the Gold prizes run the strongest first, and none runs out beneath another", () => {
  let g = addAdGold([], 2, HOUR, 0);
  assert.equal(adGoldFactor(g, 0), 2);
  // Half an hour on, ×3 for an hour: it runs first, the ×2's half hour after.
  g = addAdGold(g, 3, HOUR, HOUR / 2);
  assert.equal(adGoldFactor(g, HOUR / 2), 3);
  assert.equal(adGoldFactor(g, HOUR / 2 + HOUR - 1), 3);
  assert.equal(adGoldFactor(g, HOUR / 2 + HOUR), 2);
  assert.equal(adGoldFactor(g, 2 * HOUR - 1), 2);
  assert.equal(adGoldFactor(g, 2 * HOUR), 1);
  // Another ×3 adds to the ×3's time.
  g = addAdGold(g, 3, 2 * HOUR, HOUR);
  assert.equal(adGoldFactor(g, HOUR + 2.5 * HOUR - 1), 3);
  assert.equal(adGoldFactor(g, HOUR + 2.5 * HOUR), 2);
});

test("the Gold prize is its own multiplier, and buying permanent offers keeps it", () => {
  const save = defaults();
  save.ads.gold = addAdGold([], 3, HOUR, 0);
  const line = (now: number) => goldMultipliers({ save, mode: "tower", tier: 1, now }).find((m) => m.id === "adPrize");
  assert.equal(line(0)?.factor, 3);
  save.entitlements.push("adFree", "coins3");
  assert.equal(line(0)?.factor, 3, "kept beside Ad-Disable and the Coin Pack");
  assert.equal(goldMultipliers({ save, mode: "tower", tier: 1, now: 0 }).find((m) => m.id === "ads")?.factor, 1.5);
  assert.equal(line(HOUR), undefined, "gone once it runs out");
});

test("the discount prize halves Permanent Ad-Disable for a day", () => {
  const save = defaults(), adFree = offer("adFree")!;
  assert.deepEqual(priceOf(save, adFree, WED), adFree.price);
  save.ads.discountUntil = WED + 24 * HOUR;
  const half = priceOf(save, adFree, WED);
  assert.equal(half.kind === "money" && half.label, "$4.95");
  const t = purchase(save, adFree, WED, "store");
  assert.ok(typeof t !== "string");
  assert.equal(t.price, "$4.95", "recorded at the price paid");
  assert.deepEqual(priceOf(save, adFree, WED + 24 * HOUR), adFree.price);
});

test("the game's ad desk counts ads and pays each prize", () => {
  const save = defaults(), g = new Game(save);
  let now = WED;
  g.clock = () => now;
  save.shop.clock = { server: WED, local: WED };
  for (let i = 0; i < AD_SERIES_LENGTH; i++) g.ads.watched();
  const gems = save.gems;
  assert.equal(g.ads.claim(1)?.gems, 30);
  assert.equal(save.gems, gems + 30);
  g.ads.claim(0);
  assert.equal(g.ads.gold?.factor, 2);
  const cards = g.ads.claim(6)!;
  assert.equal(cards.buys.length + cards.gems / 20, 3, "three card buys, Gems for any the deck has no room for");
  g.ads.claim(7);
  assert.equal(save.ads.discountUntil, WED + 24 * HOUR);
  // Ad-Disable bought: no more ads, but the Gold prize keeps running.
  save.entitlements.push("adFree");
  assert.equal(g.ads.on, false);
  assert.equal(g.ads.gold?.factor, 2);
  now += 30 * 60_000;
  assert.equal(g.ads.gold?.factor, 2);
});

test("the ad series survives a reload, and a bad one decodes to nothing", () => {
  const save = defaults();
  for (let i = 0; i < 17; i++) recordWatch(save.ads, WED);
  claimPrize(save.ads, 2, WED);
  save.ads.gold = addAdGold([], 2, HOUR, WED);
  save.ads.discountUntil = WED + HOUR;
  assert.deepEqual(decode(JSON.stringify(save)).ads, save.ads);
  assert.deepEqual(decodeAds({ watched: 99, claimed: "x", gold: [{ factor: 0.5, from: 1, until: 2 }] }), defaultAds());
  // A prize marked claimed beyond those reached is dropped.
  assert.equal(decodeAds({ watched: 5, claimed: 0b11 }).claimed, 0b01);
});
