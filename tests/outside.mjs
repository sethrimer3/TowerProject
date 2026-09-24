import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 710 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    const fixture = sessionStorage.getItem("outsideFixture");
    if (fixture) { localStorage.setItem("towerincramental.v1", fixture); sessionStorage.removeItem("outsideFixture"); }
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.evaluate(async () => {
    const { Game } = await import("/src/state.ts"), { defaults } = await import("/src/save.ts");
    const g = new Game(defaults()); g.newRun(true); g.save.upgrades.delve = 1;
    g.switchMode("delve"); g.newRun(true);
    sessionStorage.setItem("outsideFixture", JSON.stringify(g.save));
  });
  await page.reload();
  await expect(page.locator("#board-title")).toHaveText("THE TOWER APPROACH");
  await page.locator('[data-tab="delve"]').click();
  await expect(page.locator("#board-title")).toHaveText("THE MOUNTAIN HOLLOW");
  await expect(page.locator("#board")).not.toHaveClass(/mode-tower/);
  await page.locator('[data-tab="settings"]').click();
  await page.locator("#weather-sound").uncheck();
  await page.reload();
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator("#weather-sound")).not.toBeChecked();
  await page.locator('[data-tab="tower"]').click();
  const box = await page.locator("#world").boundingBox();
  await page.mouse.click(box.x + box.width * 10.5 / 20, box.y + box.width * 7.5 / 20);
  await expect(page.locator("#board-title")).toHaveText("THE ASCENT TRIALS", { timeout: 10000 });
  await expect(page.locator("#height")).toHaveText("1");
  const result = await page.evaluate(async () => {
    const { Game } = await import("/src/state.ts");
    const { defaults } = await import("/src/save.ts");
    const { Renderer } = await import("/src/rendering.ts");
    const { OutsideWorld, outsideWeather } = await import("/src/outside.ts");
    document.head.querySelectorAll('style,link[rel="stylesheet"]').forEach(e => e.remove());
    document.body.style.cssText = "margin:0;background:#101a1c;color:#d6dfca;font:14px sans-serif";
    const gallery = document.createElement("div");
    gallery.style.cssText = "position:fixed;inset:0;display:grid;grid-template-columns:repeat(4,320px);background:#101a1c;z-index:99999";
    document.body.append(gallery);
    const seeds = {};
    for (let seed = 0; Object.keys(seeds).length < 4; seed++) seeds[outsideWeather(seed)] ??= seed;
    for (const mode of ["tower", "delve"]) for (const weather of ["sunny", "cloudy", "rain", "storm"]) {
      const tile = document.createElement("div");
      tile.innerHTML = `<p style="margin:8px">${mode.toUpperCase()} · ${weather.toUpperCase()}</p><canvas style="width:320px;height:320px"></canvas>`;
      gallery.append(tile);
      const g = new Game(defaults()); g.save.upgrades.delve = 1; g.switchMode(mode); g.newRun(true);
      g.run.seed = seeds[weather]; g.world = new OutsideWorld(g.run.seed, mode);
      const canvas = tile.querySelector("canvas"), renderer = new Renderer(canvas, g);
      renderer.draw(100);
      for (const density of [16, 20, 24, 30]) {
        g.save.settings.density = density; renderer.draw(116);
        if (renderer.density !== 20) throw Error("Forest must fit the viewport");
        const box = canvas.getBoundingClientRect();
        const tap = renderer.position(box.left + (g.run.player.x - renderer.left + 0.5) * renderer.size, box.top + 7.5 * renderer.size);
        if (tap.x !== g.run.player.x || tap.y !== 12) throw Error("Entrance tap mismatch");
      }
      g.save.settings.reduceMotion = true; renderer.draw(200);
      const still = canvas.toDataURL(); renderer.draw(900);
      if (canvas.toDataURL() !== still) throw Error("Reduced motion weather changed");
      g.save.settings.reduceMotion = false;
      renderer.weather.elapsed = 50; renderer.weather.nextThunder = 49;
      renderer.draw(1000); renderer.weather.elapsed += 2; renderer.draw(1016);
      if (weather === "storm") {
        window.outsideTestWeather = renderer.weather;
        if (!(renderer.weather.lightningStart > 0)) throw Error("Storm did not trigger");
      }
    }
    return seeds;
  });
  if (process.env.OUTSIDE_PREVIEW) await page.screenshot({ path: process.env.OUTSIDE_PREVIEW });
  await page.evaluate(() => {
    const b = document.createElement("button"); b.id = "audio-check"; b.textContent = "Enable thunder";
    b.style.cssText = "position:fixed;right:0;bottom:0;z-index:100000";
    b.onclick = () => window.outsideTestWeather.unlock(); document.body.append(b);
  });
  await page.locator("#audio-check").click();
  await expect.poll(() => page.evaluate(() => window.outsideTestWeather.audio?.state)).toBe("running");
  await page.evaluate(() => { window.outsideTestWeather.rumble(42); window.outsideTestWeather.silence(); });
  expect(errors).toEqual([]);
  console.log("Both forest entrances, all four weather states, density-independent taps, reduced motion, storm scheduling and audio activation passed.", result);
} finally { await browser.close(); }
