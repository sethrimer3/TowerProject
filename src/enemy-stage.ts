/** The enemy stage's rules, shared by the Tower and the Delve
 * (docs/ENEMY_SCHEDULE.md section 3): how many enemies to add for the
 * schedule's count, and which strength each enemy stands at for its shares.
 * Every draw comes from the stream the caller passes. */
import { RANKED_STRENGTHS, enemyCountPercent, enemyShare, type RankedStrength } from "./enemy-schedule.ts";

/** Floor `depth`'s (0 is the first) shares of tower `tower`, in
 * `RANKED_STRENGTHS` order. */
export const sharesOn = (depth: number, tower: number) => RANKED_STRENGTHS.map((k) => enemyShare(k, depth, tower));

/** How many enemies to add to a floor of `baseline` enemies for floor
 * `depth`'s count: the whole part, and one more at the fraction's chance. */
export function extraEnemies(baseline: number, depth: number, rng: () => number) {
  const hundredths = baseline * (enemyCountPercent(depth) - 100);
  const whole = Math.floor(hundredths / 100);
  return whole + (rng() * 100 < hundredths - whole * 100 ? 1 : 0);
}

/** A strength drawn from `shares` (percents in `RANKED_STRENGTHS` order). */
export function drawStrength(shares: readonly number[], rng: () => number): RankedStrength {
  let roll = rng() * 100;
  for (let i = 0; i < shares.length; i++) if ((roll -= shares[i]) < 0) return RANKED_STRENGTHS[i];
  // Rounding left the roll at the very top: the strongest with a share.
  let last = shares.length - 1;
  while (last > 0 && !shares[last]) last--;
  return RANKED_STRENGTHS[last];
}

const ORDER: Record<RankedStrength, number> = { weak: 0, normal: 1, strong: 2, elite: 3 };

/** The strength each of `asked` stands at, in the same order: the enemies
 * taken weakest asked first (ties in a random order, drawn before sorting),
 * then dealt the shares' strengths weakest first, each strength's count
 * the whole of its share and its fraction by chance, from one offset drawn
 * for the floor (systematic sampling: every count within one of its
 * share, and right on average). */
export function rankStrengths(asked: readonly RankedStrength[], shares: readonly number[], rng: () => number): RankedStrength[] {
  const n = asked.length;
  if (!n) return [];
  const keys = asked.map(() => rng());
  const order = asked.map((_, i) => i).sort((a, b) => ORDER[asked[a]] - ORDER[asked[b]] || keys[a] - keys[b]);
  const offset = rng(), out = new Array<RankedStrength>(n);
  let k = 0, cum = shares[0];
  order.forEach((i, rank) => {
    // The rank's place in percent of the floor: (rank + offset) / n · 100.
    while (k < shares.length - 1 && (rank + offset) * 100 >= cum * n) cum += shares[++k];
    out[i] = RANKED_STRENGTHS[k];
  });
  return out;
}
