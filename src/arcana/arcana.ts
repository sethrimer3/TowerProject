import type { CritRule } from "../combat.ts";
import { STELLAR_FACTOR } from "../environments.ts";
import { drawAt, tileRandom } from "../random.ts";
import { isRecord, wholeIn } from "../save/decode.ts";

// Arcana (docs/agents/arcana.md): mighty spells bought and upgraded with
// Arcanite and kept for good, or lent to one climb by a Shrine boon. Each
// names its own trigger and its three attributes; this module is the
// catalog, the prices, the draws and what the save keeps. It reads nothing
// of the game but what it is given.

/** One level of an attribute: its value, and the Arcanite that buys it (the first is free). */
type Step = readonly [value: number, cost: number];
export type AttributeDef = { name: string; steps: readonly Step[]; shown: (value: number) => string };

/** An arcanum's three attribute values, in its attributes' order. */
export type AttributeValues = readonly [number, number, number];
/** The level of each of an arcanum's three attributes (0 as it is bought). */
export type AttributeLevels = [number, number, number];

/** What sets an arcanum off: its own event (`shotHit`, the hero's shot
 * striking an enemy: volley.ts), a cooldown of so many turns that restarts
 * the moment it runs out, whatever the arcanum is still doing, or nothing
 * (`always`: it works for as long as it is on). A new trigger is a new member
 * here, and the code that raises that event. */
export type ArcanumTrigger = { on: "shotHit" } | { on: "cooldown"; turns: (values: AttributeValues) => number } | { on: "always" };

export type ArcanumDef = {
  name: string;
  trigger: ArcanumTrigger;
  attributes: readonly [AttributeDef, AttributeDef, AttributeDef];
  /** What it does, with these values. */
  summary: (values: AttributeValues) => string;
  /** What its Arcanum Damage multiplies by, if it deals damage. */
  damage?: (values: AttributeValues) => number;
  /** The run card's value, for an arcanum that deals no damage. */
  effect?: (values: AttributeValues) => string;
};

const countOf = (n: number) => n.toLocaleString("en-US");

