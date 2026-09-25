// Characterization snapshots for the DOM built in src/main.ts (pages, HUD,
// inspect panel, dialogs). Fixed saves are loaded with seeded randomness,
// a scripted walk clicks through every page, subtab, tooltip and dialog, and
// after each step the normalized `#app` HTML is hashed against
// tests/fixtures/ui.golden.json. Regenerate with UPDATE_GOLDEN=1 on the code
// *before* a UI refactor, then run without it after. Baseline HTML goes to
// test-results/ui-golden/ and current HTML to test-results/ui/, and the first
// differing line is printed for any mismatch.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UPDATE = process.env.UPDATE_GOLDEN === "1";
const GOLDEN = new URL("./fixtures/ui.golden.json", import.meta.url);
const BASELINE_DIR = "test-results/ui-golden";
const OUT_DIR = "test-results/ui";
const URL_ROOT = "http://127.0.0.1:5173/";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Seeded randomness from the first script on, and the fixture save (if any).
await page.addInitScript(() => {
  let seed = 12345;
  const rng = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rng;
  // Frames draw random effects, so reseed right before a step that rolls a
  // new run seed, in the same task, to keep that seed fixed.
  window.__reseed = (value) => { seed = value; };
  crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(rng() * 2 ** 32); return arr; };
  const fixture = sessionStorage.getItem("__uiFixture");
  if (fixture) localStorage.setItem("towerincramental.v1", fixture);
});

// --- Fixture saves, built in the page from the real defaults ---
await page.goto(URL_ROOT);
const FIXTURES = await page.evaluate(async () => {
  const { defaults } = await import("/src/save.ts");
  const { Game } = await import("/src/state.ts");
  const make = (edit) => {
    const s = defaults();
    edit?.(s);
    return { save: JSON.stringify(s), targets: [] };
  };
  /** A save with a Tower run inside the tower at `rooms` floors up, built by
   * the real game so the run is valid. */
  const inside = (edit, rooms = 0) => {
    const s = defaults();
    edit?.(s);
    const g = new Game(s);
    g.switchMode("tower");
    g.newRun(false);
    for (let i = 0; i < rooms; i++) g.advanceTowerRoom();
    // One tile of every kind on this floor, so the inspect panel shows each.
    const targets = {};
    for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) {
      const t = g.world.tile(x, y), kind = t.kind === "door" ? `door-${t.color ?? t.door?.type}` : t.kind === "key" ? `key-${t.color}` : t.kind;
      targets[kind] ??= [x, y];
    }
    return { save: JSON.stringify(g.save), targets: Object.values(targets) };
  };
  const quiet = (s) => {
    s.settings.transition = "instant";
    s.settings.reduceMotion = true;
    s.settings.weatherSound = false;
  };
  const rich = (s) => {
    quiet(s);
    Object.assign(s.upgrades, { delve: 1, auto: 1, legacy: 1, revive: 1, shardHp: 2, undos: 1, autoPersist: 1 });
    s.delve.essence = 37;
    s.tower.shards = 21;
    s.gold = 480;
    s.xp = 900;
    for (const k of Object.keys(s.materials)) s.materials[k] = 120;
    s.tower.reached = 31;
    s.tower.best = 31;
    s.delve.reached = 57;
    s.delve.best = 57;
    s.tower.sectionHp = { 1: 260, 2: 340 };
    s.tower.log = {
      0: { earned: ["silver", "gold"], claimed: ["silver"] },
      4: { earned: ["silver"], claimed: ["silver"] },
      30: { earned: ["silver", "gold", "platinum"], claimed: [] },
    };
    s.provisions.heal = 2;
  };
  return {
    fresh: make(quiet),
    towerFloor: inside(quiet, 3),
    rich: inside(rich, 12),
    devStatus: inside((s) => {
      rich(s);
      s.settings.devMode = true;
      s.settings.infoDisplay = "status";
      s.settings.showArrows = true;
    }, 25),
  };
});

