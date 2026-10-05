/** How the Tower and the Delve differ, one profile per mode: the currency a
 * mode pays and how progress maps to an equivalent floor, where a run enters
 * and how its board is built, what its enemies drop, and the words the game
 * uses for it. Code that needs a per-mode answer asks `MODES[mode]` rather
 * than branching on the mode; features only the Tower has still test for it. */
import { START_X, TOWER_START_X, TOWER_WIDTH, WIDTH, goldReward } from "./config.ts";
import type { DelveRun, Mode, Run, Save, TowerRun } from "./entities.ts";
import { LAYOUT_VERSION, World } from "./delve/world.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import type { Board } from "./board.ts";

export type ModeProfile<R extends Run = Run> = {
  /** The balance of the currency this mode pays, and paying it. */
  balance(save: Save): number;
  credit(save: Save, amount: number): void;
  /** The equivalent floor `progress` counts as: the scale every loot table
   * is gated on, and each new one reached pays one currency. */
  equivalentFloor(progress: number): number;
  /** The progress loot at row `y` of the run's board is measured at. */
  progressAt(run: R, y: number): number;
  /** The board's width, and the column a run enters at from the forest. */
  width: number;
  entranceX: number;
  /** The generator version a run's saved map edits belong to. */
  layoutVersion: number;
  /** The board a run inside the mode plays on, regenerated from its seed. */
  board(run: R): Board;
  /** Gold paid when a run ends. */
  endGold(run: R): number;
  /** Keys a kill or treasure so it pays out once, whatever undo does. */
  lootKey(run: R, x: number, y: number): string;
  words: {
    /** The currency, as the player sees it. */
    currency: string;
    /** What the progress count measures. */
    progress: string;
    /** What the currency a new best pays is paid for (the reward under the height). */
    newBest: string;
    /** A run in this mode. */
    run: string;
    /** What a retired run is replaced with. */
    fresh: string;
    /** The numbered places a run climbs, as in "Tower II" (tiers.ts). */
    tierName: string;
    /** Declines a prompt to end the run. */
    keepGoing: string;
    /** The board's title in the forest outside, and inside. */
    outsideTitle: string;
    title: string;
    subtitle: string;
    /** Feedback on stepping through the entrance. */
    enter: string;
    /** The inspect text for the forest entrance and a plain floor tile. */
    entrance: string;
    floor: string;
  };
};

/** The milestone schedule: from each equivalent floor (`from`) on, one point
 * every `per` equivalent floors, until the next stage. Past the last stage's
 * `until`, no more points. */
export const MILESTONE_STAGES = [
  { from: 0, per: 1 },
  { from: 100, per: 10 },
  { from: 1000, per: 100 },
] as const;
export const MILESTONE_END = 10000;

/** The milestone points reaching equivalent floor `floor` pays in all: one a
 * floor to 100, one per 10 floors to 1,000, one per 100 floors to 10,000,
 * then none (100, 190 and 280 points at those floors). */
export function milestonePoints(floor: number) {
  let points = 0;
  MILESTONE_STAGES.forEach((stage, i) => {
    const end = Math.min(floor, MILESTONE_STAGES[i + 1]?.from ?? MILESTONE_END);
    if (end > stage.from) points += Math.floor((end - stage.from) / stage.per);
  });
  return points;
}

/** Milestone currency for progress rising from `from` to `to`, by the
 * equivalent floors it reaches (`milestonePoints`). */
export function milestones(profile: ModeProfile, from: number, to: number) {
  return milestonePoints(profile.equivalentFloor(to)) - milestonePoints(profile.equivalentFloor(from));
}

export const MODES: { tower: ModeProfile<TowerRun>; delve: ModeProfile<DelveRun> } = {
  tower: {
    balance: (save) => save.tower.inspiration,
    credit: (save, amount) => { save.tower.inspiration += amount; },
    equivalentFloor: (height) => height,
    progressAt: (run) => run.height,
    width: TOWER_WIDTH,
    entranceX: TOWER_START_X,
    layoutVersion: TOWER_LAYOUT_VERSION,
    board: (run) => new RoomWorld(run.seed, run.height, run.changes, run.percentPotions, run.tier),
    endGold: () => 0,
    // Tower floors reuse the same x/y space, so the floor is part of the key.
    lootKey: (run, x, y) => `${run.seed}:${run.height}:${x},${y}`,
    words: {
      currency: "Inspiration",
      progress: "floor",
      newBest: "Inspiration for each floor this ascent has completed beyond your highest: paid as you climb its stairs",
      run: "ascent",
      fresh: "tower",
      tierName: "Tower",
      keepGoing: "Keep climbing",
      outsideTitle: "THE TOWER APPROACH",
      title: "THE ASCENT TRIALS",
      subtitle: "ONE CHAMBER AT A TIME",
      enter: "You enter the tower.",
      entrance: "Begin the climb — Floor 1",
      floor: "Well-worn stone floor.",
    },
  },
  delve: {
    balance: (save) => save.delve.courage,
    credit: (save, amount) => { save.delve.courage += amount; },
    equivalentFloor: (depth) => Math.floor(depth / 10),
    progressAt: (_run, y) => y,
    width: WIDTH,
    entranceX: START_X,
    layoutVersion: LAYOUT_VERSION,
    board: (run) => new World(run),
    endGold: (run) => goldReward(run.treasures),
    lootKey: (run, x, y) => `${run.seed}:${x},${y}`,
    words: {
      currency: "Courage",
      progress: "depth",
      newBest: "Courage for each new 10-depth milestone this delve has passed beyond your deepest",
      run: "delve",
      fresh: "descent",
      tierName: "Delve",
      keepGoing: "Keep delving",
      outsideTitle: "THE MOUNTAIN HOLLOW",
      title: "THE HOLLOW SPIRE",
      subtitle: "HIGHER DANGERS · GREATER REWARDS",
      enter: "You enter the mountain cave.",
      entrance: "Descend into the cave",
      floor: "Ancient cavern floor.",
    },
  },
};