export const ARCANA = {
  ricochetShot: {
    name: "Ricochet Shot",
    trigger: { on: "shotHit" },
    attributes: [
      {
        name: "ATK Mult",
        shown: (v) => `${countOf(v)}x`,
        steps: [[2, 0], [3, 5], [5, 11], [9, 17], [14, 23], [22, 29], [32, 35], [46, 41], [63, 47], [85, 53], [113, 61], [148, 71], [191, 84], [244, 100], [309, 120], [387, 144], [482, 174], [596, 210], [733, 252], [898, 302], [1094, 362], [1328, 434], [1607, 525], [1937, 636], [2329, 767], [2794, 923], [3342, 1109], [3990, 1295], [4755, 1521], [5655, 1787], [6715, 2103], [7961, 2469]],
      },
      {
        name: "Rebounds",
        shown: countOf,
        steps: [[1, 0], [2, 30], [3, 75], [4, 150], [5, 400]],
      },
      {
        name: "Chance",
        shown: (v) => `${v.toFixed(1)}%`,
        steps: [[5, 0], [6.5, 8], [8, 26], [9.5, 44], [11, 62], [12.5, 80], [14, 98], [15.5, 116], [17, 134], [18.5, 152], [20, 170], [21.5, 188], [23, 206], [24.5, 224], [26, 242], [27.5, 260]],
      },
    ],
    summary: ([mult, rebounds, chance]) => `${chance.toFixed(1)}% chance on enemy hit to ricochet the shot to ${countOf(rebounds)} additional ${rebounds === 1 ? "enemy" : "enemies"}, with ${countOf(mult * 100)}% of ATK (accounts for critical chances and factors).`,
    damage: ([mult]) => mult,
  },
  aurumBloom: {
    name: "Aurum Bloom",
    trigger: { on: "always" },
    attributes: [
      {
        name: "Bonus",
        shown: (v) => `${v.toFixed(1)}×`,
        steps: [[5, 0], [5.8, 5], [6.6, 13], [7.4, 22], [8.2, 32], [9, 43], [9.8, 55], [10.6, 68], [11.4, 82], [12.2, 98], [13, 116], [13.8, 138], [14.6, 162], [15.4, 250], [16.2, 350], [17, 500], [17.8, 700], [18.6, 950], [19.4, 1250], [20.2, 1600], [21, 2000]],
      },
      {
        name: "Golden Chance",
        shown: (v) => `${v.toFixed(1)}%`,
        steps: [[5, 0], [5.5, 5], [6, 14], [6.5, 23], [7, 32], [7.5, 41], [8, 50], [8.5, 59], [9, 68], [9.5, 77], [10, 87], [10.5, 98], [11, 110], [11.5, 123], [12, 137], [12.5, 152], [13, 168], [13.5, 185], [14, 203], [14.5, 222], [15, 242], [15.5, 263], [16, 285], [16.5, 308], [17, 332], [17.5, 356], [18, 380], [18.5, 404], [19, 428], [19.5, 452], [20, 476], [20.5, 530], [21, 614], [21.5, 728], [22, 872], [22.5, 1046], [23, 1250], [23.5, 1484], [24, 1748]],
      },
      {
        name: "Stellar Chance",
        shown: (v) => `${v.toFixed(1)}%`,
        steps: [[0.5, 0], [1, 10], [1.5, 28], [2, 46], [2.5, 64], [3, 82], [3.5, 100], [4, 118], [4.5, 136], [5, 154], [5.5, 172], [6, 190], [6.5, 208], [7, 226], [7.5, 244], [8, 262], [8.5, 300], [9, 368], [9.5, 476], [10, 644]],
      },
    ],
    summary: ([bonus, chance, stellar]) => `Adds ${chance.toFixed(1)}% chance each floor is a Golden Floor and raises its bonus to ${bonus.toFixed(1)}× (Golden Floors and its research add to that), and ${stellar.toFixed(1)}% chance each floor is a Stellar Floor, which multiplies its Gold and Silver by ${STELLAR_FACTOR}×.`,
    effect: ([bonus, chance, stellar]) => `${bonus.toFixed(1)}× · +${chance.toFixed(1)}% · ${stellar.toFixed(1)}% Stellar`,
  },
  overseer: {
    name: "Overseer",
    trigger: { on: "always" },
    attributes: [
      {
        name: "Bonus",
        shown: (v) => `${v.toFixed(1)}×`,
        steps: [[8, 0], [9.4, 5], [10.8, 13], [12.2, 21], [13.6, 30], [15, 40], [16.4, 52], [17.8, 65], [19.2, 80], [20.6, 95], [22, 112], [23.4, 133], [24.8, 150], [26.2, 180], [27.6, 220], [29, 280], [30.4, 320], [31.8, 360], [33.2, 420], [34.6, 500], [36, 600], [37.4, 720], [38.8, 850], [40.2, 1000], [41.6, 1175], [43, 1400], [44.4, 1650], [45.8, 1925], [47.2, 2225], [48.6, 2550], [50, 2900]],
      },
      {
        name: "Angle",
        shown: (v) => `${v}°`,
        steps: [[30, 0], [31, 5], [32, 16], [33, 27], [34, 38], [35, 49], [36, 60], [37, 71], [38, 82], [39, 93], [40, 104], [41, 115], [42, 126], [43, 137], [44, 148], [45, 159], [46, 170], [47, 181], [48, 192], [49, 203], [50, 214], [51, 225], [52, 236], [53, 247], [54, 258], [55, 269], [56, 280], [57, 291], [58, 302], [59, 313], [60, 324], [61, 337], [62, 352], [63, 369], [64, 388], [65, 409], [66, 432], [67, 457], [68, 484], [69, 513], [70, 544], [71, 577], [72, 612], [73, 649], [74, 688], [75, 729], [76, 772], [77, 817], [78, 864], [79, 913], [80, 964], [81, 1017], [82, 1072], [83, 1129], [84, 1188], [85, 1249], [86, 1312], [87, 1377], [88, 1444], [89, 1513], [90, 1584]],
      },
      {
        name: "Quantity",
        shown: countOf,
        steps: [[1, 0], [2, 375], [3, 850], [4, 2500]],
      },
    ],
    summary: ([bonus, angle, beams]) => `${beams === 1 ? "A spotlight beam" : `${countOf(beams)} spotlight beams`} of ${angle}° from the hero, turning 4° clockwise each turn, through walls and out to the area's edges. Enemies in ${beams === 1 ? "it" : "them"} take ${bonus.toFixed(1)}× ATK on hits from your ATK.`,
    effect: ([bonus, angle, beams]) => `${bonus.toFixed(1)}× · ${angle}° · ${countOf(beams)} ${beams === 1 ? "beam" : "beams"}`,
  },
  thunderbolt: {
    name: "Thunderbolt",
    trigger: { on: "cooldown", turns: ([, , turns]) => turns },
    attributes: [
      {
        name: "ATK Mult",
        shown: (v) => `${countOf(v)}x`,
        steps: [[10, 0], [11, 5], [13, 11], [16, 17], [20, 23], [26, 29], [34, 35], [43, 41], [55, 47], [69, 53], [87, 61], [108, 71], [134, 84], [164, 100], [200, 120], [243, 144], [293, 174], [352, 210], [421, 252], [502, 302], [597, 362], [708, 432], [838, 528], [989, 654], [1165, 810], [1370, 996], [1608, 1222], [1886, 1488], [2209, 1804], [2585, 2180], [3021, 2636], [3776, 2742], [4720, 2848], [5900, 2954], [7375, 3060], [9219, 3166]],
      },
      {
        name: "Quantity",
        shown: countOf,
        steps: [[5, 0], [6, 4], [7, 12], [8, 35], [9, 70], [10, 120], [11, 180], [12, 275], [13, 350], [14, 420], [15, 500], [16, 600], [17, 750], [18, 950], [19, 1200], [20, 1500]],
      },
      {
        name: "Cooldown",
        shown: (v) => `${v} turns`,
        steps: [[180, 0], [170, 8], [160, 24], [150, 40], [140, 56], [130, 72], [120, 88], [110, 104], [100, 120], [90, 136], [80, 152], [70, 168], [60, 184], [50, 200], [40, 216], [30, 232], [20, 750]],
      },
    ],
    summary: ([mult, bolts, turns]) => `Every ${turns} turns, ${countOf(bolts)} thunderbolts strike random enemies on the floor, with ${countOf(mult * 100)}% of ATK each (accounts for critical chances and factors). With fewer enemies than thunderbolts, the rest strike again, once a turn, until they are used up or no enemies remain on the floor.`,
    damage: ([mult]) => mult,
  },
} as const satisfies Record<string, ArcanumDef>;

