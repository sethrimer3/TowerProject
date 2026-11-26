import { test } from "node:test";
import assert from "node:assert/strict";
import { random } from "../src/random.ts";
import { defaults, decode } from "../src/save/save.ts";
import {
  GIFT_RARITIES, GIFT_WEIGHTS, GIFTS, addGifts, decodeGifts, giftCount, giftId, giftsSince, giftTotals, grantGifts, rollGift,
} from "../src/economy/gifts.ts";
import { giftAmount, giftFactor } from "../src/economy/gift-effects.ts";
import { loadout, statFactor } from "../src/progression/loadout.ts";
import { trainedAmount } from "../src/progression/training.ts";
import { goldMultipliers } from "../src/economy/gold-multipliers.ts";
import { settlePerks } from "../src/shop/perks.ts";
import { grant } from "../src/shop/items.ts";
import { OFFERS } from "../src/shop/offers.ts";
import { towerRelicId } from "../src/economy/relics.ts";
import { RELICS } from "../src/economy/relics.ts";

test("gift rarities roll by their weights, and Mythic never", () => {
  assert.equal(GIFT_RARITIES.reduce((n, r) => n + GIFT_WEIGHTS[r], 0), 100);
  const rng = random(12345), seen: Record<string, number> = {};
  const n = 20_000;
  for (let i = 0; i < n; i++) {
    const r = GIFTS[rollGift(rng)]!.rarity;
    seen[r] = (seen[r] ?? 0) + 1;
  }
  assert.equal(seen.mythic, undefined);
  for (const r of GIFT_RARITIES) if (GIFT_WEIGHTS[r]) assert.ok(Math.abs((seen[r] ?? 0) / n * 100 - GIFT_WEIGHTS[r]) < 1.5, `${r}: ${seen[r]}`);
});

test("every rolled rarity has gifts, and the catalog's ids name rarity and stat", () => {
  for (const r of GIFT_RARITIES) if (GIFT_WEIGHTS[r]) assert.ok(Object.values(GIFTS).some((g) => g.rarity === r), r);
  assert.deepEqual(GIFTS[giftId("legendary", "xp")], { rarity: "legendary", stat: "xp", percent: 10 });
  assert.deepEqual(GIFTS[giftId("epic", "drop5")], { rarity: "epic", stat: "drop5", percent: 1 });
});

test("gifts roll on their saved stream: a reload rolls on where it stopped", () => {
  const a = defaults(), first = grantGifts(a, 3);
  assert.equal(giftCount(a.gifts), 3);
  assert.notEqual(a.gifts.rng, null);
  const b = decode(JSON.stringify(a));
  assert.deepEqual(b.gifts, a.gifts, "the gifts decode as saved");
  assert.deepEqual(grantGifts(b, 5), grantGifts(a, 5), "the same stream on from the same place");
  assert.equal(first.reduce((n, g) => n + g.count, 0), 3);
});

test("gifts decode defensively", () => {
  assert.deepEqual(decodeGifts(null), { owned: {}, rng: null, expanded: false, perks: [] });
  const d = decodeGifts({ owned: { "common.attack": 2, "nope.x": 4, "rare.gold": -1 }, rng: 7, expanded: true, perks: ["coins3", "coins3", 5] });
  assert.deepEqual(d, { owned: { "common.attack": 2 }, rng: 7, expanded: true, perks: ["coins3"] });
});

test("gifts of a stat add up, then multiply the relics' factor as one of their own", () => {
  const save = defaults();
  addGifts(save, ["common.attack", "common.attack", "rare.attack"]);
  assert.equal(giftAmount(save, "attack"), 5);
  const base = statFactor(save, "attack");
  // A tower relic of ATK, if one exists, multiplies apart from the gifts.
  const relic = Object.entries(RELICS).find(([, r]) => r.bonus.kind === "boost" && r.bonus.stat === "attack" && !r.also);
  assert.ok(relic, "some relic raises ATK");
  save.relics.push(relic![0]);
  const pct = relic![1].bonus.kind === "boost" ? relic![1].bonus.percent : 0;
  const both = statFactor(save, "attack");
  assert.ok(Math.abs(both - (base * (100 + pct)) / 100) < 1e-9, "relics multiply the gifts' factor, not add into it");
  assert.ok(Math.abs(base - 1.05 * statFactor(defaults(), "attack")) < 1e-9);
  assert.ok(loadout(save).attack > loadout(defaults()).attack);
  assert.ok(towerRelicId(1, "epic"));
});

