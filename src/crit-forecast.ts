import { atWorst, certainParry, critMultiplier, guaranteedCrits, instakill as instakills, netDamage, parriedAttack, parriedEstimate, parryCut, predict, raisedAttack, replies, thornDamage, type CombatPrediction, type CritRule } from "./combat.ts";
import { snap } from "./exact.ts";
import type { Enemy, Player } from "./entities.ts";

/** What a fight against `enemy` may cost a hero with critical strikes, or
 * whose parries Evade Prediction counts. The damage the hero takes depends
 * on how many strikes the enemy lands, so the forecast works out the odds
 * of each fight length (every strike an independent roll) and reads
 * everything from them; parries then spread each length's damage about
 * its mean. Crits and parries only help, so `worst` (the guaranteed
 * applications and no more, no parry that isn't certain) bounds the fight
 * from above and `best` (every roll lands) from below. */
export type CritForecast = {
  worst: CombatPrediction;
  best: CombatPrediction;
  /** The mean damage taken, a fight that fells the hero counting its whole
   * damage as though it fought on, so the HP the hero has never caps it;
   * below 0 when Lifesteal heals the hero more than the fight hurts it. */
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

/** One way a fight may end: after the hero's `t` strikes and the enemy's
 * `r` (`t` − 1, or `t` when its thorns fell it, one more against a Fast
 * enemy), with odds `chance`. */
type Ending = [t: number, r: number, chance: number];

/** The parries a forecast counts: each enemy strike's chance (0 to 1) and
 * the percent it cuts ATK by. */
type ParryOdds = { chance: number; cut: number };

/** Past `played` strikes (all of them unless given) a fight is estimated,
 * not played out (`predict`'s), and its odds are approximated. `parries`
 * counts the hero's parries (Evade Prediction), when they are a chance:
 * a certain parry is in every prediction already. */
export function forecast(player: Player, enemy: Enemy, crit: CritRule | undefined, parries = false, played = Infinity): CritForecast {
  const rule = crit ?? { chance: 0, factor: 1 };
  const k = guaranteedCrits(rule.chance), extra = snap((rule.chance - 100 * k) / 100);
  const parry: ParryOdds | null = parries && (player.parryChance ?? 0) > 0 && parryCut(player) > 0 && !certainParry(player) ? { chance: player.parryChance! / 100, cut: parryCut(player) } : null;
  const worst = predict(atWorst(player, crit), enemy, played);
  const topMultiplier = critMultiplier(rule.factor, k + (extra > 0 ? 1 : 0));
  const best = predict({ ...player, attack: snap(player.attack * topMultiplier), ...(parry ? { parryChance: 100 } : {}) }, enemy, played);
  const sameLength = worst.turns === best.turns && !worst.thornKill === !best.thornKill;
  if (worst.impervious || (sameLength && !parry)) {
    const net = worst.impervious ? worst.damage : netDamage(player, worst);
    return { worst, best, expected: net, p10: net, p90: net, turns: worst.turns, survive: worst.survivable ? 1 : 0, instakill: instakills(worst) ? 1 : 0 };
  }
  const thorn = thornDamage(player, enemy), low = worst.hit, step = snap(best.hit - worst.hit);
  const odds: Ending[] = sameLength ? [[worst.turns, replies(worst), 1]] : turnOdds(enemy.hp, low, step, extra, worst.turns, best.turns, thorn ? Infinity : Math.min(EXACT_TURNS, played), thorn, enemy.fast ? 1 : 0);
  const { cost, felled, spread } = damageByStrikes(player, enemy, replies(worst), thorn ? Infinity : played, thorn, parry, { low, step, extra });
  // A fight heals at most up to max HP; its damage is never capped by the HP
  // the hero has, so regenerating HP never moves the forecast.
  const floor = snap(player.hp - player.maxHp), capped = (t: number, r: number) => Math.max(floor, cost(t, r));
  if (parry) return parried(worst, best, odds, { cost: capped, felled, spread, floor: player.lifesteal ? floor : 0 });
  let expected = 0, turns = 0, survive = 0, instakill = 0, p10: number | null = null, p90: number | null = null, sum = 0;
  for (const [t, r, chance] of odds) {
    expected += chance * capped(t, r);
    turns += chance * t;
    if (!felled(t, r)) survive += chance;
    if (t === 1 && !r) instakill = chance;
    sum += chance;
    if (p10 === null && sum >= 0.1) p10 = capped(t, r);
    if (p90 === null && sum >= 0.9) p90 = capped(t, r);
  }
  return { worst, best, expected: snap(expected), p10: p10 ?? capped(best.turns, replies(best)), p90: p90 ?? capped(worst.turns, replies(worst)), turns, survive: Math.abs(1 - survive) < 1e-9 ? 1 : Math.min(1, survive), instakill };
}

/** The forecast once parries spread each fight length's damage: nearly
 * normal about its mean (`cost`, a mean `felled` judges by its spread), so
 * the chance to survive and the range sum each length's normal curve. */
function parried(worst: CombatPrediction, best: CombatPrediction, odds: Ending[], d: { cost: (t: number, r: number) => number; felled: (t: number, r: number) => number; spread: (r: number) => number; floor: number }): CritForecast {
  let expected = 0, turns = 0, survive = 0, instakill = 0;
  const curves = odds.map(([t, r, chance]) => ({ chance, mean: d.cost(t, r), sd: d.spread(r) }));
  for (const [t, r, chance] of odds) {
    expected += chance * d.cost(t, r);
    turns += chance * t;
    survive += chance * (1 - d.felled(t, r));
    if (t === 1 && !r) instakill = chance;
  }
  // The damage below which `share` of fights fall, found by halving.
  const below = (x: number) => curves.reduce((sum, c) => sum + c.chance * (c.sd ? normalCdf((x - c.mean) / c.sd) : c.mean <= x ? 1 : 0), 0);
  const quantile = (share: number) => {
    let lo = Math.min(...curves.map((c) => c.mean - 6 * c.sd)), hi = Math.max(...curves.map((c) => c.mean + 6 * c.sd));
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (below(mid) >= share) hi = mid;
      else lo = mid;
    }
    return snap(Math.max(d.floor, hi));
  };
  return { worst, best, expected: snap(expected), p10: quantile(0.1), p90: quantile(0.9), turns, survive: Math.abs(1 - survive) < 1e-9 ? 1 : Math.min(1, Math.max(0, survive)), instakill };
}

