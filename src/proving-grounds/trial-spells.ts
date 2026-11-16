import type { ArcanaRun } from "../arcana/arcana.ts";
import type { LifespringRun, LifespringStep } from "../arcana/lifespring.ts";
import { beamFactor, type Beams } from "../arcana/overseer.ts";
import { frostArea, frostSlowAt, type FrostEffects, type FrostFreeze, type FrostRun, type Necro } from "../arcana/necrotic-frost.ts";
import type { PhantasmRun } from "../arcana/phantasm.ts";
import { slowedAct, togetherSlow, type DilationRun } from "../arcana/time-dilation.ts";
import { inVortex, type VoidwellRun, type VortexZone } from "../arcana/voidwell.ts";
import { snap } from "../exact.ts";
import type { Spot } from "./arena.ts";
import type { TrialState } from "./trial.ts";

// What a trial attempt holds of the hero's arcana (docs/agents/arcana.md).
// `session.ts` fills `spells` from the Arcana desk before each turn; the rest
// of the trial reads only these.

/** The arcana held and on, as the desk gives them. */
export type TrialSpells = {
  /** `shock`: Ricochet Shock's chance a strike shocks its foe, in hundredths of a percent. */
  ricochet?: { boost: number; rebounds: number; chance: number; shock?: number };
  /** Shock Multiplier, once Ricochet Shock is researched: what the hero's ATK is multiplied by on a shocked foe. */
  shock?: number;
  /** `amplify`: Thunderbolt Amplifier's factor a hit, in tenths; `radius`: Thunderbolt Expansion's, in tenths of a tile. */
  thunderbolt?: { boost: number; bolts: number; turns: number; amplify?: number; radius?: number };
  /** Overseer Zap, once researched while Overseer is held and on: its cooldown, and its strike's share of ATK before the beams. */
  zap?: { boost: number; turns: number };
  /** `reach`: the field's, in hundredths of a tile; `amplify`: its Damage Amplification a wave, as researched. */
  lifespring?: { hp: number; waves: number; turns: number; reach: number; amplify: number };
  /** `slow`: the percent its field slows what is in it by; `reach`: the field's, in hundredths of a tile. */
  timeDilation?: { duration: number; slow: number; turns: number; reach: number };
  phantasm?: { boost: number; quantity: number; turns: number; blast: number; spin: number; drain?: number; stun?: number };
  /** `freeze`: Necrotic Freeze, once researched. */
  necroticFrost?: { boost: number; duration: number; turns: number; effects: FrostEffects; freeze?: FrostFreeze };
  /** `radius`: its vortex's, in tiles; `reach`: how far from the hero it opens, in hundredths of a tile;
   * `twin`, Extra Voidwell; `damage`, Voidwell Damage, in hundredths of a percent of total HP a turn;
   * `gold`, Voidwell Gold Bonus, in tenths (10: none). */
  voidwell?: { radius: number; duration: number; turns: number; reach: number; twin?: boolean; damage?: number; gold?: number };
  beams?: Pick<Beams, "count" | "width" | "bonus">;
  /** Whether Overseer is held, on or off: its beams turn on either way. */
  overseer: boolean;
};
/** An arcanum's strike of the last turn, for the board to show. */
export type TrialStrike = { kind: "ricochet" | "thunderbolt" | "lifespring" | "phantasm" | "necro" | "voidwell"; from: Spot; to: Spot; damage: number; tick: number; splash?: true };
/** The attempt's arcana: its toggles, cooldowns and bolts, the turns Overseer's
 * beams have turned, Lifespring's state and the Effect Waves it has fired
 * (`springWaves`), and Time Dilation's: its field and cooldown (`dilation`), each
 * foe's tally on what it does (`tallies`), and how far its field has held back the
 * clocks of the boss's effects and its Blaster Turret's, in hundredths of a turn
 * (`lag`), Phantasm's (`phantasm`) and Necrotic Frost's: its cooldown and fields (`frost`), what is on each foe (`necro`) and the fields each stood in as the last turn ended (`frostIn`, Necrotic Freeze), and Voidwell's cooldown and vortex (`voidwell`), the Thunderbolt bolts that have hit each foe (`bolted`, Thunderbolt Amplifier), and each foe's turns of stun left (`stuns`, Phantasm Stun and Necrotic Freeze), and the foes Ricochet Shock has shocked (`shocked`, by key), all saved with it; `spells`, what strikes this turn, `struck`, what
 * the hero's step strikes, `strikes` and `springStep`, what Lifespring did last turn, aren't saved. */
export type TrialArcana = { run: ArcanaRun; beamTurns: number; lifespring?: LifespringRun; springWaves?: number; dilation?: DilationRun; tallies?: Record<string, number>; lag?: Partial<Record<BossClock, number>>; phantasm?: PhantasmRun; frost?: FrostRun; necro?: Record<string, Necro>; frostIn?: Record<string, number[]>; voidwell?: VoidwellRun; bolted?: Record<string, number>; stuns?: Record<string, number>; shocked?: string[]; spells?: TrialSpells; struck?: Spot & { foe: object }; strikes?: TrialStrike[]; springStep?: LifespringStep };

/** The clocks Time Dilation can hold back: the boss's own effects, and its Blaster Turret's. */
export type BossClock = "boss" | "turret";

