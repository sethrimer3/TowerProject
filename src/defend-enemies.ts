/** DEFEND mode enemy waves. Enemies are deliberately simple — colored
 * pixels of different sizes — so this stays about the mechanics: they
 * spawn on the reserved top row, march toward the keep, chew through
 * whatever city wall blocks their shortest path, and once a wall is
 * breached they re-path through the gap. */
import {
  DEFEND_WIDTH,
  DEFEND_HEIGHT,
  DEFEND_NO_BUILD_ROW,
  damageWall,
  damageKeep,
  type DefendState,
  type DefendPos,
} from "./defend.ts";

export type EnemyKind = "roach" | "orc" | "bombat";

export type EnemyDef = {
  kind: EnemyKind;
  name: string;
  /** Render color — these are just colored pixels, no sprites. */
  color: string;
  /** Relative visual size (their "NxN pixels" footprint); doesn't affect
   * which single tile they occupy for movement/combat. */
  pixelSize: number;
  hp: number;
  /** Damage dealt per tick to whatever wall or keep they're attacking. */
  attack: number;
  explodesOnDeath: boolean;
  explosionDamage: number;
  /** Chebyshev radius of the death explosion, in tiles. */
  explosionRadius: number;
};

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  roach: {
    kind: "roach",
    name: "Roach",
    color: "#111214",
    pixelSize: 2,
    hp: 6,
    attack: 2,
    explodesOnDeath: false,
    explosionDamage: 0,
    explosionRadius: 0,
  },
  orc: {
    kind: "orc",
    name: "Orc",
    color: "#3d8b3d",
    pixelSize: 4,
    hp: 20,
    attack: 6,
    explodesOnDeath: false,
    explosionDamage: 0,
    explosionRadius: 0,
  },
  bombat: {
    kind: "bombat",
    name: "Bombat",
    color: "#c0392b",
    pixelSize: 3,
    hp: 10,
    attack: 4,
    explodesOnDeath: true,
    explosionDamage: 12,
    explosionRadius: 1,
  },
};

export type WaveComposition = Partial<Record<EnemyKind, number>>;

/** Five hand-tuned waves, easiest first: roaches only, then orcs mixed in,
 * then bombats join, and counts climb each time. */
export const DEFEND_WAVES: WaveComposition[] = [
  { roach: 5 },
  { roach: 8, orc: 2 },
  { roach: 6, orc: 4, bombat: 2 },
  { roach: 10, orc: 6, bombat: 3 },
  { roach: 12, orc: 8, bombat: 5 },
];
export const DEFEND_WAVE_COUNT = DEFEND_WAVES.length;

export type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
};

export type DefendWaveState = {
  enemies: Enemy[];
  /** How many waves have been started so far (0..DEFEND_WAVE_COUNT). */
  wavesStarted: number;
  nextEnemyId: number;
};

export function createDefendWaveState(): DefendWaveState {
  return { enemies: [], wavesStarted: 0, nextEnemyId: 1 };
}

/** Deterministically build the enemy list for a wave: a fixed composition,
 * fixed spawn order (roaches, then orcs, then bombats), spread evenly
 * across the top row. */
export function buildWave(waveIndex: number, idStart: number): Enemy[] {
  const composition = DEFEND_WAVES[waveIndex];
  if (!composition) return [];
  const order: EnemyKind[] = ["roach", "orc", "bombat"];
  const kinds: EnemyKind[] = [];
  for (const kind of order) for (let i = 0; i < (composition[kind] ?? 0); i++) kinds.push(kind);
  return kinds.map((kind, i) => {
    const def = ENEMY_DEFS[kind];
    return {
      id: idStart + i,
      kind,
      x: i % DEFEND_WIDTH,
      y: DEFEND_NO_BUILD_ROW,
      hp: def.hp,
      maxHp: def.hp,
    };
  });
}

/** Spawn the next wave if the board is clear of enemies, the keep still
 * stands, and waves remain. Returns whether a wave was started. */
