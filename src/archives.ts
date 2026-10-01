import { levelForXp, type UpgradeId } from "./config.ts";
import type { Settings } from "./settings.ts";

// The Archives: research that lasts between runs. An archivist takes one
// research project at a time; each level costs Gold and real time, and once
// done changes the game for good. What research does is data: each level's
// effect names a number the game reads through `researched`, so a new
// project needs a row here and, for a new kind of effect, one target.
//
// Every time here is a wall-clock timestamp (ms), passed in, so research
// runs on while the game is closed and tests set the clock.

/** The groups the research library can be filtered by. */
export const RESEARCH_CATEGORIES = {
  combat: "Combat",
  economy: "Economy",
  defense: "Defense",
  abilities: "Abilities",
  equipment: "Equipment",
  progression: "Progression",
  qualityOfLife: "Quality of life",
  special: "Special",
} as const;
export type ResearchCategory = keyof typeof RESEARCH_CATEGORIES;

/** The numbers research can change, each with how one effect on it reads. */
export const RESEARCH_TARGETS = {
  /** Focus uses a run starts with. */
  focusPerRun: { text: (v: number) => `+${v} Focus use each run` },
  /** Movement speed choices above 3 steps a second, once Movement Speed is owned. */
  moveSpeed: { text: (v: number) => `${3 + v} steps / sec option` },
  /** Undos the hero can store, once Rehearsed steps has given the first. */
  undoCapacity: { text: (v: number) => `+${v} undo stored` },
  /** The percent of its HP a potion restores, from 100 (red potions aside). */
  potionHeal: { text: (v: number) => `+${v}% potion healing` },
  /** The percent of its Gold / Floor a new floor pays, from 100. */
  floorGold: { text: (v: number) => `+${v}% Gold per floor` },
  /** The percent of its Silver / Floor a new floor pays, from 100. */
  floorSilver: { text: (v: number) => `+${v}% Silver per floor` },
  /** The percent of the Silver found that a run pays, from 100. */
  silverBonus: { text: (v: number) => `+${v}% Silver` },
  /** The percent of its Gold a kill pays, from 100. */
  killGold: { text: (v: number) => `+${v}% Gold per kill` },
  /** How fast trainers work: a rank of `d` takes d / (1 + speed). */
  trainingSpeed: { text: (v: number) => `+${Math.round(v * 100)}% training speed` },
  /** How fast archivists work: a level of `d` hours takes d / (1 + speed). */
  researchSpeed: { text: (v: number) => `+${Math.round(v * 100)}% research speed` },
} as const;
export type ResearchTarget = keyof typeof RESEARCH_TARGETS;

/** How an effect changes its target. Levels add up: every completed level's
 * effect applies, the adds summed, then the multipliers; a `set` replaces
 * the whole result with the latest level's value. */
export type ResearchEffect = { target: ResearchTarget; op: "add" | "multiply" | "set"; value: number };
/** What a research level costs and gives. */
export type ResearchLevel = { gold: number; hours: number; effect: ResearchEffect };
/** Something a research project needs before it can start: an owned skill,
 * another project's level, or the hero's level. */
export type ResearchRequirement =
  | { upgrade: UpgradeId }
  | { research: string; level: number }
  | { playerLevel: number };
export type ResearchDefinition = {
  name: string;
  description: string;
  categories: ResearchCategory[];
  requires: ResearchRequirement[];
  /** Level 1 first; the project's maximum level is its length. */
  levels: ResearchLevel[];
};

/** Focus Count and Undo Count: +1 to `target` a level, for nine levels
 * (Movement Speed takes the first six). Level 1 costs 500 Gold and takes 8
 * hours; each level after takes 8 hours more, and costs 500 × n Gold more
 * than level n before it (500, 1000, 2000, 3500, …). */
const countLevels = (target: ResearchTarget, length = 9) => Array.from({ length }, (_, i): ResearchLevel => ({
  gold: 500 * (1 + (i * (i + 1)) / 2),
  hours: 8 * (i + 1),
  effect: { target, op: "add", value: 1 },
}));

/** Potion HP (+3% potion healing a level) and Gold / Floor (+5% of the
 * Gold a new floor pays a level), for 100 levels each. The first four
 * are quick, to draw players in (15 s for 10 Gold, 1 min for 25, 5 min for
 * 50, 10 min for 75); then the formula starts over from level 5, so the
 * seam is smooth: the m-th level after them (level 4 + m) takes m / 4 hours
 * and costs 100 × m Gold (15 min and 100 Gold at level 5, 24 h and 9,600 at
 * 100). */
