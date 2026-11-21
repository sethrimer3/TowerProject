import { givePowers, type GivenPowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { random } from "../src/random.ts";
import type { Board } from "../src/board.ts";
import type { Tile } from "../src/entities.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { CARDS, deckCards, planHand } from "../src/cards/cards.ts";
import { powerBonus, type PowerStat } from "../src/cards/powers.ts";
import { adTerms, gemCardBonus } from "../src/cards/gem-card.ts";
import { CARD_LEVEL_XP, MAX_CARD_XP } from "../src/cards/levels.ts";
import { AD_COOLDOWN_MS, AD_GEMS, GEM_VALUE, adBank, claimAdBank, defaultGemDrop, rollGemKind, sideSpot, wholeGems } from "../src/economy/gems.ts";

const MINUTE = 60 * 1000;
/** The XP that reaches level `n`. */
const xpTo = (n: number) => CARD_LEVEL_XP.slice(0, n).reduce((a, b) => a + b, 0);
/** GEM at level `level` in `save`, ascended as far as it needs. */
function gemAt(save: ReturnType<typeof defaults>, level: number) {
  save.cardXp.gem = level >= 60 ? MAX_CARD_XP : xpTo(level);
  save.cardAscension.gem = Math.max(0, Math.ceil(level / 10) - 1);
}

test("GEM's powers at level 60: 3 minutes off the cooldown and five more rewards banked", () => {
  const bonus = powerBonus({ gem: 60 });
  assert.deepEqual([bonus.gemBankSpeed, bonus.gemXp, bonus.gemChance, bonus.goldenGem, bonus.gemBank, bonus.chestGem, bonus.stellarGem], [180, 1100, 3, 10, 5, 5, 20]);
  assert.deepEqual(adTerms(bonus), { cap: 6, part: 0, cooldown: 7 * MINUTE, gems: AD_GEMS });
  // Half a reward a level: at level 31, a whole one only on a refill whose roll came up.
  assert.deepEqual([adTerms(powerBonus({ gem: 31 })).cap, adTerms(powerBonus({ gem: 31 })).part], [1, 0.5]);
  assert.equal(adTerms(powerBonus({ gem: 31 }), undefined, true).cap, 2);
  assert.equal(adTerms(powerBonus({ gem: 32 }), undefined, true).cap, 2, "a whole reward, no fraction to roll");
});

test("Gem Card (2 Breakthrough) adds the GEM card to the deck, and its upgrades count only while either hand holds it", () => {
  const save = defaults();
  assert.ok(!deckCards(save.upgrades).includes("gem"));
  save.upgrades.gemCard = 1;
  assert.ok(deckCards(save.upgrades).includes("gem"));
  assert.equal(CARDS.gem.name, "Gem");
  gemAt(save, 32);
  assert.deepEqual(adTerms(gemCardBonus(save)), { cap: 1, part: 0, cooldown: AD_COOLDOWN_MS, gems: AD_GEMS }, "in the deck but no hand");
  save.manualHand = ["gem"];
  assert.equal(adTerms(gemCardBonus(save)).cap, 2, "the Manual hand counts");
  save.manualHand = [];
  save.hand = ["stairs", "gem"];
  assert.equal(adTerms(gemCardBonus(save)).cap, 2, "and the Auto hand");
});

test("the Gem button's bank tallies on between claims, stops while full, and fills its meter from the first reward to the last", () => {
  const d = defaultGemDrop(), cap = 3, cd = 10 * MINUTE;
  d.adReadyAt = 1000;
  let bank = adBank(d, 1000, cap, cd);
  assert.deepEqual([bank.banked, bank.fill, bank.full], [1, 0, false], "appears empty");
  bank = adBank(d, 1000 + 5 * MINUTE, cap, cd);
  assert.deepEqual([bank.banked, bank.fill], [1, 0.25], "a quarter of the way from the first to the third");
  // A claim between bankings doesn't reset the tally: the next shows 5 minutes on.
  assert.equal(claimAdBank(d, 1000 + 5 * MINUTE, cap, cd), 1);
  assert.equal(adBank(d, 1000 + 10 * MINUTE - 1, cap, cd).banked, 0);
  assert.equal(adBank(d, 1000 + 10 * MINUTE, cap, cd).banked, 1);
  // Left alone it banks to full, then stops.
  bank = adBank(d, 1000 + 60 * MINUTE, cap, cd);
  assert.deepEqual([bank.banked, bank.fill, bank.full], [3, 1, true]);
  assert.equal(claimAdBank(d, 1000 + 60 * MINUTE, cap, cd), 3, "a claim takes every reward");
  assert.equal(d.adReadyAt, 1000 + 70 * MINUTE, "a full bank tallies again from the claim");
  // Without a bank, the button is as it was: one reward, then the cooldown.
  const plain = defaultGemDrop();
  assert.equal(adBank(plain, 5, 1, cd).banked, 1, "a new profile's shows at once");
  assert.equal(adBank(plain, 5, 1, cd).fill, 0, "with no meter");
  assert.equal(claimAdBank(plain, 5, 1, cd), 1);
  assert.equal(adBank(plain, 5 + cd - 1, 1, cd).banked, 0);
  assert.equal(adBank(plain, 5 + 100 * cd, 1, cd).banked, 1);
});

test("the Gem button pays every banked reward", () => {
  const g = new Game(defaults());
  let now = 5_000_000;
  g.clock = () => now;
  g.save.hand = ["stairs", "gem"];
  gemAt(g.save, 60);
  assert.ok(g.gemFinder.claimAd());
  assert.equal(g.save.gems, AD_GEMS);
  now += 7 * MINUTE * 10;
  assert.deepEqual([g.gemFinder.adBank.banked, g.gemFinder.adBank.gems, g.gemFinder.adBank.full], [6, 6 * AD_GEMS, true]);
  assert.ok(g.gemFinder.claimAd());
  assert.equal(g.save.gems, 7 * AD_GEMS);
});

test("GEM's half reward: each claim rolls whether the next refill banks one more, about half the time", () => {
  const g = new Game(defaults());
  let now = 5_000_000;
  g.clock = () => now;
  g.save.hand = ["stairs", "gem"];
  gemAt(g.save, 31);
  let more = 0;
  for (let i = 0; i < 400; i++) {
    assert.ok(g.gemFinder.claimAd());
    const cap = g.gemFinder.adTerms.cap;
    assert.equal(cap, g.save.gemDrop.adBonusSlot ? 2 : 1);
    if (cap === 2) more++;
    now += 60 * MINUTE;
  }
  assert.ok(more > 150 && more < 250, `about half of 400: ${more}`);
});

test("a Gem's kind rolls golden, then stellar, each from its own sequence; fractions of a Gem carry", () => {
  const counts = { plain: 0, golden: 0, stellar: 0 }, golden = random(1), stellar = random(2);
  for (let i = 0; i < 20000; i++) counts[rollGemKind(10, 50, golden, stellar)]++;
  assert.ok(Math.abs(counts.golden + counts.stellar - 2000) < 200, `about 10% golden or better (${counts.golden + counts.stellar})`);
  assert.ok(Math.abs(counts.stellar - 1000) < 150, `about half of those stellar (${counts.stellar})`);
  assert.equal(rollGemKind(0, 100, golden, stellar), "plain", "no Golden Gem, no stellar");
  assert.deepEqual([GEM_VALUE.plain, GEM_VALUE.golden, GEM_VALUE.stellar], [1, 5, 25]);
  const d = defaultGemDrop();
  assert.deepEqual([wholeGems(d, 1.25), wholeGems(d, 1.25), wholeGems(d, 1.25), wholeGems(d, 1.25)], [1, 1, 1, 2]);
  assert.equal(d.fraction, 0);
});

/** A board of `rows`, one string a row from y = 0 up: `.` floor, `#` wall, `S` stairs, `D` a door. */
function board(rows: string[]): Board {
  const kinds: Record<string, Tile> = { ".": { kind: "floor" }, "#": { kind: "wall" }, S: { kind: "stairs" }, D: { kind: "door", color: "yellow" } };
  return {
    width: rows[0].length, floor: 0,
    tile: (x, y) => kinds[rows[y]?.[x] ?? "#"],
    step: (x, y, dx, dy) => (rows[y + dy]?.[x + dx] === undefined ? null : { x: x + dx, y: y + dy }),
    clear: () => {},
  };
}

test("Gem Chance's Gem lies in a side room where there is one: furthest off the way to the stairs, past doors too", () => {
  const b = board([
    ".....",
    "#.###",
    "#D###",
    "#..##",
    "#.S##",
  ]);
  // The way runs up column 1 to the stairs; the side room is the top row's far end.
  assert.deepEqual(sideSpot(b, { x: 1, y: 4 }, { minY: 0, maxY: Infinity }, random(3)), { x: 4, y: 0 });
  // Its own tile, nor one taken, never.
  assert.deepEqual(sideSpot(b, { x: 1, y: 4 }, { minY: 0, maxY: Infinity }, random(3), [{ x: 4, y: 0 }]), { x: 3, y: 0 });
});

/** A 5 × 5 open floor with the stairs in its far corner, the hero at its first corner, holding GEM raising `stats`. */
function arena(stats: Partial<Record<PowerStat, number>>) {
  const g = new Game(defaults());
  g.save.upgrades.gemCard = 1;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("4,4", { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  g.run.hand = ["gem", "stairs"];
  g.run.handLevels = givePowers({ gem: stats });
  g.clock = () => 1_000_000;
  return g;
}

test("Gem Chance lays a Gem of its own on a new floor beside the cooldown's; GEM heads for them and gains XP from each", () => {
  const g = arena({ gemChance: 100, gemXp: 400 });
  assert.ok(g.move(1, 0));
  const gems = g.gemFinder.gems;
  assert.equal(gems.length, 2, "the cooldown's and Gem Chance's");
  assert.ok(gems.every((gem) => g.world.tile(gem.x, gem.y).kind === "floor"));
  const plan = planHand(g.handRules, ["gem"], "tower")!;
  assert.ok(plan, "GEM wants a Gem");
  const end = plan.path.at(-1)!;
  assert.ok(gems.some((gem) => gem.x === end.x && gem.y === end.y));
  for (const step of plan.path) assert.ok(g.move(step.dx, step.dy));
  assert.equal(g.save.gems, 1);
  assert.equal(g.save.cardXp.gem, 5, "Gem XP: 1 XP and 400% more");
  assert.equal(g.gemFinder.gems.length, 1);
});

test("Gem Chance's Gem missed is gone for good; GEM gains no XP from activating, only from Gems", () => {
  const g = arena({ gemChance: 100 });
  g.move(1, 0);
  assert.equal(g.save.gemDrop.extra.length, 1);
  g.finish("Ended");
  g.newRun();
  assert.equal(g.save.gemDrop.extra.length, 0, "never owed again");
  assert.equal(g.save.cardXp.gem ?? 0, 0);
});

test("a boss may drop a Gem on its tile, and a chest hold one, each rolled once however often undo replays it", () => {
  const g = arena({});
  g.run.handLevels = givePowers({ gem: { bossGem: 100, chestGem: 100, goldenGem: 100 } });
  g.move(1, 0);
  const before = g.save.gemDrop.extra.length;
  const boss = { strength: "boss" } as never;
  g.gemFinder.bossDrop(boss, { x: 3, y: 3 }, `${g.run.seed}:${g.run.height}:3,3`);
  assert.equal(g.save.gemDrop.extra.length, before + 1);
  assert.equal(g.save.gemDrop.extra.at(-1)!.kind, "golden", "Golden Gem's chance");
  g.gemFinder.bossDrop(boss, { x: 3, y: 3 }, `${g.run.seed}:${g.run.height}:3,3`);
  assert.equal(g.save.gemDrop.extra.length, before + 1, "once a boss");
  const gems = g.save.gems;
  g.gemFinder.chestDrop(2, 2);
  assert.equal(g.save.gems, gems + 5, "a golden Gem from the chest");
  g.gemFinder.chestDrop(2, 2);
  assert.equal(g.save.gems, gems + 5, "once a chest");
  assert.equal(g.save.cardXp.gem, 5, "the chest's Gem gives its XP too");
});
