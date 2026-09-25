// Characterization screenshots for the board renderer. Fixed scenes (Tower,
// dim Tower, Delve, sprites off, outside, reduced motion, and decor: a crate
// stepped on, a pool waded into, tall grass walked through), plus the Defend
// board (building mode, a rainy battle, a night boss wave and a stormy night
// zoomed in, from the replay test's cities) and its palette icons, are drawn
// at fixed timestamps with seeded randomness, and each canvas's pixels are hashed
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

  // ── Defend ──────────────────────────────────────────────────────────────
  // The Defend board: fixed cities stepped to fixed moments (the same
  // scenarios as tests/defend-replay.test.ts), then drawn under each sky.
  const { DefendRenderer } = await import("/src/defend/render.ts");
  const { paintIcon } = await import("/src/defend/structure-art.ts");
  const { defaultLayout, fitLayout, placeCityTile, placeStructure } = await import("/src/defend/layout.ts");
  const { generateCity } = await import("/src/defend/citygen.ts");
  const { DefendSim } = await import("/src/defend/sim.ts");
  const { UPGRADES, ENEMIES } = await import("/src/defend/catalog.ts");
  const { tileKey, SUB, TILES_W, TILES_H } = await import("/src/defend/grid.ts");

  const levelsAt = (over = {}) => ({ ...Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), ...over });
  const maxLevels = () => levelsAt(Object.fromEntries(UPGRADES.map((u) => [u.id, u.maxLevel])));
  const cityLayout = (ring, structures) => {
    let l = defaultLayout();
    const { tx, ty } = l.keep;
    for (const [dx, dy] of ring) l = placeCityTile(l, tx + dx, ty + dy);
    for (const [kind, dx, dy] of structures) l = placeStructure(l, kind, tx + dx, ty + dy);
    return l;
  };
  const SQUARE = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const WIDE = [...SQUARE, [-2, 0], [2, 0], [-2, 1], [2, 1], [-2, -1], [2, -1], [0, -2], [-1, -2], [1, -2]];
  const GARRISON = {
    layout: () => cityLayout(SQUARE, [["barracks", 1, 1], ["archerBarracks", -1, -1], ["archerTower", -1, 1], ["watchTower", 1, -1], ["cannonTower", 0, -2]]),
    citySeed: 5, levels: levelsAt, seed: 2, smash: [[20, "house"], [21, "house"], [30, "wall"]],
  };
  const FORTRESS = {
    layout: () => cityLayout(WIDE, [["barracks", 1, 1], ["barracks", -2, 0], ["archerBarracks", -1, -1], ["archerBarracks", 2, 1], ["archerTower", -1, 1], ["archerTower", 0, -3], ["watchTower", 1, -1], ["cannonTower", 2, -2], ["cannonTower", -2, -2]]),
    citySeed: 8, levels: maxLevels, seed: 9, smash: [[45, "house"], [46, "wall"], [47, "barracks"]],
  };
  const cityOf = (sc) => generateCity(fitLayout(sc.layout()), sc.citySeed);
  const intactOf = (sim, kind) => sim.map.buildings.find((b) => b.kind === kind && sim.intact(b));
  /** Steps a scenario to `seconds`, then optionally drops a bomb on the
   * southernmost walking enemy so a fresh blast, scorch and dust are live. */
  const battle = (sc, seconds, bomb) => {
    const sim = new DefendSim(cityOf(sc), sc.levels(), sc.seed);
    for (let t = 1; t <= seconds; t++) {
      for (let f = 0; f < 4; f++) sim.update(0.25);
      for (const [at, kind] of sc.smash) if (at === t) sim.damageBuilding(intactOf(sim, kind).id, 1e9);
    }
    if (bomb) {
      const e = sim.enemies.filter((e) => !ENEMIES[e.kind].boss && !ENEMIES[e.kind].flying).sort((a, b) => b.y - a.y)[0];
      sim.dropBomb(e.x, e.y);
      sim.update(0.1);
    }
    return sim;
  };
  const has = {
    boom: (s) => s.effects.some((e) => e.kind === "boom"), scorch: (s) => s.scorches.length > 0, shell: (s) => s.shells.length > 0,
    arrow: (s) => s.arrows.length > 0, rubble: (s) => s.map.buildings.some((b) => !s.intact(b)),
    rebuilt: (s) => s.built.some((b, id) => b > 0 && b < s.map.buildings[id].cells.length),
    boss: (s) => s.enemies.some((e) => ENEMIES[e.kind].boss), marked: (s) => s.enemies.some((e) => e.marked),
    bat: (s) => s.enemies.some((e) => ENEMIES[e.kind].flying), working: (s) => s.civilians.some((c) => c.state === "working"),
    archer: (s) => s.soldiers.some((u) => u.kind === "archer"), sword: (s) => s.soldiers.some((u) => u.kind === "sword"),
  };
  const enemyWhere = (want) => (sim) => sim.enemies.find((e) => want(ENEMIES[e.kind]));

  const DEFEND_SCENES = {
    // Building mode: no battle, the tile grid, legal tiles, a hovered tile,
    // a structure ghost and an aimed bomb.
    defendEdit: () => {
      const layout = GARRISON.layout(), map = cityOf(GARRISON);
      const legal = new Set();
      for (let ty = 0; ty < TILES_H; ty++) for (let tx = 0; tx < TILES_W; tx++) if (placeCityTile(layout, tx, ty)) legal.add(tileKey(tx, ty));
      const hover = [...legal][0], [hx, hy] = hover.split(",").map(Number);
      return {
        map, sim: null,
        overlay: { legal, hover, ghost: { rect: { x: hx * SUB + 2, y: hy * SUB + 1, w: 3, h: 4 }, kind: "barracks" }, bomb: { x: 30, y: 50, r: 2.5 } },
        opts: { grid: true, weather: null, night: 0, reduceMotion: false },
      };
    },
    // Early rain battle: rubble, rebuilding, cannon shells, a fresh blast,
    // plus a hurt tower (health bar), a hurt house, and struck units.
    defendRain: () => {
      const sim = battle(GARRISON, 30, true);
      const tower = intactOf(sim, "archerTower"), house = intactOf(sim, "house");
      sim.damageBuilding(tower.id, sim.maxHp[tower.id] * 0.6);
      sim.damageBuilding(house.id, sim.maxHp[house.id] * 0.4);
      const struck = [sim.soldiers[0], sim.civilians[0], sim.enemies[0]].filter(Boolean);
      if (!struck.length) throw Error("defendRain: no unit to strike");
      for (const u of struck) u.flash = 0.1;
      return { map: sim.map, sim, overlay: null, opts: { grid: false, weather: { rain: true }, night: 0, reduceMotion: false }, need: ["boom", "scorch", "shell", "rubble", "rebuilt", "working", "archer", "sword"] };
    },
    // The wave-10 boss at night and the fight at the wall, zoomed in (the
    // city layer repainted at 2×).
    defendNight: () => {
      const sim = battle(FORTRESS, 400, true);
      const boss = enemyWhere((d) => d.boss)(sim), marked = sim.enemies.find((e) => e.marked);
      const focus = () => ({ x: (boss.x + marked.x) / 2, y: (boss.y + marked.y) / 2 });
      return { map: sim.map, sim, overlay: null, zoom: 1.5, focus, opts: { grid: false, weather: { rain: false }, night: 0.85, reduceMotion: false }, need: ["boom", "scorch", "arrow", "boss", "marked", "rebuilt", "archer", "sword"] };
    },
    // A stormy night, reduced motion, zoomed right in (3×) on a bat.
    defendStorm: () => {
      const sim = battle(FORTRESS, 456, false);
      return { map: sim.map, sim, overlay: null, zoom: 3, focus: enemyWhere((d) => d.flying), opts: { grid: false, weather: { rain: true }, night: 1, reduceMotion: true }, need: ["bat", "arrow"] };
    },
  };

  const defendCanvas = document.createElement("canvas");
  defendCanvas.style.cssText = "position:fixed;left:0;top:0";
  document.body.append(defendCanvas);
  const grabDefend = () => {
    const c = defendCanvas.getContext("2d");
    return { pixels: c.getImageData(0, 0, defendCanvas.width, defendCanvas.height).data.slice(), png: defendCanvas.toDataURL("image/png") };
  };
  /** A Defend scene: frames until every light has baked, then a later frame
   * (the flag has waved, torches flickered, rain fallen). */
  const captureDefend = (name, seed) => seeded(seed, () => {
    const scene = DEFEND_SCENES[name]();
    for (const need of scene.need ?? []) if (!has[need](scene.sim)) throw Error(`${name}: no ${need} in the scene`);
    const r = new DefendRenderer(defendCanvas);
    r.resize(504);
    if (scene.zoom) {
      // Zooming about a point keeps it fixed, so zoom twice: about the
      // canvas centre, then pan the focus there.
      const f = scene.focus(scene.sim), box = defendCanvas.getBoundingClientRect();
      r.zoomAt(box.left + box.width / 2, box.top + box.height / 2, scene.zoom);
      r.panBy(box.width / 2 - ((f.x / 63) * box.width * scene.zoom + r.cam.x), box.height / 2 - ((f.y / 91) * box.height * scene.zoom + r.cam.y));
    }
    const draw = (now) => r.draw(scene.map, scene.sim, scene.overlay, { ...scene.opts, now });
    const out = {};
    for (let t = 1000; t <= 2000; t += 50) draw(t);
    out.settled = grabDefend();
    for (let t = 2050; t <= 2600; t += 50) draw(t);
    out.later = grabDefend();
    return out;
  });
  /** Every palette icon, side by side. */
  const captureIcons = () => {
    const items = ["cityTile", "bomb", "keep", "barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower"];
    const sheet = document.createElement("canvas");
    sheet.width = items.length * 48;
    sheet.height = 48;
    const s = sheet.getContext("2d");
    items.forEach((item, i) => {
      const icon = document.createElement("canvas");
      icon.width = icon.height = 48;
      paintIcon(icon, item);
      s.drawImage(icon, i * 48, 0);
    });
    return { sheet: { pixels: s.getImageData(0, 0, sheet.width, sheet.height).data.slice(), png: sheet.toDataURL("image/png") } };
  };

  const JOBS = [
    ...Object.keys(SCENES).map((name) => [name, (seed) => capture(name, seed)]),
    ...Object.keys(DEFEND_SCENES).map((name) => [name, (seed) => captureDefend(name, seed)]),
    ["defendIcons", () => captureIcons()],
  ];

  const results = {};
  let seed = 1;
  for (const [name, run] of JOBS) {
    // Art loads asynchronously: repeat until two captures agree.
    let previous = null, stable = null;
    for (let attempt = 0; attempt < 30 && !stable; attempt++) {
      const shot = run(seed);
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
  defendCanvas.remove();
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
