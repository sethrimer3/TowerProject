import { pointing } from "../exact.ts";
import { TURN_TICKS } from "../enemies/ranged.ts";
import { isRecord, wholeIn } from "../save/decode.ts";

// Phantasm (docs/agents/arcana.md): its cooldown brings ghosts back to a ring round
// the hero, evenly spaced and turning slowly. A ghost that touches an enemy's tile
// strikes everything in its blast and is gone until the next activation. Whether
// one touches decides play, so its place is exact arithmetic in every engine: its
// direction in whole hundredths of a degree, its offset from `pointing`. This module
// is its rules: it reads nothing of the game but what it is given.

/** The shortest its cooldown can be, whatever lowers it. */
export const COOLDOWN_CAP = 37;
/** How far a ghost's center rides from the hero's, in tiles. */
export const RING_RADIUS = 1;
/** The second ring its augment boon adds: how many ghosts it holds, and how far
 * each rides from the hero's center, in tiles. It turns the other way. */
export const OUTER_GHOSTS = 5, OUTER_RADIUS = 2;
/** The radius of a ghost's body, in tiles: half a tile wide. */
export const GHOST_RADIUS = 0.25;

/** What a run keeps of Phantasm, in the run so undo takes it back with what it
 * struck: the cooldown's turns left, the turns its ring has turned, how many slots
 * the ring was laid out with, the slots still holding a ghost, and those of the
 * augment boon's outer ring (each absent with none). */
export type PhantasmRun = { timer?: number; turns?: number; ring?: number; ghosts?: number[]; outer?: number[] };
/** Where a ghost struck: its tick of the turn, its place in tiles, its direction from the hero, and how far out it rode. */
export type GhostStrike = { tick: number; x: number; y: number; direction: number; radius: number };
/** A ghost out: its slot, and whether it rides the outer ring. */
export type Ghost = { slot: number; outer: boolean };

/** What research adds to it, for labs to raise: the blast's radius in tiles, how
 * far the ring turns each turn in hundredths of a degree, and the turns off its cooldown. */
export type PhantasmEffects = { blast: number; spin: number; cooldown: number };
export const phantasmEffects = (_save: unknown): PhantasmEffects => ({ blast: 0.1, spin: 100, cooldown: 0 });

/** Its cooldown from the attribute and what research takes off, never under the cap. */
export const phantasmCooldown = (attribute: number, { cooldown }: Pick<PhantasmEffects, "cooldown"> = { cooldown: 0 }) => Math.max(COOLDOWN_CAP, attribute - cooldown);

/** Where the ghost in `slot` of a ring of `ring` points `tick` ticks into the turn
 * after `turns` finished turns, in hundredths of a degree clockwise from straight up the board. */
export const ghostDirection = (turns: number, slot: number, ring: number, spin: number, tick = 0) => (turns * spin + (tick * spin) / TURN_TICKS + (slot * 36_000) / ring) % 36_000;
/** `ghostDirection` for the outer ring's ghost in `slot`, turning the other way. */
export const outerDirection = (turns: number, slot: number, spin: number, tick = 0) => (36_000 - (turns * spin + (tick * spin) / TURN_TICKS) % 36_000 + (slot * 36_000) / OUTER_GHOSTS) % 36_000;
/** How far from the hero a ghost pointing `direction` rides, `radius` tiles out, rows rising up the board. */
export function ghostOffset(direction: number, radius = RING_RADIUS) {
  const { x, y } = pointing(direction / 100);
  return { x: x * radius, y: y * radius };
}
/** Every ghost out, the inner ring's first. */
export const ghostsOut = ({ ghosts, outer }: Pick<PhantasmRun, "ghosts" | "outer">): Ghost[] =>
  [...(ghosts ?? []).map((slot) => ({ slot, outer: false })), ...(outer ?? []).map((slot) => ({ slot, outer: true }))];
/** Whether a ghost's body overlaps the tile whose center lies `dx`, `dy` from the ghost's center. */
export function touchesTile(dx: number, dy: number) {
  const x = Math.max(0, Math.abs(dx) - 0.5), y = Math.max(0, Math.abs(dy) - 0.5);
  return x * x + y * y < GHOST_RADIUS * GHOST_RADIUS;
}
/** Whether what lies `dx`, `dy` from a ghost's center is within its blast, by Euclidean distance. */
export const inBlast = (dx: number, dy: number, blast: number) => dx * dx + dy * dy <= blast * blast;

/** Takes the ghost in `slot` out of its ring. */
export function loseGhost(s: PhantasmRun, slot: number, outer = false) {
  if (outer) {
    const left = (s.outer ?? []).filter((g) => g !== slot);
    if (left.length) s.outer = left;
    else delete s.outer;
    return;
  }
  const left = (s.ghosts ?? []).filter((g) => g !== slot);
  if (left.length) s.ghosts = left;
  else {
    delete s.ghosts;
    delete s.ring;
  }
}

/** One turn of Phantasm: the ring turns and the cooldown runs, restarting the
 * moment it runs out, which fills every gap in the ring up to `quantity`, evenly
 * spaced, and the outer ring's `outer` slots, if it has them. Returns whether it did. */
export function stepPhantasm(s: PhantasmRun, { quantity, turns, outer }: { quantity: number; turns: number; outer?: number }) {
  s.turns = (s.turns ?? 0) + 1;
  const left = Math.min(s.timer ?? turns, turns) - 1;
  s.timer = left <= 0 ? turns : left;
  if (left > 0) return false;
  s.ring = quantity;
  s.ghosts = Array.from({ length: quantity }, (_, slot) => slot);
  if (outer) s.outer = Array.from({ length: outer }, (_, slot) => slot);
  return true;
}

/** Switched off: the cooldown and the ghosts are gone. */
export function clearPhantasm(s: PhantasmRun | undefined) {
  if (!s) return;
  delete s.timer;
  delete s.ring;
  delete s.ghosts;
  delete s.outer;
}

const whole = (v: unknown) => v === undefined || wholeIn(v, 1, 1e12);
const validGhosts = ({ ring, ghosts }: Record<string, unknown>) =>
  ghosts === undefined ? ring === undefined : Array.isArray(ghosts) && ghosts.length > 0 && wholeIn(ring, 1, 1e3) && new Set(ghosts).size === ghosts.length && ghosts.every((g) => wholeIn(g, 0, (ring as number) - 1));
const validOuter = (outer: unknown) => outer === undefined || (Array.isArray(outer) && outer.length > 0 && new Set(outer).size === outer.length && outer.every((g) => wholeIn(g, 0, OUTER_GHOSTS - 1)));
export const validPhantasm = (v: unknown): v is PhantasmRun => isRecord(v) && whole(v.timer) && whole(v.turns) && validGhosts(v) && validOuter(v.outer);
