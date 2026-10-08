import { analyzeDelve } from "./delve/analyzer.ts";
import { ownerAt, region, themeInfluence } from "./delve/labyrinth.ts";
import { capabilities } from "./delve/automove.ts";
import { towerFloorReport } from "./tower/index.ts";
import type { DefendPage } from "./defend/ui.ts";
import type { Game } from "./state.ts";
import type { MailDraft } from "./mail/server.ts";

/** The Dev mail `mailDebug.send()` posts when given nothing: an outage
 * notice with 20 Gems for it. */
export const OUTAGE_MAIL: MailDraft = {
  subject: "Sorry about the outage",
  body: "The servers were down for about an hour this morning, and some runs and purchases may not have gone through.\n\nEverything is back to normal now. Here are 20 Gems for the trouble.",
  items: [{ kind: "currency", currency: "gems", amount: 20 }],
};

/** Console-only developer aids (no UI):
 * - `towerDebug()` prints the strategic generation summary and map of the
 *   Tower floor currently being played.
 * - `delveDebug()` returns live Delve navigation diagnostics (dev mode only;
 *   no generation hints ever go to Automove).
 * - `defendDebug(seconds, { rain }?)` fast-forwards a running Defend battle,
 *   optionally forcing its weather.
 * - `tournamentDebug()` begins a tournament run now, until the Tournament
 *   page does (a Ticket spent, from a forest); it resolves to why it
 *   couldn't, or null once inside.
 * - `mailDebug.send({ subject, body, items }?)` posts a message to the
 *   stand-in Mail server's mailbox, as the server will send one (with
 *   nothing given, `OUTAGE_MAIL`), and asks it for the inbox.
 * - `boardBusy()` is true while the board is still moving on its own (a
 *   route being walked, a fight playing out), so the UI snapshot suite
 *   knows when a step has finished without waiting a fixed time. */

export function installDebugHooks(game: Game, defendPage: DefendPage, beginTournament: () => Promise<string | null>, sendMail: (draft: MailDraft) => Promise<void>) {
  const w = window as unknown as {
    towerDebug: () => void;
    delveDebug: () => unknown;
    defendDebug: typeof defendPage.fastForward;
    boardBusy: () => boolean;
    tournamentDebug: () => Promise<string | null>;
    mailDebug: { send: (draft?: Partial<MailDraft>) => Promise<void> };
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
  w.tournamentDebug = beginTournament;
  w.mailDebug = { send: (draft = {}) => sendMail({ ...OUTAGE_MAIL, ...draft }) };
  w.boardBusy = () => game.route.length > 0 || !!game.encounter;
}

function delveReport(game: Game) {
  const milestone = game.delveRun.milestone, p = game.run.player, seed = game.run.seed;
  const influence = themeInfluence(seed, p.x, p.y), blend = influence - Math.floor(influence);
  const seen = game.delvePlan.decisions ?? [];
  return {
    ...analyzeDelve(seed, milestone),
    progressionDepth: game.run.height, physicalY: p.y, physicalArea: ownerAt(seed, p.x, p.y),
    lastMilestone: milestone * 100, nextMilestone: (milestone + 1) * 100,
    transition: { gateId: `transition_${(milestone + 1) * 100}`, gate: region(seed, milestone).gate, crossed: false, previousSealed: milestone > 0 },
    themeBlend: { [`area${Math.floor(influence) + 1}`]: +(1 - blend).toFixed(2), [`area${Math.floor(influence) + 2}`]: +blend.toFixed(2) },
    knownTiles: Object.keys(game.save.delve.memory.known).length,
    branches: { frontiers: seen.filter(d => d.frontier).length, knownDeadEnds: seen.filter(d => d.deadEnd).length },
    capabilities: capabilities(game.save.upgrades), decisions: seen,
  };
}
