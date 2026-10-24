/** The shape of the save: each mode's slice (`ModeSave`) and everything kept between runs (`Save`). save/save.ts loads and decodes it. */
import type { TrainingJob, TrainingPaid } from "../progression/training-jobs.ts";
import type { TierRecord } from "../tiers.ts";
import type { ThemeId } from "../theme-collection.ts";
import type { ArchivesSave } from "../progression/archives.ts";
import type { ShrinesSave } from "../shrines.ts";
import type { CardId, CardLink } from "../cards/cards.ts";
import type { BadgesSave } from "../cards/badges.ts";
import type { CardBuysSave } from "../cards/buys.ts";
import type { CardTreeLevels } from "../cards/trees.ts";
import type { GoldItemId } from "../economy/provisions.ts";
import type { TrainingId } from "../progression/training.ts";
import type { UpgradeId } from "../progression/upgrades.ts";
import type { MaterialId } from "../economy/materials.ts";
import type { EquipmentSave } from "../equipment/inventory.ts";
import type { DefendSave } from "../defend/progress.ts";
import type { GemDrop } from "../economy/gems.ts";
import type { RunFinds } from "../run-notes.ts";
import type { Settings } from "./settings.ts";
import type { EntitlementId } from "../shop/entitlements.ts";
import type { ShopSave } from "../shop/ledger.ts";
import type { GoalsSave } from "../goals.ts";
import type { TournamentSave } from "../tournament/progress.ts";
import type { MailSave } from "../mail/progress.ts";
import type { MissionsSave } from "../missions/progress.ts";
import type { EventsSave } from "../events/progress.ts";
import type { Profile } from "./profile.ts";
import type { TowerRun, DelveRun, AutomoveMemory, Run, MoveSnapshot, Fall } from "../runs.ts";
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
  /** What the current run found that undo never takes back (materials,
   * Cells, Gems, equipment), for its notes (run-notes.ts), kept beside
   * `runGold`. */
  runFinds: RunFinds;
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
  trialAccess: import("../proving-grounds/access.ts").TrialAccess;
  /** A separate encounter; ordinary mode runs remain untouched. */
  provingGrounds?: import("../proving-grounds/trial.ts").TrialState;
  version: 4;
  tower: ModeSave<TowerRun> & {
    inspiration: number;
  };
  delve: ModeSave<DelveRun> & { courage: number; memory: AutomoveMemory };
  /** The premium currency, kept between runs like Gold (economy/gems.ts). */
  gems: number;
  /** Ascension Shards: a limited currency, kept between runs, bought only
   * in the Shop's limited packs for now. */
  ascensionShards: number;
  /** Medals: a limited currency, kept between runs, paid by the weekly
   * mission rewards (missions/catalog.ts) and Events' missions
   * (events/catalog.ts); nothing spends them yet. */
  medals: number;
  /** Cells: dropped by Greater Bosses, kept between runs with their
   * fractions (a badge's scale can change a drop), spent on the Archives'
   * Speed Ups (progression/speed-ups.ts). */
  cells: number;
  /** Where the Gems found on floors and the ad button's stand: never part
   * of a run, so undo can't touch them. */
  gemDrop: GemDrop;
  /** When the Gold ad's boost (Gold found ×1.5) runs out, as a wall-clock
   * timestamp (ms): `economy/gold-boost.ts`. */
  goldBoostUntil: number;
  gold: number;
  provisions: Record<GoldItemId, number>;
  xp: number;
  /** Training points earned beyond the hero's levels: one for each weekly
   * mission reward claimed (missions/catalog.ts). */
  bonusTrainingPoints: number;
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
  /** Equipment, opened by Tower II's floor 60 Goal: the pieces owned, what each mode's
   * hero wears, the upgrade materials, and the Gem pulls' pity
   * (equipment/inventory.ts). */
  equipment: EquipmentSave;
  /** The active hand: the cards that move the hero inside a run, in
   * priority order. Set up before a run; a new profile starts with the
   * base hand. */
  hand: CardId[];
  /** The hand's Card Groups: links between cards side by side in it, each
   * dropped once either card moves out of place (cards/cards.ts). */
  cardLinks: CardLink[];
  /** Each card's XP toward its levels (cards/levels.ts), gained in runs;
   * a card with none is left out. Undo takes back what a move gained. */
  cardXp: Partial<Record<CardId, number>>;
  /** The card points spent on each card's tree, by node (cards/trees.ts);
   * a card with none is left out. Spent and respecced in the forest only. */
  cardTrees: CardTreeLevels;
  /** The levels card buys opened on each card's tree, and where their
   * stream stands (cards/buys.ts). */
  cardBuys: CardBuysSave;
  /** Hand slots bought with Gems (after Larger Hand's). */
  handSlots: number;
  /** The card badges owned, which card holds each, and where their
   * draws' stream stands (cards/badges.ts). */
  badges: BadgesSave;
  /** Tutorials the player has finished: on the Deck page `deck`,
   * reordering the hand; `removeCard`, taking a card out of it; `addCard`,
   * the note on adding cards from the deck; `upgrades`, opening the
   * Upgrades page once the first Inspiration is earned; `gear`, opening
   * the Gear page once the Gear skill is owned; `onTheJob`, opening and
   * closing a Training group under the hand in the first run after On the
   * Job; `speed`, speeding the hand up on the second floor; `climb`, the
   * first run's note, done once the STAIRS card is pressed; `keys`, DOOR
   * or KEY pressed after the note pointing at them; `stuck`, End Run
   * pressed after the first stuck run's note; `enemy`, set while the note
   * that an enemy blocks the way has sent the player to buy Enemy, until a
   * run goes inside; and in the forest `enter`, the note to try
   * again once Door & Key is owned, dismissed (or a run entered), `delve`, opening the Delve
   * once Into the depths is owned, `chamber`, the first Tower run
   * ended, after which a new floor's "A new chamber opens." no longer
   * rises over the board, and `cardPoints`, spending the first card point
   * on an upgrade tree, led there from the forest's Deck tab. */
  tutorials: { deck: boolean; removeCard: boolean; addCard: boolean; upgrades: boolean; gear: boolean; onTheJob: boolean; speed: boolean; climb: boolean; keys: boolean; stuck: boolean; enemy: boolean; enter: boolean; delve: boolean; chamber: boolean; cardPoints: boolean };
  /** Per tree: a run that earned its currency (Inspiration in the Tower,
   * Courage in the Delve) has ended since the tree was last shown, so its
   * tab (and the Upgrades tab) wear a dot in the forest while a skill there
   * can be bought. */
  treeNotices: Record<NoticeTree, boolean>;
  /** What the HUD's dots were last dismissed at: the hero's `level` and the
   * Archives' `archives` events (levels completed plus archivists hired)
   * when the Research page was last opened, which the run's Research
   * button compares; the hero's `training` level when the Research page's
   * Training tab last showed, which that tab's dot compares; the deck's
   * `cards` and the levels of all its cards summed (`cardLevels`) when the
   * Deck page was last opened, which the Deck tab compares; and the cards
   * the player has `met` on the Deck page (pressed for details, moved,
   * added to the hand or given a badge), the rest wearing NEW there. */
  seen: { level: number; training: number; archives: number; cards: CardId[]; cardLevels: number; met: CardId[] };
  /** The Archives' archivists, completed research and its history
   * (progression/archives.ts). */
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
  /** The daily missions given, the week's tally and rewards claimed, and
   * what has counted toward them (missions/progress.ts). */
  missions: MissionsSave;
  /** The running Event's missions and what has counted toward them, and
   * the events boosted (events/progress.ts). */
  events: EventsSave;
  /** The relics owned, by id (economy/relics.ts), each once, kept between runs. */
  relics: string[];
  /** The Shrine Boons page's choices, kept between runs (shrines.ts). */
  shrines: ShrinesSave;
  /** The UI and Game themes owned (theme-collection.ts), each once, in
   * catalog order: Medieval from the start, the rest earned. Each pays
   * Gold for good. */
  themes: ThemeId[];
  /** The player profile: when it was made and its lifetime tallies, the
   * currencies earned and Training and research done (save/profile.ts). */
  profile: Profile;
};
