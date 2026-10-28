import { TrialRenderer } from "../src/proving-grounds/render.ts";
import { startTrial, trialStep } from "../src/proving-grounds/trial.ts";
import {advanceKeymasterEffects} from "../src/proving-grounds/keymaster.ts";
// The fixed scenes behind both render goldens: tests/render-golden.mjs draws
// them in a browser and hashes pixels, and tests/render-calls.test.ts draws
// them in Node on a recording canvas and hashes the calls. Each scene is
// drawn at fixed timestamps with seeded randomness; `grab` is called at each
// captured frame, and the caller decides what to record there.
import { Renderer } from "../src/render/rendering.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { decorSourceFor, tileDecor, type TileDecor } from "../src/render/decor/decor.ts";
import type { DecorLayer } from "../src/render/decor/decor-render.ts";
import type { Tile } from "../src/entities.ts";
import { withStream, stream } from "../src/random.ts";

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
  const streams = () => withStream("game", rng, () => withStream("effects", rng, body));
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
  { kind: "stairs" }, { kind: "oneway" },
  { kind: "floor", flyer: { name: "Bat", hp: 20, attack: 5, defense: 1, tier: 5, strength: "strong", flying: true } },
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
  // A Flying enemy over the hero, drawn half see-through.
  if (g.world.tile(p.x, p.y).kind === "floor") g.run.changes[`${p.x},${p.y}`] = { kind: "floor", flyer: { name: "Bat", hp: 20, attack: 5, defense: 1, tier: 5, strength: "normal", flying: true } };
}
function game(mode: "tower" | "delve", settings: Record<string, unknown> = {}) {
  // Reserve the historical fixture RNG offset so board seeds remain stable.
  stream("game")();
  const save = defaults();
  save.upgrades.breakthrough = 1;
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

/** A readable combat-art arena, shared by the golden and browser review. */
export function combatSpriteScene(settings: Record<string, unknown> = {}): BoardScene {
  const g = game("tower", { brightness: 85, decorOff: true, ...settings });
  const p = g.run.player;
  p.x = 8; p.y = 3;
  for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) g.run.changes[`${x},${y}`] = { kind: "floor" };
  const foes: Tile[] = [
    { kind: "enemy", enemy: { name: "Goblin", tier: 0, strength: "weak", hp: 80, attack: 10, defense: 1, fast: true } },
    { kind: "enemy", enemy: { name: "Skeleton", tier: 1, strength: "strong", hp: 80, attack: 10, defense: 1, ranged: true, fast: true } },
    { kind: "enemy", enemy: { name: "Golem", tier: 3, strength: "elite", hp: 80, attack: 10, defense: 1, shielded: true } },
    { kind: "floor", flyer: { name: "Bat", tier: 2, strength: "strong", hp: 80, attack: 10, defense: 1, flying: true } },
  ];
  foes.forEach((t, i) => { g.run.changes[`${5 + i * 2},10`] = t; });
  (g.world as unknown as { shield: { x: number; y: number; floor: number } }).shield = { x: 9, y: 10, floor: 4000 };
  g.run.changes["5,6"] = { kind: "treasure", chest: "supply" };
  g.run.changes["7,6"] = { kind: "treasure", chest: "equipment" };
  g.run.changes["9,6"] = { kind: "floor", chest: "supply" };
  g.run.changes["11,6"] = { kind: "floor", chest: "equipment" };
  g.run.targeted = "8,8";
  g.run.ignored = { floor: g.handRules.floor, tiles: ["5,8"] };
  g.run.skipped = { floor: g.handRules.floor, tiles: ["11,10"] };
  g.volley = { at: 1400, ms: 800, shots: [
    { by: "hero", from: { x: 8, y: 3 }, to: { x: 5, y: 10 }, damage: 0, tick: 1 },
    { by: "hero", from: { x: 8, y: 3 }, to: { x: 11, y: 10 }, damage: 0, tick: 1, charge: 60 },
    { by: "enemy", from: { x: 7, y: 10 }, to: { x: 8, y: 3 }, damage: 0, tick: 1 },
    { by: "hero", from: { x: 8, y: 3 }, to: { x: 9, y: 10 }, damage: 0, tick: 40 },
  ] };
  return { g, to: { x: 8, y: 4 } };
}

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