export type ArcanumId = keyof typeof ARCANA;
export const ARCANUM_IDS = Object.keys(ARCANA) as ArcanumId[];
export const arcanum = (id: ArcanumId): ArcanumDef => ARCANA[id];
export const isArcanum = (id: unknown): id is ArcanumId => typeof id === "string" && ARCANUM_IDS.includes(id as ArcanumId);

/** What buying the next arcanum costs, by how many are owned. */
export const ARCANUM_PRICES: readonly number[] = [5, 50, 150, 300, 800, 1250, 1750, 2400, 3000];
/** How many arcana each choice offers. */
export const OFFER_SIZE = 3;
/** The times a run's arcana can be toggled, all of them together. */
export const RUN_TOGGLES = 40;

/** The arcana bought, each attribute's level; the choice waiting, kept until
 * one is bought or it is rerolled (empty: none drawn yet); and the choices'
 * own stream, saved with the profile (`rng`, seeded once, and the `rolls` it
 * has given). */
export type ArcanaSave = { owned: Partial<Record<ArcanumId, AttributeLevels>>; offer: ArcanumId[]; rng: number | null; rolls: number };
export const defaultArcana = (): ArcanaSave => ({ owned: {}, offer: [], rng: null, rolls: 0 });

/** What a run keeps of its arcana beside it, so undo never touches them: the
 * toggles spent, those switched off, the turns each cooldown has left, and
 * Thunderbolt's bolts still to strike and the turns it has struck (`strikes`,
 * which fixes each turn's random targets). */
