/** DEFEND troops: barracks keep their garrison topped up; swordsmen chase
 * enemies within their leash of the barracks (anywhere in the city at the
 * last Patrol routes level) and head home when there's nothing to fight;
 * archers roam the streets, shooting whatever comes within sight, or with
 * Hunter's instinct path toward the nearest enemy in the city. */
import {
  ARCHER_UNIT,
  archerUnitRange,
  ENEMIES,
  SOLDIER,
  soldierCap,
  soldierLeash,
  soldierScale,
  trainSeconds,
} from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { CELL_COUNT, cellX, cellY } from "./grid.ts";
import { cellAt, cellCenter, center, findPath, nearest, type PathLimits, type Point } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";

/** Trains one troop at a time per barracks, while it's standing and below
 * its garrison cap. */
export class Barracks {
  /** Seconds until each barracks' next recruit is ready. */
  readonly training = new Map<number, number>();

  step(sim: DefendSim, dt: number) {
    const cap = soldierCap(sim.levels.barracksCapacity);
    for (const b of sim.map.buildings) {
      if (!isBarracks(b) || !sim.intact(b)) continue;
      if (this.drilled(sim, b, cap, dt)) this.recruit(sim, b);
    }
  }

  /** Counts down the barracks' drill; true when a recruit is ready. A full
   * garrison keeps the clock at a whole drill. */
  private drilled(sim: DefendSim, b: Building, cap: number, dt: number) {
    const drill = () => trainSeconds(sim.levels.barracksTraining);
    const alive = sim.soldiers.filter((s) => s.home === b.id).length;
    if (alive >= cap) {
      this.training.set(b.id, drill());
      return false;
    }
    const t = (this.training.get(b.id) ?? 0) - dt;
    if (t > 0) {
      this.training.set(b.id, t);
      return false;
    }
    this.training.set(b.id, drill());
    return true;
  }

  private recruit(sim: DefendSim, b: Building) {
    const door = sim.doorOf(b);
    if (door < 0) return;
    const archer = b.kind === "archerBarracks";
    const scale = soldierScale(sim.levels.soldierArms);
    const stats = archer ? ARCHER_UNIT : SOLDIER;
    const at = cellCenter(door);
    sim.soldiers.push({
      id: sim.newId(),
      kind: archer ? "archer" : "sword",
      home: b.id,
      x: at.x,
      y: at.y,
      hp: stats.hp * scale,
      maxHp: stats.hp * scale,
      damage: stats.damage * scale,
      cd: 0,
      target: -1,
      path: [],
      thinkT: 0,
      flash: 0,
    });
  }
}

const isBarracks = (b: Building) => b.kind === "barracks" || b.kind === "archerBarracks";

const byDistanceFrom = (p: Point) => (a: Enemy, b: Enemy) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
const inCity = (sim: DefendSim, e: Enemy) => sim.map.city[cellAt(e.x, e.y)] === 1;
/** Search limits for chasing across the whole city. */
const CITYWIDE: PathLimits = { maxCost: 1e9, maxNodes: CELL_COUNT };

// ── Swordsmen ──────────────────────────────────────────────────────────────

/** Where a swordsman may fight: within its leash of the barracks, or
 * anywhere in the city once patrols go citywide. */
class Patrol {
  readonly home: Building;
  readonly hc: Point;
  readonly leash: number;
  readonly citywide: boolean;

  constructor(
    private sim: DefendSim,
    s: Soldier,
  ) {
    this.home = sim.map.buildings[s.home];
    this.hc = center(this.home.rect);
    this.leash = soldierLeash(sim.levels.soldierReach ?? 0);
    this.citywide = !Number.isFinite(this.leash);
  }

  covers(e: Enemy) {
    const { hc, leash } = this;
    return this.citywide ? inCity(this.sim, e) : (e.x - hc.x) ** 2 + (e.y - hc.y) ** 2 <= leash ** 2;
  }

  /** Enemies it may go after, nearest `s` first. */
  candidates(s: Soldier) {
    const all = this.citywide ? this.sim.enemies.filter((e) => this.covers(e)) : this.sim.enemiesNear(this.hc.x, this.hc.y, this.leash);
    return all.sort(byDistanceFrom(s)).slice(0, 3);
  }

