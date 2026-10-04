// The fixed scenes behind both render goldens: tests/render-golden.mjs draws
// them in a browser and hashes pixels, and tests/render-calls.test.ts draws
// them in Node on a recording canvas and hashes the calls. Each scene is
// drawn at fixed timestamps with seeded randomness; `grab` is called at each
// captured frame, and the caller decides what to record there.
import { Renderer } from "../src/rendering.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { decorSourceFor, tileDecor, type TileDecor } from "../src/decor.ts";
import type { DecorLayer } from "../src/decor-render.ts";
import type { Tile } from "../src/entities.ts";
import { DefendRenderer } from "../src/defend/render.ts";
import { paintIcon } from "../src/defend/structure-art.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { UPGRADES, ENEMIES, BOMB_RADIUS } from "../src/defend/catalog.ts";
import { tileKey, SUB, TILES_W, TILES_H, withDefendStream } from "../src/defend/grid.ts";
import { withStream } from "../src/random.ts";

type Point = { x: number; y: number };
/** Called at each captured frame with its name. */
export type Grab = (frame: string) => void;

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** Runs `body` with Math.random, crypto.getRandomValues and every named
 * random stream drawing from one seeded stream. */
function seeded<T>(seed: number, body: () => T): T {
  const realRandom = Math.random, realValues = crypto.getRandomValues.bind(crypto);
  const rng = mulberry32(seed);
  Math.random = rng;
  crypto.getRandomValues = (<A extends ArrayBufferView | null>(arr: A) => {
    const a = arr as unknown as number[];
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(rng() * 2 ** 32);
    return arr;
  }) as typeof crypto.getRandomValues;
  const streams = () => withStream("game", rng, () => withStream("effects", rng, () => withDefendStream("rolls", rng, () => withDefendStream("effects", rng, body))));
  try { return streams(); } finally { Math.random = realRandom; crypto.getRandomValues = realValues; }
}

// ── Tower, Delve and outside ─────────────────────────────────────────────

/** Every kind of thing a tile can hold, so each painter is drawn. */
const PLANTS: Tile[] = [
  { kind: "key", color: "yellow" }, { kind: "key", color: "blue" }, { kind: "key", color: "red" },
  { kind: "door", color: "yellow" }, { kind: "door", color: "blue" }, { kind: "door", color: "red" },
  { kind: "door", door: { type: "keys", keys: ["yellow", "blue"], mode: "all" } }, { kind: "door", door: { type: "fullHp" } },
  { kind: "potion" }, { kind: "potion", color: "red", amount: 60 }, { kind: "attack" }, { kind: "defense" },
  { kind: "treasure" }, { kind: "openedChest" }, { kind: "openedChest", tier: "gold" },
  { kind: "reward", tier: "silver" }, { kind: "reward", tier: "gold" },
  ...(["weak", "normal", "strong", "elite"] as const).map((strength, tier): Tile => ({ kind: "enemy", enemy: { name: `Planted ${tier}`, hp: 20, attack: 5, defense: 1, tier, strength } })),
  { kind: "enemy", enemy: { name: "Slime", hp: 20, attack: 5, defense: 1, tier: 0, strength: "elite" } },
  { kind: "stairs" }, { kind: "stairsDown" }, { kind: "oneway" },
];
/** Fills plain floor near the player, nearest first, with every plant. */
function plantAll(g: Game) {
  const p = g.run.player, spots: [number, number, number][] = [];
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    const x = p.x + dx, y = p.y + dy;
    if ((dx || dy) && y >= 0 && x >= 0 && x < g.world.width && g.world.tile(x, y).kind === "floor") spots.push([Math.abs(dx) + Math.abs(dy), x, y]);
  }
  spots.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  PLANTS.forEach((t, i) => { if (spots[i]) g.run.changes[`${spots[i][1]},${spots[i][2]}`] = structuredClone(t); });
}
function game(mode: "tower" | "delve", settings: Record<string, unknown> = {}) {
  const save = defaults();
  save.upgrades.delve = 1;
  Object.assign(save.settings, settings);
  const g = new Game(save);
  g.switchMode(mode);
  return g;
}
const quiet = (g: Game) => { g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 }; };
/** The first floor tile next to the player, for a one-step move. */
function neighbour(g: Game): Point {
  const p = g.run.player;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const d = g.world.step(p.x, p.y, dx, dy);
    if (d && g.world.tile(d.x, d.y).kind === "floor") return d;
  }
  return p;
}

