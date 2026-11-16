import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import { premiumOffers, type OfferId } from "../src/shop/offers.ts";
import { refusal } from "../src/shop/transactions.ts";
import { offer } from "../src/shop/offers.ts";
import {
  AD_JACKPOT_GEMS, CHAMPION_BONUSES, DAILY_TRAINING_POINTS, bonusAt, championAd, championTier, championValue, claimDaily, claimTicket,
  decodeChampion, defaultChampion, onePieceChoices, redeemTicket, rollDaily, tierFor, tierPoints, ticketsEarned, ticketsWaiting,
} from "../src/shop/champion.ts";
import { relicAmount } from "../src/economy/relic-effects.ts";
import { RELICS } from "../src/economy/relics.ts";
import { adTerms } from "../src/cards/gem-card.ts";
import { treeBonus } from "../src/cards/trees.ts";
import { AD_COOLDOWN_MS, AD_GEMS } from "../src/economy/gems.ts";
import { goldMultipliers, silverFound } from "../src/economy/gold-multipliers.ts";
import { arrive, offlineGrant, recordClimb } from "../src/offline-gold.ts";
import { researched } from "../src/progression/archives.ts";
import { withStream } from "../src/random.ts";
import { STARS } from "../src/equipment/balance.ts";
import { openEquipment } from "../src/equipment/inventory.ts";

/** Noon GMT on some day, a real timestamp. */
const NOON = 20_500 * DAY_MS + DAY_MS / 2;
const HOUR = 3_600_000;
const buy = (g: Game, id: OfferId) => assert.equal(g.shop.buy(id, NOON, true), null, id);
/** A Champion with `vip` VIP Points earned in all. */
function champion(vip = 0) {
  const g = new Game(defaults());
  for (const id of ["adFree", "coins2", "coins3"] as const) buy(g, id);
  g.save.vip = vip;
  return g;
}

test("the Gold bundles are renamed, and the Champion's Bundle waits for Ad-Disable and the Special Gold Bundle", () => {
  const g = new Game(defaults());
  assert.equal(offer("coins2")!.name, "Special Gold Bundle");
  assert.equal(offer("coins3")!.name, "Champion's Bundle");
  assert.equal(refusal(g.save, offer("coins3")!, NOON, "free"), "after");
  buy(g, "adFree");
  assert.equal(g.shop.buy("coins3", NOON, true), "after", "still waiting on the Special Gold Bundle");
  buy(g, "coins2");
  buy(g, "coins3");
  assert.equal(championTier(g.save), 0, "the Base Tier comes with it");
  assert.equal(g.save.vip, 160 + 160 + 480);
});

test("tiers open at their VIP Points, then one every 9,600 from Tier 14", () => {
  assert.deepEqual([0, 959, 960, 1440, 37199, 37200, 46799, 46800, 56400].map(tierFor), [0, 0, 1, 2, 12, 13, 13, 14, 15]);
  assert.equal(tierPoints(1), 960);
  assert.equal(tierPoints(13), 37200);
  assert.equal(tierPoints(14), 46800);
  for (let n = 1; n < 30; n++) assert.equal(tierFor(tierPoints(n)), n, `tier ${n}`);
  assert.equal(championTier(new Game(defaults()).save), null, "no tier without the bundle");
});

test("each bonus starts at its tier and grows with every tier past it, up to its cap", () => {
  assert.equal(bonusAt("offlineGold", 0), 5);
  assert.equal(bonusAt("offlineGold", 3), 11);
  assert.equal(bonusAt("offlineGold", 100), 95);
  assert.equal(bonusAt("offlineGems", 100), 50);
  assert.equal(bonusAt("gemCooldown", 1), 0, "not before its tier");
  assert.equal(bonusAt("gemCooldown", 2), 10);
  assert.equal(bonusAt("gemCooldown", 30), 60);
  assert.equal(bonusAt("gold", 20), 5 + 3 * 17, "no cap");
  assert.equal(bonusAt("gemBank", 50), 9);
  assert.equal(bonusAt("dash", 20), 1, "Dash's level doesn't grow");
  assert.equal(bonusAt("endRush", 12), 3);
  assert.equal(bonusAt("gemChance", 13), 0.75);
  assert.equal(bonusAt("gemChance", 40), 2);
  assert.equal(bonusAt("adJackpot", 15), 0.75);
  assert.equal(bonusAt("gold", null), 0);
  for (const b of Object.values(CHAMPION_BONUSES)) assert.ok(b.cap === undefined || b.cap >= b.base);
});

