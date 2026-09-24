/** DEFEND mode: a city-building mini-game. The player lays out a city on a
 * grid, garrisons it with troops (added in a later pass), and is scored on
 * how well the city holds up — those results feed meta-game rewards back
 * into the main game. This module owns just the city grid framework: the
 * board shape, what can be built where, and the keep the player must
 * protect. */

/** Board is 9 tiles wide and 13 tiles tall. */
export const DEFEND_WIDTH = 9;
export const DEFEND_HEIGHT = 13;

/** The top-most row is reserved (approach lane for attackers) — nothing
 * can ever be built there. */
export const DEFEND_NO_BUILD_ROW = 0;

export type DefendTileKind = "empty" | "keep" | "wall" | "barracks";

export type DefendTile = {
  kind: DefendTileKind;
  /** Structural HP, only meaningful for `kind === "wall"`. Attackers wear
   * this down; the wall is breached (reverts to empty) once it hits 0. */
  hp?: number;
};

/** How much punishment a fresh city-wall tile can take before it's breached. */
export const DEFEND_WALL_MAX_HP = 20;

export type DefendPos = { x: number; y: number };

export type DefendState = {
  width: number;
  height: number;
  tiles: DefendTile[][];
  keep: DefendPos;
  /** The keep's remaining health. Reaching 0 loses the run. */
  keepHp: number;
  keepMaxHp: number;
  lost: boolean;
  /** How many city-wall tiles the player currently owns. Placing a wall
   * consumes one from this pool; unlocking more (a later meta-progression
   * reward) raises it. */
  wallCapacity: number;
};

const inBounds = (x: number, y: number) =>
  x >= 0 && x < DEFEND_WIDTH && y >= 0 && y < DEFEND_HEIGHT;

/** Any tile off the reserved top row is buildable, including the keep's
 * own tile once it has moved elsewhere. */
export function isBuildable(x: number, y: number): boolean {
  return inBounds(x, y) && y !== DEFEND_NO_BUILD_ROW;
}

function emptyTiles(): DefendTile[][] {
  return Array.from({ length: DEFEND_HEIGHT }, () =>
    Array.from({ length: DEFEND_WIDTH }, (): DefendTile => ({ kind: "empty" })),
  );
}

const KEEP_START: DefendPos = {
  x: Math.floor(DEFEND_WIDTH / 2),
  y: Math.floor(DEFEND_HEIGHT / 2),
};
const KEEP_MAX_HP = 100;

/** Starting number of city-wall tiles the player has to work with. */
export const DEFEND_STARTING_WALL_CAPACITY = 9;

export function createDefendState(): DefendState {
  const tiles = emptyTiles();
  tiles[KEEP_START.y][KEEP_START.x] = { kind: "keep" };
  return {
    width: DEFEND_WIDTH,
    height: DEFEND_HEIGHT,
    tiles,
    keep: { ...KEEP_START },
    keepHp: KEEP_MAX_HP,
    keepMaxHp: KEEP_MAX_HP,
    lost: false,
    wallCapacity: DEFEND_STARTING_WALL_CAPACITY,
  };
}

export function tileAt(state: DefendState, x: number, y: number): DefendTile | null {
  return inBounds(x, y) ? state.tiles[y][x] : null;
}

/** How many city-wall tiles are currently standing. */
export function wallsPlaced(state: DefendState): number {
  let n = 0;
  for (const row of state.tiles) for (const t of row) if (t.kind === "wall") n++;
  return n;
}

/** How many more city-wall tiles the player can still place. */
export function wallsRemaining(state: DefendState): number {
  return Math.max(0, state.wallCapacity - wallsPlaced(state));
}

/** The set of tiles ("x,y" keys) enclosed by the player's city walls: every
 * buildable tile that a flood fill starting from the reserved top row (the
 * attackers' approach lane) cannot reach without crossing a wall tile. With
 * no walls placed nothing is enclosed, so the fill reaches the whole board
 * and the interior is empty — the player has to wall off ground before
 * anything else can go inside it. */
