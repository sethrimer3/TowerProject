import { atWorst, breaksArmor, critAgainst, critMultiplier, guaranteedCrits, heroHit, instakill as instakills, netDamage, parriedEstimate, parryCut, predict, raisedAttack, replies, squaredUp, struckDamage, thornDamage, type CombatPrediction, type CritRule } from "./combat.ts";
import { snap } from "./exact.ts";
import type { Enemy, Player } from "./entities.ts";

/** What a fight against `enemy` may cost a hero with critical strikes. The
 * damage the hero takes depends on how many strikes the enemy lands, so the
 * forecast works out the odds of each fight length (every strike an
 * independent roll) and reads everything from them. Crits only help, so
 * `worst` (the guaranteed applications and no more) bounds the fight from
 * above and `best` (every roll lands, Super Critical too) from below. */
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
/** The most strikes the odds are worked out for when Super Critical gives a
 * strike more than two outcomes, which takes more work a strike. */
const MIXED_TURNS = 60;
/** Parts of the enemy's HP that totals of damage merge within, which keeps
 * that work bounded. */
const MIXED_PARTS = 1000;

/** One way a fight may end: after the hero's `t` strikes and the enemy's
 * `r` (`t` − 1, or `t` when its thorns fell it, one more against a Fast
 * enemy), with odds `chance`. */
type Ending = [t: number, r: number, chance: number];

/** Past `played` strikes (all of them unless given) a fight is estimated,
 * not played out (`predict`'s), and its odds are approximated. */