/** The damage the hero takes when the fight lasts `t` of its strikes and
 * `r` of the enemy's, as though it fought on whatever its HP, and whether
 * that fight fells it (with parries, the chance it does), summed once up to
 * `most` enemy strikes, or up to `played` and estimated past them. With
 * parries, `spread` is the standard deviation of `r` strikes' damage. */
function damageByStrikes(player: Player, enemy: Enemy, most: number, played: number, thorn: number, parry: ParryOdds | null, hits: { low: number; step: number; extra: number }) {
  const sums: number[] = [0], spreads: number[] = [0], shroud = player.shroud ?? 0, fatal = player.hp + shroud, defense = player.defense;
  const sure = certainParry(player) ? parryCut(player) : 0;
  // Lifesteal: each of the hero's `t` strikes restores that share of its
  // whole damage, overkill and all: on average `low` plus `extra` of a crit's
  // `step`, but at least the enemy's HP its thorns left and at most every
  // strike a crit. Taken as equal parts as the strikes land (the cap at max
  // HP is left out here, and taken by the caller), so a fight may heal on
  // balance: its damage below 0.
  const healedAt = (t: number, r: number) => {
    if (!player.lifesteal) return 0;
    const left = Math.max(0, enemy.hp - r * thorn), mean = hits.low + hits.extra * hits.step;
    const dealt = Math.min(t * (hits.low + hits.step), Math.max(left, t * mean));
    return snap((dealt * player.lifesteal) / 100);
  };
  let attack = enemy.attack, sum = 0, variance = 0;
  const known = Math.min(most, played - 1);
  for (let r = 1; r <= known && sum <= Number.MAX_SAFE_INTEGER; r++) {
    const plain = Math.max(0, parriedAttack(attack, sure) - defense);
    if (!parry) sum = snap(sum + plain);
    else {
      const cut = Math.max(0, parriedAttack(attack, parry.cut) - defense);
      sum = snap(sum + plain + parry.chance * (cut - plain));
      variance += parry.chance * (1 - parry.chance) * (plain - cut) * (plain - cut);
    }
    sums.push(sum);
    spreads.push(Math.sqrt(variance));
    attack = raisedAttack(attack);
  }
  const counted = sums.length - 1, from = attack, before = sum;
  // Past `played`, each strike's damage is estimated, parried or not.
  const sumAt = (r: number) => {
    if (r <= counted || counted < known) return sums[Math.min(r, counted)]!;
    const plain = parriedEstimate(from, defense, r - counted, sure);
    return before + (parry ? plain + parry.chance * (parriedEstimate(from, defense, r - counted, parry.cut) - plain) : plain);
  };
  const healsBefore = (t: number, r: number) => (healedAt(t, r) * Math.min(r, t)) / t;
  const spread = (r: number) => spreads[Math.min(r, counted)]!;
  return {
    cost: (t: number, r: number) => {
      const s = sumAt(r), healed = healedAt(t, r);
      return healed ? snap(Math.max(0, s - shroud) - healed) : snap(Math.max(0, s - shroud));
    },
    felled: (t: number, r: number) => {
      const s = sumAt(r), healed = healedAt(t, r);
      const over = healed ? player.hp + shroud + healsBefore(t, r) : fatal, sd = spread(r);
      if (!parry || !sd) return (healed ? snap(s - shroud - healsBefore(t, r)) >= player.hp : s >= fatal) ? 1 : 0;
      return 1 - normalCdf((over - s) / sd);
    },
    spread,
  };
}