export function cityInterior(state: DefendState): Set<string> {
  const key = (x: number, y: number) => `${x},${y}`;
  const outside = new Set<string>();
  const queue: DefendPos[] = Array.from({ length: DEFEND_WIDTH }, (_, x) => ({
    x,
    y: DEFEND_NO_BUILD_ROW,
  }));
  while (queue.length) {
    const { x, y } = queue.pop()!;
    const k = key(x, y);
    if (outside.has(k) || !inBounds(x, y)) continue;
    if (state.tiles[y][x].kind === "wall") continue;
    outside.add(k);
    queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  const interior = new Set<string>();
  for (let y = DEFEND_NO_BUILD_ROW + 1; y < DEFEND_HEIGHT; y++) {
    for (let x = 0; x < DEFEND_WIDTH; x++) {
      if (state.tiles[y][x].kind === "wall") continue;
      if (!outside.has(key(x, y))) interior.add(key(x, y));
    }
  }
  return interior;
}

/** Whether a tile is enclosed within the player's walled-off city. */
export function isInsideCityLimits(state: DefendState, x: number, y: number): boolean {
  return cityInterior(state).has(`${x},${y}`);
}

export type WallEdges = { top: boolean; right: boolean; bottom: boolean; left: boolean };

/** Which sides of a wall tile still show as a wall. A shared edge between
 * two adjacent wall tiles merges away — only the outer perimeter of a run
 * of walls renders. Meaningless (all false) for a non-wall tile. */
export function wallEdgesAt(state: DefendState, x: number, y: number): WallEdges {
  if (tileAt(state, x, y)?.kind !== "wall") {
    return { top: false, right: false, bottom: false, left: false };
  }
  const isWall = (nx: number, ny: number) => tileAt(state, nx, ny)?.kind === "wall";
  return {
    top: !isWall(x, y - 1),
    right: !isWall(x + 1, y),
    bottom: !isWall(x, y + 1),
    left: !isWall(x - 1, y),
  };
}

/** Place a building on an empty, buildable tile. A city wall is limited by
 * `wallCapacity`; anything else (troops, traps, ...) can only be placed
 * inside the area the player's walls currently enclose. Returns false if
 * the tile is off-board, on the reserved row, already occupied, over
 * capacity, or outside the city limits. */
export function placeBuilding(
  state: DefendState,
  x: number,
  y: number,
  kind: Exclude<DefendTileKind, "empty" | "keep">,
): boolean {
  if (!isBuildable(x, y)) return false;
  if (state.tiles[y][x].kind !== "empty") return false;
  if (kind === "wall") {
    if (wallsRemaining(state) <= 0) return false;
  } else if (!isInsideCityLimits(state, x, y)) {
    return false;
  }
  state.tiles[y][x] = kind === "wall" ? { kind, hp: DEFEND_WALL_MAX_HP } : { kind };
  return true;
}

/** Damage a wall tile. Returns true if this breached it (it reverts to an
 * empty, walkable tile); false if it's still standing, wasn't a wall, or
 * was off-board. */
export function damageWall(state: DefendState, x: number, y: number, amount: number): boolean {
  const tile = tileAt(state, x, y);
  if (!tile || tile.kind !== "wall") return false;
  const hp = (tile.hp ?? DEFEND_WALL_MAX_HP) - amount;
  if (hp <= 0) {
    state.tiles[y][x] = { kind: "empty" };
    return true;
  }
  tile.hp = hp;
  return false;
}

/** Clear a built tile back to empty. The keep can never be removed this
 * way — it can only be relocated with `moveKeep`. */
export function removeBuilding(state: DefendState, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = state.tiles[y][x];
  if (tile.kind === "empty" || tile.kind === "keep") return false;
  state.tiles[y][x] = { kind: "empty" };
  return true;
}

/** Move the keep to a new empty, buildable tile, vacating its old one. The
 * keep is never deletable — only relocatable. */
export function moveKeep(state: DefendState, x: number, y: number): boolean {
  if (!isBuildable(x, y)) return false;
  if (state.tiles[y][x].kind !== "empty") return false;
  state.tiles[state.keep.y][state.keep.x] = { kind: "empty" };
  state.tiles[y][x] = { kind: "keep" };
  state.keep = { x, y };
  return true;
}

/** Apply damage to the keep. Once its HP reaches 0 the run is lost and the
 * board is frozen (no further building or moving). */
export function damageKeep(state: DefendState, amount: number): void {
  if (state.lost) return;
  state.keepHp = Math.max(0, state.keepHp - amount);
  if (state.keepHp === 0) state.lost = true;
}

export type DefendSave = {
  tiles: DefendTileKind[][];
  /** Wall HP keyed by `"x,y"`, present only for tiles currently a wall. */
  wallHp: Record<string, number>;
  keep: DefendPos;
  keepHp: number;
  keepMaxHp: number;
  lost: boolean;
  wallCapacity: number;
};

export function toDefendSave(state: DefendState): DefendSave {
  const wallHp: Record<string, number> = {};
  state.tiles.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === "wall") wallHp[`${x},${y}`] = t.hp ?? DEFEND_WALL_MAX_HP;
    }),
  );
  return {
    tiles: state.tiles.map((row) => row.map((t) => t.kind)),
    wallHp,
    keep: { ...state.keep },
    keepHp: state.keepHp,
    keepMaxHp: state.keepMaxHp,
    lost: state.lost,
    wallCapacity: state.wallCapacity,
  };
}

export function defaultDefendSave(): DefendSave {
  return toDefendSave(createDefendState());
}

export function fromDefendSave(save: DefendSave): DefendState {
  return {
    width: DEFEND_WIDTH,
    height: DEFEND_HEIGHT,
    tiles: save.tiles.map((row, y) =>
      row.map((kind, x): DefendTile =>
        kind === "wall" ? { kind, hp: save.wallHp?.[`${x},${y}`] ?? DEFEND_WALL_MAX_HP } : { kind },
      ),
    ),
    keep: { ...save.keep },
    keepHp: save.keepHp,
    keepMaxHp: save.keepMaxHp,
    lost: save.lost,
    wallCapacity: save.wallCapacity,
  };
}
