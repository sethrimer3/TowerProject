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
};

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
  };
}

export function tileAt(state: DefendState, x: number, y: number): DefendTile | null {
  return inBounds(x, y) ? state.tiles[y][x] : null;
}

/** Place a building on an empty, buildable tile. Returns false if the tile
 * is off-board, on the reserved row, or already occupied. */
export function placeBuilding(
  state: DefendState,
  x: number,
  y: number,
  kind: Exclude<DefendTileKind, "empty" | "keep">,
): boolean {
  if (!isBuildable(x, y)) return false;
  if (state.tiles[y][x].kind !== "empty") return false;
  state.tiles[y][x] = { kind };
  return true;
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
  keep: DefendPos;
  keepHp: number;
  keepMaxHp: number;
  lost: boolean;
};

export function toDefendSave(state: DefendState): DefendSave {
  return {
    tiles: state.tiles.map((row) => row.map((t) => t.kind)),
    keep: { ...state.keep },
    keepHp: state.keepHp,
    keepMaxHp: state.keepMaxHp,
    lost: state.lost,
  };
}

export function defaultDefendSave(): DefendSave {
  return toDefendSave(createDefendState());
}

export function fromDefendSave(save: DefendSave): DefendState {
  return {
    width: DEFEND_WIDTH,
    height: DEFEND_HEIGHT,
    tiles: save.tiles.map((row) => row.map((kind) => ({ kind }))),
    keep: { ...save.keep },
    keepHp: save.keepHp,
    keepMaxHp: save.keepMaxHp,
    lost: save.lost,
  };
}