export function startNextWave(state: DefendState, waves: DefendWaveState): boolean {
  if (state.lost) return false;
  if (waves.enemies.length > 0) return false;
  if (waves.wavesStarted >= DEFEND_WAVE_COUNT) return false;
  const spawned = buildWave(waves.wavesStarted, waves.nextEnemyId);
  waves.enemies = spawned;
  waves.nextEnemyId += spawned.length;
  waves.wavesStarted += 1;
  return true;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const inBounds = (x: number, y: number) => x >= 0 && x < DEFEND_WIDTH && y >= 0 && y < DEFEND_HEIGHT;
const key = (x: number, y: number) => `${x},${y}`;

/** Shortest 4-directional path from `from` to `to`, treating wall tiles as
 * impassable. Includes both endpoints. Null if there's no open route. */
function bfsPath(state: DefendState, from: DefendPos, to: DefendPos): DefendPos[] | null {
  if (from.x === to.x && from.y === to.y) return [from];
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
        path.push(from);
        return path.reverse();
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** Every open tile reachable from `from` without crossing a wall. */
function reachableRegion(state: DefendState, from: DefendPos): DefendPos[] {
  const visited = new Set([key(from.x, from.y)]);
  const region: DefendPos[] = [from];
  for (let i = 0; i < region.length; i++) {
    const cur = region[i];
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx,
        ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      if (state.tiles[ny][nx].kind === "wall") continue;
      visited.add(k);
      region.push({ x: nx, y: ny });
    }
  }
  return region;
}

/** The wall tiles bordering an open region — the only walls an enemy stuck
 * inside/outside that region could actually reach to attack. */
function frontierWalls(state: DefendState, region: DefendPos[]): DefendPos[] {
  const seen = new Set<string>();
  const walls: DefendPos[] = [];
  for (const { x, y } of region) {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (state.tiles[ny][nx].kind !== "wall") continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      walls.push({ x: nx, y: ny });
    }
  }
  return walls;
}

/** Advance the wave by one tick: every enemy either steps toward the keep,
 * attacks it if already adjacent, or — if no open path to the keep exists —
 * attacks the nearest wall bordering the ground it can actually reach.
 * Breaching that wall opens a path the next tick will naturally take. */
export function stepDefendCombat(state: DefendState, waves: DefendWaveState): void {
  if (state.lost) return;
  for (const enemy of waves.enemies) {
    if (state.lost) break;
    const def = ENEMY_DEFS[enemy.kind];
    const path = bfsPath(state, { x: enemy.x, y: enemy.y }, state.keep);
    if (path) {
      if (path.length <= 2) {
        damageKeep(state, def.attack);
      } else {
        enemy.x = path[1].x;
        enemy.y = path[1].y;
      }
      continue;
    }
    const region = reachableRegion(state, { x: enemy.x, y: enemy.y });
    const walls = frontierWalls(state, region);
    if (!walls.length) continue;
    let target = walls[0];
    let bestDist = Infinity;
    for (const w of walls) {
      const dist = Math.abs(w.x - enemy.x) + Math.abs(w.y - enemy.y);
      if (dist < bestDist) {
        bestDist = dist;
        target = w;
      }
    }
    damageWall(state, target.x, target.y, def.attack);
  }
}

function explode(state: DefendState, at: DefendPos, def: EnemyDef): void {
  for (let dy = -def.explosionRadius; dy <= def.explosionRadius; dy++) {
    for (let dx = -def.explosionRadius; dx <= def.explosionRadius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = at.x + dx,
        y = at.y + dy;
      if (!inBounds(x, y)) continue;
      if (state.tiles[y][x].kind === "wall") damageWall(state, x, y, def.explosionDamage);
    }
  }
  if (Math.abs(state.keep.x - at.x) <= def.explosionRadius && Math.abs(state.keep.y - at.y) <= def.explosionRadius) {
    damageKeep(state, def.explosionDamage);
  }
}

/** Apply damage from a defender (troop/trap, added in a later pass) to an
 * enemy. Removes it once its HP reaches 0, triggering its death explosion
 * (bombats) if it has one. */
export function damageEnemy(state: DefendState, waves: DefendWaveState, id: number, amount: number): void {
  const enemy = waves.enemies.find((e) => e.id === id);
  if (!enemy) return;
  enemy.hp -= amount;
  if (enemy.hp > 0) return;
  const def = ENEMY_DEFS[enemy.kind];
  if (def.explodesOnDeath) explode(state, enemy, def);
  waves.enemies = waves.enemies.filter((e) => e.id !== id);
}

export type DefendWaveSave = DefendWaveState;

export function toDefendWaveSave(waves: DefendWaveState): DefendWaveSave {
  return {
    enemies: waves.enemies.map((e) => ({ ...e })),
    wavesStarted: waves.wavesStarted,
    nextEnemyId: waves.nextEnemyId,
  };
}

export function defaultDefendWaveSave(): DefendWaveSave {
  return toDefendWaveSave(createDefendWaveState());
}

export function fromDefendWaveSave(save: DefendWaveSave): DefendWaveState {
  return {
    enemies: save.enemies.map((e) => ({ ...e })),
    wavesStarted: save.wavesStarted,
    nextEnemyId: save.nextEnemyId,
  };
}
