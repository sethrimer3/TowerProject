import type { TrainingJob, TrainingPaid } from "./training-jobs.ts";
import type { TierRecord } from "./tiers.ts";
import type { ArchivesSave } from "./archives.ts";
import type { CardId } from "./cards.ts";
import type { BadgesSave, RunBadge } from "./badges.ts";
import type { GoldItemId, KeyColor, TrainingId, UpgradeId } from "./config.ts";
import type { MaterialId } from "./materials.ts";
import type { EquipmentSave } from "./equipment/inventory.ts";
import type { DefendSave } from "./defend/progress.ts";
import type { GemDrop } from "./gems.ts";
import type { Settings } from "./settings.ts";
import type { EntitlementId } from "./shop/entitlements.ts";
import type { ShopSave } from "./shop/ledger.ts";
import type { GoalsSave } from "./goals.ts";
import type { TournamentSave } from "./tournament/progress.ts";
import type { MailSave } from "./mail/progress.ts";
import type { TournamentRun } from "./tournament/run.ts";
export type Kind =
  | "wall"
  | "floor"
  | "enemy"
  | "key"
  | "door"
  | "potion"
  | "attack"
  | "defense"
  | "reward"
  | "treasure"
  | "openedChest"
  | "stairs"
  | "stairsDown"
  | "oneway";
/** How hard a generator asked an enemy to be. Strong and elite enemies wear
 * a brighter glow and rank chevrons, and weak ones a chevron pointing down,
 * so the player can tell them apart. A
 * boss guards the way up at the end of every ten floors, and a Greater
 * Boss appears on a Tower floor whose every torch is put out. */
export type EnemyStrength = "weak" | "normal" | "strong" | "elite" | "boss" | "greaterBoss";
export type Enemy = {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  tier: number;
  strength: EnemyStrength;
};
/** An area reward chest's metal: gold for an area mastered, silver for one
 * cleared (tower/area-ledger.ts). */
export type ChestTier = "silver" | "gold";
/** Declarative lock rules. `color` remains on Tile for legacy single-key
 * doors and keys; new doors use this rule so every gameplay system shares
 * the same requirements and consumption behavior. */
export type DoorRule =
  /** `heart`: it also drains the hero's HP to 1, as a Heart Door does. */
  | { type: "keys"; keys: KeyColor[]; mode: "all" | "any"; heart?: true }
  | { type: "fullHp" }
  /** A Wooden Door: any one key opens it; a hero with none breaks it down
   * for `durability` HP, which DEF doesn't reduce (doors.ts). */
  | { type: "wood"; durability: number };
export type Tile = { kind: Kind; amount?: number; color?: KeyColor; door?: DoorRule; enemy?: Enemy; tier?: ChestTier };
export type Point = { x: number; y: number };
/** A stationary wall-mounted light source, anchored to a walkable floor
 * tile adjacent to a wall. Its visibility polygon is computed once (on
 * creation) and cached; rendering only clips a radial gradient to it. */
