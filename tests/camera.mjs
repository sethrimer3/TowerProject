import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/");
const results = await page.evaluate(async () => {
  const { Renderer } = await import("/src/rendering.ts");
  const { Game } = await import("/src/state.ts");
  const { defaults, decode } = await import("/src/save.ts");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;left:-9999px;width:400px;height:400px";
  document.body.append(canvas);
  const data = {};
  // Viewport is 17 tiles on a 30-wide Delve, so the camera targets
  // left = x - 8 and bottom = y - 8: (15,10) -> left 7, bottom 2, and
  // (16,11) -> left 8, bottom 3.
  for (const mode of ["smooth", "fast", "instant"]) {
    const g = new Game(defaults());
    g.save.upgrades.delve = 1;
    g.switchMode("delve");
    g.save.settings.transition = mode;
    g.run.player.x = 15;
    g.run.player.y = 10;
    const original = g.world.tile.bind(g.world);
    g.world.tile = (x, y) => {
      if (!Number.isInteger(x) || !Number.isInteger(y))
        throw Error("Fractional world tile lookup");
      return original(x, y);
    };
    const renderer = new Renderer(canvas, g);
    renderer.draw(100);
    g.run.player.x = 16;
    g.run.player.y = 11;
    renderer.draw(116);
    data[mode] = {
      left: renderer.left,
      bottom: renderer.bottom,
      playerX: renderer.playerX,
      playerY: renderer.playerY,
    };
    const box = canvas.getBoundingClientRect(),
      size = renderer.size,
      n = renderer.density;
    const hit = renderer.position(
      box.left + (16 - renderer.left + 0.5) * size,
      box.top + (n - 0.5 - (11 - renderer.bottom)) * size,
    );
    if (hit.x !== 16 || hit.y !== 11)
      throw Error("Tap mapping fails during camera interpolation");
    const before = renderer.left;
    g.run.player.x = 15;
    g.run.player.y = 10;
    renderer.draw(132);
    if (mode !== "instant" && !(renderer.left > 7 && renderer.left < before))
      throw Error("Leftward camera did not interpolate");
    g.save.settings.reduceMotion = true;
    g.run.player.x = 17;
    g.run.player.y = 12;
    renderer.draw(148);
    if (
      renderer.left !== 9 ||
      renderer.bottom !== 4 ||
      renderer.playerX !== 17 ||
      renderer.playerY !== 12
    )
      throw Error("Reduce motion did not snap");
  }
  if (!(
    data.smooth.left > 7 &&
    data.smooth.left < 8 &&
    data.smooth.bottom > 2 &&
    data.smooth.bottom < 3
  ))
    throw Error("Smooth camera snapped");
  if (!(
    data.fast.left > data.smooth.left &&
    data.fast.left < 8 &&
    data.fast.bottom > data.smooth.bottom
  ))
    throw Error("Fast is not faster");
  if (
    data.instant.left !== 8 ||
    data.instant.bottom !== 3 ||
    data.instant.playerX !== 16 ||
    data.instant.playerY !== 11
  )
    throw Error("Instant does not snap all movement");
  if (
    decode(JSON.stringify({ version: 1, settings: { transition: "invalid" } }))
      .settings.transition !== "smooth"
  )
    throw Error("Invalid setting fallback");
  canvas.remove();
  return data;
});
await page.locator('[data-tab="settings"]').click();
await expect(page.locator("#transition")).toHaveValue("smooth");
for (const mode of ["fast", "instant", "smooth"]) {
  await page.locator("#transition").selectOption(mode);
  await page.reload();
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator("#transition")).toHaveValue(mode);
}
await expect(page.locator("#sprites-off")).not.toBeChecked();
await page.locator("#sprites-off").check();
await page.reload();
await page.locator('[data-tab="settings"]').click();
await expect(page.locator("#sprites-off")).toBeChecked();
await page.locator("#sprites-off").uncheck();
await page.screenshot({
  path: "test-results/transition-settings.png",
  fullPage: true,
});
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Camera modes, bidirectional interpolation, integer tile sampling, moving tap mapping, reduce-motion override and persistence passed.",
  results,
);
await browser.close();