/** The percent Time Dilation's and Necrotic Frost's fields slow what stands at `at` by this turn. */
export function slowedAt(s: TrialState, at: Spot) {
  const a = s.arcana, rule = a?.spells?.timeDilation, frost = a?.spells?.necroticFrost, fields = a?.frost?.fields;
  const dx = at.x - s.player.x, dy = at.y - s.player.y;
  return togetherSlow(rule && a?.dilation?.left && (dx * dx + dy * dy) * 10_000 <= rule.reach * rule.reach ? rule.slow : 0, frost && fields ? frostSlowAt(frostArea(fields, frost.effects), dx, dy) : 0);
}
/** Voidwell's vortex (and its twin) while one stands and it is held and on. */
export function trialVortex(s: TrialState): VortexZone | undefined {
  const rule = s.arcana?.spells?.voidwell, v = s.arcana?.voidwell?.vortex;
  return rule && v ? { x: v.x, y: v.y, radius: rule.radius, wrap: 0, ...(v.twin ? { twin: v.twin } : {}) } : undefined;
}
/** Whether what stands at `at`, the boss aside (it is immune), is stunned by Voidwell's vortex this turn. */
export function stunnedIn(s: TrialState, at: Spot) {
  const zone = trialVortex(s);
  return !!zone && inVortex(zone, at.x, at.y);
}
/** What Voidwell Gold Bonus multiplies the Gold dropped at `at` by: its factor while `at` lies in a vortex, the boss's own tile too, else 1. */
export function voidwellGoldAt(s: TrialState, at: Spot) {
  const tenths = s.arcana?.spells?.voidwell?.gold ?? 10, zone = tenths === 10 ? undefined : trialVortex(s);
  return zone && inVortex(zone, at.x, at.y) ? tenths / 10 : 1;
}
/** Whether the foe `key` (by `Target.key`: `boss`, `slime:<id>` …) has turns of a Phantasm stun left. */
export const phantasmStunned = (s: TrialState, key: string) => !!s.arcana?.stuns?.[key];
/** The foe a boss clock belongs to, whose Phantasm stun holds it. */
const CLOCK_FOE: Record<BossClock, string> = { boss: "boss", turret: "part:turret" };
/** Whether the foe `key`, standing at `at`, does what it is about to (a counter, a
 * bite, a step): always, unless a Phantasm stun holds it, which stops all of it, or a
 * vortex stuns it, which stops its steps (`move:` keys, but the boss's) but not its
 * answer to a hit, or Time Dilation's field holds it back. Its tally goes on from one
 * chance to the next, however far apart. */
export function foeActs(s: TrialState, at: Spot, key: string) {
  if (phantasmStunned(s, key.startsWith("move:") ? key.slice(5) : key)) return false;
  if (key.startsWith("move:") && key !== "move:boss" && stunnedIn(s, at)) return false;
  const slow = slowedAt(s, at);
  if (!slow) return true;
  const tallies = (s.arcana!.tallies ??= {}), { acts, tally } = slowedAct(tallies[key] ?? 0, slow);
  if (tally) tallies[key] = tally;
  else delete tallies[key];
  return acts;
}
/** Where a boss clock stands, in hundredths of a turn: the attempt's turns, less
 * what Time Dilation's field has held it back. */
export const bossClock = (s: TrialState, clock: BossClock = "boss") => s.steps * 100 - (s.arcana?.lag?.[clock] ?? 0);
/** The turn the attempt just counted, for what stands at `at` on `clock`: its field
 * holds the clock back by its Slowdown, a vortex stops the turret's, and a Phantasm stun on
 * its foe (the boss, or the Blaster Turret) stops it while it lasts. Returns whether an effect every `interval`
 * turns falls due this turn, `offset` turns into each: the clock passed that mark,
 * and whatever it passed by rolls on toward the next. */
export function bossTurn(s: TrialState, at: Spot, clock: BossClock = "boss") {
  const before = bossClock(s, clock) - 100, slow = phantasmStunned(s, CLOCK_FOE[clock]) || (clock === "turret" && stunnedIn(s, at)) ? 100 : slowedAt(s, at);
  if (slow) {
    const lag = (s.arcana!.lag ??= {});
    lag[clock] = snap((lag[clock] ?? 0) + slow);
  }
  const now = bossClock(s, clock);
  return (interval: number, offset = 0) => Math.floor((now - offset * 100) / (interval * 100)) > Math.floor((before - offset * 100) / (interval * 100));
}
/** The turns until an effect every `interval` turns falls due, as it counts them. */
export const bossDueIn = (s: TrialState, interval: number) => snap(interval - (bossClock(s) / 100) % interval);

/** The hero's ATK on a hit at `at`: Overseer's beams as the turn begins multiply
 * it, and Shock Multiplier when Ricochet Shock has shocked the foe (named by `key`). */
export function heroAttackOn(s: TrialState, at: Spot, key?: string) {
  const a = s.arcana, beams = a?.spells?.beams, shock = a?.spells?.shock && key && a.shocked?.includes(key) ? a.spells.shock : 1;
  const attack = beams ? s.player.attack * beamFactor({ ...beams, turns: a.beamTurns }, 0, at.x - s.player.x, at.y - s.player.y) : s.player.attack;
  return shock === 1 ? attack : attack * shock;
}