/** A real overgrown, wet room: reusable environment review and animated golden. */
export function environmentSpriteScene(settings: Record<string, unknown> = {}): BoardScene {
  const g = game("tower", { brightness: 50, ...settings });
  g.newRun({ seed: 7 });
  for (let room = 0; room < 25; room++) g.advanceTowerRoom();
  const src = decorSourceFor(g.world, g.run.seed)!, candidates: { x: number; y: number; water: number }[] = [];
  for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) {
    const d = tileDecor(src, x, y);
    if (g.world.tile(x, y).kind === "floor" && d.water?.[20 * 24 + 12] === 1 && d.waterCount > 150)
      candidates.push({ x, y, water: d.waterCount });
  }
  candidates.sort((a, b) => b.water - a.water || a.y - b.y || a.x - b.x);
  for (const to of candidates) {
    const from = [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dx, dy]) => ({ x: to.x + dx, y: to.y + dy }))
      .find(p => g.world.tile(p.x, p.y).kind === "floor" && !tileDecor(src, p.x, p.y).crates.length);
    if (!from) continue;
    Object.assign(g.run.player, from);
    return { g, to: { x: to.x, y: to.y }, check: decor => decor.ripples.length > 0 };
  }
  throw Error("the environment scene has no walkable pool");
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

/** Later board scenes retain their historical fixture seeds. */
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
  /** The Delve's forest once Equipment and the Tournament are open: the
   * Blacksmith left of the path, the Tournament Hall right of it. */
  forestHall: () => {
    const g = game("delve", { brightness: 70 });
    g.save.goals.claimed = { 1: [60, 70] };
    g.save.equipment.unlocked = true;
    g.newRun({ outside: true });
    const world = g.world as { blacksmith?: boolean; hall?: boolean };
    if (!world.blacksmith || !world.hall) throw Error("the forest has no Blacksmith or Hall");
    return { g };
  },
  /** A Shielded enemy's green bubble, three tiles round it, over another
   * enemy it guards, the hero outside it. */
  towerShield: () => {
    const g = game("tower", { brightness: 70 });
    const p = g.run.player, open = (x: number, y: number) => g.world.tile(x, y).kind === "floor";
    let at: Point | null = null;
    for (let dy = 3; dy <= 8 && !at; dy++) for (let dx = -2; dx <= 2 && !at; dx++) if (open(p.x + dx, p.y + dy) && open(p.x + dx + 1, p.y + dy)) at = { x: p.x + dx, y: p.y + dy };
    if (!at) throw Error("no room for the shield");
    g.run.changes[`${at.x},${at.y}`] = { kind: "enemy", enemy: { name: "Slime", hp: 40, attack: 9, defense: 1, tier: 0, strength: "strong", shielded: true } };
    g.run.changes[`${at.x + 1},${at.y}`] = { kind: "enemy", enemy: { name: "Slime", hp: 40, attack: 9, defense: 1, tier: 0, strength: "normal" } };
    (g.world as unknown as { shield: { x: number; y: number; floor: number } }).shield = { ...at, floor: 4000 };
    return { g };
  },
  /** A Supply Chest (a blue glow, one star), an Equipment Chest (a purple
   * glow, two stars) and the floor an opened Equipment Chest left, still
   * marked, in a row above the hero. */
  towerChests: () => {
    const g = game("tower", { brightness: 70 });
    const p = g.run.player, open = (x: number, y: number) => g.world.tile(x, y).kind === "floor";
    let at: Point | null = null;
    for (let dy = 2; dy <= 8 && !at; dy++) for (let dx = -3; dx <= 1 && !at; dx++) if ([0, 1, 2].every((i) => open(p.x + dx + i, p.y + dy))) at = { x: p.x + dx, y: p.y + dy };
    if (!at) throw Error("no room for the chests");
    g.run.changes[`${at.x},${at.y}`] = { kind: "treasure", chest: "supply" };
    g.run.changes[`${at.x + 1},${at.y}`] = { kind: "treasure", chest: "equipment" };
    g.run.changes[`${at.x + 2},${at.y}`] = { kind: "floor", chest: "equipment" };
    return { g };
  },
};

// Appended to keep all existing scene seeds unchanged.
LATER_BOARD_SCENES.spriteCombat = () => combatSpriteScene();
LATER_BOARD_SCENES.spriteEnvironment = () => environmentSpriteScene();
LATER_BOARD_SCENES.spriteForestTower = () => forestSpriteScene("tower");
LATER_BOARD_SCENES.spriteForestDelve = () => forestSpriteScene("delve");
LATER_BOARD_SCENES.spriteDungeonMasonry = () => dungeonSpriteScene("tower");
LATER_BOARD_SCENES.spriteDungeonCave = () => dungeonSpriteScene("delve");
LATER_BOARD_SCENES.spriteOptions = () => dungeonSpriteScene("tower", { squareDoors: true, spriteAnimations: true, reduceMotion: false });
LATER_BOARD_SCENES.spriteTowerTwo = () => towerTierSpriteScene(2);
LATER_BOARD_SCENES.spriteTowerThree = () => towerTierSpriteScene(3);
LATER_BOARD_SCENES.spriteAmbient = () => {
  const { g } = dungeonSpriteScene("tower", { spriteAnimations: true, reduceMotion: false });
  plantAll(g);
  g.fights.struckDown = [1400];
  return { g };
};

