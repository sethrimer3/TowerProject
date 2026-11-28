// A fight's forecast (docs/agents/catacombs.md): what fighting slot `i`'s
// undead from here would cost the Magician, round by round as `turn.ts`
// plays them, without MCrits. Pure: it reads the save and changes nothing.
import { snap } from "../exact.ts";
import { undeadStats } from "./catalog.ts";
import { BARRAGE_SHARE } from "./abilities.ts";
import { hitFor, striking } from "./combat.ts";
import type { CatacombSave } from "./state.ts";

/** The most rounds a forecast plays before it calls the fight endless. */
const MAX_ROUNDS = 100_000;

/** A fight's forecast: the Magician's strikes to banish the undead (0 when
 * it can't be harmed), the MHP the whole fight would cost (Infinity when it
 * never ends), whether the Magician lives through it, and whether neither
 * side can harm the other (a restart). */
export type CatacombForecast = { strikes: number; damage: number; survives: boolean; stalemate: boolean };

/** Fighting slot `i`'s undead from now, at the Magician's MHP now, its buffs
 * and Speed Drop attacks running down a round at a time; null with no
 * undead there. No MCrits, and no ability cast along the way. */
export function forecastFight(c: CatacombSave, i: number): CatacombForecast | null {
  const run = c.run, slot = run?.slots[i];
  if (!run || !slot) return null;
  const foe = undeadStats(slot.id, slot.strength, run.hall, c.number);
  const plain = striking({ ...c, buffs: { ...c.buffs, surge: 0 } }), surged = striking({ ...c, buffs: { ...c.buffs, surge: 1 } });
  const buffs = { ...c.buffs };
  let mhp = slot.mhp, speed = c.speed, strikes = 0, damage = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const m = buffs.surge > 0 ? surged : plain, enemyHit = Math.max(0, snap(foe.matk - m.mdef)), hit = hitFor(m, foe.mdef, false);
    const barrage = buffs.barrage > 0 ? hitFor(m, foe.mdef, false, BARRAGE_SHARE) : 0;
    if (hit === 0 && barrage === 0 && !buffs.surge && !buffs.barrage) {
      // Nothing the Magician has left can harm it: a restart, or a fall.
      if (enemyHit === 0) return { strikes: 0, damage, survives: damage < run.hero.mhp, stalemate: true };
      return { strikes: 0, damage: Infinity, survives: false, stalemate: false };
    }
    const each = 1 + (speed > 0 ? 1 : 0) + (buffs.rush > 0 ? 1 : 0);
    for (let k = 0; k < each && mhp > 0; k++) {
      mhp = Math.max(0, snap(mhp - hit));
      strikes++;
    }
    if (mhp > 0 && barrage) mhp = Math.max(0, snap(mhp - barrage));
    if (speed > 0) speed--;
    for (const b of ["surge", "rush", "barrage"] as const) if (buffs[b] > 0) buffs[b]--;
    if (mhp === 0) break;
    damage = snap(damage + enemyHit);
  }
  return mhp === 0 ? { strikes, damage, survives: damage < run.hero.mhp, stalemate: false } : { strikes: 0, damage: Infinity, survives: false, stalemate: false };
}
