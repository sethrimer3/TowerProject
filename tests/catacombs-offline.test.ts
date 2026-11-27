// The Catacombs' time away (docs/CATACOMBS.md, step 6): banked as the app
// starts and reported in the Offline dialog; and Spirit and Ingots in the
// currencies table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { bankGap, BANK_GAP_MS } from "../src/catacombs/clock.ts";
import { catacombLine } from "../src/ui/offline-gold-dialog.ts";
import { currencyRows } from "../src/ui/currencies-dialog.ts";

const HOUR = 3_600_000;

test("a gap over ten seconds banks its whole seconds, the rest left to count on", () => {
  const clock = { lastTurnAt: 1_000_000, bank: 5, haste: 1 as const };
  assert.equal(bankGap(clock, 1_000_000 + BANK_GAP_MS), 0, "ten seconds play out");
  assert.equal(bankGap(clock, 1_000_000 + 2 * HOUR + 400), 7200);
  assert.deepEqual(clock, { lastTurnAt: 1_000_000 + 2 * HOUR, bank: 7205, haste: 1 });
  assert.equal(bankGap({ lastTurnAt: 0, bank: 0, haste: 1 }, 5 * HOUR), 0, "a clock not started banks nothing");
});

test("starting the app banks the time away while a Catacomb run is under way", () => {
  const save = defaults();
  save.upgrades.catacombs = 1;
  const g = new Game(save);
  g.clock = () => 1_000_000;
  assert.equal(g.catacombs.arrive(1_000_000 + HOUR), 0, "no run, nothing banked");
  save.catacombs.rng.spawns = 1;
  g.catacombs.enter(1);
  save.catacombs.clock.lastTurnAt = 1_000_000;
  assert.equal(g.catacombs.arrive(1_000_000 + 3 * HOUR), 10_800);
  assert.equal(save.catacombs.clock.bank, 10_800);
  assert.equal(g.catacombs.arrive(1_000_000 + 3 * HOUR + 500), 0, "only once");
  save.upgrades.catacombs = 0;
  save.catacombs.clock.lastTurnAt = 1_000_000;
  assert.equal(g.catacombs.arrive(1_000_000 + HOUR), 0, "nothing while the Catacombs are shut");
});

test("the Offline dialog's Catacomb line: the turns banked and the time", () => {
  assert.match(catacombLine(10_800), /Catacombs: <b>\+10,800<\/b> banked turns \(03h:00m\)/);
});

test("the currencies table lists every Spirit and Ingot once the Catacombs are open", () => {
  const save = defaults(), g = new Game(save);
  const ids = () => currencyRows(g).map((r) => r.id);
  assert.ok(!ids().some((id) => id.startsWith("spirit-") || id.startsWith("ingot-")));
  save.upgrades.catacombs = 1;
  save.catacombs.spirit.epic = 12;
  save.catacombs.ingots.steel = 3;
  const rows = currencyRows(g);
  assert.deepEqual(rows.filter((r) => r.id.startsWith("spirit-")).map((r) => r.name),
    ["Common Spirit", "Uncommon Spirit", "Rare Spirit", "Epic Spirit", "Legendary Spirit", "Mythic Spirit", "Ancestral Spirit"]);
  assert.deepEqual(rows.filter((r) => r.id.startsWith("ingot-")).map((r) => r.name), ["Brass Ingots", "Iron Ingots", "Steel Ingots", "Nickel Ingots"]);
  assert.equal(rows.find((r) => r.id === "spirit-epic")!.value, "12");
  assert.equal(rows.find((r) => r.id === "ingot-steel")!.value, "3");
});
