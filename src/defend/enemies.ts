/** How a DEFEND enemy spends one step. In order: fight any defender in
 * reach; bats fly straight at the keep; a house that caught its eye is
 * wrecked; otherwise it walks the flow field downhill toward the keep,
 * smashing any building that lies across the cheapest way, and now and then
 * a house beside the street lures it off the road. */
import { ENEMIES, type EnemyDef } from "./catalog.ts";
import { sideCells } from "./citygen.ts";
import { CELLS_H, CELLS_W } from "./grid.ts";
import { cellCenter, center, clampCell, downhill, nearestPoint, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** One enemy's step: the sim, the enemy, its kind and how close it must be
 * to strike. */
type Turn = { sim: DefendSim; e: Enemy; def: EnemyDef; reach: number; dt: number };

export function stepEnemy(sim: DefendSim, e: Enemy, dt: number) {
  const def = ENEMIES[e.kind];
  e.cd -= dt;
  const t: Turn = { sim, e, def, reach: def.size / 2 + 0.4, dt };
  if (fightDefender(t)) return;
  if (def.flying) return flyAtKeep(t);
  if (e.distract >= 0 && chaseDistraction(t)) return;
  march(t);
}

function fightDefender({ sim, e, def, reach }: Turn) {
  const foe = sim.nearestDefender(e.x, e.y, reach + 0.2);
  if (!foe) return false;
  if (e.cd <= 0) {
    e.cd = def.cooldown;
    foe.hp -= def.damage;
    foe.flash = 0.12;
  }
  return true;
}

function flyAtKeep(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  if (rectDist(sim.keep.rect, e.x, e.y) <= reach) return hitBuilding(t, sim.keepId);
  sim.moveToward(e, center(sim.keep.rect), { speed: def.speed, dt, flying: true });
}

/** Wreck the house that caught its eye. False once the house is gone or the
 * enemy lost interest, so it goes back to marching this same step. */
function chaseDistraction(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const b = sim.map.buildings[e.distract];
  e.distractT -= dt;
  if (e.distractT <= 0 || isRubble(sim, b.id)) {
    e.distract = -1;
    return false;
  }
  if (rectDist(b.rect, e.x, e.y) <= reach) hitBuilding(t, b.id);
  else if (!sim.moveToward(e, nearestPoint(b.rect, e.x, e.y), { speed: def.speed, dt })) e.distract = -1;
  return true;
}

/** Downhill on the flow field toward the keep. */
function march(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const cx = clampCell(e.x, CELLS_W),
    cy = clampCell(e.y, CELLS_H);
  if (rectDist(sim.keep.rect, e.x, e.y) <= reach) return hitBuilding(t, sim.keepId);
  const best = downhill(sim.field, sim.solid, cx, cy);
  if (best < 0) return;
  const c = cellCenter(best);
  if (sim.solid[best]) return smashThrough(t, best, c);
  rollForDistraction(t, cx, cy);
  sim.moveToward(e, { x: c.x + e.jx, y: c.y + e.jy }, { speed: def.speed, dt });
}

/** The cheapest way on goes through a building: walk up and smash it. */
function smashThrough(t: Turn, cell: number, c: { x: number; y: number }) {
  const { sim, e, def, reach, dt } = t;
  const bid = sim.map.owner[cell];
  if (rectDist(sim.map.buildings[bid].rect, e.x, e.y) <= reach) return hitBuilding(t, bid);
  sim.moveToward(e, c, { speed: def.speed, dt });
}

/** Streets are lined with temptations: twice a second, a chance that a
 * house beside the enemy's cell lures it for a while. */
function rollForDistraction({ sim, e, def, dt }: Turn, cx: number, cy: number) {
  e.rollT -= dt;
  if (e.rollT > 0) return;
  e.rollT = 0.5;
  if (def.distraction <= 0 || sim.rand() >= def.distraction * 0.3) return;
  const house = sideCells({ x: cx, y: cy, w: 1, h: 1 }).find((n) => sim.solid[n] && isHouse(sim, sim.map.owner[n]));
  if (house === undefined) return;
  e.distract = sim.map.owner[house];
  e.distractT = 5;
}

const isRubble = (sim: DefendSim, id: number) => sim.hp[id] <= 0 || !sim.built[id];
const isHouse = (sim: DefendSim, bid: number) => bid >= 0 && sim.map.buildings[bid].kind === "house";

function hitBuilding({ sim, e, def }: Turn, id: number) {
  if (e.cd > 0) return;
  e.cd = def.cooldown;
  sim.damageBuilding(id, def.damage);
}