/** `fight`: the step goes into an enemy there, played out strike by strike.
 * `climb`: the hero takes the stairs instead, and a door's spent keys and a
 * Heart Door's checked heart rise on the new floor. */
type BoardScene = { g: Game; to?: Point; fight?: boolean; climb?: boolean; check?: (decor: DecorLayer) => boolean };

/** A Tower game on the first floor where `want(plan)` holds for a floor
 * tile with a plain floor tile beside it: the hero starts beside it and
 * steps onto it. */
function decorScene(settings: Record<string, unknown>, want: (d: TileDecor) => boolean): BoardScene {
  const g = game("tower", settings);
  for (let floor = 0; floor < 120; floor++) {
    const src = decorSourceFor(g.world, g.run.seed)!, floorAt = (x: number, y: number) => g.world.tile(x, y).kind === "floor";
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
}

const BOARD_SCENES: Record<string, () => BoardScene> = {
  towerArea1: () => {
    const g = game("tower");
    plantAll(g);
    return { g };
  },
  towerDim: () => {
    const g = game("tower", { brightness: 40 });
    for (let i = 0; i < 15; i++) g.advanceTowerRoom();
    plantAll(g);
    return { g };
  },
  delveTorches: () => {
    const g = game("delve", { brightness: 70 });
    plantAll(g);
    return { g };
  },
  spritesOff: () => {
    const g = game("tower", { spritesOff: true, brightness: 55 });
    for (let i = 0; i < 3; i++) g.advanceTowerRoom();
    plantAll(g);
    return { g };
  },
  outside: () => {
    const g = game("tower");
    g.newRun({ outside: true });
    return { g };
  },
  reducedNoDecor: () => {
    const g = game("delve", { reduceMotion: true, decorOff: true, brightness: 85 });
    plantAll(g);
    return { g };
  },
  decorCrates: () => ({
    ...decorScene({ brightness: 60 }, (d) => d.crates.length >= 3),
    check: (decor) => decor.broken.size === 1 && decor.particles.some((p) => p.kind === "splinter"),
  }),
  decorPool: () => ({
    ...decorScene({ brightness: 45 }, (d) => d.water?.[20 * 24 + 12] === 1 && d.waterCount > 150),
    check: (decor) => decor.ripples.length > 0 && Array.from({ length: 17 * 17 }, (_, k) => tileDecor(decor.src!, k % 17, Math.floor(k / 17))).some((d) => d.drip),
  }),
  decorThicket: () => ({
    ...decorScene({ brightness: 35 }, (d) => d.thicket && d.blades.length > 20),
    check: (decor) => decor.busy,
  }),
};

/** Board scenes added since the Defend scenes: they draw after all the
 * others, since each scene's seed is its place in JOBS. */
const LATER_BOARD_SCENES: Record<string, () => BoardScene> = {
  towerFight: () => {
    const g = game("tower", { brightness: 70 });
    const to = neighbour(g);
    g.run.changes[`${to.x},${to.y}`] = { kind: "enemy", enemy: { name: "Slime", hp: 40, attack: 9, defense: 1, tier: 0, strength: "normal" } };
    return { g, to, fight: true };
  },
  towerClimb: () => ({ g: game("tower", { brightness: 70 }), climb: true }),
  /** Damage Visual claimed: enemies on floor tiles near the hero wear what
   * each fight costs, gold, green (free), red (lethal), shortened, and ∞. */
  towerDamageLabels: () => {
    const g = game("tower", { brightness: 70 });
    g.save.goals.claimed = { 1: [50] };
    const p = g.run.player, step = neighbour(g), spots: Point[] = [];
    for (let dy = 1; dy <= 5 && spots.length < 5; dy++)
      for (let dx = -3; dx <= 3 && spots.length < 5; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (g.world.tile(x, y).kind === "floor" && !(x === step.x && y === step.y)) spots.push({ x, y });
      }
    const stats = [[40, 9, 1], [5, 30, 0], [400, 60, 2], [90_000, 900, 0], [30, 5, 50]];
    spots.forEach(({ x, y }, i) => {
      const [hp, attack, defense] = stats[i]!;
      g.run.changes[`${x},${y}`] = { kind: "enemy", enemy: { name: "Slime", hp: hp!, attack: attack!, defense: defense!, tier: 0, strength: "normal" } };
    });
    return { g };
  },
};

/** One board scene on `canvas` (408×408 CSS pixels), fully synchronous so
 * no frame loop can interleave: a settled frame, a frame mid-step with
 * feedback, rising rewards and a route preview showing (or, in a fight
 * scene, mid-strike), and later frames once the camera has caught up. */
function playBoard(name: string, seed: number, canvas: HTMLCanvasElement, grab: Grab) {
  seeded(seed, () => {
    const scene = (BOARD_SCENES[name] ?? LATER_BOARD_SCENES[name])(), g = scene.g;
    quiet(g);
    const r = new Renderer(canvas, g);
    for (let t = 1000; t <= 1400; t += 50) r.draw(t);
    grab("settled");
    const to = scene.to ?? neighbour(g), from = { ...g.run.player };
    if (scene.climb) {
      g.advanceTowerRoom();
      quiet(g); // Its feedback text is timed by the real clock.
      const p = g.run.player, at = { x: p.x, y: p.y + 1 };
      g.gains.push(
        { ...at, text: "−1 yellow key", art: { tile: { kind: "key", color: "yellow" }, spent: true } },
        { ...at, text: "Full HP ✓", art: { heart: true } },
      );
    } else if (scene.fight) {
      g.playsFights = true;
      g.save.settings.fightAnimation = true;
      g.move(to.x - from.x, to.y - from.y);
      g.encounter!.start = 1400;
    } else {
      g.run.player.x = to.x;
      g.run.player.y = to.y;
      r.previewRoute = [from, to, neighbour(g)];
      g.blocked = { x: from.x, y: from.y + 1, until: 1900 };
      g.effect = { text: "Move undone", x: to.x, y: to.y, until: 2600 };
      // A reward with a sprite rises first, then one written out.
      g.gains.push({ x: to.x, y: to.y, text: "+2 attack", art: { tile: { kind: "attack" } } }, { x: to.x, y: to.y, text: "+40 Gold", art: null });
    }
    r.draw(1450);
    r.draw(1483);
    grab("moving");
    for (let t = 1500; t <= 3300; t += 60) {
      // As the frame loop does: the fight counts once its last strike is done.
      if (g.encounter && t >= g.encounter.start + g.encounter.bout.duration) g.finishEncounter();
      r.draw(t);
      // Ripples spread past the hero's feet.
      if (t === 2100) grab("ripples");
      // Splinters in flight, a fresh splash, grass still swaying.
      if (t !== 1740) continue;
      grab("after");
      // Guards the scene itself: the effect it exists for must be live.
      if (scene.check && !scene.check(r.decor)) throw Error(`${name}: its decor effect never started`);
    }
    if (scene.fight && (g.encounter || g.run.player.x !== to.x || g.run.player.y !== to.y)) throw Error(`${name}: the fight never settled`);
    grab("later");
  });
}

// ── Defend ───────────────────────────────────────────────────────────────
// The Defend board: fixed cities stepped to fixed moments (the same
// scenarios as tests/defend-replay.test.ts), then drawn under each sky.

type Levels = Record<string, number>;
const levelsAt = (over: Levels = {}): Levels => ({ ...Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), ...over });
const maxLevels = () => levelsAt(Object.fromEntries(UPGRADES.map((u) => [u.id, u.maxLevel])));
function cityLayout(ring: number[][], structures: [string, number, number][]) {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of ring) l = placeCityTile(l, tx + dx, ty + dy)!;
  for (const [kind, dx, dy] of structures) l = placeStructure(l, kind as never, tx + dx, ty + dy)!;
  return l;
}
const SQUARE = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const WIDE = [...SQUARE, [-2, 0], [2, 0], [-2, 1], [2, 1], [-2, -1], [2, -1], [0, -2], [-1, -2], [1, -2]];
type Scenario = { layout: () => ReturnType<typeof defaultLayout>; citySeed: number; levels: () => Levels; seed: number; smash: [number, string][] };
const GARRISON: Scenario = {
  layout: () => cityLayout(SQUARE, [["barracks", 1, 1], ["archerBarracks", -1, -1], ["archerTower", -1, 1], ["watchTower", 1, -1], ["cannonTower", 0, -2]]),
  citySeed: 5, levels: levelsAt, seed: 2, smash: [[20, "house"], [21, "house"], [30, "wall"]],
};
const FORTRESS: Scenario = {
  layout: () => cityLayout(WIDE, [["barracks", 1, 1], ["barracks", -2, 0], ["archerBarracks", -1, -1], ["archerBarracks", 2, 1], ["archerTower", -1, 1], ["archerTower", 0, -3], ["watchTower", 1, -1], ["cannonTower", 2, -2], ["cannonTower", -2, -2]]),
  citySeed: 8, levels: maxLevels, seed: 9, smash: [[45, "house"], [46, "wall"], [47, "barracks"]],
};
const cityOf = (sc: Scenario) => generateCity(fitLayout(sc.layout()), sc.citySeed);
const intactOf = (sim: DefendSim, kind: string) => sim.map.buildings.find((b) => b.kind === kind && sim.intact(b))!;
/** Steps a scenario to `seconds`, then optionally drops a bomb on the
 * southernmost walking enemy so a fresh blast, scorch and dust are live. */
