// The Catacombs' ×0 pause, a fight's forecast and a tapped hall tile's box
// (src/catacombs/clock.ts, forecast.ts, ui/catacomb-tile-info.ts), and the
// boost table's tap words (boosts/catalog.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CORRIDOR_ROW, defaultCatacombs, enterCatacomb, forecastFight, hallTargets, LORE_X, newCarry, setHaste, SLOT_XS, STAIRS_X, tick,
  undeadStats, type CatacombSave, type Slot,
} from "../src/catacombs/index.ts";
import { catacombTileInfo, plainTile } from "../src/ui/catacomb-tile-info.ts";
import { hasteLabel } from "../src/ui/catacomb-view.ts";
import { BOOST_IDS, BOOSTS } from "../src/boosts/catalog.ts";
import { seedAll } from "./catacombs-seed.ts";

const fresh = (): CatacombSave => {
  const c = defaultCatacombs();
  seedAll(c, 3);
  enterCatacomb(c, 1);
  return c;
};
const slot = (id: Slot["id"], strength: Slot["strength"] = "normal"): Slot => ({ id, strength, mhp: undeadStats(id, strength, 1, 1).mhp });
const only = (c: CatacombSave, s: Slot) => {
  c.run!.slots = [s, null, null, null, null, null];
  c.run!.hero.x = 1;
};
const plainText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("×0 pauses the Catacombs: each second goes to the bank, none is played", () => {
  const c = defaultCatacombs(), carry = newCarry();
  tick(c.clock, 1_000_000, carry);
  setHaste(c.clock, 0, carry);
  assert.equal(c.clock.haste, 0, "pausing needs nothing banked");
  assert.deepEqual(tick(c.clock, 1_003_400, carry), { real: 0, hasted: 0, banked: 3, slowed: false });
  assert.equal(c.clock.bank, 3);
  // Played on, it starts from the second it was at, and the bank pays for haste.
  setHaste(c.clock, 1, carry);
  assert.equal(tick(c.clock, 1_004_000, carry).real, 1);
  setHaste(c.clock, 5, carry);
  assert.equal(c.clock.haste, 5);
  assert.equal(hasteLabel(0), "×0 (Pause)");
  assert.equal(hasteLabel(10), "×10");
});

test("a forecast plays the fight out without MCrits and changes nothing", () => {
  const c = fresh();
  only(c, slot("ghost"));
  const before = JSON.stringify(c);
  // A Ghost: 250 MHP, MDef 5 against MAtk 10 is 5 a strike, and 10 MAtk against MDef 0 is 10 a strike back.
  const f = forecastFight(c, 0)!;
  assert.deepEqual(f, { strikes: 50, damage: 490, survives: true, stalemate: false });
  assert.equal(JSON.stringify(c), before);
  // A Speed Drop's attacks strike twice a round: half the rounds, half the damage back.
  c.speed = 100;
  assert.deepEqual(forecastFight(c, 0), { strikes: 50, damage: 240, survives: true, stalemate: false });
  c.speed = 0;
  // Too little MHP left is LETHAL.
  c.run!.hero.mhp = 100;
  assert.equal(forecastFight(c, 0)!.survives, false);
  // An undead the Magician can't harm, that can't harm it either: the run restarts.
  only(c, { ...slot("skeleton"), mhp: 550 });
  c.run!.hero.mhp = 1000;
  assert.equal(forecastFight(c, 0)!.strikes, 0);
  assert.equal(forecastFight(c, 1), null, "no undead there");
});

test("a tapped tile's box: an undead's Magic stats, what it pays and its forecast", () => {
  const c = fresh();
  only(c, { ...slot("ghost"), drops: { mxp: 4 }, mark: "gold" });
  const info = catacombTileInfo(c, SLOT_XS[0], CORRIDOR_ROW)!;
  assert.equal(info.title, "Ghost");
  const text = plainText(info.body);
  // MHP, MAtk with each strike back, MDef with each of the Magician's strikes, MXP (×4 Drop) and Spirit.
  for (const piece of ["250 · 10 ( -10 ) · 5 ( -5 ) · 12 · 1", "MXP Drop: ×4 MXP", "Gold crosshair", "490 damage · Survivable", "50 hits to defeat"])
    assert.ok(text.includes(piece), `${piece} in: ${text}`);
  assert.ok(!text.includes("without MCrits"), "no MCrit chance, nothing to leave out");
  assert.ok(!plainTile(info));
  only(c, slot("wisp", "elite"));
  assert.equal(catacombTileInfo(c, SLOT_XS[0], CORRIDOR_ROW)!.title, "Elite Wisp");
});

test("a tapped tile's box: the Lore, the stairs, a potion and plain stone", () => {
  const c = fresh(), run = c.run!;
  const lore = hallTargets(run.hall, c.number, run.slots).find((t) => t.kind === "lore")!;
  assert.equal(catacombTileInfo(c, LORE_X, CORRIDOR_ROW)!.title, "Lore");
  assert.ok(plainText(catacombTileInfo(c, LORE_X, CORRIDOR_ROW)!.body).includes(`+${lore.amount} Lore`));
  assert.equal(catacombTileInfo(c, STAIRS_X, CORRIDOR_ROW)!.body, "Leads to Hall 2");
  run.potions = [[1, CORRIDOR_ROW - 1]];
  run.hero.mhp = 995;
  const potion = catacombTileInfo(c, 1, CORRIDOR_ROW - 1)!;
  assert.equal(potion.title, "Potion");
  assert.ok(plainText(potion.body).includes("+5 MHP"), "only what room is left");
  assert.ok(plainTile(catacombTileInfo(c, 0, 0)!), "a wall fades");
  assert.equal(catacombTileInfo(c, 0, 0)!.title, "Wall");
  assert.ok(plainTile(catacombTileInfo(c, 1, CORRIDOR_ROW + 1)!), "a floor fades");
});

test("every boost says what it does in a few words", () => {
  for (const id of BOOST_IDS) {
    const about = BOOSTS[id].about(BOOSTS[id].plus ? "+1" : "×1.5");
    assert.match(about, /^[A-Z].*\.$/, id);
    assert.ok(about.split(" ").length <= 8, `${id}: ${about}`);
    assert.ok(!/[—<>&]/.test(about), id);
  }
});
