// What a watching player can tap in a hall (docs/CATACOMBS.md): crosshairs
// on the undead, a free hit each (a gold one ×3), and potions on the side
// tiles. Each turn rolls them on their own saved streams; a tap spends no turn.
import { snap } from "../exact.ts";
import { undeadStats } from "./catalog.ts";
import { SIDE_TILES } from "./hall.ts";
import { magician } from "./magic.ts";
import { defeat, hitFor, noGains, rollCrit, striking, type CatacombGains, type Paid } from "./combat.ts";
import { drawing, type CatacombSave } from "./state.ts";

/** Each turn, each undead without a crosshair gains one this often (percent). */
export const CROSSHAIR_CHANCE = 5;
/** What a gold crosshair multiplies its hit by. */
export const GOLD_CROSSHAIR_FACTOR = 3;
/** Each turn a potion appears on a free side tile this often (percent). */
export const POTION_CHANCE = 5;
/** The MHP a potion restores, never past the maximum. */
export const POTION_MHP = 10;

/** A tap's outcome, for the board's popups. */
export type TapEvent =
  | { kind: "crosshair"; slot: number; hit: number; crit: boolean; gold: boolean; killed: boolean; paid?: Paid }
  | { kind: "potion"; x: number; y: number; mhp: number };

/** The end of a turn: each undead standing without a crosshair rolls for
 * one (and, once Fortune gives a chance, for it to be gold), then the hall
 * rolls for a potion on a side tile free of the hero and of potions. A
 * crosshair stays until tapped or its undead is beaten; potions until the
 * hall is left. */
export function rollTaps(c: CatacombSave) {
  const run = c.run;
  if (!run || run.fell) return;
  const gold = magician(c).goldCrosshair;
  drawing(c, "crosshairs", (rng) => {
    for (const slot of run.slots) {
      if (!slot || slot.mark || rng() * 100 >= CROSSHAIR_CHANCE) continue;
      slot.mark = gold > 0 && rng() * 100 < gold ? "gold" : "crosshair";
    }
  });
  drawing(c, "potions", (rng) => {
    if (rng() * 100 >= POTION_CHANCE) return;
    const free = SIDE_TILES.filter(([x, y]) => !(run.hero.x === x && run.hero.y === y) && !run.potions.some(([px, py]) => px === x && py === y));
    if (free.length) run.potions.push([...free[Math.floor(rng() * free.length)]!]);
  });
}

/** Taps slot `slot`'s crosshair: its undead takes one of the Magician's
 * hits, MCrit rolled as ever, ×3 if gold, and no turn passes. A beaten
 * undead pays as in a round; if it was the one being fought, the next turn
 * dashes on. Null when there is no crosshair there to tap. */
export function tapCrosshair(c: CatacombSave, slot: number, gains: CatacombGains = noGains()): TapEvent | null {
  const run = c.run, s = run?.slots[slot];
  if (!run || run.fell || !s?.mark) return null;
  const m = striking(c), crit = rollCrit(c, m), gold = s.mark === "gold";
  const hit = snap(hitFor(m, undeadStats(s.id, s.strength, run.hall, c.number).mdef, crit) * (gold ? GOLD_CROSSHAIR_FACTOR : 1));
  delete s.mark;
  s.mhp = Math.max(0, snap(s.mhp - hit));
  const killed = s.mhp === 0;
  const paid = killed ? defeat(c, slot, gains) : undefined;
  return { kind: "crosshair", slot, hit, crit, gold, killed, ...(paid ? { paid } : {}) };
}

/** Takes the potion on tile (x, y): MHP back, never past the maximum. Null when none lies there. */
export function takePotion(c: CatacombSave, x: number, y: number): TapEvent | null {
  const run = c.run, i = run ? run.potions.findIndex(([px, py]) => px === x && py === y) : -1;
  if (!run || run.fell || i < 0) return null;
  run.potions.splice(i, 1);
  const before = run.hero.mhp;
  run.hero.mhp = Math.min(magician(c).mhp, snap(run.hero.mhp + POTION_MHP));
  return { kind: "potion", x, y, mhp: snap(run.hero.mhp - before) };
}