/** One fixed material identity for each later Tower, on real tier geometry. */
export function towerTierSpriteScene(tier: 2 | 3): BoardScene {
  const save = defaults();
  Object.assign(save.settings, { brightness: 75, reduceMotion: true });
  save.tower.tiersOpen = 3; save.tower.tier = tier;
  const g = new Game(save); g.newRun({ seed: 1103 });
  for (let i = 0; i < 3; i++) g.advanceTowerRoom();
  return { g };
}

/** Real connected interior geometry, with native wall faces and material patches. */
export function dungeonSpriteScene(mode: "tower" | "delve", settings: Record<string, unknown> = {}): BoardScene {
  const g = game(mode, { brightness: 75, reduceMotion: true, ...settings });
  g.newRun({ seed: mode === "tower" ? 1103 : 1107 });
  if (mode === "tower") for (let i = 0; i < 3; i++) g.advanceTowerRoom();
  return { g };
}

/** Both enormous entrance bases and the layered forest at the crossroads. */
export function forestSpriteScene(mode: "tower" | "delve", settings: Record<string, unknown> = {}): BoardScene {
  const g = game(mode, { reduceMotion: true, weatherSound: false, ...settings });
  g.save.goals.claimed = { 1: [60, 70] };
  g.save.equipment.unlocked = true;
  g.newRun({ outside: true, seed: mode === "tower" ? 503 : 507 });
  return { g };
}

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
        { ...at, text: "−1 gold key", art: { tile: { kind: "key", color: "yellow" }, spent: true } },
        { ...at, text: "Full HP ✓", art: { heart: true } },
      );
    } else if (scene.fight) {
      g.fights.playsFights = true;
      g.save.settings.fightAnimation = true;
      g.move(to.x - from.x, to.y - from.y);
      g.fights.encounter!.start = 1400;
      // The skull over a hero struck down, as a revival's strike raises it,
      // and the heart with a plus of Max HP's badge.
      g.fights.struckDown = [1400];
      g.gains.push({ ...from, text: "+16 max HP", art: { heart: true, raised: true } });
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
      if (g.fights.encounter && t >= g.fights.encounter.start + g.fights.encounter.bout.duration) g.fights.finish();
      r.draw(t);
      // Ripples spread past the hero's feet.
      if (t === 2100) grab("ripples");
      // Splinters in flight, a fresh splash, grass still swaying.
      if (t !== 1740) continue;
      grab("after");
      // Guards the scene itself: the effect it exists for must be live.
      if (scene.check && !scene.check(r.decor)) throw Error(`${name}: its decor effect never started`);
    }
    if (scene.fight && (g.fights.encounter || g.run.player.x !== to.x || g.run.player.y !== to.y)) throw Error(`${name}: the fight never settled`);
    grab("later");
  });
}