// --- Snapshot helpers ---
/** `#app` HTML, with crafted items' random UUIDs replaced by a placeholder. */
const snapshot = () => page.evaluate(() =>
  document.querySelector("#app").outerHTML.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>"));
/** Waits until the HTML has stopped changing for 400ms, longer than any
 * fade (the tile highlight's is 300ms), so routes and fades have finished. */
async function settled() {
  let previous = null, same = 0;
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(100);
    const html = await snapshot();
    same = html === previous ? same + 1 : 0;
    if (same >= 4) return html;
    previous = html;
  }
  throw Error("UI never settled");
}
const shots = {};
async function shot(name) {
  if (shots[name]) throw Error(`Duplicate snapshot ${name}`);
  shots[name] = await settled();
}
async function load(name) {
  await page.evaluate((f) => sessionStorage.setItem("__uiFixture", f), FIXTURES[name].save);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
}
const click = (selector) => page.locator(selector).first().click();
const tab = (id) => click(`[data-tab="${id}"]`);
/** Taps Tower tile (x, y): the Tower view is fixed on the 17 × 17 room. */
async function tapTile(x, y) {
  const box = await page.locator("#world").boundingBox(), s = box.width / 17;
  await page.mouse.click(box.x + (x + 0.5) * s, box.y + (16 - y + 0.5) * s);
}
async function closeModal() {
  await page.evaluate(() => document.querySelector("#modal").open && document.querySelector("#modal").close());
}

// --- Scripted walks ---
async function boardTour(prefix, fixture) {
  await tab("tower");
  await shot(`${prefix}.tower`);
  const tiles = [[8, 1], [8, 3], [3, 8], [13, 8], [8, 13], [1, 1], [15, 15], ...FIXTURES[fixture].targets];
  for (const [x, y] of tiles) {
    if (shots[`${prefix}.tap.${x}.${y}`]) continue;
    await tapTile(x, y);
    await shot(`${prefix}.tap.${x}.${y}`);
  }
  // Tap the same tile twice: the first previews, the second walks.
  await tapTile(8, 2);
  await tapTile(8, 2);
  await shot(`${prefix}.walked`);
  await click("#undo");
  await shot(`${prefix}.undone`);
}
async function dialogsTour(prefix) {
  await click("#log");
  await shot(`${prefix}.log`);
  if (await page.locator("#log-older:not([disabled])").count()) {
    await click("#log-older");
    await shot(`${prefix}.log.older`);
  }
  await closeModal();
  await click("#section-pick");
  await shot(`${prefix}.sections`);
  await closeModal();
  await click("#auto-settings");
  await shot(`${prefix}.autoSettings`);
  await closeModal();
  await click("#end-run");
  await shot(`${prefix}.endRun`);
  await click("#cancel");
  await shot(`${prefix}.endRun.cancelled`);
}
async function upgradesTour(prefix) {
  await tab("upgrades");
  await shot(`${prefix}.upgrades`);
  for (const tree of await page.locator("[data-tree]").evaluateAll((bs) => bs.map((b) => b.dataset.tree))) {
    await click(`[data-tree="${tree}"]`);
    await shot(`${prefix}.tree.${tree}`);
    const skills = await page.locator("[data-skill]").evaluateAll((bs) => bs.map((b) => b.dataset.skill));
    for (const skill of skills.slice(0, 3)) {
      await click(`[data-skill="${skill}"]`);
      await shot(`${prefix}.tree.${tree}.${skill}`);
    }
    // Second tap on the selected node buys it when affordable.
    await click(`[data-skill="${skills[skills.length > 2 ? 2 : 0]}"]`);
    await shot(`${prefix}.tree.${tree}.buy`);
  }
}
async function gearTour(prefix) {
  await tab("gear");
  await shot(`${prefix}.gear`);
  for (const t of ["inventory", "crafting", "provisions", "equipped"]) {
    await click(`[data-geartab="${t}"]`);
    await shot(`${prefix}.gear.${t}`);
    if (t === "crafting") {
      await click(`[data-craft-slot="helmet"]`);
      await click(`[data-craft-metal]:nth-child(2)`);
      await shot(`${prefix}.gear.crafting.choices`);
      const plus = page.locator("[data-enh-plus]:not([disabled])");
      if (await plus.count()) {
        await plus.first().click();
        await shot(`${prefix}.gear.crafting.enhanced`);
      }
      if (await page.locator("#craft-btn:not([disabled])").count()) {
        await click("#craft-btn");
        await shot(`${prefix}.gear.crafted`);
      }
    }
    if (t === "provisions" && await page.locator("[data-gold]:not([disabled])").count()) {
      await click("[data-gold]:not([disabled])");
      await shot(`${prefix}.gear.provisions.bought`);
    }
  }
  await click("[data-geartab=inventory]");
  if (await page.locator("[data-equip]").count()) {
    await click("[data-equip]");
    await shot(`${prefix}.gear.equipped.item`);
    await click("[data-inspect]");
    await shot(`${prefix}.gear.inspect`);
    await closeModal();
    await click("[data-filter]:nth-child(2)");
    await shot(`${prefix}.gear.filtered`);
  }
}
async function settingsTour(prefix) {
  await tab("settings");
  await shot(`${prefix}.settings`);
  await page.locator("#info-display").selectOption("status");
  await tab("tower");
  await tapTile(8, 3);
  await shot(`${prefix}.statusInfo`);
  await tab("settings");
  await page.locator("#info-display").selectOption("popup");
  await page.locator("#arrows").setChecked(true);
  await tab("tower");
  await shot(`${prefix}.popupArrows`);
  await tab("settings");
  await page.locator("#dev-mode").setChecked(true);
  await shot(`${prefix}.settings.dev`);
  await click("#retire");
  await shot(`${prefix}.retire.confirm`);
  await click("#confirm");
  await shot(`${prefix}.summary`);
  await page.evaluate(() => { window.__reseed(777); document.querySelector("#again").click(); });
  await shot(`${prefix}.again`);
}

