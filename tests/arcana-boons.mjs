// Augment boons in the real app (node tests/arcana-boons.mjs; starts its own server):
// the green rows in an offer, the taken list, bans and ranking, under each kind of
// theme; the card's information; both of Phantasm's rings on the board; review images
// in test-results/arcana-boons/.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
import { openMenu } from "./run-menu.mjs";

const OUT = "test-results/arcana-boons";
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 5189 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
/** Whether `rgb(...)` has green well ahead of red and blue. */
const greenish = (css) => {
  const [r, g, b] = css.match(/[\d.]+/g).map(Number);
  return g > r + 8 && g > b + 8;
};
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    globalThis.__handStartsPaused = true; globalThis.__handHeld = true;
    const fixture = sessionStorage.getItem("__augmentFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__augmentFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator("#hp").waitFor();

  /** Loads a save set up by `kind`: "run" with an offer and a boon waiting, "forest" for the page. */
  async function load(kind, uiTheme, picked = []) {
    await page.evaluate(async ({ kind, uiTheme, picked }) => {
      const { defaults } = await import("/src/save/save.ts"), { Game } = await import("/src/state.ts"), { BOON_IDS } = await import("/src/shrines.ts");
      const s = defaults();
      Object.keys(s.tutorials).forEach((k) => (s.tutorials[k] = true));
      Object.assign(s.upgrades, { archives: 1, combatStance: 1, buildout: 1, onTheJob: 1 });
      Object.assign(s.settings, { reduceMotion: true, transition: "instant", weatherSound: false, uiTheme, phantasmAlpha: 1 });
      if (uiTheme !== "medieval") s.themes.push(`${uiTheme}Ui`);
      Object.assign(s.archives.levels, { unlockShrines: 1, banBoons: 2, autoPickRanking: 4 });
      s.arcana.owned.overseer = [0, 0, 0];
      s.arcana.owned.phantasm = [0, 0, 0];
      const g = new Game(s); g.newRun({ outside: kind === "forest", seed: 7 });
      if (kind === "forest") {
        s.shrines.ranking = ["augmentOverseer", "attack", "augmentPhantasm", "gold", ...BOON_IDS.filter((id) => !["augmentOverseer", "attack", "augmentPhantasm", "gold"].includes(id))];
        s.shrines.banned = ["augmentVoidwell"];
      } else {
        g.run.height = g.run.maxHeight = 199;
        g.run.shrine = { picked, rolls: 0, ...(picked.length ? {} : { offer: ["augmentOverseer", "attack"] }) };
        g.run.phantasm = { timer: 100, turns: 30, ring: 3, ghosts: [0, 1, 2], outer: [0, 1, 2, 3, 4] };
      }
      sessionStorage.setItem("__augmentFixture", JSON.stringify(g.save));
    }, { kind, uiTheme, picked });
    await page.reload();
    await page.locator("#hp").waitFor();
  }
  const look = (selector) => page.locator(selector).first().evaluate((e) => {
    const css = getComputedStyle(e);
    return { background: css.backgroundColor, color: css.color };
  });

  const themes = await page.evaluate(async () => (await import("/src/save/settings.ts")).SETTINGS.uiTheme.choices.map(([id]) => id));
  for (const uiTheme of themes) {
    await load("run", uiTheme);
    await page.locator("#shrine-bar").click();
    await page.screenshot({ path: `${OUT}/${uiTheme}-offer.png` });
    assert.ok(greenish((await look('.boon-choice[data-boon="augmentOverseer"]')).background), `${uiTheme}: offer`);
    assert.ok(greenish((await look('.boon-choice[data-boon="augmentOverseer"] b')).color), `${uiTheme}: offer's words`);
    assert.notEqual((await look('.boon-choice[data-boon="attack"]')).background, (await look('.boon-choice[data-boon="augmentOverseer"]')).background, `${uiTheme}: it stands apart from a standard boon`);
    await page.locator('[data-boon="augmentOverseer"]').click();
    await page.locator("#shrine-bar").click();
    await page.screenshot({ path: `${OUT}/${uiTheme}-taken.png` });
    assert.ok(greenish((await look(".boon-table tr.augment td")).background), `${uiTheme}: taken`);
    assert.ok(greenish((await look(".boon-table tr.augment td span")).color), `${uiTheme}: taken's words`);
    await page.locator("#shrine-close").click();
    await page.locator('[data-run-tab="arcana"]').click();
    await page.locator('.arcana-card:has-text("Overseer") .drill-name').click();
    await page.screenshot({ path: `${OUT}/${uiTheme}-card-info.png` });
    assert.match(await page.locator(".arcana-info").textContent(), /12\.0×/);
    assert.match(await page.locator(".arcana-info").textContent(), /Shrine Boon×1\.5 ATK/);

    await load("forest", uiTheme);
    await openMenu(page);
    await page.locator("#shrines-button").click();
    await page.locator('[data-ban="augmentRicochetShot"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${uiTheme}-bans.png` });
    await page.locator('[data-rank="augmentOverseer"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${uiTheme}-ranking.png` });
    assert.equal(await page.locator(".boon-ban.augment").count(), 9);
    assert.equal(await page.locator(".boon-rank.augment").count(), 9);
    assert.ok(greenish((await look('.boon-rank.augment.ranked[data-rank="augmentOverseer"]')).background), `${uiTheme}: ranked`);
    assert.ok(greenish((await look('.boon-rank.augment:not(.ranked)')).background), `${uiTheme}: unranked ${(await look(".boon-rank.augment:not(.ranked)")).background}`);
    assert.ok(greenish((await look('.boon-ban.augment:not(.banned)')).background), `${uiTheme}: ban row`);
    assert.ok(greenish((await look('.boon-ban.augment:not(.banned) .boon-ban-name')).color), `${uiTheme}: ban row's words`);
    assert.ok(greenish((await look('.boon-rank.augment:not(.banned) .rank-name')).color), `${uiTheme}: rank row's words`);
    assert.ok(!greenish((await look('.boon-rank.augment.banned')).background), `${uiTheme}: a banned one is red, not green`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${uiTheme}: no overflow`);
  }

  // Both rings on the board: eight ghosts drawn, the outer ring's two tiles out.
  await load("run", "medieval", ["augmentPhantasm"]);
  await page.waitForTimeout(500);
  await page.locator("#world").screenshot({ path: `${OUT}/both-rings.png` });
  const shown = await page.evaluate(async () => {
    const save = JSON.parse(localStorage.getItem("towerdelve.v1"));
    return save.tower.run.phantasm;
  });
  assert.deepEqual(shown.outer, [0, 1, 2, 3, 4]);

  // Unlock an Arcanum: the offer names the arcanum and its lent values; picked, the run holds it.
  await load("run", "medieval");
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("towerdelve.v1"));
    save.tower.run.shrine.offer = ["unlockArcanum", "attack"];
    sessionStorage.setItem("__augmentFixture", JSON.stringify(save));
  });
  await page.reload();
  await page.locator("#shrine-bar").click();
  await page.screenshot({ path: `${OUT}/unlock-offer.png` });
  const unlock = page.locator('.boon-choice[data-boon="unlockArcanum"]');
  const named = (await unlock.locator("small").textContent()).replace("UNLOCK ", "");
  await unlock.click();
  await page.locator('[data-run-tab="arcana"]').click();
  await page.screenshot({ path: `${OUT}/unlock-held.png` });
  assert.ok((await page.locator(".arcana-card").allTextContents()).some((card) => card.toUpperCase().includes(named)), `holds ${named}`);
  assert.deepEqual(errors, []);
  console.log("arcana-boons: ok");
} finally {
  await browser.close();
  await server.close();
}
