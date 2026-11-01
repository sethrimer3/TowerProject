import { pointing } from "../exact.ts";
import { tileRandom } from "../random.ts";
import { isRecord, wholeIn } from "../save/decode.ts";

// Necrotic Frost (docs/agents/arcana.md): its cooldown sets a field round the hero,
// its center off the hero's at an angle rolled for it, moving with the hero for a
// number of turns. Fields stack. Each slows what stands in it and applies a decay to
// what it touches, which grows every turn and lasts until the enemy falls, wherever it
// goes. Whether a field reaches an enemy decides play, so its place is exact
// arithmetic in every engine: its angle in whole hundredths of a degree, its offset
// from `pointing`. This module is its rules: it reads nothing of the game but what it
// is given.

/** A field's base radius, in tiles. */
export const FROST_RADIUS = 3;
/** Salts the run seed for the fields' angles. */
const FROST_SALT = 0xf205;

/** A field standing: its number among the run's activations, where it lies from the
 * hero in hundredths of a degree clockwise from straight up the board, and its turns left. */
export type FrostField = { id: number; angle: number; left: number };
/** What a run keeps of Necrotic Frost, in the run so undo takes it back with what it
 * did: the cooldown's turns left, the activations so far, and the fields standing
 * (absent with none). */
export type FrostRun = { timer?: number; casts?: number; fields?: FrostField[] };
/** What is on an enemy: for each field that has touched it, by that field's `id`,
 * the turns its effect has ticked, which is what that field's next tick has grown past. */
export type Necro = Record<string, number>;

/** What it gives, for research to raise: a field's radius and how far its center lies
 * from the hero's, in hundredths of a tile, and the percent an enemy in one field is
 * slowed by (`slow`) and in two or more (`overlap`). */
export type FrostEffects = { radius: number; offset: number; slow: number; overlap: number };
export const frostEffects = (_save: unknown): FrostEffects => ({ radius: FROST_RADIUS * 100, offset: 100, slow: 25, overlap: 50 });

/** The fields as they lie from the hero, in tiles, rows rising up the board. */
export type FrostArea = FrostEffects & { fields: { id: number; x: number; y: number }[] };
export function frostArea(fields: readonly FrostField[], effects: FrostEffects): FrostArea {
  return {
    ...effects,
    fields: fields.map(({ id, angle }) => {
      const { x, y } = pointing(angle / 100);
      return { id, x: (x * effects.offset) / 100, y: (y * effects.offset) / 100 };
    }),
  };
}
/** The fields of `area` reaching a tile whose center lies `dx`, `dy` tiles from the hero's, by Euclidean distance. */
export const fieldsOn = (area: FrostArea, dx: number, dy: number) =>
  area.fields.filter((f) => ((dx - f.x) * (dx - f.x) + (dy - f.y) * (dy - f.y)) * 10_000 <= area.radius * area.radius).map((f) => f.id);
/** The percent `area` slows what stands `dx`, `dy` tiles from the hero by: one rate in one field, another in two or more. */
export function frostSlowAt(area: FrostArea, dx: number, dy: number) {
  const fields = fieldsOn(area, dx, dy).length;
  return fields > 1 ? area.overlap : fields ? area.slow : 0;
}

/** One enemy's turn of decay: each field `touching` it that hasn't yet starts its
 * effect, and every effect on it ticks once, each a step further up its own ramp.
 * Returns what is on it after, and how many of the ramp's steps it takes this turn. */
export function decayed(necro: Necro | undefined, touching: readonly number[]) {
  const next: Necro = { ...necro };
  for (const id of touching) next[id] ??= 0;
  let units = 0;
  for (const id of Object.keys(next)) units += next[id] = next[id]! + 1;
  return { necro: next, units };
}

/** One turn of Necrotic Frost: the fields' turns run out and the cooldown runs,
 * restarting the moment it runs out, which sets a new field at an angle of its own,
 * beside those still standing. Returns whether it did. */
export function stepFrost(s: FrostRun, { duration, turns }: { duration: number; turns: number }, seed: number) {
  const kept = (s.fields ?? []).filter((f) => f.left > 1).map((f) => ({ ...f, left: f.left - 1 }));
  if (kept.length) s.fields = kept;
  else delete s.fields;
  const left = Math.min(s.timer ?? turns, turns) - 1;
  s.timer = left <= 0 ? turns : left;
  if (left > 0) return false;
  const id = (s.casts = (s.casts ?? 0) + 1);
  s.fields = [...kept, { id, angle: Math.floor(tileRandom(id, 0, (seed ^ FROST_SALT) | 0) * 36_000), left: duration }];
  return true;
}

/** Switched off: the cooldown and the fields are gone. What is on the enemies stays,
 * and ticks again once it is back on. */
export function clearFrost(s: FrostRun | undefined) {
  if (!s) return;
  delete s.timer;
  delete s.fields;
}

const whole = (v: unknown) => v === undefined || wholeIn(v, 1, 1e12);
const validField = (f: unknown) => isRecord(f) && wholeIn(f.id, 1, 1e12) && wholeIn(f.angle, 0, 35_999) && wholeIn(f.left, 1, 1e9);
export const validFrost = (v: unknown): v is FrostRun =>
  isRecord(v) && whole(v.timer) && whole(v.casts) && (v.fields === undefined || (Array.isArray(v.fields) && v.fields.length > 0 && v.fields.length <= 1000 && v.fields.every(validField)));
/** What a saved tile or foe has on it: a whole number of ticks per field, at least one field. */
export const validNecro = (v: unknown): v is Necro => isRecord(v) && Object.keys(v).length > 0 && Object.entries(v).every(([id, n]) => wholeIn(Number(id), 1, 1e12) && wholeIn(n, 1, 1e12));
