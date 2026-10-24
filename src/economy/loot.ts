// A treasure chest's Gold. It takes an injected rng so probability is
// testable without flaky statistics and never touches Math.random() itself.
// (A Supply or Equipment Chest's finds are Equipment's: equipment/acquire.ts.)
export function rollGold(E: number, rng: () => number): number {
  return 3 + Math.floor(E / 5) + Math.floor(rng() * (4 + Math.floor(E / 10)));
}

/** What `rollGold` pays on average: Floor Skip Reward counts a chest it
 * never opens at this, so the payout is the same however the run goes. */
export const averageGold = (E: number) => 3 + Math.floor(E / 5) + (3 + Math.floor(E / 10)) / 2;