export type Torch = {
  x: number;
  y: number;
  lightRadius: number;
  baseIntensity: number;
  active: boolean;
  visibilityPolygon?: Point[];
};
export type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  /** The damage the shroud blocks at the start of every fight (none when
   * absent). */
  shroud?: number;
  /** The HP regained with every step in a run (Regen; none when absent). */
  regen?: number;
  /** The percent more ATK the hero strikes bosses with (equipment; none
   * when absent). */
  bossAttack?: number;
  /** The percent of an enemy's DEF the hero's strikes ignore (equipment's
   * Piercing; none when absent). */
  pierce?: number;
  keys: Record<KeyColor, number>;
  /** Optional secret inventory counters stay absent from legacy saves until
   * the corresponding item has actually been found. */
  skeletonKeys?: number;
};
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
  loadout?: { attack: number; defense: number; maxHp: number; shroud?: number; regen?: number; bossAttack?: number; pierce?: number };
  /** The hand as it was ordered when the run went inside: the cards that
   * move the hero for the rest of the run. */
  hand?: CardId[];
  /** Silver held: earned from enemies and spent inside this run only, so
   * undo takes it back with the rest of the run. */
  silver?: number;
  /** XP earned from kills this run, for the run's end dialog; undo takes
   * it back with the rest of the run, as it does the hero's XP. */
  xp?: number;
  /** Focus uses spent this run. What is left is what a run gets now less
   * these, so a Focus Count level completed mid-run counts at once. */
  focusUsed?: number;
  /** Ignore and Target uses spent this run, counted like Focus's. */
  ignoreUsed?: number;
  targetUsed?: number;
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
  /** The card badges on the hand's cards as the run went inside
   * (badges.ts), fixed for the run. */
  badges?: Partial<Record<CardId, RunBadge>>;
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
};
/** A Tower ascent. */
export type TowerRun = RunCore & {
  /** Whether the hero has taken fight damage in this area (the ten floors
   * from the current section's first): whether it can still be mastered. */
  damaged: boolean;
  /** Each other visited floor's changes, keyed by height, so descending
   * and re-climbing preserves what was already done there. The current
   * floor's are `changes`; see TowerClimb. */
  floors?: Record<number, Record<string, Tile>>;
  /** The heights of the floors where a Greater Boss has appeared this run
   * (tower/greater-boss.ts), each once. */
  summoned?: number[];
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
/** The run and lifetime XP just before a move, so undo takes back the XP
 * (and any level) a kill paid. */
export type MoveSnapshot<R extends Run = Run> = { run: R; best: number; xp: number };
/** A hero fallen in a fight, waiting for the player to undo it or accept
 * defeat: the run just before that fight, and the enemy that won it. */
export type Fall<R extends Run = Run> = { snapshot: MoveSnapshot<R>; by: string };
export type Mode = "tower" | "delve";
export type ModeSave<R extends Run = Run> = {
  history: MoveSnapshot<R>[];
  /** Set while the run's hero lies fallen (a run inside at 0 HP). */
  fall: Fall<R> | null;
  best: number;
  reached: number;
  run: R | null;
  /** Keys of `${seed}:${x},${y}` (delve) or `${seed}:${height}:${x},${y}`
   * (tower) for every enemy kill / treasure chest that has already paid out
   * persistent rewards, kept outside `run` so it survives movement undo and
   * blocks the same physical kill/chest from paying out twice. */
  lootedTiles: Record<string, true>;
  /** Gold picked up during the current run, kept outside `run` like
   * `lootedTiles`, since undo never takes Gold back. */
  runGold: number;
  /** The Gold the current run found while the Gold ad's boost lasted,
   * before the boost (it banked `GOLD_BOOST_FACTOR` times this), or null
   * while the boost hasn't run during the run; for the run's end dialog. */
  runBoostGold: number | null;
  /** The mode's currency (Inspiration or Courage) earned during the current
   * run, from milestones and areas cleared, kept beside `runGold`. */
  runCurrency: number;
  /** Whether the current run has climbed past the tier's record (`reached`
   * as the run began), for the run's end dialog. */
  runRecord: boolean;
  /** The numbered tower (or delve) selected: the slice's records (`best`,
   * and `reached`) are this tier's. */
  tier: number;
  /** The highest tier opened, from 1 to `TIERS`: the Tower's, which the
   * Delve's caves follow. */
  tiersOpen: number;
  /** The other tiers' records, by tier, while another is selected. */
  tierRecords: Record<string, TierRecord>;
};
/** The skill trees a run's currency calls the player back to. */
export type NoticeTree = "inspiration" | "courage";
export type Save = {
  version: 3;
  tower: ModeSave<TowerRun> & {
    inspiration: number;
  };
  delve: ModeSave<DelveRun> & { courage: number; memory: AutomoveMemory };
  /** The premium currency, kept between runs like Gold (gems.ts). */
  gems: number;
  /** Ascension Shards: a limited currency, kept between runs, bought only
   * in the Shop's limited packs for now. */
  ascensionShards: number;
  /** Where the Gems found on floors and the ad button's stand: never part
   * of a run, so undo can't touch them. */
  gemDrop: GemDrop;
  /** When the Gold ad's boost (Gold found ×1.5) runs out, as a wall-clock
   * timestamp (ms): `gold-boost.ts`. */
  goldBoostUntil: number;
  gold: number;
  provisions: Record<GoldItemId, number>;
  xp: number;
  /** Ranks of each stat trained, with training points (earned per level)
   * or by a trainer for Gold. */
  training: Record<TrainingId, number>;
  /** What each stat's ranks were paid with, which a reset returns: the
   * training points spent, the Gold, and the trainers' time (ms). Ranks
   * bought with Dev free purchases paid nothing. */
  trainingPaid: Record<TrainingId, TrainingPaid>;
  /** Ranks of each stat trainers have finished: the trainers' own schedule
   * (Gold and time), apart from ranks bought with training points. */
  trainerRanks: Record<TrainingId, number>;
  /** Ranks being trained by a trainer now (their Gold is paid), each done
   * when the wall clock reaches it. */
  trainingJobs: TrainingJob[];
  /** Stats whose trainer starts the next rank as soon as one is done, when
   * the Gold is there (the Training tab's auto-continue boxes). */
  trainingAuto: TrainingId[];
  /** Each stat's time credit: training time (ms) given back when its rank
   * in training was stopped (by hand, or bought with points) or the stat
   * reset, taken off that stat's next ranks until it is used up. */
  trainingCredit: Record<TrainingId, number>;
  /** The time bank: training time (ms) a Gem reset returned, taken off any
   * stat's next ranks (after that stat's own time credit) until used up. */
  trainingBank: number;
  /** When the training boost (ranks in training go twice as fast) runs
   * out, as a wall-clock timestamp (ms). */
  trainingBoostUntil: number;
  /** Trainers bought with Gems: each lets one more stat train at once. */
  trainers: number;
  upgrades: Record<UpgradeId, number>;
  settings: Settings;
  /** Persistent crafting-material inventory. Never part of `Run` — must
   * survive movement undo, death, and new runs. */
  materials: Record<MaterialId, number>;
  /** Equipment, opened on floor 60: the pieces owned, what each mode's
   * hero wears, the upgrade materials, and the Gem pulls' pity
   * (equipment/inventory.ts). */
  equipment: EquipmentSave;
  /** The active hand: the cards that move the hero inside a run, in
   * priority order. Set up before a run; a new profile starts with the
   * base hand. */
  hand: CardId[];
  /** Hand slots bought with Gems (after Larger Hand's). */
  handSlots: number;
  /** The card badges owned, which card holds each, and where their
   * draws' stream stands (badges.ts). */
  badges: BadgesSave;
  /** Tutorials the player has finished: on the Deck page `deck`,
   * reordering the hand; `removeCard`, taking a card out of it; `addCard`,
   * the note on adding cards from the deck; `upgrades`, opening the
   * Upgrades page once the first Inspiration is earned; `gear`, opening
   * the Gear page once the Gear skill is owned; `onTheJob`, opening and
   * closing a Training group under the hand in the first run after On the
   * Job; `speed`, speeding the hand up on the second floor; `climb`, the
   * first run's note, dismissed; and in the forest `enter`, the note to try
   * again, dismissed (or a run entered), and `delve`, opening the Delve
   * once Into the depths is owned. */
  tutorials: { deck: boolean; removeCard: boolean; addCard: boolean; upgrades: boolean; gear: boolean; onTheJob: boolean; speed: boolean; climb: boolean; enter: boolean; delve: boolean };
  /** Per tree: a run that earned its currency (Inspiration in the Tower,
   * Courage in the Delve) has ended since the tree was last shown, so its
   * tab (and the Upgrades tab) wear a dot in the forest while a skill there
   * can be bought. */
  treeNotices: Record<NoticeTree, boolean>;
  /** What the HUD's dots were last dismissed at: the hero's `level` and the
   * Archives' `archives` events (levels completed plus archivists hired)
   * when the Research page was last opened, which the run's Research
   * button compares; the hero's `training` level when the Research page's
   * Training tab last showed, which that tab's dot compares; and the deck's
   * `cards` when the Deck page was last opened, which the Deck tab compares. */
  seen: { level: number; training: number; archives: number; cards: CardId[] };
  /** The Archives' archivists, completed research and its history
   * (archives.ts). */
  archives: ArchivesSave;
  /** DEFEND mini-game: city layout, purchases, upgrades and best wave. A
   * defense run itself is never saved. */
  defend: DefendSave;
  /** Permanent perks bought in the Shop (shop/entitlements.ts). Erasing
   * progress keeps them: they were paid for. */
  entitlements: EntitlementId[];
  /** The Shop's purchase counts, transaction history and last confirmed
   * server time (shop/ledger.ts); what was bought lives with its owner. */
  shop: ShopSave;
  /** The Goals screen's checkpoint rewards claimed in each tower, and the
   * premium ones (goals.ts). */
  goals: GoalsSave;
  /** The Tournament's Tickets, league, and what the player last heard of
   * each tournament entered (tournament/progress.ts). */
  tournament: TournamentSave;
  /** Mail the server pushed: the inbox it last reported, what was read,
   * removed and claimed here (mail/progress.ts). */
  mail: MailSave;
};
export const point = (x: number, y: number) => `${x},${y}`;
