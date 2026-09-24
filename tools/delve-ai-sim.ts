import { Game } from '../src/state.ts';
import { defaults } from '../src/save.ts';
import { World, LAYOUT_VERSION } from '../src/generation.ts';
import { chooseDelveStep, capabilities } from '../src/delve/automove.ts';
import { region } from '../src/delve/labyrinth.ts';
import { point } from '../src/entities.ts';

/** Runs Delve Automove headlessly at a given AI upgrade level and character
 * power, reporting how deep it gets and how it spent its resources. The
 * generator's pattern labels are only used here, for scoring the run. */
export type AiLevel = { aiMemory: number; aiEvaluation: number; aiLookahead: number };
export const AI_LEVELS: Record<string, AiLevel> = {
  naive: { aiMemory: 0, aiEvaluation: 0, aiLookahead: 0 },
  memory: { aiMemory: 2, aiEvaluation: 0, aiLookahead: 0 },
  judgment: { aiMemory: 2, aiEvaluation: 4, aiLookahead: 0 },
  full: { aiMemory: 2, aiEvaluation: 4, aiLookahead: 4 },
};
export function simulate(seed: number, level: AiLevel, opts: { steps?: number; hp?: number; attack?: number; defense?: number; keys?: number } = {}) {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1; g.save.upgrades.auto = 1;
  Object.assign(g.save.upgrades, level);
  g.switchMode('delve');
  g.run.seed = seed; g.run.outside = false; g.run.layoutVersion = LAYOUT_VERSION;
  g.run.changes = {}; g.run.height = 0; g.run.delveMilestone = 0; g.run.floor = 0;
  Object.assign(g.run.player, { x: 15, y: 0, hp: opts.hp ?? 400, maxHp: opts.hp ?? 400, attack: opts.attack ?? 14, defense: opts.defense ?? 4, keys: { yellow: opts.keys ?? 1, blue: 0, red: 0 } });
  g.world = new World(seed, g.run.changes);
  const run = g.run, caps = capabilities(g);
  const pockets = new Map<string, string>();
  const note = (a: number) => { for (const n of region(seed, a).nodes) if (n.pattern) pockets.set(point(n.x, n.y), n.pattern.quality); };
  note(0); note(1);
  const stats = { seed, steps: 0, depth: 0, hp: 0, kills: 0, keysSpent: 0, hpLost: 0, pockets: { good: 0, poor: 0, contextual: 0 } as Record<string, number>, ended: 'steps' };
  const seenPockets = new Set<string>();
  for (let i = 0; i < (opts.steps ?? 3000); i++) {
    const before = { ...run.player, keys: { ...run.player.keys } }, milestone = run.delveMilestone ?? 0;
    const step = chooseDelveStep(g, caps);
    if (!step) { stats.ended = 'stuck'; break; }
    if (!g.move(step.dx, step.dy)) { stats.ended = 'blocked'; break; }
    if (g.run !== run) { stats.ended = g.summary?.dead ? 'died' : 'ended'; break; }
    stats.steps++;
    const p = run.player, k = point(p.x, p.y);
    stats.keysSpent += Math.max(0, before.keys.yellow - p.keys.yellow) + Math.max(0, before.keys.blue - p.keys.blue) * 2;
    stats.hpLost += Math.max(0, before.hp - p.hp);
    if ((run.delveMilestone ?? 0) !== milestone) note((run.delveMilestone ?? 0) + 1);
    const q = pockets.get(k); if (q && !seenPockets.has(k)) { seenPockets.add(k); stats.pockets[q]++; }
  }
  stats.depth = run.height; stats.hp = run.player.hp; stats.kills = run.kills;
  return stats;
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('delve-ai-sim.ts')) {
  const seeds = Number(process.argv[2] ?? 8), steps = Number(process.argv[3] ?? 2500);
  for (const [name, level] of Object.entries(AI_LEVELS)) {
    const runs = Array.from({ length: seeds }, (_, s) => simulate(1000 + s, level, { steps }));
    const avg = (f: (r: typeof runs[number]) => number) => (runs.reduce((s, r) => s + f(r), 0) / runs.length).toFixed(1);
    console.log(`${name.padEnd(9)} depth ${avg(r => r.depth)}  steps ${avg(r => r.steps)}  hpLost ${avg(r => r.hpLost)}  keysSpent ${avg(r => r.keysSpent)}  poorPockets ${avg(r => r.pockets.poor)}  goodPockets ${avg(r => r.pockets.good)}  ends ${runs.map(r => r.ended[0]).join('')}  depths ${runs.map(r => r.depth).join(',')}`);
  }
}
