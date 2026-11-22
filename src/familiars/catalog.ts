// Familiars (docs/agents/familiars.md): young beasts hatched from eggs for
// Medals and grown with more, which move over the board in a run and act by
// themselves. All data: each familiar's four stats, in whole units so every
// sum is exact, and what hatching and growing cost.

export const FAMILIAR_IDS = ["dragon", "slime", "wolf", "falcon", "wisp"] as const;
export type FamiliarId = (typeof FAMILIAR_IDS)[number];

/** A stat: its value unraised, what each level adds, its levels, and how the
 * player reads a value (`boxed`, shorter, in its box where that is too long). */
export type FamiliarStat = { name: string; base: number; step: number; levels: number; shown(value: number): string; boxed?(value: number): string };

const plain = (n: number) => `${n}`;
const turns = (n: number) => `${n} ${n === 1 ? "turn" : "turns"}`;
const percent = (n: number) => `${n}%`;
/** A factor kept in tenths or hundredths, as ×14.5. */
const times = (scale: number) => (n: number) => `×${plain(n / scale)}`;
/** A radius kept in hundredths of a tile. */
const tiles = (n: number) => `${plain(n / 100)} ${n === 100 ? "tile" : "tiles"}`;

/** The turns Linger slows for once its stun is over, before anything raises them. */
export const LINGER_TURNS = 3;

const cooldown = (base: number): FamiliarStat => ({ name: "Cooldown", base, step: -3, levels: 15, shown: turns });
const lasting: FamiliarStat = { name: "Duration", base: 20, step: 1, levels: 15, shown: turns };

/** Each familiar's stats by key. Levels are saved by `order`, so never reorder one. */
export const FAMILIARS = {
  dragon: {
    name: "Fire Dragon", short: "Dragon",
    summary: "Damages and weakens enemies in an area around the dragon.",
    order: ["damage", "range", "cooldown", "reduction"],
    stats: {
      // In tenths: ×5 to ×290. The low base is on purpose, so that the damage
      // is grown into (docs/agents/familiars.md).
      damage: { name: "Damage", base: 50, step: 95, levels: 30, shown: times(10) },
      range: { name: "Range", base: 300, step: 40, levels: 15, shown: tiles },
      cooldown: cooldown(75),
      reduction: { name: "Damage Reduction", base: 20, step: 3, levels: 25, shown: percent },
    },
  },
  slime: {
    name: "Lightning Slime", short: "Slime",
    summary: "Stun enemies. Applies slow after stun ends. 50% effective against bosses.",
    order: ["duration", "cooldown", "linger", "range"],
    stats: {
      duration: { name: "Duration", base: 5, step: 1, levels: 10, shown: turns },
      cooldown: cooldown(120),
      linger: { name: "Linger", base: 20, step: 3, levels: 20, shown: (n: number) => `${n}% for ${turns(LINGER_TURNS)}`, boxed: percent },
      range: { name: "Range", base: 200, step: 30, levels: 15, shown: tiles },
    },
  },
  wolf: {
    name: "Hunting Wolf", short: "Wolf",
    summary: "Tags enemies for increased damage.",
    order: ["duration", "cooldown", "bonus", "range"],
    stats: {
      duration: lasting,
      cooldown: cooldown(120),
      bonus: { name: "Bonus", base: 350, step: 40, levels: 30, shown: times(100) },
      range: { name: "Range", base: 250, step: 25, levels: 18, shown: tiles },
    },
  },
  falcon: {
    name: "Golden Falcon", short: "Falcon",
    summary: "Grants gold multiplier on kills within range.",
    order: ["duration", "cooldown", "bonus", "range"],
    stats: {
      duration: lasting,
      cooldown: cooldown(120),
      bonus: { name: "Bonus", base: 200, step: 20, levels: 30, shown: times(100) },
      // TODO: research is to take Duration to 45 turns, once it has a schedule,
      // and relics and Equipment to widen Range, once any do.
      range: { name: "Range", base: 200, step: 25, levels: 20, shown: tiles },
    },
  },
  wisp: {
    name: "Support Wisp", short: "Wisp",
    summary: "Boost other familiar effects within range.",
    order: ["duration", "cooldown", "bonus", "range"],
    stats: {
      duration: lasting,
      cooldown: cooldown(120),
      bonus: { name: "Bonus", base: 105, step: 5, levels: 30, shown: times(100) },
      range: { name: "Range", base: 250, step: 25, levels: 18, shown: tiles },
    },
  },
} as const satisfies Record<FamiliarId, { name: string; short: string; summary: string; order: readonly [string, string, string, string]; stats: Record<string, FamiliarStat> }>;

/** The key of one of familiar `I`'s stats. */
export type StatKey<I extends FamiliarId> = (typeof FAMILIARS)[I]["order"][number];
/** A familiar's levels, in its `order`. */
export type FamiliarLevels = [number, number, number, number];

/** Familiar `id`'s stat in `slot` of its order. */
export function statAt(id: FamiliarId, slot: number): FamiliarStat {
  const { order, stats } = FAMILIARS[id];
  return (stats as Record<string, FamiliarStat>)[order[slot]!]!;
}

/** What the stat in `slot` is worth at `level`, before research. */
export function statValue(id: FamiliarId, slot: number, level: number) {
  const stat = statAt(id, slot);
  return stat.base + stat.step * level;
}

/** Every value of familiar `id` at `levels`, by key, before research. */
export function familiarValues<I extends FamiliarId>(id: I, levels: Readonly<FamiliarLevels>): Record<StatKey<I>, number> {
  return Object.fromEntries(FAMILIARS[id].order.map((key, slot) => [key, statValue(id, slot, levels[slot]!)])) as Record<StatKey<I>, number>;
}

/** What the next egg costs to hatch, by how many familiars are owned, whichever it is. */
export const HATCH_MEDALS = [150, 300, 600, 900, 1200] as const;

const FIRST_UPGRADE_MEDALS = 100;
const UPGRADE_MEDALS_STEP = 40;

/** The Medals a stat's next level costs from `level`, or null at its last. */
export const upgradeMedals = (id: FamiliarId, slot: number, level: number) =>
  level >= statAt(id, slot).levels ? null : FIRST_UPGRADE_MEDALS + UPGRADE_MEDALS_STEP * level;