test("a Champion sees the next two Premium Offers", () => {
  const g = new Game(defaults());
  assert.deepEqual(premiumOffers(g.save).map((o) => o.id), ["researcher"]);
  assert.deepEqual(premiumOffers(g.save, 2).map((o) => o.id), ["researcher", "trainer"]);
  buy(g, "researcher");
  buy(g, "trainer");
  assert.deepEqual(premiumOffers(g.save, 2).map((o) => o.id), ["stellar"]);
});

test("the Champion's Cape raises ATK and DEF by 5%, and Champion XP is its own +25% factor", () => {
  const g = champion();
  assert.ok(g.save.relics.includes("shop.coins3"));
  assert.equal(RELICS["shop.coins3"]!.name, "Champion's Cape");
  assert.equal(RELICS["shop.coins3"]!.rarity, "legendary");
  const plain = new Game(defaults());
  plain.newRun();
  g.newRun();
  const xp = (game: Game) => {
    const before = game.save.xp;
    game.gainXp({ strength: "boss" } as never, 100);
    return game.save.xp - before;
  };
  const base = xp(plain);
  assert.ok(base > 0);
  assert.equal(xp(g), Math.round(base * 1.25));
  assert.equal(relicAmount(g.save, "stellarFloor"), 0);
});

test("the ad Gem button: −20 s from the bundle, and the tiers' cooldown, bank, Gems and jackpot", () => {
  const none = treeBonus(undefined);
  assert.deepEqual(adTerms(none, championAd(new Game(defaults()).save)), adTerms(none));
  const base = champion();
  assert.equal(adTerms(none, championAd(base.save)).cooldown, AD_COOLDOWN_MS - 20_000);
  const high = champion(tierPoints(13));
  const terms = adTerms(none, championAd(high.save));
  assert.equal(terms.cooldown, AD_COOLDOWN_MS - (20 + 60) * 1000, "the tier's capped at 60 s");
  assert.equal(terms.cap, 1 + 2 + 7);
  assert.equal(terms.gems, AD_GEMS + 2 + 5);
  assert.equal(championAd(high.save).jackpot, 0.25);
  // A claim of every reward the bank holds: the jackpot's roll pays 100 in place of one.
  high.newRun({ outside: true });
  let now = 1_800_000_000_000;
  high.clock = () => now;
  high.save.gemDrop.adReadyAt = now;
  high.save.gemDrop.adBanked = 0;
  const gems = high.save.gems;
  withStream("champion", () => 0, () => assert.ok(high.gemFinder.claimAd()));
  assert.equal(high.save.gems - gems, AD_JACKPOT_GEMS);
  now += 10 * HOUR;
  const again = high.save.gems;
  withStream("champion", () => 0.99, () => assert.ok(high.gemFinder.claimAd()));
  assert.equal((high.save.gems - again) % terms.gems, 0, "no jackpot: each reward its Gems");
});