/** Where to drop a scene's bomb: on the lowest ground enemy, sparing the
 * boss, bats and marked enemies (the scenes show those) and keeping the
 * blast clear of the boss and the marks; with no such enemy, on open ground
 * six cells from them. */
function bombSpot(sim: DefendSim): Unit | undefined {
  const reach = BOMB_RADIUS + 1;
  const spared = sim.enemies.filter((m) => m.marked || ENEMIES[m.kind].boss);
  const clear = (e: Unit) => !spared.some((m) => (m.x - e.x) * (m.x - e.x) + (m.y - e.y) * (m.y - e.y) < reach * reach);
  const enemy = sim.enemies.filter((e) => !ENEMIES[e.kind].boss && !ENEMIES[e.kind].flying && clear(e)).sort((a, b) => b.y - a.y)[0];
  if (enemy || !spared.length) return enemy;
  const cx = spared.reduce((s, m) => s + m.x, 0) / spared.length, cy = spared.reduce((s, m) => s + m.y, 0) / spared.length;
  const ring = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]].map(([dx, dy]) => ({ x: cx + dx * 6, y: cy + dy * 6 }));
  return ring.find(clear);
}

/** A battle stepped `seconds` in, then on a second at a time (up to two
 * more minutes) until what a scene shows is there: everything in `need`
 * but the blast, and (when `bomb`) an enemy to bomb clear of what the scene
 * shows. Then the bomb, and tenths of a second (up to two) until all of
 * `need` holds, so a scene still finds what it shows when the city changes. */