  get limits(): PathLimits {
    return this.citywide ? CITYWIDE : { maxCost: this.leash * 3 };
  }
}

export function stepSwordsman(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const patrol = new Patrol(sim, s);
  let target = sim.enemies.find((e) => e.id === s.target && e.hp > 0) ?? null;
  if (target && !patrol.covers(target)) target = null;
  if (target && inSwordReach(s, target)) return strike(sim, s, target);
  if (s.thinkT <= 0) target = replan(sim, s, patrol);
  sim.followPath(s, target, SOLDIER.speed, dt);
}

const inSwordReach = (s: Soldier, e: Enemy) => Math.hypot(e.x - s.x, e.y - s.y) <= SOLDIER.reach + ENEMIES[e.kind].size / 2;

function strike(sim: DefendSim, s: Soldier, e: Enemy) {
  if (s.cd > 0) return;
  s.cd = SOLDIER.cooldown;
  sim.hurtEnemy(e, s.damage);
}

/** Twice a second: path to the nearest of up to three reachable enemies, or
 * back to the barracks door when there are none. */
function replan(sim: DefendSim, s: Soldier, patrol: Patrol): Enemy | null {
  s.thinkT = 0.5;
  s.path = [];
  const target = pathToFirst(sim, s, patrol.candidates(s), patrol.limits);
  s.target = target ? target.id : -1;
  if (!target) returnToDoor(sim, s, patrol.home);
  return target;
}

/** Sets `s.path` to the first enemy that has a route, and returns it. */
function pathToFirst(sim: DefendSim, s: Soldier, enemies: Enemy[], limits: PathLimits): Enemy | null {
  for (const e of enemies) {
    const path = findPath(sim.solid, s, e, limits);
    if (!path) continue;
    s.path = path;
    return e;
  }
  return null;
}

function returnToDoor(sim: DefendSim, s: Soldier, home: Building) {
  const door = sim.doorOf(home);
  if (door < 0) return;
  // (Subtracting the half cell separately keeps the original rounding.)
  const away = Math.hypot(s.x - cellX(door) - 0.5, s.y - cellY(door) - 0.5);
  if (away > 1.2) s.path = findPath(sim.solid, s, cellCenter(door), { maxCost: 400 }) ?? [];
}

// ── Archers ────────────────────────────────────────────────────────────────

/** Archers shoot the nearest enemy in sight first; otherwise they hunt
 * (with Hunter's instinct) or stroll to a random street. */
export function stepArcher(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const range = archerUnitRange(sim.levels.archerSight ?? 0);
  const near = nearest(sim.enemiesNear(s.x, s.y, range), s, range * range, true);
  if (near) return shoot(sim, s, near);
  if ((sim.levels.archerHunt ?? 0) > 0 && s.thinkT <= 0) hunt(sim, s);
  if (idle(s) && sim.streets.length) stroll(sim, s);
  sim.followPath(s, null, ARCHER_UNIT.speed, dt);
}

/** No route to walk and done thinking. */
const idle = (s: Soldier) => !s.path.length && s.thinkT <= 0;

function shoot(sim: DefendSim, s: Soldier, e: Enemy) {
  if (s.cd > 0) return;
  s.cd = ARCHER_UNIT.cooldown;
  sim.arrows.push({ x: s.x, y: s.y, target: e.id, damage: s.damage, tx: e.x, ty: e.y, life: 2 });
}

/** Path toward the nearest of up to three enemies in the city. */
function hunt(sim: DefendSim, s: Soldier) {
  s.thinkT = 0.6;
  const prey = sim.enemies.filter((e) => e.hp > 0 && inCity(sim, e)).sort(byDistanceFrom(s)).slice(0, 3);
  const e = pathToFirst(sim, s, prey, CITYWIDE);
  if (e) s.target = e.id;
}

/** Nothing to hunt (or no instinct): pick a street and stroll to it. */
function stroll(sim: DefendSim, s: Soldier) {
  s.thinkT = 0.5 + sim.rand() * 1.5;
  s.target = -1;
  const goal = sim.streets[Math.floor(sim.rand() * sim.streets.length)];
  s.path = findPath(sim.solid, s, cellCenter(goal), CITYWIDE) ?? [];
}