await load("fresh");
await shot("fresh.start");
await tab("upgrades");
await shot("fresh.upgrades");
await tab("gear");
await shot("fresh.gear");
await tab("settings");
await shot("fresh.settings");
await tab("tower");
await click("#auto");
await shot("fresh.autoLocked");

await load("towerFloor");
await boardTour("floor", "towerFloor");
await dialogsTour("floor");

await load("rich");
await boardTour("rich", "rich");
await dialogsTour("rich");
await tab("delve");
await shot("rich.delve");
await tab("defend");
await shot("rich.defend");
await upgradesTour("rich");
await gearTour("rich");
await settingsTour("rich");

await load("devStatus");
await boardTour("dev", "devStatus");
await tab("gear");
await click("[data-geartab=crafting]");
await shot("dev.gear.crafting");
await tab("upgrades");
await shot("dev.upgrades");

// --- Compare ---
const hashes = Object.fromEntries(Object.entries(shots).map(([k, html]) => [k, createHash("sha256").update(html).digest("hex").slice(0, 16)]));
mkdirSync(OUT_DIR, { recursive: true });
for (const [k, html] of Object.entries(shots)) writeFileSync(`${OUT_DIR}/${k}.html`, html);
let failed = false;
if (UPDATE || !existsSync(GOLDEN)) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  for (const [k, html] of Object.entries(shots)) writeFileSync(`${BASELINE_DIR}/${k}.html`, html);
  writeFileSync(GOLDEN, JSON.stringify(hashes, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(hashes).length} UI snapshot hashes to the golden file.`);
} else {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const changed = Object.keys({ ...golden, ...hashes }).filter((k) => golden[k] !== hashes[k]);
  for (const k of changed) {
    const base = `${BASELINE_DIR}/${k}.html`;
    let detail = "no local baseline HTML to compare";
    if (existsSync(base) && shots[k]) {
      const a = readFileSync(base, "utf8"), b = shots[k];
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      detail = `first difference at char ${i}:\n  was: ${a.slice(Math.max(0, i - 80), i + 120)}\n  now: ${b.slice(Math.max(0, i - 80), i + 120)}`;
    }
    console.error(`${k}: ${golden[k] ?? "missing"} -> ${hashes[k] ?? "missing"} (${detail})`);
  }
  if (changed.length) {
    failed = true;
    console.error(`${changed.length} UI snapshots changed; see ${OUT_DIR}/ vs ${BASELINE_DIR}/`);
  } else {
    console.log(`All ${Object.keys(hashes).length} UI snapshots match the golden hashes (${createHash("sha256").update(JSON.stringify(hashes)).digest("hex").slice(0, 8)}).`);
  }
}
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
if (failed) process.exitCode = 1;