function battle(sc: Scenario, seconds: number, bomb: boolean, need: string[] = []) {
  const sim = new DefendSim(cityOf(sc), sc.levels() as never, sc.seed);
  const before = need.filter((n) => n !== "boom" && n !== "scorch");
  const holds = (list: string[]) => list.every((n) => has[n](sim));
  let t = 1;
  for (; t <= seconds + 120; t++) {
    for (let f = 0; f < 4; f++) sim.update(0.25);
    for (const [at, kind] of sc.smash) if (at === t) sim.damageBuilding(intactOf(sim, kind).id, 1e9);
    if (t >= seconds && holds(before) && (!bomb || bombSpot(sim))) break;
  }
  if (t > seconds + 120) throw Error(`${sc.seed}: the battle never showed ${before.filter((n) => !has[n](sim)).join(", ")}`);
  if (!bomb) return sim;
  const at = bombSpot(sim)!;
  sim.dropBomb(at.x, at.y);
  for (let k = 0; k < 20; k++) {
    sim.update(0.1);
    if (holds(need)) return sim;
  }
  throw Error(`${sc.seed}: after the bomb the battle lacks ${need.filter((n) => !has[n](sim)).join(", ")}`);
}
const has: Record<string, (s: DefendSim) => boolean> = {
  boom: (s) => s.effects.some((e) => e.kind === "boom"), scorch: (s) => s.scorches.length > 0, shell: (s) => s.shells.length > 0,
  arrow: (s) => s.arrows.length > 0, rubble: (s) => s.map.buildings.some((b) => !s.intact(b)),
  rebuilt: (s) => s.built.some((b, id) => b > 0 && b < s.map.buildings[id].cells.length),
  boss: (s) => s.enemies.some((e) => ENEMIES[e.kind].boss), marked: (s) => s.enemies.some((e) => e.marked),
  bat: (s) => s.enemies.some((e) => ENEMIES[e.kind].flying), working: (s) => s.civilians.some((c) => c.state === "working"),
  archer: (s) => s.soldiers.some((u) => u.kind === "archer"), sword: (s) => s.soldiers.some((u) => u.kind === "sword"),
};
type Unit = { x: number; y: number };
const enemyWhere = (want: (d: (typeof ENEMIES)[keyof typeof ENEMIES]) => boolean) => (sim: DefendSim): Unit => sim.enemies.find((e) => want(ENEMIES[e.kind]))!;

