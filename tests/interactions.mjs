import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const fixture = sessionStorage.getItem("__fixture");
  if (fixture) {
    localStorage.setItem("towerincramental.v1", fixture);
    sessionStorage.removeItem("__fixture");
  }
});
await page.goto("http://127.0.0.1:5173/");
await expect(page.locator(".dpad")).toBeHidden();

const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("towerincramental.v1")));
const player = async () => (await saved()).delve.run.player;
/** Rewrites the save with `edit(save, arg)` in the page and reloads into Delve. */
async function fixture(edit, arg = null) {
  await page.evaluate(([body, arg]) => {
    const s = JSON.parse(localStorage.getItem("towerincramental.v1"));
    new Function("s", "arg", body)(s, arg);
    sessionStorage.setItem("__fixture", JSON.stringify(s));
  }, [`(${edit})(s, arg)`, arg]);
  await page.reload();
  await page.locator('[data-tab="delve"]').click();
}
/** Taps a tile, mapped through the Delve camera: a 17-tile view on a
 * 30-wide world, centred on the player and clamped to the edges. */
async function tap(x, y) {
  await page.waitForTimeout(250);
  const p = await player(),
    n = 17,
    left = Math.max(0, Math.min(30 - n, p.x - Math.floor(n / 2))),
    bottom = Math.max(0, p.y - Math.floor(n / 2));
  const box = await page.locator("#world").boundingBox();
  await page.mouse.click(
    box.x + ((x - left + 0.5) * box.width) / n,
    box.y + ((n - 0.5 - y + bottom) * box.width) / n,
  );
}
async function swipe(dx, dy) {
  const b = await page.locator("#world").boundingBox(),
    x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx * 45, y + dy * 45, { steps: 4 });
  await page.mouse.up();
}

// Saves only record floor/wall edits, so keys, doors and enemies come from
// the generator: find a seed whose first chunk has each one away from the
// edges, then carve floor and walls around it so each route is fixed.
const scene = await page.evaluate(async () => {
  const { generate } = await import("/src/generation.ts");
  const inner = (x, y, below, above) => x >= 2 && x <= 27 && y - below >= 0 && y + above < 20;
  for (let seed = 1; seed < 1000; seed++) {
    const cells = [...generate(seed, 0)].map(([k, t]) => { const [x, y] = k.split(",").map(Number); return { x, y, t }; });
    const key = cells.find(({ x, y, t }) => t.kind === "key" && t.color === "yellow" && inner(x, y, 2, 0));
    const door = cells.find(({ x, y, t }) => t.kind === "door" && t.color === "yellow" && !t.door && inner(x, y, 2, 3));
    const enemy = cells.find(({ x, y, t }) => t.kind === "enemy" && inner(x, y, 2, 0));
    if (key && door && enemy) return { seed, key, door, enemy };
  }
  throw Error("No seed has a yellow key, a yellow door and an enemy in its first chunk");
});
const { key, door, enemy } = scene;
/** A fresh run on the chosen seed with the player at (x, y) and `open` /
 * `closed` tiles forced to floor / wall. */
const place = (s, { seed, x, y, open = [], closed = [], stats = {}, revive = false }) => {
  s.upgrades.delve = 1;
  if (revive) s.upgrades.revive = 1;
  // A settled camera and single-tap moves keep tap positions deterministic.
  s.settings.transition = "instant";
  s.settings.oneTapMove = true;
  const r = s.delve.run;
  r.seed = seed;
  r.outside = false;
  r.floor = 0;
  r.height = 0;
  r.delveMilestone = 0;
  r.changes = {};
  for (const [cx, cy] of open) r.changes[`${cx},${cy}`] = { kind: "floor" };
  for (const [cx, cy] of closed) r.changes[`${cx},${cy}`] = { kind: "wall" };
  Object.assign(r.player, { x, y, hp: 120, attack: 12, defense: 5, keys: { yellow: 0, blue: 0, red: 0 } }, stats);
  s.delve.history = [];
  s.delve.revival = null;
};

// A fresh save has no Delve run until Delve is unlocked and opened.
await fixture((s) => { s.upgrades.delve = 1; });

