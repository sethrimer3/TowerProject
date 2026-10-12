import { performance } from "node:perf_hooks";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { random } from "../src/random.ts";
import { planHand, walkAll } from "../src/cards.ts";

/** Times the hand's pathing over seeded Delve runs: a fresh `planHand` on
 * every turn (more often than play plans, to measure the search), each
 * hand turn, and a Target walk to the farthest tile the hero can reach.
 * Compare the numbers before and after a change on the same machine.
 *
 *   npm run hand:bench -- [seeds] [turns]
 */
const seeds = Number(process.argv[2] ?? 12), turns = Number(process.argv[3] ?? 2500);

/** A strong hero's Delve run, entered, its hand playing. */
function delve(seed: number) {
  const save = defaults();
  Object.assign(save.tutorials, { climb: true, speed: true });
  Object.assign(save.upgrades, { delve: 1, target: 1 });
  const g = new Game(save, random(seed));
  g.switchMode("delve");
  g.enterRun();
  Object.assign(g.run.player, { attack: 40, defense: 25, hp: 5000, maxHp: 5000 });
  return g;
}

/** Sends Target to the farthest tile it can reach, and times each turn
 * until the hero arrives (or `limit` turns pass). */
function targetWalk(g: Game, limit = 2000) {
  const p = g.run.player, away = walkAll(g, p);
  const far = [...away].filter(([k]) => {
    const [x, y] = k.split(",").map(Number);
    return g.world.tile(x, y).kind === "floor";
  }).sort((a, b) => b[1] - a[1]);
  g.arm("target");
  const tile = far.find(([k]) => {
    const [x, y] = k.split(",").map(Number);
    return g.useArmed(x, y) === "used";
  });
  if (!tile) return null;
  let ms = 0, steps = 0;
  for (; g.run.targeted && steps < limit; steps++) {
    const t = performance.now();
    g.autoTurn();
    ms += performance.now() - t;
  }
  return { ms, steps };
}

let plans = 0, planMs = 0, handTurns = 0, turnMs = 0, walkMs = 0, walkSteps = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const g = delve(seed);
  for (let n = 0; n < turns && !g.handStuck && !g.fallen; n++) {
    let t = performance.now();
    planHand(g, g.hand, g.mode);
    planMs += performance.now() - t;
    plans++;
    t = performance.now();
    g.autoTurn();
    turnMs += performance.now() - t;
    handTurns++;
  }
  if (g.handStuck || g.fallen) continue;
  const walk = targetWalk(g);
  if (walk) (walkMs += walk.ms), (walkSteps += walk.steps);
}
const per = (ms: number, n: number) => (n ? (ms / n).toFixed(3) : "-");
console.log(`fresh planHand: ${per(planMs, plans)} ms over ${plans}`);
console.log(`hand turn:      ${per(turnMs, handTurns)} ms over ${handTurns}`);
console.log(`Target turn:    ${per(walkMs, walkSteps)} ms over ${walkSteps} steps`);
