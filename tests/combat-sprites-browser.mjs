// Real Renderer frames: PNG loading, independent themes, fallbacks and scales.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
const server = await createServer({ server: { host: "127.0.0.1", port: 5191 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
mkdirSync("test-results/combat-sprites", { recursive: true });
try {
  for (const width of [390, 1100]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => { globalThis.__handStartsPaused = true; globalThis.__handHeld = true; });
    await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
    const result = await page.evaluate(async width => {
      const { combatSpriteScene } = await import("/tests/render-scenes.ts");
      const { Renderer } = await import("/src/rendering.ts");
      const { COMBAT_SPRITES } = await import("/src/sprite-combat.ts");
      const { kitImage } = await import("/src/sprite-kit.ts");
      const { THEME_IDS } = await import("/src/theme-collection.ts");
      const scene = combatSpriteScene(), g = scene.g;
      g.save.themes = [...THEME_IDS];
      g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 };
      const board = document.createElement("canvas"); board.id = "combat-review";
      const size = width < 500 ? 360 : 408;
      board.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:99999`;
      document.body.append(board);
      const requested = [], RealImage = window.Image;
      window.Image = function Image(...args) { const img = new RealImage(...args); requested.push(img); return img; };
      window.Image.prototype = RealImage.prototype;
      const draw = () => {
        const r = new Renderer(board, g);
        for (let t = 1000; t <= 1400; t += 50) r.draw(t);
        r.draw(1740);
      };
      const settle = async () => {
        for (let pass = 0; pass < 12; pass++) {
          const count = requested.length;
          await Promise.all(requested.map(img => img.complete ? null : new Promise(resolve => {
            img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true });
          })));
          draw();
          if (count === requested.length && requested.every(img => img.complete)) return;
        }
        throw Error("combat images never settled");
      };
      const hash = async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", board.getContext("2d").getImageData(0, 0, board.width, board.height).data))].join(",");
      g.save.settings.uiSprites = false; draw(); await settle(); const off = await hash();
      COMBAT_SPRITES.forEach(kitImage);
      g.save.settings.uiSprites = true; draw(); await settle(); const on = await hash();
      g.save.settings.uiTheme = "neon"; draw(); const uiTheme = await hash();
      g.save.settings.gameTheme = "neon"; draw(); await settle(); const gameTheme = await hash();
      g.save.settings.gameTheme = "classic"; draw(); await settle(); const restored = await hash();
      g.save.settings.uiSprites = false; draw(); const offAgain = await hash();
      g.save.settings.uiSprites = true; draw();
      const loaded = COMBAT_SPRITES.filter(id => !!kitImage(id));
      // Native-size and 4x art contact sheet, with labels outside the PNGs.
      const sheet = document.createElement("canvas"); sheet.id = "combat-art";
      sheet.width = 960; sheet.height = 750;
      const c = sheet.getContext("2d"); c.imageSmoothingEnabled = false; c.fillStyle = "#293543"; c.fillRect(0, 0, 960, 750);
      COMBAT_SPRITES.forEach((id, i) => {
        const image = kitImage(id), x = (i % 6) * 160, y = Math.floor(i / 6) * 140;
        const scale = id.includes("shield") ? 1 : 4;
        c.drawImage(image, x + 8, y + 5);
        if (!id.includes("shield")) c.drawImage(image, x + 50, y + 10, image.naturalWidth * scale, image.naturalHeight * scale);
        c.fillStyle = "#eee0b7"; c.font = "10px sans-serif"; c.fillText(id.replace("combat-", ""), x + 8, y + 130);
      });
      sheet.style.cssText = "position:fixed;left:0;top:0;z-index:100000"; document.body.append(sheet);
      return { off, on, uiTheme, gameTheme, restored, offAgain, loaded, total: COMBAT_SPRITES.length };
    }, width);
    assert.equal(result.loaded.length, result.total, "every combat PNG loads");
    assert.notEqual(result.off, result.on, "Sprites changes the real board");
    assert.equal(result.on, result.uiTheme, "a UI theme leaves Classic combat sprites active");
    assert.notEqual(result.on, result.gameTheme, "a Game theme overrides combat sprites");
    assert.equal(result.on, result.restored, "returning to Classic restores the same pixels");
    assert.equal(result.off, result.offAgain, "turning Sprites off restores the exact original frame");
    if (width > 500) await page.locator("#combat-art").screenshot({ path: "test-results/combat-sprites/native-and-enlarged.png" });
    await page.locator("#combat-art").evaluate(e => e.remove());
    await page.locator("#combat-review").screenshot({ path: `test-results/combat-sprites/board-${width}.png` });
    assert.deepEqual(errors, []); await page.close();
  }
  console.log("Combat PNGs load at both scales; theme overrides and exact toggle restoration pass.");
} finally { await browser.close(); await server.close(); }
