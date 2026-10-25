import type { Enemy, Tile } from "./entities.ts";
import type { EquipMaterialId } from "./equipment/catalog.ts";
import type { EquipRarity } from "./equipment/balance.ts";
import type { Bout } from "./combat.ts";
import type { StepEffect } from "./step-effects.ts";

/** What the game hands the board to show of its latest moves: the rewards
 * rising off tiles, heals, the hero's facing and dashes, and the fight
 * being played out. `Game` (state.ts) makes them; the renderer and the
 * themed boards draw them without needing the game itself. */

/** A reward just picked up, or what a door took, to rise from the tile it
 * came from: drawn as its sprite (a tile's contents, marked `spent` for a
 * key a door used, a material, or the heart a Heart Door checked, or with
 * a plus, `raised`, the max HP Max HP's badge added), or as `text` where it
 * has none. A kill's drops carry their `drop` place, so they rise together. */
export type Gain = { x: number; y: number; text: string; art: GainArt | null; drop?: Drop };
/** Where one of a kill's or a chest's drops rises: `row` rows above its tile (below,
 * negative), Gold over Silver over the rest, and whether it starts `with`
 * the drop queued before it rather than after. */
export type Drop = { row: number; with: boolean };
export type GainArt = { tile: Tile; spent?: true } | { heart: true; raised?: true } | { gem: true } | { coin: Coin } | { cell: true }
  | { equipMaterial: EquipMaterialId; quantity: number } | { equipPiece: string; rarity: EquipRarity }
  /** CHEST's Double and Triple: the times over a chest paid, flashed over it. */
  | { multiplier: number };
/** The coin a Gold or Silver gain raises. */
export type Coin = "gold" | "silver";
/** A potion's heal: the HP from and to, where the hero stood, and its number. */
export type Heal = { from: number; to: number; x: number; y: number; id: number };
/** Which way the hero faces: the last step it took, (dx, dy) one tile
 * across or up (world y grows upward). */
export type Facing = { dx: number; dy: number };
/** A dash: the tiles the hero dashed off in one step, in order, each with
 * the step it took off it, the empty tile it landed on (none when it ended
 * on its target item), with the step onto it, and when (performance time). */
export type Dash = { tiles: ({ x: number; y: number } & Facing)[]; end?: { x: number; y: number } & Facing; at: number };
/** The latest turn's step as the board shows it: from (performance time)
 * `at`, for `ms`, the hero walks straight from tile `from` to `to`, at an
 * even pace, so a shot fired a share of the way through the turn leaves
 * from where the hero is drawn then (volley.ts). */
export type ShownTurn = { at: number; ms: number; from: { x: number; y: number }; to: { x: number; y: number } };
/** The latest fight as the board shows it: the hero struck from `from`,
 * the enemy (`hp` at the start) stood at `to`, and its strikes land from
 * `start` (performance time). Played out, they are the fight's own; settled
 * at once (`summary`), they are its summary rounds (`summarize`). */
export type ShownFight = { from: { x: number; y: number }; to: { x: number; y: number }; bout: Bout; start: number; hp: number; summary: boolean };
/** A fight being shown before it counts: the hero waits at `from`, the
 * enemy stands at `to`, and nothing changes until `finishEncounter` settles
 * it (at `start + bout.duration`). */
export type Encounter = ShownFight & { enemy: Enemy; outcome: StepEffect; settle: () => void };
