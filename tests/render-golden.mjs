// Characterization screenshots for the board renderer. Fixed scenes (Tower,
// dim Tower, Delve, sprites off, outside, reduced motion, and decor: a crate
// stepped on, a pool waded into, tall grass walked through) are drawn at fixed
// timestamps with seeded randomness, and each canvas's pixels are hashed
// against tests/fixtures/render.golden.json. Pixels depend on the browser and
// GPU, so the golden is only meaningful on the machine that made it:
// regenerate it with UPDATE_GOLDEN=1 on the code *before* a refactor, then run
// without it after. Baseline PNGs go to test-results/render-golden/ and
// current ones to test-results/render/, with a pixel-difference count for any
// mismatch.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UPDATE = process.env.UPDATE_GOLDEN === "1";
const GOLDEN = new URL("./fixtures/render.golden.json", import.meta.url);
const BASELINE_DIR = "test-results/render-golden";
const OUT_DIR = "test-results/render";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/");
await page.evaluate(() => document.fonts.ready);

const shots = await page.evaluate(async () => {
  const { Renderer } = await import("/src/rendering.ts");
  const { Game } = await import("/src/state.ts");
  const { defaults } = await import("/src/save.ts");
  const { decorSourceFor, tileDecor } = await import("/src/decor.ts");

  const mulberry32 = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const realRandom = Math.random, realValues = crypto.getRandomValues.bind(crypto);
  const seeded = (seed, body) => {
    const rng = mulberry32(seed);
    Math.random = rng;
    crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(rng() * 2 ** 32); return arr; };
    try { return body(); } finally { Math.random = realRandom; crypto.getRandomValues = realValues; }
  };

  const COLORS = ["yellow", "blue", "red"];
  /** Every kind of thing a tile can hold, so each painter is drawn. */
  const PLANTS = [
    { kind: "key", color: "yellow" }, { kind: "key", color: "blue" }, { kind: "key", color: "red" },
    { kind: "door", color: "yellow" }, { kind: "door", color: "blue" }, { kind: "door", color: "red" },
    { kind: "door", door: { type: "keys", keys: ["yellow", "blue"], mode: "all" } }, { kind: "door", door: { type: "fullHp" } },
    { kind: "potion" }, { kind: "potion", color: "red", amount: 60 }, { kind: "attack" }, { kind: "defense" },
    { kind: "treasure" }, { kind: "openedChest" }, { kind: "openedChest", tier: "gold" },
    { kind: "reward", tier: "silver" }, { kind: "reward", tier: "gold" }, { kind: "reward", tier: "platinum" },
    ...[0, 1, 2, 3].map((tier) => ({ kind: "enemy", enemy: { name: `Planted ${tier}`, hp: 20, attack: 5, defense: 1, tier } })),
    { kind: "enemy", enemy: { name: "Slime", hp: 20, attack: 5, defense: 1, tier: 0 } },
    { kind: "stairs" }, { kind: "stairsDown" }, { kind: "oneway" },
  ];
  /** Fills plain floor near the player, nearest first, with every plant. */
  const plantAll = (g) => {
    const p = g.run.player, spots = [];
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if ((dx || dy) && y >= 0 && x >= 0 && x < g.world.width && g.world.tile(x, y).kind === "floor") spots.push([Math.abs(dx) + Math.abs(dy), x, y]);
    }
    spots.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
    PLANTS.forEach((t, i) => { if (spots[i]) g.run.changes[`${spots[i][1]},${spots[i][2]}`] = structuredClone(t); });
  };
  const game = (mode, settings = {}) => {
    const save = defaults();
    save.upgrades.delve = 1;
    Object.assign(save.settings, settings);
    const g = new Game(save);
    g.switchMode(mode);
    return g;
  };
  const quiet = (g) => { g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 }; };
  /** The first floor tile next to the player, for a one-step move. */
  const neighbour = (g) => {
    const p = g.run.player;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const d = g.world.step(p.x, p.y, dx, dy);
      if (d && g.world.tile(d.x, d.y).kind === "floor") return d;
    }
    return p;
  };

  /** A Tower game on the first floor where `want(plan)` holds for a floor
   * tile with a plain floor tile beside it: the hero starts beside it and
   * steps onto it. */
  const decorScene = (settings, want) => {
    const g = game("tower", settings);
    for (let floor = 0; floor < 120; floor++) {
      const src = decorSourceFor(g.world, g.run.seed), floorAt = (x, y) => g.world.tile(x, y).kind === "floor";
      for (let y = 1; y < 16; y++)
        for (let x = 1; x < 16; x++) {
          if (!floorAt(x, y) || !want(tileDecor(src, x, y))) continue;
          const from = [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
            .find((f) => floorAt(f.x, f.y) && !tileDecor(src, f.x, f.y).crates.length);
          if (!from) continue;
          g.run.player.x = from.x;
          g.run.player.y = from.y;
          return { g, to: { x, y } };
        }
      g.advanceTowerRoom();
    }
    throw Error("no floor has that decor");
  };

  const SCENES = {
    towerArea1: () => {
      const g = game("tower");
      plantAll(g);
      return g;
    },
    towerDim: () => {
      const g = game("tower", { brightness: 40 });
      for (let i = 0; i < 15; i++) g.advanceTowerRoom();
      plantAll(g);
      return g;
    },
    delveTorches: () => {
      const g = game("delve", { brightness: 70 });
      plantAll(g);
      return g;
    },
    spritesOff: () => {
      const g = game("tower", { spritesOff: true, brightness: 55 });
      for (let i = 0; i < 3; i++) g.advanceTowerRoom();
      plantAll(g);
      return g;
    },
    outside: () => {
      const g = game("tower");
      g.newRun(true);
      return g;
    },
    reducedNoDecor: () => {
      const g = game("delve", { reduceMotion: true, decorOff: true, brightness: 85 });
      plantAll(g);
      return g;
    },
    decorCrates: () => ({
      ...decorScene({ brightness: 60 }, (d) => d.crates.length >= 3),
      check: (decor) => decor.broken.size === 1 && decor.particles.some((p) => p.kind === "splinter"),
    }),
    decorPool: () => ({
      ...decorScene({ brightness: 45 }, (d) => d.water?.[20 * 24 + 12] === 1 && d.waterCount > 150),
      check: (decor) => decor.ripples.length > 0 && Array.from({ length: 17 * 17 }, (_, k) => tileDecor(decor.src, k % 17, Math.floor(k / 17))).some((d) => d.drip),
    }),
    decorThicket: () => ({
      ...decorScene({ brightness: 35 }, (d) => d.thicket && d.blades.length > 20),
      check: (decor) => decor.busy,
    }),
  };

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;left:0;top:0;width:408px;height:408px";
  document.body.append(canvas);
  const grab = () => {
    const c = canvas.getContext("2d");
    return { pixels: c.getImageData(0, 0, canvas.width, canvas.height).data.slice(), png: canvas.toDataURL("image/png") };
  };
  /** One scene, fully synchronous so the app's own frame loop cannot
   * interleave: a settled frame, a frame mid-step with feedback showing and
   * a route preview, and a later frame once the camera has caught up. */
  const capture = (name, seed) => seeded(seed, () => {
    const scene = SCENES[name](), g = scene.g ?? scene;
    quiet(g);
    const r = new Renderer(canvas, g);
    const out = {};
    for (let t = 1000; t <= 1400; t += 50) r.draw(t);
    out.settled = grab();
    const to = scene.to ?? neighbour(g), from = { ...g.run.player };
    g.run.player.x = to.x;
    g.run.player.y = to.y;
    r.previewRoute = [from, to, neighbour(g)];
    g.blocked = { x: from.x, y: from.y + 1, until: 1900 };
    g.effect = { text: "+2 ATK", x: to.x, y: to.y, until: 2600 };
    r.draw(1450);
    r.draw(1483);
    out.moving = grab();
    for (let t = 1500; t <= 3300; t += 60) {
      r.draw(t);
      // Ripples spread past the hero's feet.
      if (t === 2100) out.ripples = grab();
      // Splinters in flight, a fresh splash, grass still swaying.
      if (t !== 1740) continue;
      out.after = grab();
      // Guards the scene itself: the effect it exists for must be live.
      if (scene.check && !scene.check(r.decor)) throw Error(`${name}: its decor effect never started`);
    }
    out.later = grab();
    return out;
  });
  const hash = async (pixels) => {
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const results = {};
  let seed = 1;
  for (const name of Object.keys(SCENES)) {
    // Art loads asynchronously: repeat until two captures agree.
    let previous = null, stable = null;
    for (let attempt = 0; attempt < 30 && !stable; attempt++) {
      const shot = capture(name, seed);
      const hashes = {};
      for (const [frame, { pixels }] of Object.entries(shot)) hashes[frame] = await hash(pixels);
      const key = JSON.stringify(hashes);
      if (key === previous) stable = { hashes, shot };
      previous = key;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!stable) throw Error(`${name}: frames never became stable`);
    for (const [frame, h] of Object.entries(stable.hashes)) results[`${name}.${frame}`] = { hash: h, png: stable.shot[frame].png };
    seed++;
  }
  canvas.remove();
  return results;
});

