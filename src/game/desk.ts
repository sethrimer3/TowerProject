import type { Run, Save } from "../entities.ts";
import type { MissionType } from "../missions/catalog.ts";

/** What the game's desks need from it: the save (replaced by an erase, so
 * read each time), the active run, Dev free purchases, the wall clock and
 * the status line. */
export interface DeskHost {
  readonly save: Save;
  readonly run: Run;
  readonly free: boolean;
  clock(): number;
  message: string;
  /** Counts what a desk's command did toward the daily missions. */
  missionDone?(type: MissionType, amount: number): void;
}

/** Whether `gems` can be paid now (always, with Dev free purchases). */
export const affordsGems = (host: DeskHost, gems: number) => host.free || host.save.gems >= gems;