const POTION_HP_START: [gold: number, seconds: number][] = [[10, 15], [25, 60], [50, 300], [75, 600]];
const hundredLevels = (target: ResearchTarget, value: number) => Array.from({ length: 100 }, (_, i): ResearchLevel => {
  const m = i + 1 - POTION_HP_START.length, [gold, seconds] = POTION_HP_START[i] ?? [100 * m, 900 * m];
  return { gold, hours: seconds / 3600, effect: { target, op: "add", value } };
});

/** Faster Trainers: +2% training speed a level, for 100 levels. The n-th
 * level costs 250 × n Gold and takes 1.75 × n hours, about a year and 1.26
 * million Gold in all (Potion HP takes about seven weeks). */
const fasterTrainersLevels = () => Array.from({ length: 100 }, (_, i): ResearchLevel => ({
  gold: 250 * (i + 1),
  hours: 1.75 * (i + 1),
  effect: { target: "trainingSpeed", op: "add", value: 0.02 },
}));

/** The research library, in the order the Archives list it. */
export const RESEARCH = {
  potionHp: {
    name: "Potion HP",
    description: "Stronger draughts: every potion restores more HP.",
    categories: ["defense"],
    requires: [{ upgrade: "greaterHeal" }],
    levels: hundredLevels("potionHeal", 3),
  },
  focusCount: {
    name: "Focus Count",
    description: "Study the old climbers' journals to start each run with more Focus.",
    categories: ["abilities"],
    requires: [{ upgrade: "focus" }],
    levels: countLevels("focusPerRun"),
  },
  moveSpeed: {
    name: "Movement Speed",
    description: "Drill the old climbers' quickstep: the Movement speed setting goes one step a second faster.",
    categories: ["qualityOfLife"],
    requires: [{ upgrade: "moveSpeed" }],
    levels: countLevels("moveSpeed", 6),
  },
  undoCount: {
    name: "Undo Count",
    description: "Rehearse old climbs to store more undos.",
    categories: ["abilities"],
    requires: [{ upgrade: "inspirationUndos" }],
    levels: countLevels("undoCapacity"),
  },
  fasterTrainers: {
    name: "Faster Trainers",
    description: "Teach the trainers the old masters' drills: every rank a trainer trains takes less time.",
    categories: ["progression"],
    requires: [{ upgrade: "fasterTrainers" }],
    levels: fasterTrainersLevels(),
  },
  floorGold: {
    name: "Gold / Floor",
    description: "Count the coins in the cracks: every new floor of a run pays more Gold.",
    categories: ["economy"],
    requires: [{ upgrade: "spareChange" }],
    levels: hundredLevels("floorGold", 5),
  },
  floorSilver: {
    name: "Silver / Floor",
    description: "Toss a coin in the well: every new floor of a run pays more Silver.",
    categories: ["economy"],
    requires: [{ upgrade: "wishingWell" }],
    levels: hundredLevels("floorSilver", 5),
  },
  silverBonus: {
    name: "Silver Bonus",
    description: "Learn the moneychangers' tricks: all Silver found in a run is worth more.",
    categories: ["economy"],
    requires: [{ upgrade: "wealthy" }],
    levels: hundredLevels("silverBonus", 3),
  },
  killGold: {
    name: "Gold / Kill",
    description: "Search the fallen more thoroughly: every kill pays more Gold.",
    categories: ["economy"],
    requires: [{ upgrade: "loot" }],
    levels: hundredLevels("killGold", 3),
  },
} satisfies Record<string, ResearchDefinition>;
export type ResearchId = keyof typeof RESEARCH;
export const RESEARCH_IDS = Object.keys(RESEARCH) as ResearchId[];
export const research = (id: ResearchId): ResearchDefinition => RESEARCH[id];

/** Archivist slots: the Archives start with `start`, and each further one,
 * up to `maximum`, is hired for the next price in Gold. */
export const ARCHIVISTS = { start: 1, maximum: 5, prices: [1000, 2500, 5000, 10000] } as const;
/** How many completions the history keeps, newest last. */
export const HISTORY_LIMIT = 200;

/** A research level being worked on: paid for, started at `startedAt`
 * (moved back by any progress kept from before), done at `completesAt`. */
export type ResearchJob = { research: ResearchId; level: number; startedAt: number; completesAt: number; paid: number };
/** One archivist: its job, if any, and whether it starts the project's next
 * level on its own when this one completes. */
export type ArchivistSlot = { job?: ResearchJob; autoContinue: boolean };
export type ResearchRecord = { at: number; research: ResearchId; level: number };
export type ArchivesSave = {
  /** The hired archivists. */
  slots: ArchivistSlot[];
  /** Each project's completed level. */
  levels: Partial<Record<ResearchId, number>>;
  /** Progress kept from a switched-out job, as the share (0–1) of the
   * project's next level already done. */
  progress: Partial<Record<ResearchId, number>>;
  /** Completed levels, oldest first. */
  history: ResearchRecord[];
};