test("Daily Training Points: once each GMT day, rolling ×5, then ×3, then ×2", () => {
  const plain = new Game(defaults());
  assert.equal(claimDaily(plain.save, NOON, () => 0), null, "only a Champion claims them");
  const g = champion();
  const points = g.save.bonusTrainingPoints;
  assert.deepEqual(claimDaily(g.save, NOON, () => 0.99), { points: DAILY_TRAINING_POINTS, times: 1 }, "no tier rolls nothing");
  assert.equal(g.save.bonusTrainingPoints, points + DAILY_TRAINING_POINTS);
  assert.equal(claimDaily(g.save, NOON + HOUR, () => 0), null, "once a day");
  assert.ok(claimDaily(g.save, NOON + DAY_MS / 2, () => 0.99), "again from 00:00 GMT");
  // Tier 11: ×5 at 10%, ×3 at 16 + 8×4 = 48%, ×2 at 12 + 6×10 = 72%.
  g.save.vip = tierPoints(11);
  const draws = (...n: number[]) => () => n.shift()!;
  assert.equal(rollDaily(g.save, draws(0.05)), 5);
  assert.equal(rollDaily(g.save, draws(0.5, 0.4)), 3, "×5 missed, ×3 rolled next");
  assert.equal(rollDaily(g.save, draws(0.5, 0.5, 0.7)), 2);
  assert.equal(rollDaily(g.save, draws(0.5, 0.5, 0.8)), 1);
  assert.equal(championValue(g.save, "dailyDouble"), 72);
  assert.equal(championValue(g.save, "dailyTriple"), 48);
  assert.equal(championValue(g.save, "dailyFive"), 10);
  // The base is 1 point, so ×2, ×3 and ×5 pay 2, 3 and 5.
  assert.equal(DAILY_TRAINING_POINTS, 1);
  assert.deepEqual(claimDaily(g.save, NOON + 2 * DAY_MS, () => 0), { points: 5, times: 5 });
});

test("One Piece Tickets: one a tier from 14, claimed in the Club, each a free five-Star Unique", () => {
  const g = champion(tierPoints(13));
  assert.equal(ticketsEarned(g.save), 0);
  assert.equal(claimTicket(g.save), false);
  g.save.vip = tierPoints(15);
  assert.equal(ticketsWaiting(g.save), 2);
  assert.ok(claimTicket(g.save));
  assert.equal(ticketsWaiting(g.save), 1);
  assert.equal(g.save.champion.tickets, 1);
  openEquipment(g.save.equipment);
  const choices = onePieceChoices(g.save);
  assert.ok(choices.length > 0 && choices.every((d) => d.class === "unique"));
  assert.equal(redeemTicket(g.save, "nope"), "choice");
  const item = redeemTicket(g.save, choices[0]!.id);
  assert.ok(typeof item === "object");
  assert.equal(item.rarity, "ancestral");
  assert.equal(item.stars, STARS.most);
  assert.ok(g.save.equipment.maxed.includes(choices[0]!.id) && g.save.equipment.drawOff.includes(choices[0]!.id));
  assert.equal(g.save.champion.tickets, 0);
  assert.equal(redeemTicket(g.save, choices[0]!.id), "ticket");
});

test("Champion Status is saved, decoded defensively, and outlasts Erase All", () => {
  assert.deepEqual(decodeChampion("x"), defaultChampion());
  assert.deepEqual(decodeChampion({ dailyDay: -1, ticketsClaimed: 2.5, tickets: "3" }), { dailyDay: 0, ticketsClaimed: 2, tickets: 0 });
  const g = champion(tierPoints(14));
  claimTicket(g.save);
  claimDaily(g.save, NOON, () => 0.99);
  assert.deepEqual(decode(JSON.stringify(g.save)).champion, g.save.champion);
  const kept = { ...g.save.champion };
  g.eraseAll();
  assert.deepEqual(g.save.champion, kept);
  assert.ok(g.save.relics.includes("shop.coins3"), "the cape comes back");
});

