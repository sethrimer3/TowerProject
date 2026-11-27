// The Catacomb screen's menus (ui/catacomb-menus.ts): the Skills boxes, the
// Spirit upgrades, the abilities, and the stats table (catacombs/summary.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { catacombStatRows, defaultCatacombs, enterCatacomb, mxpForLevel, skillLines } from "../src/catacombs/index.ts";
import { abilitiesHtml, menuPanelHtml, skillBoxHtml, upgradeHtml } from "../src/ui/catacomb-menus.ts";
import { seedAll } from "./catacombs-seed.ts";

test("a skill's lines: each effect, a point's worth and the total", () => {
  assert.deepEqual(skillLines("might", 17).map((l) => [l.name, l.per, l.total, l.percent]),
    [["MAtk", 1, 17, false], ["MAtk", 1, 17, true], ["MCrit factor", 3, 51, true]]);
  assert.deepEqual(skillLines("fortune", 3).map((l) => l.total), [6, 0.6, 1.5]);
});

test("a closed box shows its name and points of its cap; an open one its buttons, each off when it can't be pressed", () => {
  const c = defaultCatacombs();
  c.mxp = mxpForLevel(3);
  c.points.focus = 2;
  const closed = skillBoxHtml(c, "focus", false);
  assert.match(closed, /Focus<\/b><small>2\/25</);
  assert.doesNotMatch(closed, /catacomb-point/);
  const open = skillBoxHtml(c, "focus", true);
  assert.match(open, /MXP gain \+5% a point · <b>\+10%/);
  assert.match(open, /MXP Drop chance \+0.3% a point · <b>\+0.6%/);
  assert.match(open, /data-delta="-1" aria-label="Take a point from Focus">/, "a point to take back");
  assert.match(open, /data-delta="1" aria-label="Put a point in Focus" disabled>/, "no point free");
  c.points.focus = 0;
  assert.match(skillBoxHtml(c, "focus", true), /Take a point from Focus" disabled>/);
  // A full skill takes no more.
  c.mxp = mxpForLevel(40);
  c.points.focus = 25;
  assert.match(skillBoxHtml(c, "focus", true), /Put a point in Focus" disabled>/);
});

test("the Skills panel lists every skill and the points free; Spirit sells its upgrades; the rest say what they will do", () => {
  const c = defaultCatacombs();
  c.mxp = mxpForLevel(4);
  const skills = menuPanelHtml(c, "skills", null);
  for (const name of ["Might", "Weaving", "Resonance", "Focus", "Fortune"]) assert.match(skills, new RegExp(name));
  assert.match(skills, /3 free/);
  assert.match(skills, /id="catacomb-stats-table"/);
  c.ingots.iron = 4;
  assert.match(menuPanelHtml(c, "forge", null), /Ingots to upgrade the Blacksmith's forge[\s\S]*Iron 4/);
  const spirit = menuPanelHtml(c, "spirit", null);
  assert.match(spirit, /No Spirit yet/);
  assert.match(spirit, /Unlock Ability[\s\S]*Magic ATK \+1/);
  assert.match(menuPanelHtml(c, "academy", null), /boosts outside the Catacombs/);
});

test("a Spirit upgrade shows its level and price, off while short, MAX once maxed", () => {
  const c = defaultCatacombs();
  assert.match(upgradeHtml(c, "unlock"), /0\/3[\s\S]*aria-label="Buy Unlock Ability for 10 Uncommon Spirit" disabled>.*spirit-uncommon.*<b>10</);
  c.spirit.uncommon = 10;
  assert.doesNotMatch(upgradeHtml(c, "unlock"), /disabled/);
  c.upgrades.matk = 25;
  assert.match(upgradeHtml(c, "matk"), /25\/25[\s\S]*disabled>MAX/);
});

test("abilities show once unlocked: Auto over each, Ready or the turns left under it", () => {
  const c = defaultCatacombs();
  seedAll(c, 1);
  enterCatacomb(c, 1);
  assert.equal(abilitiesHtml(c), "");
  c.upgrades.unlock = 2;
  c.abilities.rush = { charges: 0, cooldown: 42, auto: true };
  const html = abilitiesHtml(c);
  assert.match(html, /data-auto="surge" aria-pressed="false"[\s\S]*Spell Surge<\/button><small class="catacomb-cooldown">Ready/);
  assert.match(html, /data-auto="rush" aria-pressed="true"[\s\S]*aria-label="Cast Renewing Rush" disabled>Renewing Rush<\/button><small class="catacomb-cooldown">42/);
  assert.doesNotMatch(html, /Arcane Barrage/);
});

test("the stats table: the Magician, the drops, the run, Lore and every Spirit and Ingot", () => {
  const c = defaultCatacombs();
  seedAll(c, 3);
  enterCatacomb(c, 3);
  c.mxp = mxpForLevel(2) + 10;
  c.points.fortune = 1;
  c.spirit.rare = 5;
  const rows = Object.fromEntries(catacombStatRows(c, 41.7));
  assert.equal(rows["MAtk"], "10");
  assert.equal(rows["MHP"], "1,000 / 1,000");
  assert.equal(rows["MCrit chance"], "2%");
  assert.equal(rows["MCrit factor"], "×1.5");
  assert.equal(rows["MXP Drop chance"], "0.2%: ×3 to ×5 MXP from this undead");
  assert.equal(rows["Speed Drop chance"], "0.2%: +10 to +110 attacks at ×2 attack speed");
  assert.equal(rows["Gold Crosshair chance"], "0.5%: ×3 damage");
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