/** The trial's staging room, elemental, crossing beams and burned wall face. */
function playProvingGrounds(_name: string, _seed: number, canvas: HTMLCanvasElement, grab: Grab) {
  const state = startTrial(game("tower").run.player), renderer = new TrialRenderer(canvas);
  renderer.draw(state, 1000, 0, true, false); grab("staging");
  for (let i=0; i<4; i++) trialStep(state,0,1);
  for (let i=0; i<20; i++) trialStep(state,0,0);
  state.player.x=12; state.player.y=11;
  renderer.draw(state, 1100, 1000, true, false); grab("beam");
  renderer.draw(state, 5000, 1000, true, false); grab("glow");
  trialStep(state,0,0);
  renderer.draw(state,6000,1000,false);
  renderer.draw(state,6130,1000,false); grab("slimeHop");
  state.player.y=22;
  renderer.draw(state, 5000, 1000, true, false); grab("wallScars");
  state.player.x=12;state.player.y=11;
  renderer.draw(state,7000,0,false);
  trialStep(state,0,1);
  // Frame both ends of this deterministic flight, including the reformed ghost.
  state.player.x=Math.round((12+state.elemental.x)/2);
  state.player.y=Math.round((12+state.elemental.y)/2);
  renderer.draw(state,7100,0,false); grab("dissolve");
  renderer.draw(state,7550,0,false); grab("lightTrails");
  renderer.draw(state,8080,0,false); grab("reform");
  renderer.draw(state,8500,0,false); grab("ghost");
  renderer.draw(state,8500,0,true); grab("ghostReducedMotion");
  while(state.steps%10!==0) trialStep(state,0,0);
  renderer.draw(state,9000,8900,true); grab("corporealLasers");
  const high=startTrial(state.player,"manual",[],7391,70);
  for(let i=0;i<4;i++)trialStep(high,0,1);
  high.player.y=11;
  for(let i=0;i<8;i++)trialStep(high,0,0);
  renderer.draw(high,10000,0,true);grab("eightBeamWarning");
  trialStep(high,0,0);trialStep(high,0,0);
  renderer.draw(high,11000,10900,true);grab("eightBeams");
  const edge=startTrial(state.player,"manual",[],7391,30);
  for(let i=0;i<4;i++)trialStep(edge,0,1);
  edge.player.x=12;edge.player.y=4;edge.elemental.x=12;edge.elemental.y=7;edge.steps=9;
  renderer.draw(edge,12000,0,true);grab("edgeProps");
  trialStep(edge,0,0);
  renderer.draw(edge,13000,12900,true);grab("edgeBeamDamage");
  edge.elemental.x=11;edge.steps=49;
  trialStep(edge,0,0);
  renderer.draw(edge,14000,13900,true);grab("edgeCrateDamage");
  edge.steps=90;
  renderer.draw(edge,16000,0,true);grab("extinguishedTorches");
  // The trial uses the same default pixel-art kit as the normal board.
  const kit=startTrial(state.player,"manual",[],7391,30),options={styledSprites:true};
  renderer.draw(kit,17000,0,true,options);grab("spritesStaging");
  for(let i=0;i<4;i++)trialStep(kit,0,1);
  kit.player.y=4;kit.elemental.x=12;kit.elemental.y=7;kit.steps=9;
  renderer.draw(kit,18000,0,true,options);grab("spritesEdge");
  trialStep(kit,0,0);
  renderer.draw(kit,19000,18900,true,options);grab("spritesBeamDamage");
  kit.steps=50;
  renderer.draw(kit,20000,0,true,options);grab("spritesTorchOut");
  renderer.draw(kit,21000,0,true,{...options,destination:{x:13,y:4}});grab("manualDestination");
}

/** Each job draws the 408-pixel board. */
export type Job = { name: string; seed: number; canvas: "board"; play: (canvas: HTMLCanvasElement, grab: Grab) => void };

function playKeymaster(_name:string,_seed:number,canvas:HTMLCanvasElement,grab:Grab) {
  const s=startTrial({maxHp:1000,attack:10,defense:0},"manual",[],12,1,"keymaster");
  const renderer=new TrialRenderer(canvas),options={styledSprites:true};
  renderer.draw(s,1000,0,true,options);grab("staging");
  for(let i=0;i<4;i++)trialStep(s,0,1);
  s.player.x=12;s.player.y=11;
  renderer.draw(s,2000,0,true,options);grab("bossAndMimics");
  trialStep(s,0,1);renderer.draw(s,3000,0,true,options);grab("scatteredKeys");
  s.player.y=23;s.keymaster!.keys=4;
  renderer.draw(s,4000,0,true,options);grab("northDoor");
  trialStep(s,0,1);advanceKeymasterEffects(s,220);s.player.y=17;
  renderer.draw(s,5000,0,false,options);grab("doorFlood");
  advanceKeymasterEffects(s,380);s.player.y=14;
  renderer.draw(s,5400,0,false,options);grab("redTrails");
  renderer.draw(s,5400,0,true,options);grab("reducedMotion");
  advanceKeymasterEffects(s,500);
  renderer.draw(s,5800,0,true,options);grab("spiritsWaiting");
  s.steps=9;s.keymaster!.mimics=[];trialStep(s,0,0);advanceKeymasterEffects(s,1);
  renderer.draw(s,6000,0,true,options);grab("impact");
  const ghost=startTrial({maxHp:1000,attack:10,defense:0},"manual",[],12,1,"keymaster");
  for(let i=0;i<4;i++)trialStep(ghost,0,1);
  ghost.player.x=12;ghost.player.y=11;renderer.draw(ghost,7000,0,false,options);
  trialStep(ghost,0,1);renderer.draw(ghost,7100,0,false,options);grab("dissolve");
  renderer.draw(ghost,7600,0,false,options);grab("lightTrails");
  ghost.player.x=ghost.elemental.x;ghost.player.y=ghost.elemental.y-2;
  renderer.draw(ghost,8300,0,false,options);grab("ghost");
  renderer.draw(ghost,8300,0,true,options);grab("ghostReducedMotion");
  trialStep(ghost,0,0);renderer.draw(ghost,8400,0,true,options);grab("pursuit");
  while(ghost.steps<10){ghost.keymaster!.mimics=[];trialStep(ghost,0,0);}
  renderer.draw(ghost,9500,0,true,options);grab("reformed");
}

