// Exercise the real relative-base production bundle, mounted like GitHub Pages.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
import { openMenu } from "./run-menu.mjs";

const mount = "/TowerProject/", root = resolve("dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = resolve(root, path.slice(mount.length) || "index.html");
  if (!path.startsWith(mount) || !file.startsWith(`${root}/`)) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "public, max-age=600" }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  await fixClock(page);
  const missing = [], escaped = [], errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  page.on("request", r => { if (new URL(r.url()).pathname.startsWith("/assets/")) escaped.push(r.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}${mount}`);
  await page.locator("#hp").waitFor({ timeout: 30000 });
  assert.equal(await page.locator("#boot-loading").count(), 0);
  assert.ok(await page.evaluate(() => [...document.images].every(i => i.complete && i.naturalWidth)));
  assert.ok(await page.locator("#world").evaluate(c => c.width > 0));
  await openMenu(page); await page.locator("#auto-settings").click();
  assert.equal(await page.locator("#ui-sprites, #sprites-off").count(), 0);
  assert.ok(await page.locator("#sprite-animations").isVisible());
  assert.ok(await page.locator("#square-doors").isVisible());
  assert.ok(await page.evaluate(() => [...document.images].every(i => i.complete && i.naturalWidth)), "settings images were already cached");
  assert.deepEqual(missing, []); assert.deepEqual(escaped, []); assert.deepEqual(errors, []);
  console.log("Production startup, decoded/cached settings art and all image/font/CSS paths pass under /TowerProject/.");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