/** The odds of each way a fight may end, for each length from `first` to
 * `last` strikes of the hero's that has any: every strike deals `low`, or
 * `low + step` with probability `chance`, each enemy strike costs it
 * `thorn`, the enemy striking `opening` times (a Fast enemy's once) before
 * the hero's first, and the fight ends once the enemy's `hp` is gone,
 * exactly when it lasts at most `exact` strikes. */
function turnOdds(hp: number, low: number, step: number, chance: number, last: number, first: number, exact: number, thorn = 0, opening = 0): Ending[] {
  const done = (t: number, rolls: number, thorns: number) => snap(thorn && thorns ? t * low + rolls * step + thorns * thorn : t * low + rolls * step) >= hp;
  const out: Ending[] = [];
  if (last <= exact) {
    // pmf[j]: the odds j of the strikes so far rolled the higher hit and the fight is still on.
    let pmf = [1];
    for (let t = 1; t <= last; t++) {
      const next = new Array<number>(t + 1).fill(0);
      for (let j = 0; j < t; j++) {
        next[j]! += pmf[j]! * (1 - chance);
        next[j + 1]! += pmf[j]! * chance;
      }
      // The hero's strike ends it, or else the thorns of the enemy's reply.
      let ended = 0, thorned = 0;
      for (let j = 0; j <= t; j++) {
        if (done(t, j, t - 1 + opening)) {
          ended += next[j]!;
          next[j] = 0;
        } else if (thorn && done(t, j, t + opening)) {
          thorned += next[j]!;
          next[j] = 0;
        }
      }
      pmf = next;
      if (t >= first && ended > 0) out.push([t, t - 1 + opening, ended]);
      if (thorned > 0) out.push([t, t + opening, thorned]);
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
    out.push([t, t - 1 + opening, Math.max(0, upTo - before)]);
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