// Swipes in all four directions, below the key.
await fixture(place, {
  seed: scene.seed, x: key.x, y: key.y - 2,
  open: [[key.x - 1, key.y - 2], [key.x, key.y - 2], [key.x, key.y - 1]],
});
await swipe(-1, 0);
await expect.poll(async () => (await player()).x).toBe(key.x - 1);
await swipe(1, 0);
await expect.poll(async () => (await player()).x).toBe(key.x);
await swipe(0, -1);
await expect.poll(async () => (await player()).y).toBe(key.y - 1);
await swipe(0, 1);
await expect.poll(async () => (await player()).y).toBe(key.y - 2);

// Tapping walks to the key and picks it up; undo takes back the whole
// tapped route, which counts as one move.
await tap(key.x, key.y);
await expect.poll(async () => (await player()).y).toBe(key.y);
await expect.poll(async () => (await player()).keys.yellow).toBe(1);
await page.locator("#undo").click();
await expect.poll(async () => (await player()).y).toBe(key.y - 2);
await expect.poll(async () => (await player()).keys.yellow).toBe(0);

// Without a key, a route to a room sealed behind the door stops in front of it.
await fixture(place, {
  seed: scene.seed, x: door.x, y: door.y - 2,
  open: [[door.x, door.y - 2], [door.x, door.y - 1], [door.x, door.y + 1], [door.x, door.y + 2]],
  closed: [[door.x - 1, door.y + 1], [door.x + 1, door.y + 1], [door.x - 1, door.y + 2], [door.x + 1, door.y + 2], [door.x, door.y + 3]],
});
await tap(door.x, door.y + 2);
await expect.poll(async () => (await player()).y).toBe(door.y - 1);
await expect(page.locator("#message")).toContainText("Requires amber key.");
await page.screenshot({ path: "test-results/blocked-door.png", fullPage: true });

// A lethal fight ends the run; Revive survives a refresh and restores it.
const weak = {
  seed: scene.seed, x: enemy.x, y: enemy.y - 2,
  open: [[enemy.x, enemy.y - 2], [enemy.x, enemy.y - 1]],
  stats: { hp: 1, attack: 1, defense: 0 },
  revive: true,
};
await fixture(place, weak);
await swipe(0, -1);
await swipe(0, -1);
await expect(page.locator("#revive-now")).toBeVisible();
await expect.poll(async () => (await player()).y).toBe(0);
await page.locator("#again").click();
await expect(page.locator("#undo")).toHaveAttribute("aria-label", "Revive");
await page.reload();
await page.locator('[data-tab="delve"]').click();
await expect(page.locator("#undo")).toHaveAttribute("aria-label", "Revive");
await page.locator("#undo").click();
await expect.poll(async () => (await player()).y).toBe(enemy.y - 1);
await expect.poll(async () => (await player()).hp).toBe(1);
// Revive expires once the new run takes a step.
await swipe(0, -1);
await page.locator("#again").click();
await swipe(0, -1);
await expect(page.locator("#undo")).toHaveAttribute("aria-label", /^Undo/);
await expect.poll(async () => (await saved()).delve.revival).toBe(null);
await page.locator("#undo").click();
await expect.poll(async () => (await player()).y).toBe(0);
await expect.poll(async () => (await saved()).delve.revival).toBe(null);
await page.screenshot({ path: "test-results/touch-controls.png", fullPage: true });

// The Delve wraps left/right where both edge tiles of a row are open. The
// far edge is off-screen in a 17-tile view, so cross it with a swipe.
await fixture(place, { seed: scene.seed, x: 29, y: 0, open: [[0, 0], [29, 0]] });
await page.screenshot({ path: "test-results/wrap-opening.png", fullPage: true });
await swipe(1, 0);
await expect.poll(async () => (await player()).x).toBe(0);
await page.locator("#undo").click();
await expect.poll(async () => (await player()).x).toBe(29);
if (errors.length) throw Error(errors.join("\n"));
console.log(
  `Four swipe directions, tap path/pickup, undo, locked-door stop, death reset, Revive refresh and expiry, and edge wrap passed (seed ${scene.seed}).`,
);
await browser.close();
