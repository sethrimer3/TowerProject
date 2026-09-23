/** Tower generation report: prints annotated floors plus aggregate quality
 * metrics across many seeds/depths.
 *   npm run tower:report                 → aggregate over 300 floors + 3 samples
 *   npm run tower:report -- 42 7         → one floor (seed 42, depth 7) in full */
import { towerFloorReport } from "../src/tower/index.ts";

const [seedArg, depthArg] = process.argv.slice(2).map(Number);
if (Number.isFinite(seedArg) && Number.isFinite(depthArg)) {
  console.log(towerFloorReport(seedArg, depthArg).text);
} else {
  const depths = [0, 1, 3, 6, 10, 15, 25, 40, 60, 90];
  const agg = {
    floors: 0, emptyDeadEnds: 0, longest: 0, longestMax: 0, interactions: 0, walkable: 0,
    branches: 0, unaffordable: 0, stairsBlocked: 0, shortcuts: 0, exchanges: 0, dropped: 0, ms: 0,
  };
  const archetypes: Record<string, number> = {};
  const patterns: Record<string, number> = {};
  for (let seed = 0; seed < 30; seed++)
    for (const depth of depths) {
      const t0 = performance.now();
      const { analysis: a } = towerFloorReport(seed * 7919 + 13, depth);
      agg.ms += performance.now() - t0;
      agg.floors++;
      agg.emptyDeadEnds += a.emptyDeadEnds;
      agg.longest += a.longestEmptyTraversal;
      agg.longestMax = Math.max(agg.longestMax, a.longestEmptyTraversal);
      agg.interactions += a.interactions;
      agg.walkable += a.walkable;
      agg.branches += a.strategicBranches;
      agg.unaffordable += a.keyEconomyComplete ? 0 : 1;
      agg.stairsBlocked += a.stairsKeyReachable ? 0 : 1;
      agg.shortcuts += a.shortcutsPlaced;
      agg.dropped += a.dropped;
      if (a.regions.some((r) => r.purpose === "exchange")) agg.exchanges++;
      archetypes[a.archetype] = (archetypes[a.archetype] ?? 0) + 1;
      for (const r of a.regions) patterns[r.pattern] = (patterns[r.pattern] ?? 0) + 1;
    }
  for (const [s, d] of [[1, 0], [2, 6], [3, 25]]) console.log(towerFloorReport(s, d).text + "\n");
  const n = agg.floors;
  console.log(`=== ${n} floors ===`);
  console.log(`avg ms/floor ${(agg.ms / n).toFixed(1)}`);
  console.log(`walkable tiles per interaction ${(agg.walkable / agg.interactions).toFixed(2)}`);
  console.log(`longest empty traversal avg ${(agg.longest / n).toFixed(2)} max ${agg.longestMax}`);
  console.log(`strategic branches avg ${(agg.branches / n).toFixed(2)} · shortcuts ${agg.shortcuts} · floors with exchange rooms ${agg.exchanges}`);
  console.log(`empty dead ends ${agg.emptyDeadEnds} · dropped rewards ${agg.dropped}`);
  console.log(`floors with an unaffordable door ${agg.unaffordable} · stairs key-blocked ${agg.stairsBlocked}`);
  console.log("archetypes", archetypes);
  console.log("patterns", patterns);
}
