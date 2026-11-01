import { snap } from "../exact.ts";
import { isRecord, wholeIn } from "../save/decode.ts";

// Time Dilation (docs/agents/arcana.md): its cooldown sets a field round the hero
// for a number of turns, and enemies in it strike, shoot, move and count down their
// boss effects slower by its Slowdown. This module is its rules: it reads nothing
// of the game but what it is given.

/** The highest Slowdown, whatever raises it. */
export const SLOWDOWN_CAP = 90;

/** What a run keeps of Time Dilation, in the run so undo takes it back with what
 * it slowed: the cooldown's turns left, and the turns the field has left (absent
 * while there is none). */
export type DilationRun = { timer?: number; left?: number };

/** What research adds to it, for labs to raise: percent added to Slowdown, and the
 * percent more range the field has over the hero's shot range. */
export type DilationEffects = { slowdown: number; range: number };
export const dilationEffects = (_save: unknown): DilationEffects => ({ slowdown: 0, range: 0 });

/** The field's Slowdown, in percent: its attribute and what research adds, up to the cap. */
export const fieldSlowdown = (attribute: number, { slowdown }: DilationEffects) => Math.min(SLOWDOWN_CAP, snap(attribute + slowdown));
/** The field's reach, in hundredths of a tile, from the hero's shot range. */
export const fieldReach = (shotRange: number, { range }: DilationEffects) => (range ? Math.floor((shotRange * (100 + range)) / 100) : shotRange);

/** What slows an enemy by two kinds of field at once comes to: each multiplies what the other leaves it, up to the cap. */
export const togetherSlow = (a: number, b: number) => (!a ? b : !b ? a : Math.min(SLOWDOWN_CAP, snap(100 - ((100 - a) * (100 - b)) / 100)));

/** One turn of Time Dilation: the field's turns run out, and the cooldown runs,
 * restarting the moment it runs out. Then a new field takes the old one's place,
 * whatever it had left. Returns whether it did. */
export function stepDilation(s: DilationRun, { duration, turns }: { duration: number; turns: number }) {
  if (s.left) {
    if (s.left > 1) s.left--;
    else delete s.left;
  }
  const left = Math.min(s.timer ?? turns, turns) - 1;
  s.timer = left <= 0 ? turns : left;
  if (left > 0) return false;
  s.left = duration;
  return true;
}

/** Switched off: the cooldown and the field are gone. */
export function clearDilation(s: DilationRun | undefined) {
  if (!s) return;
  delete s.timer;
  delete s.left;
}

/** One chance for a slowed enemy to act (a strike of a fight, a step), from its
 * running `tally`, and `slow` percent Slowdown: whether it does, and the tally
 * after. It acts on (100 − `slow`)% of its chances. Under 50%, each chance adds
 * `slow` to the tally, and the one that takes it to 100 is lost: at 25%, chances
 * 4, 8, 12. From 50% on the delay is a whole chance or more per act, so it is
 * lost first: each chance adds 100 − `slow`, and only the one that takes it to 100
 * acts: at 50%, chances 2, 4, 6; at 75%, chances 4, 8, 12. Whatever is over 100
 * rolls on. */
export function slowedAct(tally: number, slow: number) {
  const next = snap(tally + (slow < 50 ? slow : 100 - slow)), full = next >= 100;
  return { acts: slow < 50 ? !full : full, tally: full ? snap(next - 100) : next };
}
/** The tally after `chances` of them from the start. */
export function tallyAfter(chances: number, slow: number) {
  let tally = 0;
  for (let i = 0; i < chances; i++) tally = slowedAct(tally, slow).tally;
  return tally;
}
/** How many of an enemy's first `chances` it acts on, `slowedAct` summed up. */
export const actsOf = (chances: number, slow: number) => {
  if (!slow) return chances;
  return slow < 50 ? chances - Math.floor(snap((chances * slow) / 100)) : Math.floor(snap((chances * (100 - slow)) / 100));
};

/** A turn's charge of `gain` units (a shooter's cooldown, an Aggroed enemy's
 * stride) under `slow` percent Slowdown, a whole number. */
export const slowedCharge = (gain: number, slow: number) => Math.floor((gain * (100 - slow)) / 100);
/** Tick `tick` (from 1) of a charge of `gain` units a tick under `slow` percent
 * Slowdown: whole units that add up to the turn's `slowedCharge` of `gain` × 100,
 * since every saved cooldown is a whole number. */
export const slowedTickGain = (gain: number, slow: number, tick: number) =>
  slowedCharge(gain * tick, slow) - slowedCharge(gain * (tick - 1), slow);

const whole = (v: unknown) => v === undefined || wholeIn(v, 1, 1e9);
export const validDilation = (v: unknown): v is DilationRun => isRecord(v) && whole(v.timer) && whole(v.left);
