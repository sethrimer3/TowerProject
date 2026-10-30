/** A run in either mode (`RunCore`, `TowerRun`, `DelveRun`), Automove's memory beside it, and undo's snapshots and the fall. */
import type { ShrineRun } from "./shrines.ts";
import type { CardId, CardLink } from "./cards/cards.ts";
import type { RunBadges } from "./cards/badges.ts";
import type { CardTreeLevels } from "./cards/trees.ts";
import type { PROVISION_BOOSTS, UsedProvision } from "./economy/provisions.ts";
import type { TrainingId } from "./progression/training.ts";
import type { RunNotes } from "./run-notes.ts";
import type { TournamentRun } from "./tournament/run.ts";
import type { Volleys } from "./enemies/ranged.ts";
import type { ChestOdds, DoorOdds, Player, Tile } from "./entities.ts";
/** A stat a provision boosts for a while. */
export type Boosted = (typeof PROVISION_BOOSTS)[keyof typeof PROVISION_BOOSTS];
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
  loadout?: { attack: number; defense: number; maxHp: number; shroud?: number; regen?: number; lifesteal?: number; thorns?: number; parry?: number; armorBreak?: number; bossAttack?: number; pierce?: number };
  /** The hand as it was ordered when the run went inside: the cards that
   * move the hero for the rest of the run. */
  hand?: CardId[];
  /** The Manual hand as it was when the run went inside: cards held for
   * their bonuses, badges and trees, that act only when pressed. Pressed,
   * one is found at its slot past the hand's (`Game.held`). */
  manual?: CardId[];
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
  /** Ignore and Target uses spent this run. What is left is what a run
   * gets now less these, so a count research level completed mid-run counts
   * at once. */
  ignoreUsed?: number;
  targetUsed?: number;
  /** Bombs thrown this run: a run has one for each Bomb provision owned,
   * so what is left is those less these. */
  bombsUsed?: number;
  /** Provisions used this run (Traveler's elixir, Vanguard Banner, Aegis charm):
   * a run has one use for each owned, so what is left is those less
   * these. Undo never gives one back: the count rides onto the run it
   * restores. */
  provisionsUsed?: Partial<Record<UsedProvision, number>>;
  /** The Vanguard Banner's and Aegis charm's boosts going on: the ATK or DEF
   * each added to the hero (on every copy of the run undo holds, so undo
   * never takes it away) and the turns it has left. Undo carries these
   * onto the run it restores, so a boost keeps counting down. */
  boosts?: Partial<Record<Boosted, { amount: number; turns: number }>>;
  /** The floor (`MODES[mode].floorOf`, from 0) the Gold Key provisions
   * last handed the run their keys on: the next come `PROVISION_KEY_FLOORS`
   * floors on. */
  keyFloor?: number;
  /** Undos spent this run. A run has as many as the loadout's undo
   * capacity, and one spent never comes back, so what is left is that
   * capacity less these (undo carries the count onto the run it restores). */
  undosUsed?: number;
  /** New floors counted toward each charge's next regained use (Ignore
   * More, Target More; run-charges.ts), while it is below full. */
  regain?: Partial<Record<"ignore" | "target", number>>;
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
  /** The chances, in percent, of each treasure chest being a Supply or an
   * Equipment Chest (the CHEST card's, raised by Supply and Equipment
   * Chest chance), fixed as the run went inside, so its floors' chests are
   * what they were generated as; none without. */
  chestOdds?: ChestOdds;
  /** DOOR's tree's chances of remaking its floors' doors (`DoorOdds`),
   * fixed as the run went inside, so its floors never change under it;
   * none without. */
  doorOdds?: DoorOdds;
  /** CHEST's tree's percent chance each of its floors is a Treasure Floor,
   * fixed as the run went inside; none without. */
  treasureFloor?: number;
  /** Golden Floor Chance research's percent chance each of its floors is a
   * Golden Floor (environments.ts), fixed as the run went inside; none
   * without. */
  goldenFloor?: number;
  /** The card the player pressed, ahead of the others, until it reaches
   * its target or has no path to one; no other card can be pressed
   * meanwhile. */
  focused?: CardId;
  /** Training ranks bought with Silver this run, on top of the hero's own:
   * they last only for this run. */
  training?: Partial<Record<TrainingId, number>>;
  /** Times each card that acts in place (cards/cards.ts `IN_PLACE`) has acted this
   * run: a siphon's nth use took n training levels, lost only for this run. */
  cardUses?: Partial<Record<CardId, number>>;
  /** Which numbered tower (or delve) the run climbs, from 2 up (tiers.ts);
   * absent for the first. */
  tier?: number;
  /** Ranged enemies' and the Archer's cooldowns, and the turns taken
   * inside (enemies/ranged.ts); absent until the first shot is due. */
  volleys?: Volleys;
  /** The card badges on the hand's cards as the run went inside
   * (cards/badges.ts), each card's top slot first, fixed for the run. */
  badges?: RunBadges;
  /** The card points spent on the trees of the hand's cards as the run went
   * inside (cards/trees.ts, `runCardTrees`), fixed for the run, so its floors
   * (More Enemies' extras) and bonuses never change under it. */
  cardTrees?: CardTreeLevels;
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
   * its stream, which starts from the run seed (progression/free-training.ts). */
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
  /** The Max HP badge's boosts this run, in percent of max HP, summed:
   * the hero's max HP is 1 + this / 100 times what it would be without
   * them (`badgeFactor`); absent with none. Undo takes it back with the
   * run. */
  maxHpBoost?: number;
  /** Whether Angel Wings has raised the hero this run, spending its
   * charge; absent until it has. Undo takes it back with the run, so the
   * fight that spent it, undone, leaves it ready again. */
  wingsSpent?: true;
  /** The Dash Combo going on (`Game.comboTurn`): the Combo the next fight
   * would have (`next`) and the turns since the last fight (`idle`); absent
   * with none. Undo takes it back with the run. */
  combo?: { next: number; idle: number };
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
/** Every card a run holds: its hand's, then its Manual hand's. */
export const heldCards = (run: Pick<RunCore, "hand" | "manual">): CardId[] => [...(run.hand ?? []), ...(run.manual ?? [])];
/** An undo point: the run, the best and XP then, the lifetime Silver then
 * (`silver`, absent in a snapshot older than the profile), since undo
 * takes back the Silver found after it, and each card's XP then (`cardXp`,
 * absent in a snapshot older than card levels). */
export type MoveSnapshot<R extends Run = Run> = { run: R; best: number; xp: number; silver?: number; cardXp?: Partial<Record<CardId, number>>; quiet?: true };
/** A hero fallen in a fight, waiting for the player to undo it or accept
 * defeat: the run just before that fight, and the enemy that won it. */
export type Fall<R extends Run = Run> = { snapshot: MoveSnapshot<R>; by: string };
