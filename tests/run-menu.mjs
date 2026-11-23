/** Settings, Missions and the rest wait in the HUD's menu, in the forest
 * and inside a run: opens it if it is shut. */
export async function openMenu(page) {
  const toggle = page.locator("#run-menu-toggle");
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

const anchored = new WeakSet();
/** A new game's first climb ends only once the Chrono Anchor is held
 * (src/divine.ts; tests/divine.test.ts walks the Divine Portal): hands it
 * over in the saved game and reloads, the hero where it stood. The page
 * saves as it unloads, so the edited save waits in sessionStorage for an
 * init script to put in place. */
export async function holdAnchor(page) {
  if (!anchored.has(page)) {
    anchored.add(page);
    await page.addInitScript(() => {
      const s = sessionStorage.getItem("__anchorSave");
      if (s) { localStorage.setItem("towerdelve.v1", s); sessionStorage.removeItem("__anchorSave"); }
    });
  }
  // The game has started and saved once.
  await page.waitForFunction(() => !!localStorage.getItem("towerdelve.v1"), undefined, { timeout: 60000 });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("towerdelve.v1"));
    s.divineRelics = ["chronoAnchor"];
    sessionStorage.setItem("__anchorSave", JSON.stringify(s));
  });
  await page.reload();
  await page.locator("#hp").waitFor({ timeout: 30000 });
}
