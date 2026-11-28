// One Catacomb turn (docs/CATACOMBS.md): a dash, a round of combat, a
// pickup, a descent or a restart, chosen by the hero's next target. Pure:
// it changes only the CatacombSave it is given and reports what it earned,
// so the game credits the Lore (`save.cells`) and draws what happened.
import { snap } from "../exact.ts";
import { undeadStats } from "./catalog.ts";
import { hallTargets, type Target } from "./hall.ts";
import { magician } from "./magic.ts";
import { autoCast, BARRAGE_SHARE, coolAbilities } from "./abilities.ts";
import { defeat, hitFor, noGains, rollCrit, striking, type CatacombGains } from "./combat.ts";
import { rollTaps } from "./taps.ts";
import { enterHall, startRun, type CatacombSave } from "./state.ts";

export { noGains, type CatacombGains } from "./combat.ts";

/** A round: the hits the Magician struck its target with (summed), whether
 * any crit, how many strikes it had, what the undead struck back, whether
 * the target fell, and Arcane Barrage's hit on each other undead. */
export type TurnEvent =
  | { kind: "dash"; x: number; y: number }
  | { kind: "round"; slot: number; heroHit: number; enemyHit: number; killed: boolean; crit: boolean; strikes: number; barrage?: { slot: number; hit: number; killed: boolean }[] }
  | { kind: "pickup"; target: Extract<Target, { kind: "lore" | "ingot" }> }
  | { kind: "descend"; hall: number }
  | { kind: "fall" }
  | { kind: "restart"; stalemate: boolean };

/** The strikes a round gives the Magician: one, plus one each for a Speed
 * Drop's attacks and Renewing Rush's buff (attack speed adds: ×2 and ×2 make ×3). */
export const strikesNow = (c: CatacombSave) => 1 + (c.speed > 0 ? 1 : 0) + (c.buffs.rush > 0 ? 1 : 0);

/** Takes the run's next turn, adding what it earns to `gains` (and to the
 * save's MXP, Spirit and Ingots). Null when there is no run. The abilities
 * cool a turn first and those on Auto are cast; then, after the turn,
 * crosshairs and potions roll. */
export function catacombTurn(c: CatacombSave, gains: CatacombGains = noGains()): TurnEvent | null {
  if (!c.run) return null;
  gains.turns++;
  coolAbilities(c);
  if (c.run.fell) return restart(c, gains, false);
  autoCast(c);
  const event = act(c, gains);
  rollTaps(c);
  return event;
}

function act(c: CatacombSave, gains: CatacombGains): TurnEvent {
  let run = c.run!;
  const hero = magician(c);
  // Points moved out of Weaving take effect now: MHP never above its maximum.
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
  return round(c, target.slot, gains);
}

/** A round beside slot `i`'s undead: the Magician strikes first, once a
 * strike; Arcane Barrage hits every undead; the beaten pay; if the target
 * stands, it strikes back. Each buff and the Speed Drops lose an attack. */
function round(c: CatacombSave, i: number, gains: CatacombGains): TurnEvent {
  const run = c.run!, m = striking(c), slot = run.slots[i]!, foe = undeadStats(slot.id, slot.strength, run.hall, c.number);
  const enemyHit = Math.max(0, snap(foe.matk - m.mdef));
  // Neither can hurt the other (no MCrit or Barrage gets MAtk past MDef): the run ends and starts over at once.
  if (enemyHit === 0 && hitFor(m, foe.mdef, false) === 0) return restart(c, gains, true);
  const strikes = strikesNow(c);
  let heroHit = 0, crit = false;
  for (let k = 0; k < strikes && slot.mhp > 0; k++) {
    const critical = rollCrit(c, m), hit = hitFor(m, foe.mdef, critical);
    crit ||= critical;
    heroHit = snap(heroHit + hit);
    slot.mhp = Math.max(0, snap(slot.mhp - hit));
  }
  let barrage: { slot: number; hit: number; killed: boolean }[] | undefined;
  if (c.buffs.barrage > 0) {
    barrage = [];
    run.slots.forEach((s, j) => {
      if (!s || s.mhp === 0) return;
      const hit = hitFor(m, undeadStats(s.id, s.strength, run.hall, c.number).mdef, false, BARRAGE_SHARE);
      s.mhp = Math.max(0, snap(s.mhp - hit));
      if (j === i) heroHit = snap(heroHit + hit);
      else barrage!.push({ slot: j, hit, killed: s.mhp === 0 });
    });
  }
  if (c.speed > 0) c.speed--;
  for (const b of ["surge", "rush", "barrage"] as const) if (c.buffs[b] > 0) c.buffs[b]--;
  // The beaten pay, the target last; a slot emptied leaves the targets, so the index already points past it.
  for (const b of barrage ?? []) if (b.killed) defeat(c, b.slot, gains);
  const killed = slot.mhp === 0;
  if (killed) {
    defeat(c, i, gains);
    return { kind: "round", slot: i, heroHit, enemyHit: 0, killed, crit, strikes, ...(barrage ? { barrage } : {}) };
  }
  run.hero.mhp = Math.max(0, snap(run.hero.mhp - enemyHit));
  if (run.hero.mhp === 0) {
    run.fell = true;
    gains.falls++;
  }
  return { kind: "round", slot: i, heroHit, enemyHit, killed, crit, strikes, ...(barrage ? { barrage } : {}) };
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