export type ArcanaRun = { toggles: number; off: ArcanumId[]; timers: Partial<Record<ArcanumId, number>>; bolts?: number; strikes?: number };
export const defaultArcanaRun = (): ArcanaRun => ({ toggles: 0, off: [], timers: {} });

type Owned = Pick<ArcanaSave, "owned">;
/** The arcana bought, in the catalog's order. */
export const ownedArcana = (a: Owned) => ARCANUM_IDS.filter((id) => a.owned[id]);
/** The arcana left to buy. */
export const unownedArcana = (a: Owned) => ARCANUM_IDS.filter((id) => !a.owned[id]);
/** What the next arcanum costs (the dearest once past the list). */
export const arcanumPrice = (a: Owned) => ARCANUM_PRICES[Math.min(ownedArcana(a).length, ARCANUM_PRICES.length - 1)]!;
/** What a reroll costs: 20% of the next arcanum's price. */
export const rerollPrice = (a: Owned) => Math.ceil(arcanumPrice(a) / 5);
/** Whether a reroll could change anything: otherwise every option left already shows. */
export const rerollOpen = (a: Owned) => unownedArcana(a).length > OFFER_SIZE;
/** The Arcana tab shows once Arcanite has been held, whatever is left of it,
 * and with Dev free purchases, which need none. */
export const arcanaOpen = (save: { arcanite: number; arcana: ArcanaSave; profile: { earned: { arcanite: number } }; settings: { freePurchases: boolean } }) =>
  save.settings.freePurchases || save.arcanite > 0 || save.profile.earned.arcanite > 0 || ownedArcana(save.arcana).length > 0;

/** Up to `count` of `pool` drawn without repeats, each as likely as any other. */
export function drawOptions<T>(pool: readonly T[], count: number, draw: () => number): T[] {
  const left = [...pool], out: T[] = [];
  while (out.length < count && left.length) out.push(left.splice(Math.floor(draw() * left.length), 1)[0]!);
  return out;
}
/** A new choice in place of `now`: a different set whenever `pool` has one to give. */
export function redrawOptions<T>(pool: readonly T[], now: readonly T[], count: number, draw: () => number): T[] {
  const same = (set: readonly T[]) => set.length === now.length && set.every((o) => now.includes(o));
  let next = drawOptions(pool, count, draw);
  while (pool.length > count && same(next)) next = drawOptions(pool, count, draw);
  return next;
}
/** The next number of the choices' saved stream, seeding it once from `seed`. */
export function nextDraw(a: ArcanaSave, seed: () => number) {
  a.rng ??= Math.floor(seed() * 4294967296);
  return drawAt(a.rng, a.rolls++);
}

export const levelsOf = (a: Owned, id: ArcanumId): AttributeLevels => a.owned[id] ?? [0, 0, 0];
export const valuesAt = (id: ArcanumId, levels: AttributeLevels): AttributeValues => {
  const [a, b, c] = arcanum(id).attributes;
  return [a.steps[levels[0]]![0], b.steps[levels[1]]![0], c.steps[levels[2]]![0]];
};
/** What the attribute's next level costs and holds; null at its highest. */
export function nextStep(id: ArcanumId, attribute: number, level: number) {
  const step = arcanum(id).attributes[attribute]!.steps[level + 1];
  return step ? { value: step[0], cost: step[1] } : null;
}

/** What an arcanum multiplies the hero's ATK by, with the equipment's factors:
 * Arcanum Damage = Multiplier × Equipment × Hero ATK × (1 + Critical Factor ×
 * Critical Chance) × (1 + Super Crit Mult × Super Crit Chance × Critical Chance).
 * Its crits are this average, never rolled. */
export function arcanumBoost(multiplier: number, crit: CritRule | undefined, equipment = 1) {
  const chance = (crit?.chance ?? 0) / 100, superCrit = crit?.superCrit;
  return multiplier * equipment * (1 + (crit?.factor ?? 0) * chance) * (1 + (superCrit ? superCrit.factor * (superCrit.chance / 100) * chance : 0));
}

/** Each cooldown one turn on: those of `active` that ran out fired, and
 * started over at once, whatever the arcanum is still doing. */
