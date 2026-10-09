import { atWorst, critMultiplier, guaranteedCrits, predict, raisedAttack, type CombatPrediction, type CritRule } from "./combat.ts";
import { snap } from "./exact.ts";
import type { Enemy, Player } from "./entities.ts";

/** What a fight against `enemy` may cost a hero with critical strikes. The
 * damage the hero takes depends only on how many strikes the fight lasts,
 * so the forecast works out the odds of each length (every strike an
 * independent roll) and reads everything from them. Crits only help, so
 * `worst` (the guaranteed applications and no more) bounds the fight from
 * above and `best` (every roll lands) from below. */
export type CritForecast = {
  worst: CombatPrediction;
  best: CombatPrediction;
  /** The mean damage taken, a fight that fells the hero counting the HP it had. */
  expected: number;
  /** The damage the hero takes in 10% of fights at most, and in 90% of fights at most. */
  p10: number;
  p90: number;
  /** The mean number of the hero's strikes the fight takes. */
  turns: number;
  /** The chance the hero survives, and that its first strike wins. */
  survive: number;
  instakill: number;
};

/** The most strikes the exact odds are worked out for; a longer fight uses a
 * normal approximation. */
const EXACT_TURNS = 400;
/** The strikes of a longer fight the approximation lists, around the mean. */
const SPREAD_TURNS = 400;

export function forecast(player: Player, enemy: Enemy, crit: CritRule): CritForecast {
  const k = guaranteedCrits(crit.chance), extra = snap((crit.chance - 100 * k) / 100);
  const worst = predict(atWorst(player, crit), enemy);
  const topMultiplier = critMultiplier(crit.factor, k + (extra > 0 ? 1 : 0));
  const best = predict({ ...player, attack: snap(player.attack * topMultiplier) }, enemy);
  if (worst.impervious || worst.turns === best.turns) return { worst, best, expected: worst.damage, p10: worst.damage, p90: worst.damage, turns: worst.turns, survive: worst.survivable ? 1 : 0, instakill: worst.turns === 1 ? 1 : 0 };
  const low = worst.hit, step = snap(best.hit - worst.hit);
  const odds = turnOdds(enemy.hp, low, step, extra, worst.turns, best.turns);
  const cost = damageByTurns(player, enemy, worst.turns);
  const capped = (t: number) => Math.min(player.hp, cost(t));
  let expected = 0, turns = 0, survive = 0, instakill = 0, p10: number | null = null, p90: number | null = null, sum = 0;
  for (const [t, chance] of odds) {
    expected += chance * capped(t);
    turns += chance * t;
    if (cost(t) < player.hp) survive += chance;
    if (t === 1) instakill = chance;
    sum += chance;
    if (p10 === null && sum >= 0.1) p10 = capped(t);
    if (p90 === null && sum >= 0.9) p90 = capped(t);
  }
  return { worst, best, expected: snap(expected), p10: p10 ?? capped(best.turns), p90: p90 ?? capped(worst.turns), turns, survive: Math.abs(1 - survive) < 1e-9 ? 1 : Math.min(1, survive), instakill };
}

/** The damage the hero takes when the fight lasts `t` strikes (Infinity when
 * that is more than it can take), summed once up to `most` strikes. */
function damageByTurns(player: Player, enemy: Enemy, most: number) {
  const taken: number[] = [0], shroud = player.shroud ?? 0, fatal = player.hp + shroud;
  let attack = enemy.attack, sum = 0;
  for (let t = 1; t <= most; t++) {
    if (t > 1) {
      sum = snap(sum + Math.max(0, attack - player.defense));
      attack = raisedAttack(attack);
    }
    taken.push(sum >= fatal ? Infinity : snap(Math.max(0, sum - shroud)));
    if (sum >= fatal) break;
  }
  return (t: number) => taken[Math.min(t, taken.length - 1)]!;
}

/** The odds that a fight lasts exactly `t` strikes, for each `t` from `first`
 * to `last` that has any: every strike deals `low`, or `low + step` with
 * probability `chance`, and the fight ends once the enemy's `hp` is gone. */
function turnOdds(hp: number, low: number, step: number, chance: number, last: number, first: number): [number, number][] {
  const done = (t: number, rolls: number) => snap(t * low + rolls * step) >= hp;
  const out: [number, number][] = [];
  if (last <= EXACT_TURNS) {
    // pmf[j]: the odds j of the strikes so far rolled the higher hit and the fight is still on.
    let pmf = [1];
    for (let t = 1; t <= last; t++) {
      const next = new Array<number>(t + 1).fill(0);
      for (let j = 0; j < t; j++) {
        next[j]! += pmf[j]! * (1 - chance);
        next[j + 1]! += pmf[j]! * chance;
      }
      let ended = 0;
      for (let j = 0; j <= t; j++) {
        if (done(t, j)) {
          ended += next[j]!;
          next[j] = 0;
        }
      }
      pmf = next;
      if (t >= first && ended > 0) out.push([t, ended]);
    }
    return out;
  }
  // A long fight: the strike count is nearly normal around hp / mean damage.
  const mean = low + chance * step, sd = Math.sqrt(chance * (1 - chance)) * step;
  const centre = hp / mean, spread = (sd / mean) * Math.sqrt(centre);
  let from = Math.max(first, Math.floor(centre - 4 * spread)), to = Math.min(last, Math.ceil(centre + 4 * spread));
  if (to - from > SPREAD_TURNS) to = from + SPREAD_TURNS;
  let before = normalCdf((from - 1 - centre) / spread);
  for (let t = from; t <= to; t++) {
    const upTo = t === last ? 1 : normalCdf((t - centre) / spread);
    out.push([t, Math.max(0, upTo - before)]);
    before = upTo;
  }
  return out;
}

/** The standard normal's CDF (Abramowitz and Stegun 7.1.26). */
function normalCdf(z: number) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z < 0 ? (1 - erf) / 2 : (1 + erf) / 2;
}