export function defaultArchives(): ArchivesSave {
  return { slots: Array.from({ length: ARCHIVISTS.start }, () => ({ autoContinue: false })), levels: {}, progress: {}, history: [] };
}

/** What the Archives read from the rest of the profile (a `Save`), and
 * the Gold they spend. */
export type ArchivesOwner = {
  archives: ArchivesSave;
  gold: number;
  upgrades: Record<UpgradeId, number>;
  /** Lifetime XP, for the hero's level. */
  xp: number;
  /** Dev free purchases: research costs no Gold and takes no time, and
   * archivists are hired for nothing. */
  settings: Pick<Settings, "freePurchases">;
};

export const researchLevel = (a: ArchivesSave, id: ResearchId) => a.levels[id] ?? 0;
/** The level `id` would research next, or undefined once it is complete. */
export const nextLevel = (a: ArchivesSave, id: ResearchId): ResearchLevel | undefined =>
  research(id).levels[researchLevel(a, id)];

/** `base` changed by every completed research level aimed at `target`. */
export function researched(a: ArchivesSave, target: ResearchTarget, base: number) {
  let add = 0, multiply = 1, set: number | undefined;
  for (const id of RESEARCH_IDS) {
    for (const { effect } of research(id).levels.slice(0, researchLevel(a, id))) {
      if (effect.target !== target) continue;
      if (effect.op === "add") add += effect.value;
      else if (effect.op === "multiply") multiply *= effect.value;
      else set = effect.value;
    }
  }
  return set ?? (base + add) * multiply;
}

/** How long `level` takes with the research speed the Archives have now,
 * in ms. The definition keeps its own hours. */
export const duration = (a: ArchivesSave, level: ResearchLevel) =>
  Math.round((level.hours * 3_600_000) / (1 + researched(a, "researchSpeed", 0)));

const met = (o: ArchivesOwner, r: ResearchRequirement) =>
  "upgrade" in r ? o.upgrades[r.upgrade] > 0
  : "research" in r ? researchLevel(o.archives, r.research as ResearchId) >= r.level
  : levelForXp(o.xp) >= r.playerLevel;
/** The requirements `id` still waits on. */
export const missing = (o: ArchivesOwner, id: ResearchId) => research(id).requires.filter((r) => !met(o, r));

/** The slot working on `id`, or -1. */
export const activeSlot = (a: ArchivesSave, id: ResearchId) => a.slots.findIndex((s) => s.job?.research === id);

export type ResearchStatus = "locked" | "available" | "active" | "completed";
export function status(o: ArchivesOwner, id: ResearchId): ResearchStatus {
  if (activeSlot(o.archives, id) >= 0) return "active";
  if (!nextLevel(o.archives, id)) return "completed";
  return missing(o, id).length ? "locked" : "available";
}

/** A job's share done at `now`, 0–1 (a clock set back reads as no progress). */
export const jobProgress = (job: ResearchJob, now: number) =>
  Math.min(1, Math.max(0, (now - job.startedAt) / Math.max(1, job.completesAt - job.startedAt)));

/** Why `id` can't start in `slot` now, or null when it can. */
export function cannotStart(o: ArchivesOwner, slot: number, id: ResearchId): string | null {
  const a = o.archives, level = nextLevel(a, id);
  if (!a.slots[slot] || a.slots[slot].job) return "That archivist is busy.";
  if (!level) return "Research complete.";
  if (activeSlot(a, id) >= 0) return "Already being researched.";
  if (missing(o, id).length) return "Locked.";
  if (!o.settings.freePurchases && o.gold < level.gold) return `Need ${level.gold} Gold.`;
  return null;
}

/** Pays for `id`'s next level and sets `slot` to work on it from `now`,
 * picking up any progress kept for it. False when it can't start. */
export function startResearch(o: ArchivesOwner, slot: number, id: ResearchId, now: number) {
  if (cannotStart(o, slot, id)) return false;
  begin(o, slot, id, now);
  return true;
}
function begin(o: ArchivesOwner, slot: number, id: ResearchId, now: number) {
  const a = o.archives, level = nextLevel(a, id)!, free = o.settings.freePurchases;
  const ms = free ? 0 : duration(a, level), paid = free ? 0 : level.gold;
  const done = a.progress[id] ?? 0;
  delete a.progress[id];
  o.gold -= paid;
  const startedAt = now - Math.round(done * ms);
  a.slots[slot].job = { research: id, level: researchLevel(a, id) + 1, startedAt, completesAt: startedAt + ms, paid };
}

/** Stops `slot`'s job at `now`: its Gold comes back, and the share done is
 * kept for the project, so starting it again (and paying again) resumes
 * from there. */
