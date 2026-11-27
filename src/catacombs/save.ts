// Decoding the Catacombs' saved state (docs/CATACOMBS.md): every field read
// through the shared readers, a run that doesn't fit dropped.
import { finite, isRecord, time, whole, wholeIn } from "../save/decode.ts";
import { TIERS } from "../tiers.ts";
import { INGOTS, SPIRIT_RARITIES, UNDEAD_IDS, type CatacombStrength } from "./catalog.ts";
import { HALL_SIZE, hallTargets, SLOT_XS, type Slot } from "./hall.ts";
import { MAGIC_STAT_IDS, noPoints, pointsEarned, pointsSpent } from "./magic.ts";
import { defaultCatacombs, HASTES, type CatacombRun, type CatacombSave, type Haste } from "./state.ts";

const STRENGTH_IDS: readonly CatacombStrength[] = ["normal", "strong", "elite", "boss"];
/** The most a tally may hold: well inside exact whole numbers. */
const MOST = 1e15;
const tally = (v: unknown) => (finite(v, MOST) ? Math.floor(v) : 0);

function decodeSlot(raw: unknown): Slot | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw) || !(UNDEAD_IDS as readonly unknown[]).includes(raw.id) || !(STRENGTH_IDS as readonly unknown[]).includes(raw.strength) || !finite(raw.mhp, MOST) || raw.mhp <= 0) return undefined;
  return { id: raw.id, strength: raw.strength, mhp: raw.mhp };
}

function decodeRun(raw: unknown, number: number): CatacombRun | null {
  if (!isRecord(raw) || !wholeIn(raw.hall, 1, MOST) || !Array.isArray(raw.slots) || raw.slots.length !== SLOT_XS.length) return null;
  const slots = raw.slots.map(decodeSlot);
  if (slots.some((s) => s === undefined)) return null;
  const hero = raw.hero;
  if (!isRecord(hero) || !wholeIn(hero.x, 0, HALL_SIZE - 1) || !wholeIn(hero.y, 0, HALL_SIZE - 1) || !finite(hero.mhp, MOST)) return null;
  const kept = slots as (Slot | null)[];
  if (!wholeIn(raw.target, 0, hallTargets(raw.hall, number, kept).length - 1)) return null;
  return { hall: raw.hall, slots: kept, target: raw.target, hero: { x: hero.x, y: hero.y, mhp: hero.mhp }, ...(raw.fell === true ? { fell: true as const } : {}) };
}

export function decodeCatacombs(raw: unknown): CatacombSave {
  const c = defaultCatacombs();
  if (!isRecord(raw)) return c;
  if (wholeIn(raw.number, 1, TIERS)) c.number = raw.number;
  c.run = decodeRun(raw.run, c.number);
  if (isRecord(raw.best))
    for (const [k, v] of Object.entries(raw.best)) if (wholeIn(Number(k), 1, TIERS) && wholeIn(v, 1, MOST)) c.best[Number(k)] = v;
  if (wholeIn(raw.rng, 0, 4294967295)) c.rng = raw.rng;
  if (isRecord(raw.clock)) {
    c.clock.lastTurnAt = time(raw.clock.lastTurnAt);
    c.clock.bank = tally(raw.clock.bank);
    if ((HASTES as readonly unknown[]).includes(raw.clock.haste)) c.clock.haste = raw.clock.haste as Haste;
  }
  c.mxp = tally(raw.mxp);
  if (isRecord(raw.points)) for (const id of MAGIC_STAT_IDS) c.points[id] = whole(raw.points[id]) ? raw.points[id] : 0;
  if (isRecord(raw.spirit)) for (const r of SPIRIT_RARITIES) c.spirit[r] = tally(raw.spirit[r]);
  if (isRecord(raw.ingots)) for (const i of INGOTS) c.ingots[i] = tally(raw.ingots[i]);
  // Points spent past those earned (an edited save) are all handed back.
  if (pointsSpent(c.points) > pointsEarned(c.mxp)) c.points = noPoints();
  return c;
}