export function forecast(player: Player, enemy: Enemy, crit: CritRule, played = Infinity): CritForecast {
  // Power Strike and a boss's cuts, once, for the predictions and the odds alike.
  ({ player, enemy } = squaredUp(player, enemy));
  // The enemy cards' trees' Crit % and Crit x against it.
  crit = critAgainst(crit, player, enemy)!;
  const k = guaranteedCrits(crit.chance), extra = snap((crit.chance - 100 * k) / 100);
  const worst = predict(atWorst(player, crit), enemy, played);
  const topMultiplier = snap(critMultiplier(crit.factor, k + (extra > 0 ? 1 : 0)) * (crit.superCrit?.factor ?? 1));
  const best = predict({ ...player, attack: snap(player.attack * topMultiplier) }, enemy, played);
  if (worst.impervious || (worst.turns === best.turns && !worst.thornKill === !best.thornKill)) {
    const net = worst.impervious ? worst.damage : netDamage(player, worst);
    return { worst, best, expected: net, p10: net, p90: net, turns: worst.turns, survive: worst.survivable ? 1 : 0, instakill: instakills(worst) ? 1 : 0 };
  }
  const thorn = thornDamage(player, enemy), low = worst.hit, step = snap(best.hit - worst.hit);
  // Armor Break makes every strike's outcomes different, each strike's DEF lower than the last's.
  const breaks = breaksArmor(player, enemy), rate = player.armorBreak ?? 0, start = enemy.broken ?? 0, opening = enemy.fast ? 1 : 0;
  const brokenAt = (t: number) => snap(start + t * rate);
  const hits = crit.superCrit || breaks ? strikeOutcomes(player, enemy, crit, k, extra, breaks ? brokenAt(1) : undefined) : null;
  const hitsAt = (t: number) => (breaks ? strikeOutcomes(player, enemy, crit, k, extra, brokenAt(t)) : hits!);
  // Their average hit over a fight of the length an average strike's ATK makes it.
  const mean = breaks ? enemy.hp / predict({ ...player, attack: snap(player.attack * meanMultiplier(crit, k, extra)) }, enemy, played).turns : hits ? meanHit(hits) : low + extra * step;
  const odds = hits
    ? mixedOdds(enemy.hp, hitsAt, worst.turns, best.turns, thorn ? Infinity : Math.min(MIXED_TURNS, played), thorn, opening, mean, hitSpread(hits))
    : turnOdds(enemy.hp, low, step, extra, worst.turns, best.turns, thorn ? Infinity : Math.min(EXACT_TURNS, played), thorn, opening);
  const { cost, felled } = damageByStrikes(player, enemy, replies(worst), thorn ? Infinity : played, thorn, { mean, top: breaks ? Math.max(mean, enemy.hp / best.turns) : low + step });
  // A fight heals at most up to max HP; its damage is never capped by the HP
  // the hero has, so regenerating HP never moves the forecast.
  const floor = snap(player.hp - player.maxHp), capped = (t: number, r: number) => Math.max(floor, cost(t, r));
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

/** The damage the hero takes when the fight lasts `t` of its strikes and
 * `r` of the enemy's, as though it fought on whatever its HP, and whether
 * that fight fells it, summed once up to `most` enemy strikes, or up to
 * `played` and estimated past them. */
function damageByStrikes(player: Player, enemy: Enemy, most: number, played: number, thorn: number, hits: { mean: number; top: number }) {
  const sums: number[] = [0], shroud = player.shroud ?? 0, fatal = player.hp + shroud, defense = player.defense, cut = parryCut(player);
  // Lifesteal: each of the hero's `t` strikes restores that share of its
  // whole damage, overkill and all: on average the `mean` hit, but at least
  // the enemy's HP its thorns left and at most every strike the `top` hit.
  // Taken as equal parts as the strikes land (the cap at max
  // HP is left out here, and taken by the caller), so a fight may heal on
  // balance: its damage below 0.
  const healedAt = (t: number, r: number) => {
    if (!player.lifesteal) return 0;
    const left = Math.max(0, enemy.hp - r * thorn);
    const dealt = Math.min(t * hits.top, Math.max(left, t * hits.mean));
    return snap((dealt * player.lifesteal) / 100);
  };
  let attack = enemy.attack, sum = 0;
  const known = Math.min(most, played - 1);
  for (let r = 1; r <= known && sum <= Number.MAX_SAFE_INTEGER; r++) {
    sum = snap(sum + struckDamage(attack, defense, cut));
    sums.push(sum);
    attack = raisedAttack(attack);
  }
  const counted = sums.length - 1, from = attack, before = sum;
  // Past `played`, each strike's damage is estimated.
  const sumAt = (r: number) => (r <= counted || counted < known ? sums[Math.min(r, counted)]! : before + parriedEstimate(from, defense, r - counted, cut));
  const healsBefore = (t: number, r: number) => (healedAt(t, r) * Math.min(r, t)) / t;
  return {
    cost: (t: number, r: number) => {
      const s = sumAt(r), healed = healedAt(t, r);
      return healed ? snap(Math.max(0, s - shroud) - healed) : snap(Math.max(0, s - shroud));
    },
    felled: (t: number, r: number) => {
      const s = sumAt(r), healed = healedAt(t, r);
      return healed ? snap(s - shroud - healsBefore(t, r)) >= player.hp : s >= fatal;
    },
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
  return normalOdds(hp, low + chance * step, Math.sqrt(chance * (1 - chance)) * step, last, first, opening);
}

/** A long fight's endings: the strike count is nearly normal around hp /
 * `mean` damage, each strike's spread `sd`. */
function normalOdds(hp: number, mean: number, sd: number, last: number, first: number, opening: number): Ending[] {
  const out: Ending[] = [];
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

/** What one strike may deal when Super Critical gives it more than two outcomes. */
type Hit = { damage: number; chance: number };
/** A strike's outcomes under `crit`, `k` applications certain and `extra` the
 * chance of one more: each with any application may also be Super Critical.
 * With `broken`, Armor Break has that percent of the enemy's DEF off for it. */
function strikeOutcomes(player: Player, enemy: Enemy, crit: CritRule, k: number, extra: number, broken?: number): Hit[] {
  const hit = (multiplier: number) => {
    const raised = { ...player, attack: snap(player.attack * multiplier) };
    return broken === undefined ? predict(raised, enemy, 1).hit : Math.max(0, heroHit(raised, enemy, 1, broken));
  };
  const lands = Math.min(1, (crit.superCrit?.chance ?? 0) / 100), out: Hit[] = [];
  for (const [applications, chance] of [[k, 1 - extra], [k + 1, extra]] as const) {
    const multiplier = critMultiplier(crit.factor, applications);
    if (!applications) out.push({ damage: hit(multiplier), chance });
    else out.push({ damage: hit(multiplier), chance: chance * (1 - lands) }, { damage: lands ? hit(snap(multiplier * crit.superCrit!.factor)) : 0, chance: chance * lands });
  }
  return out.filter((h) => h.chance > 0);
}
const meanHit = (hits: Hit[]) => hits.reduce((sum, h) => sum + h.damage * h.chance, 0);
/** How far `hits` spread around their mean, one standard deviation. */
const hitSpread = (hits: Hit[]) => {
  const mean = meanHit(hits);
  return Math.sqrt(hits.reduce((sum, h) => sum + (h.damage - mean) * (h.damage - mean) * h.chance, 0));
};
/** What `crit` multiplies a strike's ATK by on average, `k` applications
 * certain and `extra` the chance of one more. */
function meanMultiplier(crit: CritRule, k: number, extra: number) {
  const lands = Math.min(1, (crit.superCrit?.chance ?? 0) / 100), superFactor = crit.superCrit?.factor ?? 1;
  const at = (applications: number) => critMultiplier(crit.factor, applications) * (applications ? 1 + lands * (superFactor - 1) : 1);
  return (1 - extra) * at(k) + extra * at(k + 1);
}

/** `turnOdds` for strikes with any number of outcomes, `hitsAt` of each
 * strike's number from 1, longest fight `last` strikes and shortest `first`:
 * worked out strike by strike up to `exact`, the damage dealt so far merged
 * within a thousandth of the enemy's HP, and past it from the `mean` hit and
 * its `spread`. */
function mixedOdds(hp: number, hitsAt: (t: number) => Hit[], last: number, first: number, exact: number, thorn: number, opening: number, mean: number, spread: number): Ending[] {
  if (last > exact) return normalOdds(hp, mean, spread, last, first, opening);
  const done = (dealt: number, thorns: number) => snap(dealt + thorns * thorn) >= hp;
  const part = hp / MIXED_PARTS, out: Ending[] = [];
  let live: [dealt: number, chance: number][] = [[0, 1]];
  for (let t = 1; t <= last; t++) {
    const hits = hitsAt(t), next = new Map<number, [number, number]>();
    let ended = 0, thorned = 0;
    for (const [dealt, odds] of live) {
      for (const { damage, chance } of hits) {
        const total = dealt + damage, share = odds * chance;
        if (done(total, t - 1 + opening)) ended += share;
        else if (thorn && done(total, t + opening)) thorned += share;
        else {
          const key = Math.round(total / part), merged = next.get(key);
          if (merged) merged[1] += share;
          else next.set(key, [total, share]);
        }
      }
    }
    live = [...next.values()];
    // Merged totals may fall a little short of the end the worst hits reach.
    if (t === last) for (const [, odds] of live) ended += odds;
    if (ended > 0) out.push([t, t - 1 + opening, ended]);
    if (thorned > 0) out.push([t, t + opening, thorned]);
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