test("Gold and Silver: the Club's tiers add factors of their own, listed only for a Champion", () => {
  const plain = new Game(defaults());
  assert.ok(!goldMultipliers({ save: plain.save, mode: "tower", tier: 1, now: 0 }).some((m) => m.id === "champion"));
  const g = champion();
  assert.deepEqual(goldMultipliers({ save: g.save, mode: "tower", tier: 1, now: 0 }).find((m) => m.id === "champion"), { id: "champion", name: "Champion's Club", factor: null });
  g.save.vip = tierPoints(5);
  assert.equal(goldMultipliers({ save: g.save, mode: "tower", tier: 1, now: 0 }).find((m) => m.id === "champion")!.factor, 1.11);
  g.save.upgrades.wealthy = 1;
  const silver = silverFound(g.save, "tower", 10), without = silverFound({ ...g.save, entitlements: [] }, "tower", 10);
  assert.ok(Math.abs(silver - without * 1.15) < 1e-9, `${silver} vs ${without}`);
});

test("Offline: a Champion is paid without the skill, for twice the time, with Offline Gems from the floors climbed", () => {
  const g = champion(tierPoints(12));
  g.save.upgrades.offlineGold = 0;
  for (let i = 0; i < 4; i++) recordClimb(g.save.offline, 1000, HOUR, 120);
  const away = 10 * HOUR, grant = offlineGrant(g.save, away);
  const cap = researched(g.save.archives, "offlineGoldMinutes") * 60_000 * 2;
  assert.equal(grant.capMs, cap);
  assert.equal(grant.multiplier, (5 + 2 * 12) * 10, "the Club's rate alone, in tenths of a percent");
  assert.equal(grant.gold, Math.floor((1000 * (Math.min(away, cap) / HOUR) * grant.multiplier) / 1000));
  // 2 floors a minute: the Gem timer finds one every 30 minutes, Gem chance 0.5% a floor, Golden Gems 5 + 3×7 = 26%.
  const paid = Math.min(away, cap), floors = (2 * paid) / 60_000, golden = 0.26;
  const expected = Math.floor(((paid / (30 * 60_000) + 0.005 * floors) * ((1 - golden) + golden * 5) * (5 + 2 * 12)) / 100);
  assert.equal(grant.gems, expected);
  assert.ok(grant.gems > 0);
  // Arriving owes it; claiming pays both.
  g.save.offline.seenAt = 1;
  arrive(g.save, 1 + away, false);
  const gems = g.save.gems, gold = g.save.gold;
  g.claimOfflineGold();
  assert.equal(g.save.gems - gems, grant.gems);
  assert.equal(g.save.gold - gold, grant.gold);
  // No floors recorded, no Offline Gems; no Champion, no grant without the skill.
  const plain = new Game(defaults());
  recordClimb(plain.save.offline, 1000, HOUR, 120);
  plain.save.offline.seenAt = 1;
  assert.equal(arrive(plain.save, 1 + away, false), null);
});

test("a Tower climb records its new floors for the Recent Floors per Minute", () => {
  const g = new Game(defaults());
  let now = Date.UTC(2026, 9, 30, 12);
  g.clock = () => now;
  g.newRun({ seed: 3 });
  g.run.notes!.floors = 7;
  now += HOUR;
  g.finish("Ended");
  assert.equal(g.save.offline.climbs.at(-1)!.floors, 7);
});

test("Dash, End Rush and the Stellar Floor chance count the Club's tiers without their research", () => {
  const g = champion(tierPoints(12));
  g.newRun();
  assert.equal(g.save.upgrades.dash ?? 0, 0);
  assert.equal(g.dashTiles, g.worn.dashTiles + 1);
  assert.equal(g.dashFor("stairs") - g.dashTiles, g.worn.endRushTiles + 3);
  assert.equal(g.environments.stellarFloor, 4);
  // With the research, the Club's tiles add to its levels'.
  g.save.upgrades.dash = 1;
  g.save.upgrades.endRush = 1;
  g.save.archives.levels.dash = 3;
  g.save.archives.levels.endRush = 2;
  assert.equal(g.dashTiles, g.worn.dashTiles + 3 + 1);
  assert.equal(g.dashFor("stairs") - g.dashTiles, g.worn.endRushTiles + 2 + 3);
});
