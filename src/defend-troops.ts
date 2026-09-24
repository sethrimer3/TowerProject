/** DEFEND mode player troops. Like enemies, they're just colored pixels.
 * Barracks tucked into a tile's corner train them over time; swordsmen
 * walk out and fight in melee, archers hold position and fire bolts at
 * anything that wanders into range. */
import {
  DEFEND_WIDTH,
  DEFEND_HEIGHT,
  tileAt,
  type DefendState,
  type DefendPos,
  type BarracksKind,
} from "./defend.ts";
import { damageEnemy, type DefendWaveState } from "./defend-enemies.ts";

export type TroopKind = "swordsman" | "archer";

export type TroopDef = {
  kind: TroopKind;
  name: string;
  color: string;
  pixelSize: number;
  hp: number;
  attack: number;
  /** Chebyshev tiles: 1 = melee (must be adjacent), more = ranged. */
  range: number;
  /** Simulation ticks a barracks needs to train one of these. */
  trainTicks: number;
  ranged: boolean;
};

export const TROOP_DEFS: Record<TroopKind, TroopDef> = {
  swordsman: {
    kind: "swordsman",
    name: "Swordsman",
    color: "#7fa8d9",
    pixelSize: 3,
    hp: 12,
    attack: 4,
    range: 1,
    trainTicks: 4,
    ranged: false,
  },
  archer: {
    kind: "archer",
    name: "Archer",
    color: "#d9c27f",
    pixelSize: 2,
    hp: 8,
    attack: 3,
    range: 3,
    trainTicks: 5,
    ranged: true,
  },
};

export const BARRACKS_TROOP_KIND: Record<BarracksKind, TroopKind> = {
  barracks_swordsman: "swordsman",
  barracks_archer: "archer",
};

/** Garrison cap per barracks — once a barracks has this many troops out,
 * it stops training more until some are lost. */
export const BARRACKS_GARRISON_CAP = 3;

export type Troop = {
  id: number;
  kind: TroopKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** The barracks tile this troop calls home, for garrison-cap bookkeeping. */
  homeX: number;
  homeY: number;
};

export type DefendTroopState = {
  troops: Troop[];
  nextTroopId: number;
  /** Training progress in ticks, keyed by barracks `"x,y"`. */
  progress: Record<string, number>;
};

export function createDefendTroopState(): DefendTroopState {
  return { troops: [], nextTroopId: 1, progress: {} };
}

const inBounds = (x: number, y: number) => x >= 0 && x < DEFEND_WIDTH && y >= 0 && y < DEFEND_HEIGHT;
const key = (x: number, y: number) => `${x},${y}`;
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function garrisonSize(troops: Troop[], homeX: number, homeY: number): number {
  return troops.filter((t) => t.homeX === homeX && t.homeY === homeY).length;
}

/** Advance barracks training by one tick: every standing barracks under its
 * garrison cap accrues progress, and once it hits that troop kind's
 * `trainTicks` a fresh troop steps out of it. Deterministic — barracks are
 * visited in row-major order so simultaneous completions resolve the same
 * way every time. */
export function trainTroopsTick(state: DefendState, troops: DefendTroopState): void {
  for (let y = 0; y < DEFEND_HEIGHT; y++) {
    for (let x = 0; x < DEFEND_WIDTH; x++) {
      const tile = tileAt(state, x, y);
      if (tile?.kind !== "barracks_swordsman" && tile?.kind !== "barracks_archer") continue;
      if (garrisonSize(troops.troops, x, y) >= BARRACKS_GARRISON_CAP) continue;
      const k = key(x, y);
      const kind = BARRACKS_TROOP_KIND[tile.kind];
      const def = TROOP_DEFS[kind];
      const next = (troops.progress[k] ?? 0) + 1;
      if (next >= def.trainTicks) {
        troops.progress[k] = 0;
        troops.troops.push({
          id: troops.nextTroopId++,
          kind,
          x,
          y,
          hp: def.hp,
          maxHp: def.hp,
          homeX: x,
          homeY: y,
        });
      } else {
        troops.progress[k] = next;
      }
    }
  }
}

/** The next tile to step onto to shorten a 4-directional walk from `from`
 * toward `to`, treating wall tiles as impassable. Null if `to` is already
 * `from` or unreachable. */
function bfsStepToward(state: DefendState, from: DefendPos, to: DefendPos): DefendPos | null {
  if (from.x === to.x && from.y === to.y) return null;
  const visited = new Set([key(from.x, from.y)]);
  const prev = new Map<string, DefendPos>();
  const queue: DefendPos[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx,
        ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      if (state.tiles[ny][nx].kind === "wall") continue;
      visited.add(k);
      prev.set(k, cur);
      if (nx === to.x && ny === to.y) {
        const path: DefendPos[] = [{ x: nx, y: ny }];
        let p = cur;
        while (!(p.x === from.x && p.y === from.y)) {
          path.push(p);
          p = prev.get(key(p.x, p.y))!;
        }
        return path[path.length - 1];
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

export type Shot = { from: DefendPos; to: DefendPos };

/** Advance troop actions by one tick. Swordsmen path toward the nearest
 * enemy and melee it once adjacent; archers hold their ground and shoot
 * the nearest enemy within range. Returns the archer shots fired this tick
 * (for rendering a bolt) — purely visual, not persisted. */
export function stepTroopCombat(state: DefendState, waves: DefendWaveState, troops: DefendTroopState): Shot[] {
  const shots: Shot[] = [];
  for (const troop of troops.troops) {
    if (!waves.enemies.length) continue;
    const def = TROOP_DEFS[troop.kind];
    let nearest = waves.enemies[0];
    let nearestDist = Infinity;
    for (const enemy of waves.enemies) {
      const dist = Math.max(Math.abs(enemy.x - troop.x), Math.abs(enemy.y - troop.y));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    if (def.ranged) {
      if (nearestDist <= def.range) {
        shots.push({ from: { x: troop.x, y: troop.y }, to: { x: nearest.x, y: nearest.y } });
        damageEnemy(state, waves, nearest.id, def.attack);
      }
      continue;
    }
    if (nearestDist <= def.range) {
      damageEnemy(state, waves, nearest.id, def.attack);
    } else {
      const step = bfsStepToward(state, { x: troop.x, y: troop.y }, { x: nearest.x, y: nearest.y });
      if (step) {
        troop.x = step.x;
        troop.y = step.y;
      }
    }
  }
  return shots;
}

/** Damage a troop; once its HP reaches 0 it's removed. */
export function damageTroop(troops: DefendTroopState, id: number, amount: number): void {
  const troop = troops.troops.find((t) => t.id === id);
  if (!troop) return;
  troop.hp -= amount;
  if (troop.hp <= 0) troops.troops = troops.troops.filter((t) => t.id !== id);
}

export type DefendTroopSave = DefendTroopState;

export function toDefendTroopSave(troops: DefendTroopState): DefendTroopSave {
  return {
    troops: troops.troops.map((t) => ({ ...t })),
    nextTroopId: troops.nextTroopId,
    progress: { ...troops.progress },
  };
}

export function defaultDefendTroopSave(): DefendTroopSave {
  return toDefendTroopSave(createDefendTroopState());
}

export function fromDefendTroopSave(save: DefendTroopSave): DefendTroopState {
  return {
    troops: save.troops.map((t) => ({ ...t })),
    nextTroopId: save.nextTroopId,
    progress: { ...save.progress },
  };
}