export function tickCooldowns(active: readonly { id: ArcanumId; turns: number }[], timers: ArcanaRun["timers"]) {
  const fired: ArcanumId[] = [];
  for (const { id, turns } of active) {
    // A cooldown upgraded while it ran counts down from no more than its new length.
    const left = Math.min(timers[id] ?? turns, turns) - 1;
    if (left <= 0) fired.push(id);
    timers[id] = left <= 0 ? turns : left;
  }
  return fired;
}

/** Salts a run's seed for Thunderbolt's targets. */
const THUNDERBOLT_SALT = 0x7b017;
/** Thunderbolt's targets, one bolt each: up to `bolts` of `enemies`, each as
 * likely as any other, fixed by the run and the turn it strikes (`strike`), so
 * undo and a replay agree. Each draws its key first, whatever order they come in. */
export function boltTargets<T extends { x: number; y: number }>(enemies: readonly T[], bolts: number, seed: number, strike: number): T[] {
  const salted = (seed ^ THUNDERBOLT_SALT ^ Math.imul(strike, 0x85ebca6b)) | 0;
  return enemies.map((enemy) => ({ enemy, key: tileRandom(enemy.x, enemy.y, salted) }))
    .sort((a, b) => a.key - b.key || a.enemy.y - b.enemy.y || a.enemy.x - b.enemy.x)
    .slice(0, bolts).map(({ enemy }) => enemy);
}
/** The bolts this turn strikes with: those left from the last trigger, and a
 * new trigger's `quantity` if its cooldown just ran out. Counts the strike. */
export function chargeBolts(run: ArcanaRun, quantity: number, fired: boolean) {
  const bolts = (run.bolts ?? 0) + (fired ? quantity : 0);
  if (bolts) run.strikes = (run.strikes ?? 0) + 1;
  return { bolts, strike: run.strikes ?? 0 };
}
/** Keeps the bolts a strike left for the next turn. */
export function settleBolts(run: ArcanaRun, left: number) {
  if (left) run.bolts = left;
  else delete run.bolts;
}

/** What research and the like have added to an arcanum, as rows of its
 * information: none are defined yet. */
export const enhancementsOf = (_id: ArcanumId, _save: unknown): readonly (readonly [string, string])[] => [];

/** Levels within an attribute's steps, or none at all. */
const validLevels = (id: ArcanumId, raw: unknown): AttributeLevels | null => {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  return arcanum(id).attributes.every((a, i) => wholeIn(raw[i], 0, a.steps.length - 1)) ? [raw[0], raw[1], raw[2]] : null;
};
const knownList = (raw: unknown) => (Array.isArray(raw) ? [...new Set(raw.filter(isArcanum))] : []);

/** The saved arcana: known ones at levels they have; a choice only of those not owned. */
export function decodeArcana(raw: unknown): ArcanaSave {
  const d = defaultArcana();
  if (!isRecord(raw)) return d;
  for (const id of ARCANUM_IDS) {
    const levels = validLevels(id, (raw.owned as Record<string, unknown> | undefined)?.[id]);
    if (levels) d.owned[id] = levels;
  }
  d.offer = knownList(raw.offer).filter((id) => !d.owned[id]).slice(0, OFFER_SIZE);
  if (wholeIn(raw.rng, 0, 4294967295)) d.rng = raw.rng as number;
  if (wholeIn(raw.rolls, 0, Number.MAX_SAFE_INTEGER)) d.rolls = raw.rolls as number;
  return d;
}

/** What a run kept beside it. */
export function decodeArcanaRun(raw: unknown): ArcanaRun {
  const d = defaultArcanaRun();
  if (!isRecord(raw)) return d;
  if (wholeIn(raw.toggles, 0, RUN_TOGGLES)) d.toggles = raw.toggles as number;
  d.off = knownList(raw.off);
  for (const id of ARCANUM_IDS) {
    const left = (raw.timers as Record<string, unknown> | undefined)?.[id];
    if (wholeIn(left, 1, 1e9)) d.timers[id] = left as number;
  }
  if (wholeIn(raw.bolts, 1, 1e9)) d.bolts = raw.bolts as number;
  if (wholeIn(raw.strikes, 1, 1e9)) d.strikes = raw.strikes as number;
  return d;
}