export function cancelResearch(o: ArchivesOwner, slot: number, now: number) {
  const job = o.archives.slots[slot]?.job;
  if (!job) return false;
  const done = jobProgress(job, now);
  if (done > 0 && done < 1) o.archives.progress[job.research] = done;
  o.gold += job.paid;
  o.archives.slots[slot].job = undefined;
  return true;
}

/** Takes `ms` off `slot`'s job: the way to trade something scarce for
 * research time (nothing pays for it yet but Dev mode). */
export function hastenResearch(a: ArchivesSave, slot: number, ms: number) {
  const job = a.slots[slot]?.job;
  if (!job || !(ms > 0)) return false;
  job.startedAt -= ms;
  job.completesAt -= ms;
  return true;
}

/** Completes every job due by `now`, oldest first, recording each. An
 * archivist set to auto-continue starts the project's next level the
 * moment the last completed, paying for it, so research done while the game
 * was closed carries on; without the Gold (or with nothing left to
 * research), it waits idle. Returns what completed. */
export function settleArchives(o: ArchivesOwner, now: number): ResearchRecord[] {
  const a = o.archives, done: ResearchRecord[] = [];
  for (;;) {
    const due = a.slots
      .map((s, i) => ({ i, job: s.job }))
      .filter((s): s is { i: number; job: ResearchJob } => !!s.job && s.job.completesAt <= now)
      .sort((x, y) => x.job.completesAt - y.job.completesAt || x.i - y.i)[0];
    if (!due) break;
    const { i, job } = due;
    a.slots[i].job = undefined;
    a.levels[job.research] = job.level;
    const record = { at: job.completesAt, research: job.research, level: job.level };
    a.history.push(record);
    done.push(record);
    if (a.slots[i].autoContinue && !cannotStart(o, i, job.research)) begin(o, i, job.research, job.completesAt);
  }
  if (a.history.length > HISTORY_LIMIT) a.history.splice(0, a.history.length - HISTORY_LIMIT);
  return done;
}

/** The Gold the next archivist costs, or undefined when all are hired. */
export const nextArchivistPrice = (a: ArchivesSave): number | undefined => ARCHIVISTS.prices[a.slots.length - ARCHIVISTS.start];
/** Hires the next archivist for its Gold. */
export function hireArchivist(o: ArchivesOwner) {
  const price = nextArchivistPrice(o.archives);
  if (price === undefined) return false;
  if (!o.settings.freePurchases) {
    if (o.gold < price) return false;
    o.gold -= price;
  }
  o.archives.slots.push({ autoContinue: false });
  return true;
}

// --- Saves ---
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e15;
const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isResearch = (id: unknown): id is ResearchId => typeof id === "string" && RESEARCH_IDS.includes(id as ResearchId);

/** The saved Archives, each part kept when it is well formed: completed
 * levels within each project's maximum, a job only for the level after the
 * completed one and no project in two slots, and kept progress under 1. */
export function decodeArchives(raw: any): ArchivesSave {
  const a = defaultArchives();
  if (!isRecord(raw)) return a;
  if (isRecord(raw.levels))
    for (const id of RESEARCH_IDS) {
      const n = raw.levels[id];
      if (Number.isInteger(n) && n > 0 && n <= research(id).levels.length) a.levels[id] = n;
    }
  if (isRecord(raw.progress))
    for (const id of RESEARCH_IDS) {
      const p = raw.progress[id];
      if (finite(p) && p > 0 && p < 1 && nextLevel(a, id)) a.progress[id] = p;
    }
  if (Array.isArray(raw.slots) && raw.slots.length >= ARCHIVISTS.start && raw.slots.length <= ARCHIVISTS.maximum) {
    const busy = new Set<ResearchId>();
    a.slots = raw.slots.map((s: any): ArchivistSlot => {
      const slot: ArchivistSlot = { autoContinue: s?.autoContinue === true };
      const j = s?.job;
      if (
        isRecord(j) && isResearch(j.research) && !busy.has(j.research) && j.level === researchLevel(a, j.research) + 1 &&
        nextLevel(a, j.research) && finite(j.startedAt) && finite(j.completesAt) && j.completesAt >= j.startedAt && finite(j.paid)
      ) {
        busy.add(j.research);
        slot.job = { research: j.research, level: j.level, startedAt: j.startedAt, completesAt: j.completesAt, paid: Math.floor(j.paid) };
      }
      return slot;
    });
  }
  if (Array.isArray(raw.history))
    a.history = raw.history
      .filter((r: any) => isRecord(r) && finite(r.at) && isResearch(r.research) && Number.isInteger(r.level) && r.level > 0 && r.level <= research(r.research).levels.length)
      .slice(-HISTORY_LIMIT)
      .map((r: any) => ({ at: r.at, research: r.research, level: r.level }));
  return a;
}
