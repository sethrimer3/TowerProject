// The Catacomb screen's Stats menu (ui/catacomb-menus.ts) and its stats table
// (catacombs/summary.ts), docs/CATACOMBS.md step 5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { catacombStatRows, defaultCatacombs, enterCatacomb, mxpForLevel, statLines } from "../src/catacombs/index.ts";
import { menuPanelHtml, statBoxHtml } from "../src/ui/catacomb-menus.ts";

test("a stat box's lines: each stat it raises, a point's worth and the total", () => {
  assert.deepEqual(statLines("force", 17), [{ stat: "matk", name: "MAtk", per: 2, total: 34 }]);
  assert.deepEqual(statLines("vitality", 3), [{ stat: "mhp", name: "MHP", per: 100, total: 300 }]);
});

test("a closed box shows its name and points; an open one its buttons, each off when it can't be pressed", () => {
  const c = defaultCatacombs();
  c.mxp = mxpForLevel(3);
  c.points.ward = 2;
  const closed = statBoxHtml(c, "ward", false);
  assert.match(closed, /Ward<\/b><small>2</);
  assert.doesNotMatch(closed, /catacomb-point/);
  const open = statBoxHtml(c, "ward", true);
  assert.match(open, /MDef \+1 a point · <b>\+2/);
  assert.match(open, /data-delta="-1" aria-label="Take a point from Ward">/, "a point to take back");
  assert.match(open, /data-delta="1" aria-label="Put a point in Ward" disabled>/, "no point free");
  c.points.ward = 0;
  assert.match(statBoxHtml(c, "ward", true), /Take a point from Ward" disabled>/);
});

test("the Stats panel lists every box and the points free; the others say what they will do", () => {
  const c = defaultCatacombs();
  c.mxp = mxpForLevel(4);
  const stats = menuPanelHtml(c, "stats", null);
  for (const name of ["Force", "Ward", "Vitality"]) assert.match(stats, new RegExp(name));
  assert.match(stats, /3 free/);
  assert.match(stats, /id="catacomb-stats-table"/);
  c.ingots.iron = 4;
  assert.match(menuPanelHtml(c, "forge", null), /Ingots to upgrade the Blacksmith's forge[\s\S]*Iron 4/);
  assert.match(menuPanelHtml(c, "spirit", null), /No Spirit yet/);
  assert.match(menuPanelHtml(c, "academy", null), /boosts outside the Catacombs/);
});

test("the stats table: the Magician, the run, Lore and every Spirit and Ingot", () => {
  const c = defaultCatacombs();
  c.rng = 3;
  enterCatacomb(c, 3);
  c.mxp = mxpForLevel(2) + 10;
  c.points.force = 1;
  c.spirit.rare = 5;
  const rows = Object.fromEntries(catacombStatRows(c, 41.7));
  assert.equal(rows["MAtk"], "12");
  assert.equal(rows["MHP"], "1,000 / 1,000");
  assert.equal(rows["Magic level"], "2");
  assert.equal(rows["MXP to next level"], "10 / 240");
  assert.equal(rows["Magic skill points"], "0 free of 1");
  assert.equal(rows["Catacomb"], "III");
  assert.equal(rows["Hall"], "1");
  assert.equal(rows["Lore bonus"], "×3.1");
  assert.equal(rows["Lore"], "41");
  assert.equal(rows["Rare Spirit"], "5");
  assert.equal(rows["Ancestral Spirit"], "0");
  assert.equal(rows["Nickel Ingots"], "0");
});
