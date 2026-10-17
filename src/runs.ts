/** A run in either mode (`RunCore`, `TowerRun`, `DelveRun`), Automove's memory beside it, and undo's snapshots and the fall. */
import type { ShrineRun } from "./shrines.ts";
import type { CardId, CardLink } from "./cards.ts";
import type { RunBadges } from "./badges.ts";
import type { TrainingId } from "./config.ts";
import type { RunNotes } from "./run-notes.ts";
import type { TournamentRun } from "./tournament/run.ts";
import type { Volleys } from "./ranged.ts";
import type { Player, Tile } from "./entities.ts";
/** What a run holds in either mode. */
export type RunCore = {
  outside?: boolean;
  layoutVersion?: number;
  seed: number;
  player: Player;
  height: number;
  maxHeight?: number;
  kills: number;
  treasures: number;
  changes: Record<string, Tile>;
  floor: number;
  /** The ATK/DEF/max HP the run started with (its loadout), shifted by any
   * gear change since. */
  loadout?: { attack: number; defense: number; maxHp: number; shroud?: number; regen?: number; lifesteal?: number; thorns?: number; parry?: number; bossAttack?: number; pierce?: number };
  /** The hand as it was ordered when the run went inside: the cards that
   * move the hero for the rest of the run. */
  hand?: CardId[];
  /** The hand's links (Card Groups) as they were when the run went inside. */
  links?: CardLink[];
  /** Silver held: earned from enemies and spent inside this run only, so
   * undo takes it back with the rest of the run. */
  silver?: number;
  /** XP earned from kills this run, for the run's end dialog; undo takes
   * it back with the rest of the run, as it does the hero's XP. */
  xp?: number;
  /** The run's notes (run-notes.ts): its start, steps, keys, doors,
   * pickups and Silver found; undo takes them back with the run. */
  notes?: RunNotes;
  /** Focus uses spent this run. What is left is what a run gets now less
   * these, so a Focus Count level completed mid-run counts at once. */
  focusUsed?: number;
  /** Ignore and Target uses spent this run, counted like Focus's. */
  ignoreUsed?: number;
  targetUsed?: number;
  /** Undos spent this run. A run has as many as the loadout's undo
   * capacity, and one spent never comes back, so what is left is that
   * capacity less these (undo carries the count onto the run it restores). */
  undosUsed?: number;
  /** New floors counted toward each charge's next regained use (Refocus,
   * Ignore More, Target More; run-charges.ts), while it is below full. */
  regain?: Partial<Record<"focus" | "ignore" | "target", number>>;
  /** The tiles Ignore marked on floor `floor` (points): no card's path, or
   * Target's, steps on them for the rest of that floor. */
  ignored?: { floor: number; tiles: string[] };
  /** The tile (a point) Target sends the hero to, until it gets there or
   * has no path left. */
  targeted?: string;
  /** The chance each potion on this run's floors is a percent potion, in
   * hundredths of a percent, from Recovery and Find Potion training when it
   * went inside (none without). Fixed for the run, so its floors never
   * change under it. */
  percentPotions?: number;
  /** The card a Focus put ahead of the others, until it reaches its target
   * or has no path to one. */
  focused?: CardId;
  /** Training ranks bought with Silver this run, on top of the hero's own:
   * they last only for this run. */
  training?: Partial<Record<TrainingId, number>>;
  /** Times each card that acts in place (cards.ts `IN_PLACE`) has acted this
   * run: a siphon's nth use took n training levels, lost only for this run. */
  cardUses?: Partial<Record<CardId, number>>;
  /** Which numbered tower (or delve) the run climbs, from 2 up (tiers.ts);
   * absent for the first. */
  tier?: number;
  /** Ranged enemies' and the Archer's cooldowns, and the turns taken
   * inside (ranged.ts); absent until the first shot is due. */
  volleys?: Volleys;
  /** The card badges on the hand's cards as the run went inside
   * (badges.ts), each card's top slot first, fixed for the run. */
  badges?: RunBadges;
  /** The floor each cooling-down badge (Stairward, Skip Open Nodes) last
   * worked on: it works again on that floor, or once enough floors pass. */
  badgeFloors?: Partial<Record<"stairward" | "skipOpen", number>>;
  /** The doors and monsters Skip Open Nodes passed over on floor `floor`
   * (points), skipped and marked for the rest of that floor. */
  skipped?: { floor: number; tiles: string[] };
  /** Deprioritize on floor `floor`: how many targets it has marked there,
   * and the tiles still marked with a ? or, once the hand was stuck, a !
   * (points); stepping on one clears its mark. */
  marks?: { floor: number; made: number; tiles: string[]; bangs: string[] };
  /** How many of Skip's rolls this run has drawn from its stream, which
   * starts from the run seed. */
  skipRolls?: number;
  /** How many of each Free Upgrade group's rolls this run has drawn from
   * its stream, which starts from the run seed (free-training.ts). */
  freeRolls?: Partial<Record<"offense" | "defense" | "utility", number>>;
  /** How many enemies the run has spawned onto its floors
   * (`Game.spawnEnemy`), each numbered by the count before it; absent with
   * none. Undo takes it back with the run, so a spawn undone and made again
   * gets the same number. */
  spawns?: number;
  /** Goldback's combo: the multiplier its activations have tallied for the
   * next Gold the run finds (each adds its value), used up by that Gold;
   * absent with none. */
  goldCombo?: number;
};
/** A Tower ascent. */
export type TowerRun = RunCore & {
  /** Whether the hero has taken fight damage in this area (the ten floors
   * from the current section's first): whether it can still be mastered. */
  damaged: boolean;
  /** Whether the hero has climbed past a floor of this area with an enemy
   * still on it: whether the area can still be cleared (absent: none). */
  enemiesLeft?: boolean;
  /** The heights of the floors where a Greater Boss has appeared this run
   * (tower/greater-boss.ts), each once. */
  summoned?: number[];
  /** The height the run began on, when a Warp began it above the first
   * floor (absent: floor 1); Retry starts the next run there. */
  start?: number;
  /** The run's boons (shrines.ts): absent until Shrines are researched and
   * the first is earned. */
  shrine?: ShrineRun;
};
/** A Delve descent. */
export type DelveRun = RunCore & {
  /** Milestone gates crossed: the area the labyrinth is sealed below. */
  milestone: number;
  /** The highest row the hero has stood on this run (absent: the row it
   * stands on). The STAIRS card climbs only to rows above it. */
  top?: number;
  /** A tournament run's tournament, seeds and chance streams
   * (tournament/run.ts); absent for every other run. */
  tournament?: TournamentRun;
};
/** What Delve Automove has seen of the descent in the labyrinth, and how
 * often the player has stood on each tile. It is kept beside the run, not
 * in it, so undo never copies or rewinds it. */
export type AutomoveMemory = { known: Record<string, true>; visited: Record<string, number> };
export type Run = TowerRun | DelveRun;
/** An undo point: the run, the best and XP then, and the lifetime Silver
 * then (`silver`, absent in a snapshot older than the profile), since undo
 * takes back the Silver found after it. */
export type MoveSnapshot<R extends Run = Run> = { run: R; best: number; xp: number; silver?: number; quiet?: true };
/** A hero fallen in a fight, waiting for the player to undo it or accept
 * defeat: the run just before that fight, and the enemy that won it. */
export type Fall<R extends Run = Run> = { snapshot: MoveSnapshot<R>; by: string };
