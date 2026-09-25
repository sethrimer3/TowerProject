/** DEFEND civilians rebuild rubble one cell at a time. A fixed pool of slots
 * (the Guild of builders level) sends a civilian out of the house nearest
 * the best job whenever a slot is free; each walks to its job, works it
 * until rebuilt (backing off when enemies come close), takes the next job,
 * and goes indoors when there's nothing left. A killed civilian's slot
 * refills after a delay. */
import { CIVILIAN, civilianCount, civilianHp, rebuildSeconds, type UpgradeId } from "./catalog.ts";
import { cellCenter, center, findPath, rectDist, type Point } from "./pathing.ts";
import type { Civilian, DefendSim } from "./sim.ts";

/** Paths for civilians give up beyond this many cells. */
const ERRAND = { maxCost: 400 };

export class Builders {
  /** Per slot: seconds until it can send out a civilian again (0 = ready). */
  readonly respawn: number[];

  constructor(levels: Record<UpgradeId, number>) {
    this.respawn = Array(civilianCount(levels.civilianCount)).fill(0);
  }

  step(sim: DefendSim, dt: number) {
    if (this.freeSlots(sim, dt) > 0) {
      const job = pickJob(sim, center(sim.keep.rect));
      if (job >= 0) spawnCivilian(sim, job);
    }
    for (const c of sim.civilians) if (c.hp > 0) stepCivilian(sim, c, dt);
    // Civilians who died free their slot after a delay.
    for (const c of sim.civilians) if (c.hp <= 0) this.startRespawn();
  }

  /** Counts slots down; how many are ready beyond the civilians already out. */
  private freeSlots(sim: DefendSim, dt: number) {
    let free = 0;
    for (let i = 0; i < this.respawn.length; i++) {
      if (this.respawn[i] > 0) this.respawn[i] -= dt;
      else free++;
    }
    return free - sim.civilians.length;
  }

  private startRespawn() {
    const slot = this.respawn.findIndex((t) => t <= 0);
    if (slot >= 0) this.respawn[slot] = CIVILIAN.respawnSeconds;
  }
}

function stepCivilian(sim: DefendSim, c: Civilian, dt: number) {
  c.thinkT -= dt;
  if (c.state === "toJob") goToJob(sim, c, dt);
  else if (c.state === "working") work(sim, c, dt);
  else goHome(sim, c, dt);
}

function goToJob(sim: DefendSim, c: Civilian, dt: number) {
  if (sim.solid[c.job] || !jobOpen(sim, c.job, c)) return assignNext(sim, c);
  const j = cellCenter(c.job);
  if (Math.hypot(j.x - c.x, j.y - c.y) < 0.35) {
    c.state = "working";
    c.work = 0;
    return;
  }
  if (!c.path.length && c.thinkT <= 0) {
    c.thinkT = 1;
    c.path = findPath(sim.solid, c, j, ERRAND) ?? [];
    // Unreachable: try another job next time (but still step toward this one now).
    if (!c.path.length && Math.hypot(j.x - c.x, j.y - c.y) > 1.5) assignNext(sim, c, c.job);
  }
  sim.followPath(c, j, CIVILIAN.speed, dt);
}

function work(sim: DefendSim, c: Civilian, dt: number) {
  if (sim.solid[c.job]) return assignNext(sim, c);
  // Too dangerous: come back to it later.
  if (sim.enemiesNear(c.x, c.y, 2.5).length) return assignNext(sim, c, c.job);
  c.work += dt;
  if (c.work < rebuildSeconds(sim.levels.rebuildSpeed)) return;
  sim.rebuildCell(c.job);
  assignNext(sim, c);
}

function goHome(sim: DefendSim, c: Civilian, dt: number) {
  const home = sim.map.buildings[c.home];
  const hx = center(home.rect);
  if (!c.path.length && c.thinkT <= 0) {
    c.thinkT = 1;
    const door = sim.doorOf(home);
    if (door >= 0) c.path = findPath(sim.solid, c, cellCenter(door), ERRAND) ?? [];
  }
  sim.followPath(c, hx, CIVILIAN.speed, dt);
}

/** Home and standing beside an intact house: it goes indoors. */
export function atHome(sim: DefendSim, c: Civilian): boolean {
  if (c.state !== "home") return false;
  const b = sim.map.buildings[c.home];
  return sim.intact(b) && rectDist(b.rect, c.x, c.y) < 0.7;
}

/** No other civilian out and about has already taken this cell. */
function jobOpen(sim: DefendSim, cell: number, self?: Civilian): boolean {
  return !sim.civilians.some((o) => o !== self && o.hp > 0 && o.state !== "home" && o.job === cell);
}

/** Rubble most worth rebuilding: structures, then walls, then houses —
 * nearest first, skipping anything with enemies close by. */
export function pickJob(sim: DefendSim, from: Point, skip = -1): number {
  let best = -1,
    bestScore = Infinity;
  for (const { cell, tier } of openJobs(sim, skip)) {
    const p = cellCenter(cell);
    const score = tier * 1000 + Math.hypot(p.x - from.x, p.y - from.y);
    if (score < bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best;
}

/** Every rubble cell a civilian could take, with its building's tier. */
function* openJobs(sim: DefendSim, skip: number) {
  for (const b of sim.map.buildings) {
    if (sim.intact(b) || b.kind === "keep") continue;
    const tier = b.kind === "house" ? 2 : b.kind === "wall" ? 1 : 0;
    for (const cell of b.cells) if (jobAvailable(sim, cell, skip)) yield { cell, tier };
  }
}

/** Rubble nobody else has taken, with no enemy within 3 cells. */
function jobAvailable(sim: DefendSim, cell: number, skip: number) {
  if (cell === skip || sim.solid[cell]) return false;
  if (!jobOpen(sim, cell)) return false;
  const p = cellCenter(cell);
  return !sim.enemiesNear(p.x, p.y, 3).length;
}

/** The next job, or home to the nearest house when there is none. */
function assignNext(sim: DefendSim, c: Civilian, skip = -1) {
  c.path = [];
  c.thinkT = 0;
  const job = pickJob(sim, c, skip);
  if (job >= 0) {
    c.job = job;
    c.state = "toJob";
  } else {
    c.job = -1;
    c.state = "home";
    c.home = nearestHouse(sim, c);
  }
}

/** The intact house nearest `p`, or the keep if none stands. */
function nearestHouse(sim: DefendSim, p: Point): number {
  let best = sim.keepId,
    bd = Infinity;
  for (const b of sim.map.buildings) {
    if (b.kind !== "house" || !sim.intact(b)) continue;
    const d = rectDist(b.rect, p.x, p.y);
    if (d < bd) {
      bd = d;
      best = b.id;
    }
  }
  return best;
}

/** A civilian comes out of the house nearest the job. */
function spawnCivilian(sim: DefendSim, job: number) {
  const house = sim.map.buildings[nearestHouse(sim, cellCenter(job))];
  const door = sim.doorOf(house);
  if (door < 0) return;
  const hp = civilianHp(sim.levels.civilianHealth);
  const at = cellCenter(door);
  sim.civilians.push({
    id: sim.newId(),
    x: at.x,
    y: at.y,
    hp,
    maxHp: hp,
    job,
    state: "toJob",
    work: 0,
    path: [],
    home: house.id,
    thinkT: 0,
    flash: 0,
  });
}
