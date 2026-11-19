import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 5214 }, logLevel: "error" }); await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/new-spell-art", { recursive: true });
try {
  for (const width of [390, 1100]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
    page.on("pageerror", e => errors.push(e.message)); await fixClock(page);
    await page.goto(server.resolvedUrls.local[0]); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
    if (width === 1100) {
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("towerdelve.v1")); s.settings.experimentalAtlas = false; localStorage.setItem("towerdelve.v1", JSON.stringify(s)); });
      await page.reload(); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
    }
    const result = await page.evaluate(async () => {
      const { kitImage, kitIcon, pngIcon } = await import("/src/sprites/kit.ts"), { spellFrame, paintSpellFrame, paintShockStatus, paintDilationGuard } = await import("/src/sprites/spell-art.ts");
      const { drawGemArt, drawGem, drawGemSparkle } = await import("/src/render/effects/gem-art.ts");
      const { drawPhoenixSpark, SPARK_MS } = await import("/src/render/effects/phoenix-spark.ts");
      const { goldenGemIcon, stellarGemIcon, skillSprite } = await import("/src/ui/dom.ts");
      const ids = ["gem-golden", "gem-stellar", "respec-training", "respec-arcana", "status-shock", "status-dilation-guard", "ambient-phoenix-spark", "ambient-stellar-twinkles", "ambient-ricochet-shock", "ambient-dilation-guard", ...["epic", "legendary", "mythic", "ancestral"].map(r => `ui-equip-frame-${r}`)];
      await new Promise(resolve => { const poll = () => ids.every(id => !!kitImage(id)) ? resolve() : requestAnimationFrame(poll); poll(); });
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96;
      const c = canvas.getContext("2d"), picture = paint => { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 96, 96); c.translate(24, 36); paint(); return canvas.toDataURL(); };
      const f = { c, n: 1, s: 24, left: 0, bottom: 0, playerX: 0, playerY: 0, now: 200, look: { styledSprites: true, spriteAnimations: true, reduceMotion: false } };
      const phoenix = [100, 250, 450].map(age => picture(() => drawPhoenixSpark(f, age)));
      f.look.reduceMotion = true;
      const frozen = [200, 400, 600].map(age => picture(() => drawPhoenixSpark(f, age)));
      const gone = picture(() => drawPhoenixSpark(f, SPARK_MS));
      const blank = picture(() => {});
      const gems = ["plain", "golden", "stellar"].map(kind => picture(() => drawGemArt(c, kind, 0, true, true)));
      const frozenTwinkles = [200, 700].map(now => { f.now = now; return picture(() => drawGem(f, 0, 0, "stellar")); });
      const guard = [200, 700].map(now => picture(() => paintDilationGuard(c, now, false)));
      const shock = [200, 700].map(now => picture(() => paintShockStatus(c, now, false)));
      const sheet = document.createElement("canvas"); sheet.id = "new-art-sheet"; sheet.width = 576; sheet.height = 360;
      const ctx = sheet.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#10151c"; ctx.fillRect(0, 0, 576, 360);
      ids.filter(id => !id.startsWith("ambient-")).forEach((id, i) => ctx.drawImage(kitImage(id), i % 8 * 72, Math.floor(i / 8) * 72, 48, 48));
      ids.filter(id => id.startsWith("ambient-")).forEach((id, row) => { for (let frame = 0; frame < 6; frame++) ctx.drawImage(kitImage(id), frame * 24, 0, 24, 24, frame * 72, 144 + row * 48, 48, 48); });
      sheet.style.cssText = "position:fixed;left:0;top:0;z-index:99999;width:576px;max-width:100%;height:auto;aspect-ratio:8/5"; document.body.append(sheet);
      const rarityFrames = ["epic", "legendary", "mythic", "ancestral"].map(rarity => {
        const tile = document.createElement("button"); tile.className = `eq-tile rar-${rarity}`; document.body.append(tile);
        const value = getComputedStyle(tile).getPropertyValue("--equipment-frame"); tile.remove(); return value;
      });
      const dom = document.createElement("div"); dom.innerHTML = goldenGemIcon() + stellarGemIcon() + skillSprite("trainingRespec") + skillSprite("arcanaRespec");
      return { phoenix, frozen, gone, blank, gems, frozenTwinkles, guard, shock, rarityFrames, iconsCorrect: [goldenGemIcon() === kitIcon("gem-golden", "", "gem-icon"), stellarGemIcon() === kitIcon("gem-stellar", "", "gem-icon"), skillSprite("trainingRespec") === pngIcon("respec-training", "skill-sprite"), skillSprite("arcanaRespec") === pngIcon("respec-arcana", "skill-sprite")], frames: [0, 200, 400].map(t => spellFrame(t, false)) };
    });
    assert.ok(new Set(result.phoenix).size > 1); assert.equal(new Set(result.frozen).size, 1);
    assert.equal(result.gone, result.blank); assert.equal(new Set(result.gems).size, 3);
    for (const frozen of [result.frozenTwinkles, result.guard, result.shock]) assert.equal(new Set(frozen).size, 1);
    assert.equal(new Set(result.rarityFrames).size, 4, "all high-rarity slots select distinct authored borders");
    assert.ok(result.rarityFrames.every(Boolean));
    assert.ok(result.iconsCorrect.every(Boolean), "real UI icons select the new native subjects in either atlas mode");
    await page.locator("#new-art-sheet").screenshot({ path: `test-results/new-spell-art/sheet-${width}.png` });
    await page.locator("#new-art-sheet").evaluate(e => e.remove());
    const live = await page.evaluate(async () => {
      const { atlasRegion } = await import("/src/sprites/ui-atlas.ts");
      const { dungeonSpriteScene } = await import("/tests/render-scenes.ts"), { Renderer } = await import("/src/render/rendering.ts");
      const { g } = dungeonSpriteScene("tower", { spriteAnimations: true, reduceMotion: true });
      g.save.arcana.owned.timeDilation = [0, 0, 0]; g.save.archives.levels.dilationGuard = 1;
      g.run.timeDilation = { timer: 100, left: 3 };
      const p = g.run.player, foe = g.world.floorEnemies(p.x, p.y)[0];
      if (foe) g.world.markShock(foe.x, foe.y);
      const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;top:0;left:0;width:360px;height:360px"; document.body.append(canvas);
      const r = new Renderer(canvas, g), draw = r.ctx.drawImage.bind(r.ctx), calls = [];
      r.ctx.drawImage = (image, ...args) => { calls.push({ src: image.src || "", x: args[0], y: args[1] }); draw(image, ...args); };
      r.draw(1000); r.draw(1300);
      const region = atlasRegion("assets/style/status-shock.png");
      const guards = calls.filter(call => call.src.includes("ambient-dilation-guard")), shocks = calls.filter(call => call.src.includes("status-shock") || (region && call.src.includes("/atlases/") && call.x === region.x && call.y === region.y));
      calls.length = 0; g.run.timeDilation.left = 0; r.draw(1400);
      const expired = calls.some(call => call.src.includes("ambient-dilation-guard"));
      canvas.remove(); return { protected: guards.length, frames: guards.map(call => call.x), shocked: shocks.length, hasFoe: !!foe, marked: g.shockedTiles.length, expired };
    });
    assert.ok(live.protected > 0, "real renderer shows researched protection");
    assert.ok(live.frames.every(x => x === 48), "Reduce Motion holds the guard's representative frame");
    if (live.hasFoe) assert.ok(live.shocked > 0, "real renderer draws shocked enemies' native status badge");
    assert.equal(live.expired, false, "protection feedback disappears when the field expires");
    assert.deepEqual(errors, []); await page.close();
    console.log(`Native gem variants, Phoenix Spark timing, motion gates, protection/shock feedback and UI subjects passed at ${width}px.`);
  }
} finally { await browser.close(); await server.close(); }
