/** How the Tower and the Delve differ, one profile per mode: the currency a
 * mode pays (the Tower's Inspiration; the Delve's depth only scores a
 * tournament) and how progress maps to an equivalent floor, where a run enters
 * and how its board is built, what its enemies drop, and the words the game
 * uses for it. Code that needs a per-mode answer asks `MODES[mode]` rather
 * than branching on the mode; features only the Tower has still test for it. */
import { START_X, TOWER_START_X, TOWER_WIDTH, WIDTH } from "./config.ts";
import { goldReward } from "./economy/kill-pay.ts";
import type { DelveRun, Run, TowerRun } from "./runs.ts";
import type { Mode } from "./entities.ts";
import type { Save } from "./save/shape.ts";
import { LAYOUT_VERSION, World } from "./delve/world.ts";
import { depthAt } from "./delve/labyrinth.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import type { Board } from "./board.ts";
import { runExtras, runFoeCut } from "./cards/trees.ts";
import { weakened } from "./shrines.ts";
import { earn } from "./save/profile.ts";

export type ModeProfile<R extends Run = Run> = {
  /** The currency new progress in this mode pays, if any: its balance,
   * paying it, its name as the player sees it, and what a new best pays it
   * for (the reward under the height). */
  pays: { balance(save: Save): number; credit(save: Save, amount: number): void; currency: string; newBest: string } | null;
  /** The equivalent floor `progress` counts as: the scale every loot table
   * is gated on, and each new one reached pays one currency where `pays`. */
  equivalentFloor(progress: number): number;
  /** The progress loot at row `y` of the run's board is measured at. */
  progressAt(run: R, y: number): number;
  /** The equivalent floor the run's hero stands on, from the run alone
   * (undo never leaves it: run-timeline.ts). */
  floorOf(run: R): number;
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
    /** What the progress count measures. */
    progress: string;
    /** A run in this mode. */
    run: string;
    /** The button and dialog action that end a run. */
    endRun: string;
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
    /** The forest's hint: how to begin a run. */
    begin: string;
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
 * equivalent floors it reaches (`milestonePoints`); none in a mode that
 * pays none. */
export function milestones(profile: ModeProfile, from: number, to: number) {
  if (!profile.pays) return 0;
  return milestonePoints(profile.equivalentFloor(to)) - milestonePoints(profile.equivalentFloor(from));
}

/** A Delve depth's equivalent floor: one for each ten depth. */
const delveFloor = (depth: number) => Math.floor(depth / 10);

export const MODES: { tower: ModeProfile<TowerRun>; delve: ModeProfile<DelveRun> } = {
  tower: {
    pays: {
      balance: (save) => save.tower.inspiration,
      credit: (save, amount) => { save.tower.inspiration += amount; earn(save, "inspiration", amount); },
      currency: "Inspiration",
      newBest: "Inspiration for each floor this climb has completed beyond your highest: paid as you climb its stairs",
    },
    equivalentFloor: (height) => height,
    progressAt: (run) => run.height,
    floorOf: (run) => run.height,
    width: TOWER_WIDTH,
    entranceX: TOWER_START_X,
    layoutVersion: TOWER_LAYOUT_VERSION,
    board: (run) => new RoomWorld(run.seed, run.height, run.changes, run.percentPotions, run.tier, runExtras(run), weakened((run as TowerRun).shrine?.applied?.foes, runFoeCut(run)), run.chestOdds, run.doorOdds, run.treasureFloor),
    endGold: () => 0,
    // Tower floors reuse the same x/y space, so the floor is part of the key.
    lootKey: (run, x, y) => `${run.seed}:${run.height}:${x},${y}`,
    words: {
      progress: "floor",
      run: "climb",
      endRun: "End Climb",
      tierName: "Tower",
      keepGoing: "Keep climbing",
      outsideTitle: "THE TOWER APPROACH",
      title: "THE ASCENT TRIALS",
      subtitle: "ONE CHAMBER AT A TIME",
      enter: "You enter the tower.",
      begin: "Press Enter or the tower entrance to begin a climb.",
      entrance: "Begin the climb — Floor 1",
      floor: "Well-worn stone floor.",
    },
  },
  delve: {
    pays: null,
    equivalentFloor: delveFloor,
    progressAt: (_run, y) => y,
    floorOf: (run) => delveFloor(depthAt(run.seed, run.player.x, run.player.y, run.milestone, run.tier ?? 1)),
    width: WIDTH,
    entranceX: START_X,
    layoutVersion: LAYOUT_VERSION,
    board: (run) => new World(run, runExtras(run), weakened(undefined, runFoeCut(run))),
    endGold: (run) => goldReward(run.treasures),
    lootKey: (run, x, y) => `${run.seed}:${x},${y}`,
    words: {
      progress: "depth",
      run: "delve",
      endRun: "End Run",
      tierName: "Delve",
      keepGoing: "Keep delving",
      outsideTitle: "THE MOUNTAIN HOLLOW",
      title: "THE HOLLOW SPIRE",
      subtitle: "HIGHER DANGERS · GREATER REWARDS",
      enter: "You enter the mountain cave.",
      begin: "Press Enter or the cave entrance to begin a delve.",
      entrance: "Descend into the cave",
      floor: "Ancient cavern floor.",
    },
  },
};