type DefendScene = {
  map: ReturnType<typeof cityOf>; sim: DefendSim | null; overlay: unknown; zoom?: number; focus?: (sim: DefendSim) => Unit;
  opts: Record<string, unknown>; need?: string[];
};
const DEFEND_SCENES: Record<string, () => DefendScene> = {
  // Building mode: no battle, the tile grid, legal tiles, a hovered tile,
  // a structure ghost and an aimed bomb.
  defendEdit: () => {
    const layout = GARRISON.layout(), map = cityOf(GARRISON);
    const legal = new Set<string>();
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
    const need = ["boom", "scorch", "arrow", "boss", "marked", "rebuilt", "archer", "sword"];
    const sim = battle(FORTRESS, 400, true, need);
    const boss = enemyWhere((d) => !!d.boss)(sim), marked = sim.enemies.find((e) => e.marked)!;
    const focus = () => ({ x: (boss.x + marked.x) / 2, y: (boss.y + marked.y) / 2 });
    return { map: sim.map, sim, overlay: null, zoom: 1.5, focus, opts: { grid: false, weather: { rain: false }, night: 0.85, reduceMotion: false }, need };
  },
  // A stormy night, reduced motion, zoomed right in (3×) on a bat.
  defendStorm: () => {
    const sim = battle(FORTRESS, 456, false);
    return { map: sim.map, sim, overlay: null, zoom: 3, focus: enemyWhere((d) => !!d.flying), opts: { grid: false, weather: { rain: true }, night: 1, reduceMotion: true }, need: ["bat", "arrow"] };
  },
};

/** A Defend scene on `canvas`: frames until every light has baked, then a
 * later frame (the flag has waved, torches flickered, rain fallen). */
function playDefend(name: string, seed: number, canvas: HTMLCanvasElement, grab: Grab) {
  seeded(seed, () => {
    const scene = DEFEND_SCENES[name]();
    for (const need of scene.need ?? []) if (!has[need](scene.sim!)) throw Error(`${name}: no ${need} in the scene`);
    const r = new DefendRenderer(canvas);
    r.resize(504);
    if (scene.zoom) {
      // Zooming about a point keeps it fixed, so zoom twice: about the
      // canvas centre, then pan the focus there.
      const f = scene.focus!(scene.sim!), box = canvas.getBoundingClientRect();
      r.zoomAt(box.left + box.width / 2, box.top + box.height / 2, scene.zoom);
      r.panBy(box.width / 2 - ((f.x / 63) * box.width * scene.zoom + r.cam.x), box.height / 2 - ((f.y / 91) * box.height * scene.zoom + r.cam.y));
    }
    const draw = (now: number) => r.draw(scene.map, scene.sim, scene.overlay as never, { ...scene.opts, now } as never);
    for (let t = 1000; t <= 2000; t += 50) draw(t);
    grab("settled");
    for (let t = 2050; t <= 2600; t += 50) draw(t);
    grab("later");
  });
}

/** Every palette icon side by side on `sheet` (8 × 48 by 48 pixels). */
function playIcons(_name: string, _seed: number, sheet: HTMLCanvasElement, grab: Grab) {
  const items = ["cityTile", "bomb", "keep", "barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower"];
  sheet.width = items.length * 48;
  sheet.height = 48;
  const s = sheet.getContext("2d")!;
  items.forEach((item, i) => {
    const icon = document.createElement("canvas");
    icon.width = icon.height = 48;
    paintIcon(icon, item as never);
    s.drawImage(icon, i * 48, 0);
  });
  grab("sheet");
}

/** Which canvas a job draws on: the 408 px board, the Defend board (which
 * sizes itself), or a fresh sheet for the icons. */
export type CanvasKind = "board" | "defend" | "icons";
export type Job = { name: string; seed: number; canvas: CanvasKind; play: (canvas: HTMLCanvasElement, grab: Grab) => void };

/** Every scene, in order, each with its own seed. */
export const JOBS: Job[] = [
  ...Object.keys(BOARD_SCENES).map((name) => ({ name, canvas: "board" as const, run: playBoard })),
  ...Object.keys(DEFEND_SCENES).map((name) => ({ name, canvas: "defend" as const, run: playDefend })),
  { name: "defendIcons", canvas: "icons" as const, run: playIcons },
  ...Object.keys(LATER_BOARD_SCENES).map((name) => ({ name, canvas: "board" as const, run: playBoard })),
].map(({ name, canvas, run }, i) => ({ name, seed: i + 1, canvas, play: (cv: HTMLCanvasElement, grab: Grab) => run(name, i + 1, cv, grab) }));
