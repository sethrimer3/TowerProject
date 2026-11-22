import type { Point } from "../entities.ts";
import { snap } from "../exact.ts";
import { FAMILIAR_IDS, type FamiliarId, type StatKey } from "./catalog.ts";
import { pathOffset, wolfAngle, wolfOffset } from "./paths.ts";
import type { FamiliarState, FamiliarsRun } from "./save.ts";

// Familiars' rules in a run (docs/agents/familiars.md): where each is, what
// it reaches, and a turn of their clocks. A turn reads every familiar where
// it stood as the turn began: it activates there, and moves on only as the
// turn ends. This module reads nothing of the game but what it is given.

/** The values of the familiars working, research counted: those hatched and switched on. */
export type FamiliarValues = { [I in FamiliarId]?: Record<StatKey<I>, number> };
/** What the paths go round: the room's middle as the turn began, the columns
 * the board wraps by (0: none) and the run's seed. */
export type Room = { middle: Point; wrap: number; seed: number };
/** A circle on the floor: its exact center, its radius in hundredths of a tile, and the wrap. */
export type Area = { x: number; y: number; reach: number; wrap: number };
/** An area and what it multiplies by. */
export type BoostArea = Area & { factor: number };

/** A multiplier of ×1, in hundredths. */
const ONCE = 100;

/** `dx` the short way round a board `wrap` columns wide, however many times round it lies. */
function across(dx: number, wrap: number) {
  if (!wrap) return dx;
  const d = dx % wrap;
  return Math.abs(d) > wrap / 2 ? d - Math.sign(d) * wrap : d;
}

/** Whether (x, y), a tile's center, lies in `area`, its edge included. */
export function inArea(area: Area, x: number, y: number) {
  const dx = across(x - area.x, area.wrap), dy = y - area.y;
  return (dx * dx + dy * dy) * 10_000 <= area.reach * area.reach;
}

/** Where familiar `id` is as the turn began; the Wolf only while planted,
 * since following the hero decides nothing. */
export function familiarAt(id: FamiliarId, state: FamiliarState | undefined, room: Room): Point | undefined {
  if (id === "wolf") return state?.left ? state.at : undefined;
  const offset = pathOffset(id, state?.turns ?? 0);
  return { x: room.middle.x + offset.x, y: room.middle.y + offset.y };
}

/** Familiar `id`'s area while its lasting effect stands. */
function standing(id: "wolf" | "falcon" | "wisp", run: FamiliarsRun | undefined, values: FamiliarValues, room: Room): Area | undefined {
  const state = run?.[id], stats = values[id];
  if (!stats || !state?.left) return undefined;
  const at = familiarAt(id, state, room);
  return at && { x: at.x, y: at.y, reach: stats.range, wrap: room.wrap };
}

/** The Wisp's area while its effect stands. */
export const wispArea = (run: FamiliarsRun | undefined, values: FamiliarValues, room: Room) => standing("wisp", run, values, room);

/** What the Wisp multiplies a familiar standing at `at` by, in hundredths. */
export function wispBoost(run: FamiliarsRun | undefined, values: FamiliarValues, room: Room, at: Point) {
  const area = wispArea(run, values, room);
  return area && inArea(area, at.x, at.y) ? values.wisp!.bonus : ONCE;
}

/** The Wolf's or Falcon's area while it stands, its Bonus times the Wisp's. */
function bonusArea(id: "wolf" | "falcon", run: FamiliarsRun | undefined, values: FamiliarValues, room: Room): BoostArea | undefined {
  const area = standing(id, run, values, room);
  return area && { ...area, factor: snap((values[id]!.bonus * wispBoost(run, values, room, area)) / (ONCE * ONCE)) };
}
/** Where the hero's damage is multiplied: round the planted Wolf. */
export const wolfArea = (run: FamiliarsRun | undefined, values: FamiliarValues, room: Room) => bonusArea("wolf", run, values, room);
/** Where a kill's Gold is multiplied: round the Falcon while its effect stands. */
export const falconArea = (run: FamiliarsRun | undefined, values: FamiliarValues, room: Room) => bonusArea("falcon", run, values, room);

/** An effect that happens at once: its area, and the Wisp's boost on it as it fired, in hundredths. */
export type Burst = { id: "slime" | "dragon"; area: Area; boost: number };

/** The order they activate in: the Wisp first, so it counts for what fires
 * with it, and the Slime before anything strikes. */
const ORDER = ["wisp", "slime", "dragon", "wolf", "falcon"] as const satisfies readonly FamiliarId[];

/** One turn of the cooldowns, before anything strikes: each restarts the
 * moment it runs out, whatever its effect is still doing, and what it sets
 * off stands from here. One shortened while it runs counts down from no more
 * than its new length. Returns what struck at once. */
export function stepFamiliars(run: FamiliarsRun, values: FamiliarValues, room: Room): Burst[] {
  const bursts: Burst[] = [];
  for (const id of ORDER) {
    const stats = values[id];
    if (!stats) continue;
    const state = (run[id] ??= { turns: 0 }), left = Math.min(state.timer ?? stats.cooldown, stats.cooldown) - 1;
    state.timer = left <= 0 ? stats.cooldown : left;
    if (left > 0) continue;
    if (id === "dragon" || id === "slime") {
      const at = familiarAt(id, state, room)!, reach = values[id]!.range;
      bursts.push({ id, area: { x: at.x, y: at.y, reach, wrap: room.wrap }, boost: wispBoost(run, values, room, at) });
      continue;
    }
    state.left = values[id]!.duration;
    if (id === "wolf") {
      const cast = (state.casts = (state.casts ?? 0) + 1), offset = wolfOffset(wolfAngle(room.seed, cast)), x = room.middle.x + offset.x;
      state.at = { x: room.wrap ? ((x % room.wrap) + room.wrap) % room.wrap : x, y: room.middle.y + offset.y };
    }
  }
  return bursts;
}

/** The turn's end, after all that struck: each working familiar moves on a
 * turn and its effect has a turn less. */
export function endFamiliarsTurn(run: FamiliarsRun, values: FamiliarValues) {
  for (const id of FAMILIAR_IDS) {
    const state = run[id];
    if (!values[id] || !state) continue;
    state.turns++;
    if (!state.left) continue;
    if (state.left > 1) state.left--;
    else endEffect(state);
  }
}

/** A familiar's lasting effect is over, or it was switched off: its cooldown
 * and path stay where they are. */
export function endEffect(state: FamiliarState | undefined) {
  if (!state) return;
  delete state.left;
  delete state.at;
}