const png = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
const hashes = Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.hash]));
mkdirSync(OUT_DIR, { recursive: true });
for (const [k, v] of Object.entries(shots)) writeFileSync(`${OUT_DIR}/${k}.png`, png(v.png));

if (UPDATE || !existsSync(GOLDEN)) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  for (const [k, v] of Object.entries(shots)) writeFileSync(`${BASELINE_DIR}/${k}.png`, png(v.png));
  writeFileSync(GOLDEN, JSON.stringify(hashes, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(hashes).length} render hashes to the golden file.`);
} else {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const changed = Object.keys({ ...golden, ...hashes }).filter((k) => golden[k] !== hashes[k]);
  for (const k of changed) {
    const base = `${BASELINE_DIR}/${k}.png`;
    let detail = "no local baseline PNG to compare";
    if (existsSync(base) && shots[k]) {
      const diff = await page.evaluate(async ([a, b]) => {
        const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };
        const [x, y] = await Promise.all([load(a), load(b)]);
        const read = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
        const p = read(x), q = read(y);
        if (p.length !== q.length) return "different sizes";
        let n = 0, max = 0;
        for (let i = 0; i < p.length; i += 4) {
          const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]), Math.abs(p[i + 3] - q[i + 3]));
          if (d) { n++; max = Math.max(max, d); }
        }
        return `${n} pixels differ (max channel delta ${max})`;
      }, [`data:image/png;base64,${readFileSync(base).toString("base64")}`, shots[k].png]);
      detail = diff;
    }
    console.error(`${k}: ${golden[k] ?? "missing"} -> ${hashes[k] ?? "missing"} (${detail})`);
  }
  if (changed.length) {
    await browser.close();
    throw Error(`${changed.length} render frames changed; see ${OUT_DIR}/ vs ${BASELINE_DIR}/`);
  }
  console.log(`All ${Object.keys(hashes).length} render frames match the golden hashes (${createHash("sha256").update(JSON.stringify(hashes)).digest("hex").slice(0, 8)}).`);
}
if (errors.length) throw Error(errors.join("\n"));
await browser.close();
