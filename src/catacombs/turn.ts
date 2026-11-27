// One Catacomb turn (docs/CATACOMBS.md): a dash, a round of combat, a
// pickup, a descent or a restart, chosen by the hero's next target. Pure:
// it changes only the CatacombSave it is given and reports what it earned,
// so the game credits the Lore (`save.cells`) and draws what happened.
import { snap } from "../exact.ts";
import { INGOTS, SPIRIT_RARITIES, undeadRewards, undeadStats, type IngotId, type SpiritRarity } from "./catalog.ts";
import { hallTargets, type Target } from "./hall.ts";
import { heroStats } from "./magic.ts";
import { enterHall, startRun, type CatacombSave } from "./state.ts";

export type TurnEvent =
  | { kind: "dash"; x: number; y: number }
  | { kind: "round"; slot: number; heroHit: number; enemyHit: number; killed: boolean }
  | { kind: "pickup"; target: Extract<Target, { kind: "lore" | "ingot" }> }
  | { kind: "descend"; hall: number }
  | { kind: "fall" }
  | { kind: "restart"; stalemate: boolean };

/** What turns earned, summed: MXP, Lore (for `save.cells`), Spirit and
 * Ingots, and the kills, falls, restarts and halls descended. */
export type CatacombGains = {
  turns: number; mxp: number; lore: number; kills: number; falls: number; restarts: number; halls: number;
  spirit: Record<SpiritRarity, number>; ingots: Record<IngotId, number>;
};
export const noGains = (): CatacombGains => ({
  turns: 0, mxp: 0, lore: 0, kills: 0, falls: 0, restarts: 0, halls: 0,
  spirit: Object.fromEntries(SPIRIT_RARITIES.map((r) => [r, 0])) as Record<SpiritRarity, number>,
  ingots: Object.fromEntries(INGOTS.map((i) => [i, 0])) as Record<IngotId, number>,
});

/** Takes the run's next turn, adding what it earns to `gains` (and to the
 * save's MXP, Spirit and Ingots). Null when there is no run. */
export function catacombTurn(c: CatacombSave, gains: CatacombGains = noGains()): TurnEvent | null {
  let run = c.run;
  if (!run) return null;
  gains.turns++;
  const hero = heroStats(c.points);
  if (run.fell) return restart(c, gains, false);
  // Points moved out of Vitality take effect now: MHP never above its maximum.
  run.hero.mhp = Math.min(run.hero.mhp, hero.mhp);
  const targets = hallTargets(run.hall, c.number, run.slots), target = targets[run.target]!;
  if (target.kind === "stairs") {
    run = c.run = enterHall(c, run.hall + 1, run.hero.mhp);
    c.best[c.number] = Math.max(c.best[c.number] ?? 0, run.hall);
    gains.halls++;
    return { kind: "descend", hall: run.hall };
  }
  if (target.kind === "lore" || target.kind === "ingot") {
    run.hero.x = target.x;
    run.hero.y = target.y;
    if (target.kind === "lore") gains.lore = snap(gains.lore + target.amount);
    else { c.ingots[target.ingot] += target.amount; gains.ingots[target.ingot] += target.amount; }
    run.target++;
    return { kind: "pickup", target };
  }
  // An enemy: dash to the tile before it, or fight a round beside it.
  if (run.hero.x !== target.x - 1 || run.hero.y !== target.y) {
    run.hero.x = target.x - 1;
    run.hero.y = target.y;
    return { kind: "dash", x: run.hero.x, y: run.hero.y };
  }
  const slot = run.slots[target.slot]!, foe = undeadStats(slot.id, slot.strength, run.hall, c.number);
  const heroHit = Math.max(0, snap(hero.matk - foe.mdef)), enemyHit = Math.max(0, snap(foe.matk - hero.mdef));
  // Neither can hurt the other: the run ends and starts over at once.
  if (heroHit === 0 && enemyHit === 0) return restart(c, gains, true);
  slot.mhp = Math.max(0, snap(slot.mhp - heroHit));
  if (slot.mhp === 0) {
    const r = undeadRewards(slot.id, slot.strength);
    c.mxp += r.mxp;
    gains.mxp += r.mxp;
    c.spirit[r.rarity] += r.spirit;
    gains.spirit[r.rarity] += r.spirit;
    gains.kills++;
    run.slots[target.slot] = null;
    // The slot is gone from the targets now, so the index already points past it.
    return { kind: "round", slot: target.slot, heroHit, enemyHit: 0, killed: true };
  }
  run.hero.mhp = Math.max(0, snap(run.hero.mhp - enemyHit));
  if (run.hero.mhp === 0) {
    run.fell = true;
    gains.falls++;
  }
  return { kind: "round", slot: target.slot, heroHit, enemyHit, killed: false };
}

function restart(c: CatacombSave, gains: CatacombGains, stalemate: boolean): TurnEvent {
  startRun(c);
  gains.restarts++;
  return { kind: "restart", stalemate };
}

/** Takes `n` turns, however many runs they span, and sums their gains;
 * `last` is the final turn's event, the one a frame draws. */
export function runTurns(c: CatacombSave, n: number) {
  const gains = noGains();
  let last: TurnEvent | null = null;
  for (let i = 0; i < n && c.run; i++) last = catacombTurn(c, gains);
  return { gains, last };
}
