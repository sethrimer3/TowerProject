// Decoding the Catacombs' saved state (docs/CATACOMBS.md): every field read
// through the shared readers, a run that doesn't fit dropped.
import { finite, isRecord, time, whole, wholeIn } from "../save/decode.ts";
import { snap } from "../exact.ts";
import { TIERS } from "../tiers.ts";
import { DROP_IDS, DROPS, INGOTS, SPIRIT_RARITIES, UNDEAD_IDS, type CatacombStrength, type DropId } from "./catalog.ts";
import { HALL_SIZE, hallTargets, SIDE_TILES, SLOT_XS, type Slot } from "./hall.ts";
import { MAGIC_SKILL_IDS, MAGIC_SKILLS, noPoints, pointsEarned, pointsSpent } from "./magic.ts";
import { ABILITIES, ABILITY_IDS, MAX_CHARGES, TAP_UNLOCKS } from "./abilities.ts";
import { SPIRIT_UPGRADE_IDS, SPIRIT_UPGRADES } from "./spirit-upgrades.ts";
import { CATACOMB_STREAMS, defaultCatacombs, HASTES, type CatacombRun, type CatacombSave, type Haste } from "./state.ts";

const STRENGTH_IDS: readonly CatacombStrength[] = ["normal", "strong", "elite", "boss"];
/** The most a tally may hold: well inside exact whole numbers. */
const MOST = 1e15;
const tally = (v: unknown) => (finite(v, MOST) ? Math.floor(v) : 0);
/** A tally that may hold a fraction (MXP and Spirit, raised by percent gains). */
const amount = (v: unknown) => (finite(v, MOST) ? snap(v) : 0);

function decodeSlot(raw: unknown): Slot | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw) || !(UNDEAD_IDS as readonly unknown[]).includes(raw.id) || !(STRENGTH_IDS as readonly unknown[]).includes(raw.strength) || !finite(raw.mhp, MOST) || raw.mhp <= 0) return undefined;
  const slot: Slot = { id: raw.id, strength: raw.strength, mhp: raw.mhp };
  if (isRecord(raw.drops)) {
    const drops: Partial<Record<DropId, number>> = {};
    for (const d of DROP_IDS) if (wholeIn(raw.drops[d], DROPS[d].lo, DROPS[d].hi)) drops[d] = raw.drops[d];
    if (Object.keys(drops).length) slot.drops = drops;
  }
  if (raw.mark === "crosshair" || raw.mark === "gold") slot.mark = raw.mark;
  return slot;
}

function decodeRun(raw: unknown, number: number): CatacombRun | null {
  if (!isRecord(raw) || !wholeIn(raw.hall, 1, MOST) || !Array.isArray(raw.slots) || raw.slots.length !== SLOT_XS.length) return null;
  const slots = raw.slots.map(decodeSlot);
  if (slots.some((s) => s === undefined)) return null;
  const hero = raw.hero;
  if (!isRecord(hero) || !wholeIn(hero.x, 0, HALL_SIZE - 1) || !wholeIn(hero.y, 0, HALL_SIZE - 1) || !finite(hero.mhp, MOST)) return null;
  const kept = slots as (Slot | null)[];
  if (!wholeIn(raw.target, 0, hallTargets(raw.hall, number, kept).length - 1)) return null;
  const potions: [number, number][] = [];
  if (Array.isArray(raw.potions))
    for (const p of raw.potions)
      if (Array.isArray(p) && SIDE_TILES.some(([x, y]) => p[0] === x && p[1] === y) && !potions.some(([x, y]) => p[0] === x && p[1] === y)) potions.push([p[0], p[1]]);
  return { hall: raw.hall, slots: kept, target: raw.target, hero: { x: hero.x, y: hero.y, mhp: hero.mhp }, potions, ...(raw.fell === true ? { fell: true as const } : {}) };
}

export function decodeCatacombs(raw: unknown): CatacombSave {
  const c = defaultCatacombs();
  if (!isRecord(raw)) return c;
  if (wholeIn(raw.number, 1, TIERS)) c.number = raw.number;
  c.run = decodeRun(raw.run, c.number);
  if (isRecord(raw.best))
    for (const [k, v] of Object.entries(raw.best)) if (wholeIn(Number(k), 1, TIERS) && wholeIn(v, 1, MOST)) c.best[Number(k)] = v;
  if (isRecord(raw.rng)) for (const s of CATACOMB_STREAMS) if (wholeIn(raw.rng[s], 0, 4294967295)) c.rng[s] = raw.rng[s];
  if (isRecord(raw.clock)) {
    c.clock.lastTurnAt = time(raw.clock.lastTurnAt);
    c.clock.bank = tally(raw.clock.bank);
    if ((HASTES as readonly unknown[]).includes(raw.clock.haste)) c.clock.haste = raw.clock.haste as Haste;
  }
  c.mxp = amount(raw.mxp);
  if (isRecord(raw.points)) for (const id of MAGIC_SKILL_IDS) c.points[id] = wholeIn(raw.points[id], 0, MAGIC_SKILLS[id].cap) ? raw.points[id] : 0;
  if (isRecord(raw.spirit)) for (const r of SPIRIT_RARITIES) c.spirit[r] = amount(raw.spirit[r]);
  if (isRecord(raw.ingots)) for (const i of INGOTS) c.ingots[i] = tally(raw.ingots[i]);
  c.speed = tally(raw.speed);
  if (isRecord(raw.upgrades)) for (const id of SPIRIT_UPGRADE_IDS) if (wholeIn(raw.upgrades[id], 0, SPIRIT_UPGRADES[id].prices.length)) c.upgrades[id] = raw.upgrades[id];
  if (isRecord(raw.abilities))
    for (const id of ABILITY_IDS) {
      const a = raw.abilities[id];
      if (!isRecord(a)) continue;
      if (wholeIn(a.charges, 0, MAX_CHARGES)) c.abilities[id].charges = a.charges;
      if (wholeIn(a.cooldown, 0, ABILITIES[id].cooldown)) c.abilities[id].cooldown = a.cooldown;
      c.abilities[id].auto = a.auto === true;
    }
  if (isRecord(raw.buffs)) for (const id of ABILITY_IDS) if (whole(raw.buffs[id])) c.buffs[id] = raw.buffs[id];
  if (Array.isArray(raw.taught)) c.taught = TAP_UNLOCKS.filter((id) => (raw.taught as unknown[]).includes(id));
  c.hideMaxed = raw.hideMaxed === true;
  // Points spent past those earned (an edited save) are all handed back.
  if (pointsSpent(c.points) > pointsEarned(c.mxp)) c.points = noPoints();
  return c;
}
