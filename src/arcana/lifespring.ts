import { snap } from "../exact.ts";
import { isRecord, wholeIn } from "../save/decode.ts";

// Lifespring (docs/agents/arcana.md): its cooldown sets off Effect Waves, one
// every few turns, each hitting every enemy on the floor at once, then a field
// round the hero with an HP Pool, which spends itself on the enemies it touches.
// This module is its rules: it reads nothing of the game but what it is given.

/** The turns from one Effect Wave to the next, and from the last to the field. */
export const WAVE_INTERVAL = 4;
/** The turns the rings stay blue once a new activation adds to a pool not yet spent. */
export const TINT_TURNS = 5;

/** What a run keeps of Lifespring, in the run so undo takes it all back: the
 * cooldown's turns left, the Effect Waves still to come and the turns until the
 * next of them or the field (`wait`, absent while none is under way), the HP
 * Pool, the turns the rings stay blue, and the percent of max HP its Health Bonus
 * has added. */
export type LifespringRun = { timer?: number; waves?: number; wait?: number; pool?: number; tint?: number; health?: number };

/** What Lifespring gives, for research to raise: Health Bonus's percent of max
 * HP an enemy a wave or the field touched pays when it falls and the factor it stops at, the field's
 * damage multiplied per wave hit (`amplify`), the factor on Gold and the
 * additional share of Cells an enemy hit pays, and the percent of DEF a wave takes off. */
export type LifespringEffects = { healthPerKill: number; healthLimit: number; amplify: number; gold: number; cells: number; defense: number };
export const lifespringEffects = (_save: unknown): LifespringEffects => ({ healthPerKill: 0.05, healthLimit: 5, amplify: 5, gold: 1, cells: 0, defense: 0 });

/** What the field multiplies its damage by against an enemy `waves` Effect Waves have hit. */
export const springAmplify = (amplify: number, waves: number) => (waves > 0 ? amplify * waves : 1);

/** What Lifespring's Health Bonus multiplies hero stat `stat` by now. */
export const lifespringFactor = (run: { lifespring?: LifespringRun }, stat: string) => (stat === "maxHp" ? 1 + (run.lifespring?.health ?? 0) / 100 : 1);

/** What one turn did: an Effect Wave fired, or the field formed. */
export type LifespringStep = { wave?: true; formed?: true };

/** One turn of Lifespring: the blue fades, the cooldown runs (restarting the
 * moment it runs out, whatever is under way), and what is under way goes on. A
 * field forming adds `amount` to the pool, and with a pool still held, turns blue. */
export function stepLifespring(s: LifespringRun, { waves, turns, amount }: { waves: number; turns: number; amount: number }): LifespringStep {
  if (s.tint) {
    if (s.tint > 1) s.tint--;
    else delete s.tint;
  }
  const left = Math.min(s.timer ?? turns, turns) - 1;
  s.timer = left <= 0 ? turns : left;
  if (left <= 0) {
    s.waves = (s.waves ?? 0) + waves;
    s.wait ??= 0;
  }
  if (s.wait === undefined) return {};
  if (s.wait > 0 && --s.wait > 0) return {};
  if (s.waves) {
    if (s.waves > 1) s.waves--;
    else delete s.waves;
    s.wait = WAVE_INTERVAL;
    return { wave: true };
  }
  delete s.wait;
  if (s.pool) s.tint = TINT_TURNS;
  s.pool = snap((s.pool ?? 0) + amount);
  return { formed: true };
}

/** Switched off: the cooldown, the waves under way and the pool are gone; the
 * Health Bonus already earned stays. */
export function clearLifespring(s: LifespringRun | undefined) {
  if (!s) return;
  delete s.timer;
  delete s.waves;
  delete s.wait;
  delete s.pool;
  delete s.tint;
}

/** The field against an enemy of `hp` HP, damage multiplied by `rate`: the pool
 * pays exactly what felling it costs, or else all it has, prorated. */
export function fieldHit(pool: number, hp: number, rate: number) {
  const cost = snap(hp / rate);
  return pool >= cost ? { damage: hp, pool: snap(pool - cost) } : { damage: snap(pool * rate), pool: 0 };
}

const whole = (v: unknown, least: number) => v === undefined || wholeIn(v, least, 1e9);
const positive = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v > 0);
export const validLifespring = (v: unknown): v is LifespringRun =>
  isRecord(v) && whole(v.timer, 1) && whole(v.waves, 1) && whole(v.wait, 1) && positive(v.pool) && whole(v.tint, 1) && positive(v.health);
