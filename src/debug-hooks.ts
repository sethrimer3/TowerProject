import { analyzeDelve } from "./delve/analyzer.ts";
import { ownerAt, region, themeInfluence } from "./delve/labyrinth.ts";
import { capabilities, decisions } from "./delve/automove.ts";
import { towerFloorReport } from "./tower/index.ts";
import type { DefendPage } from "./defend/ui.ts";
import type { Game } from "./state.ts";

/** Console-only developer aids (no UI):
 * - `towerDebug()` prints the strategic generation summary and map of the
 *   Tower floor currently being played.
 * - `delveDebug()` returns live Delve navigation diagnostics (dev mode only;
 *   no generation hints ever go to Automove).
 * - `defendDebug(seconds, { rain }?)` fast-forwards a running Defend battle,
 *   optionally forcing its weather. */
export function installDebugHooks(game: Game, defendPage: DefendPage) {
  const w = window as unknown as {
    towerDebug: () => void;
    delveDebug: () => unknown;
    defendDebug: typeof defendPage.fastForward;
  };
  w.towerDebug = () => {
    const text = towerFloorReport(game.save.tower.run?.seed ?? game.run.seed, game.save.tower.run?.height ?? 0).text;
    console.log(text);
  };
  w.delveDebug = () => {
    if (!game.save.settings.devMode || game.mode !== "delve") return null;
    const report = delveReport(game);
    console.log(report);
    return report;
  };
  w.defendDebug = (s, weather) => defendPage.fastForward(s, weather);
}

function delveReport(game: Game) {
  const milestone = game.run.delveMilestone ?? 0, p = game.run.player, seed = game.run.seed;
  const influence = themeInfluence(seed, p.x, p.y), blend = influence - Math.floor(influence);
  const seen = decisions.get(game) ?? [];
  return {
    ...analyzeDelve(seed, milestone),
    progressionDepth: game.run.height, physicalY: p.y, physicalArea: ownerAt(seed, p.x, p.y),
    lastMilestone: milestone * 100, nextMilestone: (milestone + 1) * 100,
    transition: { gateId: `transition_${(milestone + 1) * 100}`, gate: region(seed, milestone).gate, crossed: false, previousSealed: milestone > 0 },
    themeBlend: { [`area${Math.floor(influence) + 1}`]: +(1 - blend).toFixed(2), [`area${Math.floor(influence) + 2}`]: +blend.toFixed(2) },
    knownTiles: Object.keys(game.run.delveKnown ?? {}).length,
    branches: { frontiers: seen.filter(d => d.frontier).length, knownDeadEnds: seen.filter(d => d.deadEnd).length },
    capabilities: capabilities(game), decisions: seen,
  };
}
