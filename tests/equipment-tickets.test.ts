import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { itemDef } from "../src/equipment/catalog.ts";
import { pullPrice, rarityRank, WELCOME_TICKETS } from "../src/equipment/balance.ts";
import { decodeEquipment, defaultEquipment, openEquipment } from "../src/equipment/inventory.ts";
import { pull } from "../src/equipment/acquire.ts";
import { random } from "../src/random.ts";

/** A game whose Equipment the floor-60 Goal of Tower II has just opened. */
function opened() {
  const s = defaults();
  s.tower.tiersOpen = 2;
  s.tower.tierRecords[2] = { best: 60, reached: 60 };
  const g = new Game(s);
  g.newRun({ outside: true, seed: 7 });
  assert.equal(g.claimGoal(2, 60, false)?.kind, "unlock");
  return g;
}
const isEpicUnique = (p: { item: { def: string; rarity: string } }) => itemDef(p.item.def)!.class === "unique" && p.item.rarity === "epic";

test("opening Equipment by its Goal gives ten Equipment Tickets, once", () => {
  const g = opened(), e = g.save.equipment;
  assert.equal(WELCOME_TICKETS, 10);
  assert.deepEqual([e.unlocked, e.tickets, e.welcome], [true, 10, { left: 10, epic: true }]);
  openEquipment(e);
  assert.equal(e.tickets, 10, "an Equipment already open gives none again");
  const kept = new Game(decode(JSON.stringify(g.save))).save.equipment;
  assert.deepEqual([kept.tickets, kept.welcome], [10, { left: 10, epic: true }], "kept by the save");
});

test("tickets pay for pulls first, a ticket a pull, and Gems the rest at that pull's price", () => {
  assert.deepEqual(pullPrice(1, false, 0), { tickets: 0, gems: 20 });
  assert.deepEqual(pullPrice(1, false, 5), { tickets: 1, gems: 0 });
  assert.deepEqual(pullPrice(10, false, 3), { tickets: 3, gems: 140 });
  assert.deepEqual(pullPrice(10, true, 3), { tickets: 3, gems: 126 }, "all types keep their discount on the Gems");
  assert.deepEqual(pullPrice(10, true, 12), { tickets: 10, gems: 0 });
  const g = opened(), e = g.save.equipment;
  e.tickets = 3;
  assert.equal(g.equipment.pull("all", 10), "gems", "short of the rest's Gems, nothing is taken");
  assert.equal(e.tickets, 3);
  g.save.gems = 126;
  assert.ok(Array.isArray(g.equipment.pull("all", 10)));
  assert.deepEqual([e.tickets, g.save.gems], [0, 0]);
});

test("one of the first ten ticket pulls is a sure Epic Unique, landing on any of them", () => {
  const where = new Set<number>();
  for (let seed = 1; seed <= 40; seed++) {
    const g = opened(), e = g.save.equipment;
    e.streams.all = e.streams.weapon = seed * 7919;
    // Six single ticket pulls, then ten more: four tickets and six pulls' Gems.
    g.save.gems = 120;
    const all = [...Array.from({ length: 6 }, () => g.equipment.pull("all", 1)), g.equipment.pull("weapon", 10)]
      .flatMap((r) => (Array.isArray(r) ? r : assert.fail(String(r))));
    assert.equal(all.length, 16);
    assert.deepEqual([e.tickets, g.save.gems], [0, 0]);
    const sure = all.flatMap((p, i) => (p.sure ? [i] : []));
    assert.equal(sure.length, 1, `seed ${seed}: exactly one sure pull`);
    assert.ok(sure[0] < 10 && isEpicUnique(all[sure[0]]), "among the ten, an Epic Unique");
    assert.deepEqual(e.welcome, { left: 0, epic: false });
    where.add(sure[0]);
  }
  assert.ok(where.size >= 6, `it lands on many of the ten: ${[...where].sort((a, b) => a - b)}`);
});

test("Gem pulls, and ticket pulls after the first ten, bring no sure Epic", () => {
  const e = { ...defaultEquipment(), unlocked: true, tickets: 30, welcome: { left: 0, epic: false } };
  const pulled = pull(e, "all", 10, random(3), 0, 10);
  assert.ok(pulled.every((p) => !p.sure));
  const fresh = { ...defaultEquipment(), unlocked: true, welcome: { left: 10, epic: true } };
  assert.ok(pull(fresh, "all", 10, random(3), 0, 0).every((p) => !p.sure), "Gem pulls leave the welcome alone");
  assert.deepEqual(fresh.welcome, { left: 10, epic: true });
});

test("the sure pull counts as an Epic for pity", () => {
  const e = { ...defaultEquipment(), unlocked: true, tickets: 1, welcome: { left: 1, epic: true } };
  e.pity.all = 50;
  const [p] = pull(e, "all", 1, random(5), 0, 1);
  assert.ok(p.sure && isEpicUnique(p) && rarityRank(p.item.rarity) === rarityRank("epic"));
  assert.equal(e.pity.all, 0);
});

test("decoding keeps tickets and the welcome, and drops what can't be", () => {
  const e = decodeEquipment({ unlocked: true, tickets: 4, welcome: { left: 3, epic: true } });
  assert.deepEqual([e.tickets, e.welcome], [4, { left: 3, epic: true }]);
  const bad = decodeEquipment({ unlocked: true, tickets: -2, welcome: { left: 99, epic: true } });
  assert.deepEqual([bad.tickets, bad.welcome], [0, { left: 0, epic: false }]);
  assert.deepEqual(decodeEquipment({ welcome: { left: 0, epic: true } }).welcome, { left: 0, epic: false }, "no sure pull with none left");
});