function playTrialCamera(_name:string,_seed:number,canvas:HTMLCanvasElement,grab:Grab) {
  const s=startTrial({maxHp:1000,attack:10,defense:0}),renderer=new TrialRenderer(canvas);
  renderer.draw(s,1000,0,false);grab("smallRoom");
  s.room="arena";s.player.x=10;s.player.y=8;
  const ahead=Array.from({length:6},()=>({dx:0,dy:1}));
  renderer.draw(s,2000,0,false,{pathAhead:ahead});grab("arenaStart");
  trialStep(s,0,1);renderer.draw(s,2016,0,false,{pathAhead:ahead.slice(1)});grab("heroGlide");
  for(let i=1;i<=60;i++) {
    if(i%15===0 && s.player.y<14)trialStep(s,0,1);
    renderer.draw(s,2016+i*1000/60,0,false,{pathAhead:ahead.slice(s.steps)});
  }
  grab("cameraGlide");
  for(let i=1;i<=180;i++)renderer.draw(s,3016+i*1000/60,0,false);
  grab("settled");
  trialStep(s,1,0);renderer.draw(s,6033,0,false,{transition:"fast"});grab("fast");
  renderer.draw(s,6050,0,false,{transition:"instant"});grab("instant");
  renderer.draw(s,6066,0,true);grab("reducedMotion");
}

/** Empty, walking and settled frames for both sides of a forest crossing. */
function playForestTravel(_name: string, seed: number, canvas: HTMLCanvasElement, grab: Grab) {
  seeded(seed, () => {
    const g = new Game(defaults());
    g.save.tower.tiersOpen = 3;
    g.save.equipment.unlocked = true;
    g.save.settings.reduceMotion = false;
    g.save.settings.transition = "smooth";
    g.save.settings.weatherSound = false;
    g.newRun({ outside: true, seed: 7 });
    const r = new Renderer(canvas, g);
    g.travelForest(1); g.forestArrivalFrame(1000);
    r.draw(1000); grab("emptyLeft");
    r.draw(1099); grab("pauseLeft");
    r.draw(1250); grab("walkLeft");
    g.forestArrivalFrame(1400); r.draw(1450); grab("arrivedLeft");
    g.travelForest(-1); g.forestArrivalFrame(2000);
    r.draw(2000); grab("emptyRight");
    r.draw(2250); grab("walkRight");
    g.forestArrivalFrame(2400); r.draw(2450); grab("arrivedRight");
    g.save.settings.reduceMotion = true;
    g.travelForest(1); g.forestArrivalFrame(3000);
    r.draw(3099); grab("pauseReduced");
    g.forestArrivalFrame(3100); r.draw(3100); grab("arrivedReduced");
  });
}

/** Every scene retains its seed, including gaps left by retired scenes. */
export const JOBS: Job[] = [
  ...Object.keys(BOARD_SCENES).map((name) => ({ name, canvas: "board" as const, run: playBoard })),
  ...Object.keys(LATER_BOARD_SCENES).map((name) => ({ name, canvas: "board" as const, run: playBoard })),
  { name: "provingGrounds", canvas: "board" as const, run: playProvingGrounds },
  { name: "keymaster", canvas: "board" as const, run: playKeymaster },
  { name: "trialCamera", canvas: "board" as const, run: playTrialCamera },
  { name: "forestTravel", canvas: "board" as const, run: playForestTravel },
].map(({ name, canvas, run }, i) => {
  // Keep the fourth seed reserved for the retired sprite-opt-out scene.
  const seed = i + 1 + (i >= 3 ? 1 : 0) + (i >= Object.keys(BOARD_SCENES).length ? 5 : 0);
  return { name, seed, canvas, play: (cv: HTMLCanvasElement, grab: Grab) => run(name, seed, cv, grab) };
});