test("Silver and Critical Chance gifts count before their rows are open", () => {
  const save = defaults();
  const silver = trainedAmount(save, "silverBonus"), crit = trainedAmount(save, "critChance");
  addGifts(save, ["common.silver", "legendary.critChance"]);
  assert.equal(trainedAmount(save, "silverBonus"), silver * 1.01);
  assert.equal(trainedAmount(save, "critChance"), crit + 100, "a point of Critical Chance, in the row's hundredths");
});

test("gifts' Gold is a Gold multiplier of its own", () => {
  const save = defaults();
  const line = () => goldMultipliers({ save, mode: "tower", tier: 1, now: 0 }).find((m) => m.id === "gifts");
  assert.equal(line()?.factor, null);
  addGifts(save, ["rare.gold", "legendary.gold"]);
  assert.equal(line()?.factor, 1.04);
  assert.equal(giftFactor(save, "gold"), 1.04);
});

test("the Champion's Bundle gives 10 gifts once, and again after its gifts are cleared", () => {
  const save = defaults(), offer = OFFERS.find((o) => o.id === "coins3")!;
  const before = save.gifts.owned;
  grant(save, offer.item!, 1);
  assert.equal(giftCount(save.gifts), 10);
  assert.equal(giftsSince(before, save.gifts.owned).reduce((n, g) => n + g.count, 0), 10);
  settlePerks(save);
  assert.equal(giftCount(save.gifts), 10, "never twice");
  assert.ok(!offer.effects.includes("10 Gifts"), "its card shows the gifts as an icon instead");
  const reloaded = decode(JSON.stringify(save));
  assert.equal(giftCount(reloaded.gifts), 10, "a reload gives none more");
  const totals = giftTotals(save.gifts);
  assert.equal(totals.reduce((n, t) => n + t.count, 0), 10);
});

test("×3 and ×5 Drop Chance roll by the tile, and both together drop ×15", async () => {
  const { Game } = await import("../src/state.ts");
  const save = defaults();
  save.tutorials.climb = true;
  const g = new Game(save);
  g.newRun();
  assert.equal(g.purse.dropMultiplier(3, 4), 1, "none without the gifts");
  save.gifts.owned = { "uncommon.drop3": 100 };
  assert.equal(g.purse.dropMultiplier(3, 4), 3);
  save.gifts.owned = { "uncommon.drop3": 100, "epic.drop5": 100 };
  assert.equal(g.purse.dropMultiplier(3, 4), 15);
  save.gifts.owned = { "uncommon.drop3": 50 };
  const rolls = Array.from({ length: 400 }, (_, i) => g.purse.dropMultiplier(i % 20, Math.floor(i / 20)));
  assert.deepEqual(rolls, Array.from({ length: 400 }, (_, i) => g.purse.dropMultiplier(i % 20, Math.floor(i / 20))), "the same every time");
  const threes = rolls.filter((r) => r === 3).length;
  assert.ok(threes > 120 && threes < 280, `about half: ${threes}`);
});

test("Potions, Shards and Keys raise what each pickup yields; Provisions the elixir and Gold Keys", async () => {
  const { Game } = await import("../src/state.ts");
  const save = defaults();
  save.tutorials.climb = true;
  const g = new Game(save);
  g.newRun();
  assert.equal(g.stepRules.yields, undefined);
  save.gifts.owned = { "uncommon.potions": 2, "uncommon.shards": 3, "rare.keys": 1 };
  assert.deepEqual(g.stepRules.yields, { potion: 1.02, attack: 1.03, defense: 1.03, yellow: 1.01, blue: 1.01, red: 1.01 });
  save.gifts.owned = { "uncommon.provisions": 5 };
  save.provisions.heal = 1;
  const p = g.run.player;
  p.hp = p.maxHp;
  assert.equal(g.useProvision("heal"), "used", "the elixir heals past max HP");
  assert.equal(p.hp, p.maxHp * 1.05);
});
