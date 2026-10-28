import { entrance, floorFor } from "./delve/labyrinth.ts";
import { chooseStep } from "./automation.ts";
import { cost } from "./progression/upgrades.ts";
import { CARDS, cardText, dealCard, deckCards, explainStuck, handSlots, handBonus, keptLinks, planHand, planTarget, shootsWith, stillOpen, type CardId, type CardPlan, type HandBonus, type StuckReport } from "./cards/cards.ts";
import { addCardXp, PASSIVE_CARDS } from "./cards/levels.ts";
import { KEY_COLORS, cardMaxLevel, compounded, doorStat, foeCardStat, foeStat, foeStats, keyStat, freeUpChances, freeUpFactors, hasPointsToSpend, pointsLeft, runCardTrees, runFoeCut, treeBonus, treeFactor, treeOverheal, type FoeTreeCard, type TreeBonus } from "./cards/trees.ts";
import { aggroTurn } from "./enemies/flying.ts";
import { arrowRange, foeOn } from "./enemies/ranged.ts";
import { BADGE_IDS, MAX_COPIES, badgeOn, badgeValue, runBadges } from "./cards/badges.ts";
import { BOOST_FOREVER, permanentBoost } from "./shop/entitlements.ts";
import { noteGoldBoost } from "./economy/gold-boost.ts";
import { canWarp, claimGoal, goalUnlocked } from "./goals.ts";
import { volleyTurn, type Shot, type Volley, type VolleyTurn } from "./volley.ts";
import { missGem } from "./economy/gems.ts";
import { DelvePlan } from "./delve/automove.ts";
import { defaults } from "./save/save.ts";
import { stampProfile } from "./save/profile.ts";
import { defaultFinds, newNotes, noteKey, notesOf } from "./run-notes.ts";
import { stream, tileRandom } from "./random.ts";
import { freeLevelRow, freeTrainingLines, rollFreeTraining, type FreeGroup } from "./progression/free-training.ts";
import { doorBlockedMessage, doorName, doorRule, drainsHp, KEY_ORDER, keyWord, pickupGold, type DoorDiscounts } from "./doors.ts";
import type { SettingKey } from "./save/settings.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import { TOWER_START_X, TOWER_SECTION } from "./config.ts";
import { xpForKill, levelForXp } from "./progression/xp.ts";
import { TRAINING_PER_LEVEL, isStatRow, trainedAmount, type TrainingId, type StatTrainingRow } from "./progression/training.ts";
import { PROVISION_BOOSTS, PROVISION_BOOST_PERCENT, PROVISION_BOOST_TURNS, PROVISION_KEY_FLOORS, type UsedProvision } from "./economy/provisions.ts";
import type { Save, ModeSave } from "./save/shape.ts";
import type {
  Boosted,
  Run,
  RunCore,
  TowerRun,
  DelveRun,
  MoveSnapshot,
} from "./runs.ts";
import type {
  Tile,
  Enemy,
  Mode,
  Player,
  ChestTier,
  ChestOdds,
  KeyColor,
} from "./entities.ts";
import { World, LAYOUT_VERSION } from "./delve/world.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import { chestKindAt, litTorches, type Board } from "./board.ts";
import { healUpTo, instakill, squaredUp, type CritRule } from "./combat.ts";
import { HEART_DOOR_HP, hpCeiling, isLethal, resolveStep, type StepBlocked, type StepEffect, type StepRules, shardStat } from "./step-effects.ts";
import { ENTRANCE_Y, ENTRANCE_ZOOM_MS, OUTSIDE_START_Y, OutsideWorld } from "./outside.ts";
import { AREA_BURST_MS, AreaLedger, chestReward, clearedInspiration, type AreaReward } from "./tower/area-ledger.ts";
import { TowerClimb } from "./tower/climb.ts";
import { callsGreaterBoss, greaterBoss, greaterBossSpot } from "./tower/greater-boss.ts";
import { strengthOdds, traitOdds, type OddsSource } from "./enemies/odds.ts";
import { STEPS_PER_FLOOR } from "./enemies/curves.ts";
import { switchTier, tierNumeral, tierRewardText, tierXp } from "./tiers.ts";
import type { GoldContext } from "./economy/gold-multipliers.ts";
import { RunTimeline } from "./run-timeline.ts";
import { shiftHero } from "./progression/hero-stats.ts";
import { enemyTitle } from "./enemies/scaling.ts";
import { snap } from "./exact.ts";
import { enemyStat, keyCount, whole, wholeChange } from "./whole.ts";
import { MODES, milestones, type ModeProfile } from "./modes.ts";
import { ranksInRun, runTrainingBulk, runTrainingOffer, type RunTrainingOffer } from "./progression/run-training.ts";
import type { BuyQuantity } from "./progression/buy-quantity.ts";
import { critRule, loadout, provisionsOpen, rankShift, trainingPoints, trainingWaiting, type TrainingView } from "./progression/loadout.ts";
import { researched } from "./progression/archives.ts";
import { chargesLeft, chargesPerRun, climbFloor, spendCharge, type Charge } from "./run-charges.ts";
import { TrainingDesk } from "./game/training-desk.ts";
import { ShopDesk } from "./game/shop-desk.ts";
import { SkillDesk } from "./game/skill-desk.ts";
import { ThemeDesk } from "./game/theme-desk.ts";
import { ResearchDesk } from "./game/research-desk.ts";
import { DeckEditor } from "./game/deck-editor.ts";
import { GearDesk } from "./game/gear-desk.ts";
import { GemFinder } from "./game/gem-finder.ts";
import { BadgeDesk } from "./game/badge-desk.ts";
import { CardTreeDesk } from "./game/card-tree-desk.ts";
import { CardBuyDesk } from "./game/card-buy-desk.ts";
import { HandRules } from "./cards/hand-rules.ts";
import { RunPurse, type EquipmentLoot } from "./game/run-purse.ts";
import { EquipmentDesk } from "./game/equipment-desk.ts";
import { TournamentDesk } from "./game/tournament-desk.ts";
import { MailDesk } from "./game/mail-desk.ts";
import { MissionDesk } from "./game/mission-desk.ts";
import { EventDesk } from "./game/event-desk.ts";
import { ShrineDesk } from "./game/shrine-desk.ts";
import { NoticeDesk } from "./game/notice-desk.ts";
import { boonFactor, runBoons, weakened } from "./shrines.ts";
import type { MissionType } from "./missions/catalog.ts";
import type { EventMissionType } from "./events/catalog.ts";
import { LEAGUE_INFO, type League } from "./tournament/leagues.ts";
import { runStream, tournamentScore, type TournamentRun } from "./tournament/run.ts";
import type { TournamentInfo } from "./tournament/server.ts";
import { raised, wornEffects } from "./equipment/effects.ts";
import { RARITY_TIERS, type EquipRarity } from "./equipment/balance.ts";
import { EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, itemDef, type EquipMaterialId } from "./equipment/catalog.ts";
import { readyForestRuns, startingHero } from "./game/hero-sync.ts";
import { warpLootSilver } from "./economy/warp-loot.ts";
import { CardActivation } from "./game/card-activation.ts";
import { Finds } from "./game/finds.ts";
import { FightPlayback } from "./game/fight-playback.ts";
import type { Coin, Dash, Drop, Facing, Gain, GainArt, Heal, ShownTurn } from "./shown.ts";
/** How a new run starts: out in the forest or at the entrance, and from
 * which seed (rolled from the game's randomness when left out). */
export type RunStart = { outside?: boolean; seed?: number; height?: number };
/** A lesson shown on the board (`Game.boardLesson`). */
export type BoardLesson = "climb" | "keys" | "autoClimb" | "stuck" | "enemy" | "upgrades" | "enter" | "trainingPoints" | "cards" | "delve" | "provisions" | "research";
/** The first skills the lessons lead to on the Inspiration tree, in order. */
export type IntroSkill = "cardDoorKey" | "cardEnemy";
export type RouteEffects = {
  hp: [number, number];
  attack: [number, number];
  defense: [number, number];
  keys: Partial<Record<KeyColor, [number, number]>>;
};
/** The gains a Settings row can turn off: ATK, DEF and HP changed, keys
 * found, what a door takes, Gold and Silver found, what a fight costs
 * past its strikes, XP gained and the Gold combo. */
/** What a board tap can be readied for: Ignore, Target or a Bomb. */
export type Armed = "ignore" | "target" | "bomb";
export type GainKind = "attack" | "defense" | "hp" | "key" | "door" | "hit" | "xp" | "combo" | Coin;
const GAIN_SETTINGS = {
  attack: "attackGains", defense: "defenseGains", hp: "hpGains", key: "keyGains", door: "doorGains", hit: "hitNumbers",
  xp: "xpGains", combo: "comboGains", gold: "goldGains", silver: "silverGains",
} as const satisfies Record<GainKind, SettingKey>;
/** The kind of gain `art` raises, if a Settings row covers it: a coin, a
 * heart, or an ATK or DEF shard, potion or key's sprite. */
function kindOf(art: GainArt | null): GainKind | null {
  if (!art) return null;
  if ("coin" in art) return art.coin;
  if ("heart" in art) return "hp";
  if (!("tile" in art)) return null;
  const kind = art.tile.kind;
  return kind === "attack" || kind === "defense" || kind === "key" ? kind : kind === "potion" ? "hp" : null;
}
/** Rewards kept for the board to show; older ones are dropped unseen. */
const MAX_GAINS = 12;
/** The forest's Automove walks at least this many steps a second, however
 * slow the run's arrows were last set. */
const FOREST_SPEED = 3;
/** The speed the speed lesson teaches: one press of › from a new hero's 2. */
const LESSON_SPEED = 3;
/** The steps a run takes on the Tower's first floor before the speed
 * lesson comes. */
const LESSON_STEPS = 10;
/** How long a turn inside a run shows, at most (ms): the hero's step and
 * its shots leaving through it, shorter at higher speeds. */
const TURN_MS = 220;
/** Salts the run seed for Find Gold Key's roll on each new floor. */
const YELLOW_KEY_SALT = 0x6e11a;
/** Salt the run seed for the traders' and smelts' Floor Key rolls on each new floor. */
const FLOOR_KEY_SALT: Record<KeyColor, number> = { yellow: 0x9f10e, blue: 0xb1f10, red: 0x4ef10 };
/** A step resolved and about to be taken: the tile stepped onto, what it
 * does, where it is, whether it goes in the undo history, and for a fight
 * the hero's critical strikes in it as played (`crits`) and whether it
 * began with ENEMY's Surprise Attack (`surprise`) or a Fast enemy lost its
 * first strike to FAST ENEMY's First Strike (`firstStrike`). */
type TakenStep = { tile: Tile; outcome: StepEffect; dest: { x: number; y: number }; track: boolean; quiet?: boolean; crits?: number; surprise?: true; firstStrike?: true; card: CardStep };
/** How the hand's turn takes a step: Effective or Dampen on a card's last
 * step (`scale`, what its target's effect is multiplied by; 1 on every
 * other step), Skip on STAIRS succeeding (`floorSkip`: the climb goes up
 * two floors), and a Dash holding the turn open across its tiles (`hold`,
 * so its shots come once it stops). */
export type CardStep = { scale?: number; floorSkip?: boolean; hold?: boolean };
/** Tiles that stay on the board after being stepped on. */
const PERMANENT_TILES = new Set<Tile["kind"]>(["floor", "stairs", "oneway", "openedChest"]);
/** What DOOR's Secret Knock, Door Chest and the chest's kind roll a door
 * by, KEY's Locksmith, Master Key, Key Chest and its kind a key, and
 * ENEMY's Surprise Attack and FAST ENEMY's First Strike an enemy. */
const SECRET_KNOCK_SALT = 0x3a57e, DOOR_CHEST_SALT = 0xd00c4, DOOR_CHEST_KIND_SALT = 0xd0c4d, DOUBLE_KEY_SALT = 0xd0b1e, MASTER_KEY_SALT = 0x3a5e7,
  KEY_CHEST_SALT = 0x6c4e5, KEY_CHEST_KIND_SALT = 0x6c4d1, SURPRISE_SALT = 0x5a7c1, FIRST_STRIKE_SALT = 0xf1257, POWER_STRIKE_SALT = 0x907e5,
  CHEST_DOUBLE_SALT = 0xc4e02, CHEST_TRIPLE_SALT = 0xc4e03, CHEST_CELLS_SALT = 0xc4ec1, DRUID_KEY_SALT = 0xd401d;
/** What each key colour's own Master Key (GOLD, BLUE and RED KEY's trees) rolls a key of it by. */
const COLOR_MASTER_KEY_SALT: Record<KeyColor, number> = { yellow: 0x7e113, blue: 0xb1a57, red: 0x7ea57 };
/** Each key colour as its Master Key's message names it. */
const KEY_WORDS: Record<KeyColor, string> = { yellow: "Gold", blue: "Blue", red: "Red" };
/** The targets a Dash may end on, a tile of it left: items to take. */
const DASH_ONTO = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "treasure", "reward"]);
/** The walk in's stage (see `Game.walkIn`): on the steps, in the arch
 * (`x`, `y`, the tile above them), or gone inside since `since`. */
export type WalkIn = { x: number; y: number; stage: "steps" | "arch" | "gone"; since: number; then: () => void };
export class Game {
  provingGroundsRequested = false;
  /** The Delve's cave entrance, entered from its forest: a tournament run
   * asked for (`enter`, which waits on the server, so `main.ts` begins it),
   * or a Ticket wanted first (`ticket`). Taken by whoever acts on it. */
  tournamentRequested: "enter" | "ticket" | null = null;
  /** Whether reaching the forest's entrance plays the walk in (the browser
   * game) or goes in at once. */
  animatesEntrance = false;
  /** The walk in through the forest's entrance, once the hero stands on its
   * steps: a turn later up into the dark of the arch, a turn after that gone
   * inside, then, once the view has closed in on the arch
   * (`ENTRANCE_ZOOM_MS`), what entering does (`then`). Never saved: the hero
   * stays on the steps until it is done. */
  walkIn: WalkIn | null = null;
  mode: Mode = "tower";
  world!: Board;
  run!: Run;
  route: Step[] = [];
  blocked = { x: 0, y: 0, until: 0 };
  /** Inside a run, whether the hand moves the hero (the play/pause
   * button); in the forest, whether Automove walks. */
  auto = false;
  /** The card moving the hero and the path it committed to, until the
   * hero reaches its target. */
  cardPlan: CardPlan | null = null;
  /** The rest of the path Target committed to, until the hero arrives or
   * the path can't be followed (`stillOpen`); never saved. */
  private targetPath: Step[] | null = null;
  /** The steps the hero is about to take, nearest first: a walk tapped,
   * Target's path, or the hand's card's; empty with none planned. The
   * Delve's camera looks along it. */
  get pathAhead(): readonly Step[] {
    return this.route.length ? this.route : this.targetPath ?? this.cardPlan?.path ?? [];
  }
  /** The steps the board's golden line follows, nearest first: a walk
   * tapped, or the hand's card's path while it heads for a pressed card's
   * target, or, with the Show path setting and Auto-Climb, for the target
   * the hand chose itself; empty otherwise. */
  get shownPath(): readonly Step[] {
    if (this.route.length) return this.route;
    const plan = this.cardPlan;
    if (!plan || this.run.outside) return [];
    return this.run.focused || (this.autoClimbs && this.save.settings.showPath) ? plan.path : [];
  }
  /** The hand's card that made the latest step, to show it glowing. */
  activeCard: number | null = null;
  /** No card in the hand can act: the hand pauses, and the run ends only
   * when the player ends it. Each thing the player does (an item used, a
   * skill) checks the hand again, and it plays on once a card can act. */
  handStuck = false;
  /** While the hand is stuck: whether an enemy no card takes blocks the
   * way, before Enemy is owned (the `enemy` lesson). Never saved. */
  private enemyBlocks = false;
  paused = false;
  /** While a page covers the board inside a run: whether the hand played
   * and its speed, brought back by `resumeFromPage`. Never saved. */
  private heldPlay: { auto: boolean; speed: number } | null = null;
  message = "";
  effect = { text: "", x: 0, y: 0, until: 0 };
  /** Rewards picked up since the board last took them, oldest first. */
  gains: Gain[] = [];
  /** The free levels Free Training gave last, as the board announces them
   * ("+1 ATK"), and when (`performance.now()`). */
  freeTrained: { lines: string[]; at: number } | null = null;
  /** Each card level reached since the board last took them, oldest
   * first, for the hand's level-up animation; emptied by undo. */
  cardLevelUps: { card: CardId; level: number }[] = [];
  /** The latest turn's shots (enemies/ranged.ts), for the board to fly and land;
   * undo, a new run or a mode switch clears it. */
  volley: Volley | null = null;
  /** The latest turn's step inside a run, for the board to walk the hero
   * along as its shots leave; null when it came no single step. */
  turnShown: ShownTurn | null = null;
  /** The snapshot from before the turn being taken, for a shot that fells
   * the hero. */
  private turnBefore: MoveSnapshot | null = null;
  /** The last potion that healed, picked up or crafted: the HP it healed
   * from and to, where the hero stood, and a number that grows with each, so
   * the HP bar can fill up to it and the board raise the HP healed. */
  lastHeal: Heal | null = null;
  /** When the hero last reached a new level (performance.now()), for the
   * board's level-up burst; -Infinity once undo takes the level back. */
  levelUpAt = -Infinity;
  /** The training points the latest level-up earned, which the board
   * raises over the hero once its burst is over. */
  levelUpPoints = 0;
  /** The area rewards whose chests were opened, each with when its golden
   * burst starts (performance.now()): a chest opened while another's burst
   * plays waits for it to end. Emptied by undo. */
  areaBursts: { reward: AreaReward; inspiration: number; at: number }[] = [];
  /** The Silver Warp Loot added to the run as it went inside, and when
   * (performance.now()), for the board's burst over the hero; null when
   * it added under 1. Cleared by undo and a new run. */
  warpLooted: { silver: number; at: number } | null = null;
  /** When Equipment opened (performance.now()), for the
   * board's burst. */
  /** Where a Greater Boss last appeared, and when (performance.now()), for
   * the board's poof; cleared by undo. */
  summoned: { x: number; y: number; at: number } | null = null;
  /** Where the last Bomb went off and when (performance time), for its explosion. */
  bombed: { x: number; y: number; at: number } | null = null;
  /** Where Skip last made a card's target vanish, and when
   * (performance.now()), for the board's poof; cleared by undo. */
  vanished: { x: number; y: number; at: number } | null = null;
  /** The latest dash: the tiles the hero dashed off, in order, and when
   * (performance.now()), for the board's fading echoes of the hero. */
  dash: Dash | null = null;
  /** Where the latest Dash stopped, short of something, until the next
   * step: a fight stepped into from there is a dash attack, which ENEMY's
   * Surprise Attack may double the first strike of. */
  private dashedTo: { x: number; y: number } | null = null;
  /** The last step the hero took (into a fight too): the way it faces,
   * for a board whose hero turns. Right until it first steps; undo leaves it. */
  facing: Facing = { dx: 1, dy: 0 };
  /** Delve Automove's committed route and last weighed decisions. */
  readonly delvePlan = new DelvePlan();
  /** The Training tab's commands. */
  readonly training = new TrainingDesk(this);
  /** The Archives' commands. */
  readonly research = new ResearchDesk(this);
  /** The Deck page's commands over the next run's hand. */
  readonly deck = new DeckEditor(this);
  /** The Gear page's commands: buying provisions. */
  readonly gear = new GearDesk(this);
  /** The Gem on the board, collecting it, and the ad's Gems. */
  readonly gemFinder = new GemFinder(this);
  /** The Equipment screen's commands: leveling, merging, dismantling,
   * equipping and Gem pulls. */
  readonly equipment = new EquipmentDesk(this);
  /** The Tournament's commands: the server's reports, Tickets, standings
   * and prizes. */
  readonly tournament = new TournamentDesk(this);
  /** Mail the server pushed: the inbox, reading, removing and claiming. */
  readonly mail = new MailDesk(this);
  /** The daily and weekly missions: giving them, counting toward them and
   * paying them. */
  readonly missions = new MissionDesk(this);
  /** Events: the fortnight's missions, counting toward them and paying
   * their Medals. */
  readonly events = new EventDesk(this);
  /** The Shop's command: buying an offer. */
  readonly shop = new ShopDesk(this, this.training, this.events);
  /** The skill trees' command: buying a skill. */
  readonly skills = new SkillDesk(this);
  /** The Themes page's commands. */
  readonly themes = new ThemeDesk(this);
  /** The Deck page's card badges: drawing them with Gems and attaching
   * them to cards. */
  readonly badges = new BadgeDesk(this);
  readonly cardTrees = new CardTreeDesk(this);
  /** The Deck page's card buys: Gems for levels opened on the deck's trees. */
  readonly cardBuys = new CardBuyDesk(this);
  /** What the hand's cards may do now: their badges' rules and marks,
   * Ignore's tiles and the cards that act in place; where the hand plans
   * from. */
  readonly handRules = new HandRules(this);
  /** What a card does as it activates, and what its badges pay. */
  /** What the run finds: kills, items, chests and doors, paid, raised and
   * counted. */
  readonly finds = new Finds(this);
  readonly activation = new CardActivation(this);
  /** How fights are played and shown: the Revive and critical rolls, the
   * fight the board shows and an Encounter playing out. */
  readonly fights = new FightPlayback<TakenStep>(this, (step, revived) => this.take(step, revived));
  /** The Shrines' commands: a Tower run's boons and the Shrine Boons page's
   * choices. */
  readonly shrine = new ShrineDesk(this);
  /** The Notices: which tabs and buttons wear a dot, and what the player
   * has been shown. */
  readonly notices = new NoticeDesk(this);
  /** `rng` is the game's randomness: new run seeds, enemy drops and
   * treasure loot all draw from it (the `game` stream unless given), so a
   * seeded stream replays a game and no visual effect can shift it. */
  constructor(public save: Save, private rng: () => number = stream("game")) {
    // A Delve run left inside (the page reloaded mid-run) opens where it
    // was: no tab leads to the Delve, only the forest's sign.
    const inside = (run: Run | null) => !!run && !run.outside;
    if (inside(save.delve.run) && !inside(save.tower.run)) this.mode = "delve";
    this.loadMode();
  }
  /** Dev: whether every purchase is allowed and costs nothing (and research
   * takes no time). */
  get free() {
    return this.save.settings.freePurchases;
  }
  /** Undos a run has in all: spent ones never come back. */
  get undoCapacity() {
    return loadout(this.save, this.mode).undoCapacity;
  }
  /** What undo can take this mode's run back to (run-timeline.ts). */
  private get timeline() {
    return new RunTimeline(this.save, this.mode, () => this.undoCapacity);
  }
  /** Undos the run has left to spend. */
  get undosLeft() {
    return this.timeline.undosLeft;
  }
  /** Whether undo can take a move back: one is left and a move is held. */
  get canUndo() {
    return this.timeline.canUndo;
  }
  /** Grants unlimited currency, the first 250 floors, and every game mode.
   * Reversible: turning Dev Mode back off leaves the grants in place, since
   * there is no meaningful "undo" for progress the player has already seen. */
  setDevMode(on: boolean) {
    this.save.settings.devMode = on;
    if (!on) return;
    this.save.gold = 999_999_999;
    this.save.gems = 999_999_999;
    this.save.tower.inspiration = 999_999_999;
    this.save.breakthrough = 999_999_999;
    this.save.upgrades.breakthrough = 1;
    this.save.upgrades.legacy = 1;
    // The Deck page with its Badges box, and every badge at the top level.
    for (const id of ["cardDoorKey", "cardEnemy", "autoClimb", "combatStance", "buildout", "cardBadges"] as const) this.save.upgrades[id] = Math.max(1, this.save.upgrades[id]);
    for (const card of ["door", "key", "monster"] as const) this.save.hand = dealCard(this.save.hand, card, handSlots(this.save));
    for (const id of BADGE_IDS) this.save.badges.owned[id] = { copies: MAX_COPIES, pick: this.save.badges.owned[id]?.pick ?? 0 };
    // Equipment, with materials to spare.
    this.save.equipment.unlocked = true;
    for (const id of EQUIP_MATERIAL_IDS) this.save.equipment.materials[id] = 999_999_999;
    if (this.run.outside) this.world = this.buildWorld();
    const maxSection = 25;
    this.save.tower.reached = Math.max(this.save.tower.reached, maxSection * TOWER_SECTION);
    this.save.tower.best = Math.max(this.save.tower.best, this.save.tower.reached);
    this.save.delve.reached = Math.max(this.save.delve.reached, maxSection * TOWER_SECTION);
    this.save.delve.best = Math.max(this.save.delve.best, this.save.delve.reached);
    // Events open with Dev mode: the running Event's first missions come at once.
    this.events.refresh();
  }
  /** Makes `next` the active mode. A mode with no run yet starts one inside
   * (a new game's first), or in its forest when `outside`. The player
   * reaches the Delve only by the forest's sign (`canSwapForest`). */
  switchMode(next: Mode, outside = false) {
    if (next === this.mode) return;
    this.fights.finish();
    this.armed = null;
    this.tournamentRequested = null;
    this.mode = next;
    if (next === "delve") this.save.tutorials.delve = true;
    this.loadMode(outside);
  }
  /** Whether the Delve can be entered: only while a tournament is open for
   * entry, once the Tournament is unlocked. Its cave is the tournament's
   * way in. */
  get delveOpen() {
    return this.tournament.unlocked && this.tournament.phase === "open";
  }
  /** Whether the forest's sign leads to the other mode's forest: in the
   * forest, from the Delve's always, and from the Tower's while the Delve
   * is open. */
  get canSwapForest() {
    return !!this.run.outside && !this.fallen && (this.mode === "delve" || this.delveOpen);
  }
  /** The Tournament button: to the Delve's forest, whose cave enters the
   * open tournament. False where it can't go (no tournament open, or a run
   * inside). */
  toDelveForest() {
    if (this.mode === "delve") return !!this.run.outside && this.delveOpen;
    return this.delveOpen && this.canBeginTournament && this.swapForest();
  }
  /** Once tournament entry closes, a player in the Delve's forest is led
   * back to the Tower's at once, since its cave can no longer be entered.
   * Returns whether they were. */
  leaveClosedDelve() {
    if (this.mode !== "delve" || !this.run.outside || this.fallen || this.delveOpen) return false;
    this.toForestStart();
    this.switchMode("tower", true);
    if (this.run.outside) this.toForestStart();
    this.auto = false;
    this.cancelRoute();
    return true;
  }
  /** The forest's sign, tapped or walked onto: down the path to the other
   * mode's forest. The hero leaves this forest at its start, and arrives at
   * the other's. */
  swapForest() {
    if (!this.canSwapForest) return false;
    this.toForestStart();
    this.switchMode(this.mode === "tower" ? "delve" : "tower", true);
    if (!this.run.outside) return true;
    this.toForestStart();
    this.message = this.mode === "tower" ? "The path leads back to the Tower." : "The path leads down to the Delve.";
    return true;
  }
  /** Puts the hero on the forest's start tile, partway up the path. */
  private toForestStart() {
    const p = this.run.player;
    p.x = this.rules.entranceX;
    p.y = OUTSIDE_START_Y;
  }
  /** The lesson waiting on the board. Inside a Tower run: in a new game's
   * first run, `climb`, which holds the hand until the STAIRS card is
   * pressed; once no card can act, `stuck` the first time, saying the
   * run's Inspiration buys what gets past, until End Run is pressed, and
   * `enemy` while an enemy blocks the way with Enemy not yet owned and its
   * Inspiration held; then `keys`, the first time the hand holds DOOR and
   * KEY, until one of them is pressed; and `autoClimb`, the first run
   * inside once Auto-Climb is owned, saying the hero heads for the first
   * card's target with an open path and a pressed card goes first, until
   * its note is tapped or a card pressed. In the Tower's forest: `upgrades`,
   * to the Upgrades tab while the next first skill (`introSkill`) can be
   * bought; `enter`, to Enter, once Door & Key is owned until Enter is
   * pressed or a run goes inside from the forest (and again once Enemy is bought after its
   * lesson); `research`, once the Archives skill is owned, to the Research
   * tab, until the Research page is opened (`archivesLesson` then waits on
   * its note there); then, in either forest, `trainingPoints`, the first time training
   * points can be spent, which leads to the Research tab until the
   * Training tab's note is dismissed (`trainingLesson`); then `cards`, which leads to the Deck to
   * spend the first card point (`cardPointsLesson`); then, in the Tower's
   * forest while a tournament opens the Delve, `delve`, until the Delve is
   * opened; and in either forest, `provisions` (`provisionsLesson`). */
  get boardLesson(): BoardLesson | null {
    const tower = this.mode === "tower", t = this.save.tutorials, owned = this.save.upgrades;
    if (!this.run.outside) {
      if (!tower || this.fallen) return null;
      if (!t.climb) return "climb";
      if (this.handStuck && !t.stuck) return "stuck";
      if (this.handStuck && this.enemyBlocks && !owned.cardEnemy && this.affords("cardEnemy")) return "enemy";
      if (!t.keys && this.hand.includes("door") && this.hand.includes("key")) return "keys";
      return owned.autoClimb && !t.autoClimb ? "autoClimb" : null;
    }
    if (tower && this.introSkill) return "upgrades";
    if (tower && ((!t.enter && owned.cardDoorKey) || (t.enemy && owned.cardEnemy))) return "enter";
    if (tower && owned.archives && !t.research && !t.archives) return "research";
    if (!t.training && trainingWaiting(this.save)) return "trainingPoints";
    if (this.cardPointsLesson) return "cards";
    if (tower && this.delveOpen && !t.delve) return "delve";
    return this.provisionsLesson ? "provisions" : null;
  }
  /** Whether the provisions lesson waits: in the forest, once a first
   * provision is open, a hand on the Gear tab until it is pressed (which
   * sets `save.tutorials.gear`, `notices.shown("gear")`). */
  get provisionsLesson() {
    return this.run.outside && !this.save.tutorials.gear && provisionsOpen(this.save);
  }
  /** The first skill the lessons lead to on the Inspiration tree while it
   * can be bought: Door & Key, and once the `enemy` lesson has sent the
   * player back, Enemy. */
  get introSkill(): IntroSkill | null {
    const owned = this.save.upgrades;
    if (!owned.cardDoorKey) return this.affords("cardDoorKey") ? "cardDoorKey" : null;
    return this.save.tutorials.enemy && !owned.cardEnemy && this.affords("cardEnemy") ? "cardEnemy" : null;
  }
  /** The first skill just bought whose lesson leads back to the entrance:
   * Door & Key until a run goes inside, Enemy likewise after its lesson. */
  get introBought(): IntroSkill | null {
    const owned = this.save.upgrades, t = this.save.tutorials;
    if (t.enemy && owned.cardEnemy) return "cardEnemy";
    return owned.cardDoorKey && !t.enter ? "cardDoorKey" : null;
  }
  /** Whether the Inspiration held pays for skill `id`'s first rank. */
  private affords(id: IntroSkill) {
    return this.free || this.save.tower.inspiration >= cost(id, 0);
  }
  /** End Run pressed: it ends the `stuck` lesson, and the `enemy` lesson's
   * press sends the forest's lessons on to Enemy. */
  endRunPressed() {
    const lesson = this.boardLesson;
    if (lesson === "stuck") this.save.tutorials.stuck = true;
    if (lesson === "enemy") this.save.tutorials.enemy = true;
  }
  /** The card the card points lesson points at, while it waits: in the
   * forest after a run once a card has a point to spend on its tree, the
   * Deck open (Combat Stance) and its own lessons on the hand done. Of the
   * cards the Deck page shows (the hand's, and with Buildout the deck's),
   * the one with the most points left, the hand's first. */
  get cardPointsLesson(): CardId | null {
    const save = this.save, t = save.tutorials;
    if (t.cardPoints || !this.run.outside || !save.upgrades.combatStance || !t.deck || (save.upgrades.buildout && !t.removeCard)) return null;
    const shown = save.upgrades.buildout ? [...new Set([...save.hand, ...deckCards(save.upgrades, save.goals)])] : save.hand;
    let best: CardId | null = null;
    for (const id of shown) if (hasPointsToSpend(save, id) && (!best || pointsLeft(save, id) > pointsLeft(save, best))) best = id;
    return best;
  }
  /** Whether the Archives lesson waits on the Research page: the page opened
   * since the Archives skill was bought (`research`, the board lesson that
   * leads there), until its note on the Archives tab is dismissed. */
  get archivesLesson() {
    const t = this.save.tutorials;
    return !!this.save.upgrades.archives && t.research && !t.archives;
  }
  /** Dismisses the Archives lesson's note, ending the lesson. */
  finishArchivesLesson() {
    if (!this.archivesLesson) return false;
    this.save.tutorials.archives = true;
    return true;
  }
  /** Whether the training lesson's note waits on the Training tab: once
   * training points have been earned, until the note is dismissed. */
  get trainingLesson() {
    return !this.save.tutorials.training && trainingPoints(this.save).earned > 0;
  }
  /** Dismisses the training lesson's note, ending the lesson. */
  finishTrainingLesson() {
    if (!this.trainingLesson) return false;
    this.save.tutorials.training = true;
    return true;
  }
  /** Dismisses the `enter` and `autoClimb` lessons (the others wait on
   * what they ask for). */
  dismissLesson() {
    const lesson = this.boardLesson;
    if (lesson === "autoClimb") {
      this.save.tutorials.autoClimb = true;
      return true;
    }
    if (lesson !== "enter") return false;
    this.save.tutorials.enter = true;
    this.save.tutorials.enemy = false;
    return true;
  }
  /** Whether the first run's lesson holds the hand until STAIRS is pressed. */
  private get teachesClimb() {
    return this.boardLesson === "climb";
  }
  loadMode(outside = false) {
    const run = this.slice.run;
    if (!run) this.newRun({ outside });
    else {
      if (!run.outside) this.upgradeLayout();
      this.adoptRun(run);
    }
    this.recordProgress();
    if (!this.run.outside && this.handStartsPlaying && !this.fallen) this.playHand();
    else this.auto = false;
    this.stopPlay();
  }
  /** Stops the play under way, for a run restored, loaded or begun: the
   * route walked, a fight or volley playing out, the hand's plan and a
   * refused step's mark (which would stand on the wrong tile of a new
   * board). */
  private stopPlay() {
    this.walkIn = null;
    this.route = [];
    this.fights.clear();
    this.volley = null;
    this.turnShown = null;
    this.dropHandPlan();
    this.blocked = { x: 0, y: 0, until: 0 };
  }
  /** Makes `run` the live run of this mode and rebuilds its board. */
  private adoptRun(run: Run) {
    this.run = run;
    this.slice.run = run;
    this.world = this.buildWorld();
  }
  /** The live run's board, regenerated from its seed and changes. */
  private buildWorld(): Board {
    const r = this.run;
    return r.outside ? this.forestWorld(r.seed) : this.rules.board(r);
  }
  /** The forest clearing for `seed`: its buildings stand once they are
   * open, and its roads lead off toward the tiers on either side once
   * those are (as the tier arrows do). */
  private forestWorld(seed: number) {
    const { tier, tiersOpen } = this.slice;
    return new OutsideWorld(seed, this.mode, this.save.equipment.unlocked, goalUnlocked(this.save, "tournament"), tier > 1, tier < tiersOpen);
  }
  /** Map edits saved under an older layout can't be applied to the new one:
   * they are dropped, and progress, stats and inventory are kept. */
  private upgradeLayout() {
    if (this.slice.run!.layoutVersion === this.rules.layoutVersion) return;
    if (this.mode === "delve") this.reshapeDelve(this.save.delve.run!);
    else this.reshapeTower(this.save.tower.run!);
  }
  /** Returns the player to their section's entrance on the new labyrinth. */
  private reshapeDelve(run: DelveRun) {
    this.timeline.reset();
    run.layoutVersion = LAYOUT_VERSION;
    run.changes = {};
    run.milestone = Math.floor(run.height / 100);
    Object.assign(run.player, entrance(run.seed, run.milestone));
    run.floor = floorFor(run.seed, run.milestone);
    this.forgetLabyrinth();
    this.message =
      "The tower has reshaped. Progress kept; returned to this section’s entrance.";
  }
  /** The floor's geometry changed: stand at its entrance. */
  private reshapeTower(run: TowerRun) {
    this.timeline.reset();
    run.layoutVersion = TOWER_LAYOUT_VERSION;
    run.changes = {};
    run.player.x = TOWER_START_X;
    run.player.y = 0;
  }
  /** Pays what the run still owes; returns whether it set a new record. */
  private payout(): boolean {
    const record = this.run.height > this.slice.reached;
    this.recordProgress();
    this.purse.gold(this.rules.endGold(this.run));
    return record;
  }
  snapshot(): MoveSnapshot {
    return this.timeline.snapshot();
  }
  restore(snapshot: MoveSnapshot) {
    // The snapshot's board brings back any chest it had; area rewards are
    // paid when earned, so opening one again pays nothing.
    this.adoptRun(this.rewound(snapshot.run));
    // Lifetime achievements are never rolled back by movement undo, but XP
    // (and any level it reached) is: the kill it paid for is undone.
    this.recordProgress();
    if (levelForXp(snapshot.xp) < levelForXp(this.save.xp)) this.levelUpAt = -Infinity;
    this.fights.forgetMarks();
    this.dashedTo = null;
    this.areaBursts = [];
    this.warpLooted = null;
    this.summoned = null;
    this.vanished = null;
    this.bombed = null;
    this.save.xp = snapshot.xp;
    // Card XP too: the activation or floor it paid for is undone.
    if (snapshot.cardXp) this.save.cardXp = { ...snapshot.cardXp };
    this.cardLevelUps = [];
    // The Silver found since is taken back with the run, so it was never earned.
    if (snapshot.silver !== undefined) this.save.profile.earned.silver = Math.min(this.save.profile.earned.silver, snapshot.silver);
    // Undo pauses the hand, so the player can act before it carries on.
    this.auto = false;
    this.stopPlay();
    this.paused = false;
  }
  /** A copy of an earlier state of the run, on the same floor (a Tower
   * floor's climb forgets the history). Damage taken in this area stays on
   * record, so undo never wins back the chance to master it. */
  private rewound(past: Run): Run {
    const run = structuredClone(past);
    if (this.mode === "tower" && this.towerRun.damaged) (run as TowerRun).damaged = true;
    return run;
  }
  undo() {
    if (this.walkIn) return false;
    // A fight still playing out counts first, so undo takes it back.
    this.fights.finish();
    this.armed = null;
    // Fallen, undo spends one and takes back the fight the hero fell in.
    const undone = this.timeline.undo(this.fallen, (snapshot) => this.restore(snapshot));
    if (!undone) return false;
    this.feedback(undone === "fall" ? "Fatal fight undone · the hand waits" : "Move undone");
    return true;
  }
  /** Accepts the hero's defeat: the run ends and pays out, and the next one
   * waits in the forest. */
  acceptDefeat() {
    if (!this.fallen) return false;
    this.finalizeRun("Fallen in combat");
    return true;
  }
  /** The height Retry starts a new run on: the one this Tower run began on
   * (above floor 1 after a Warp). Null where Retry isn't offered: outside
   * a run, in the Delve, and in a tournament. */
  get retryHeight() {
    return this.mode === "tower" && !this.run.outside ? this.towerRun.start ?? 0 : null;
  }
  /** Ends the run (accepting defeat when fallen), then at once starts a new
   * one, with a new seed, on the floor this one began on. */
  retry(reason: string) {
    const height = this.retryHeight;
    if (height === null) return false;
    this.finish(reason);
    this.newRun({ outside: true, height });
    this.enterFromOutside();
    this.message = height ? `Retrying from floor ${height + 1}` : "Retrying from floor 1";
    return true;
  }
  private reject(x: number, y: number, message: string) {
    this.route = [];
    this.blocked = { x, y, until: performance.now() + 1000 };
    this.message = message;
  }
  previewRoute(x: number, y: number): Step[] | null {
    return routeTo(this, x, y);
  }
  /** Simulates walking a multi-tile route without mutating state, so the UI
   * can preview cumulative HP/ATK/DEF/key changes before the player commits
   * to the walk. Stops early at a lethal fight or a door it can't afford. */
  previewRouteEffects(route: Step[]): RouteEffects | null {
    if (route.length < 2) return null;
    const start = this.run.player;
    let end = start;
    for (const step of route) {
      const outcome = resolveStep(end, this.world.tile(step.x, step.y), this.stepRules);
      if (outcome.blocked) break;
      end = outcome.player;
      if (end.hp <= 0) break;
    }
    const result: RouteEffects = {
      hp: [start.hp, end.hp],
      attack: [start.attack, end.attack],
      defense: [start.defense, end.defense],
      keys: {},
    };
    for (const color of KEY_ORDER)
      if (end.keys[color] !== start.keys[color]) result.keys[color] = [start.keys[color], end.keys[color]];
    return result;
  }
  /** Whether play waits: paused, fallen, or a fight playing out. */
  private get busy() {
    return this.paused || this.fallen || !!this.fights.encounter || !!this.walkIn;
  }
  walkTo(x: number, y: number) {
    if (this.busy) return;
    if (!this.manualMoves) {
      this.handMovesNote();
      return;
    }
    this.auto = false;
    // A tap on the Tower's arch heads for the entrance under it.
    if (this.run.outside && this.world instanceof OutsideWorld && this.world.isArch(x, y)) {
      x = this.rules.entranceX;
      y = ENTRANCE_Y;
    }
    const route = routeTo(this, x, y);
    if (!route) {
      this.reject(x, y, "No route to that space.");
      return;
    }
    // The whole tap-to-walk route counts as a single undo step, not one per tile.
    if (route.length) this.remember(this.snapshot());
    this.route = route;
    this.message = route.length ? "Walking to destination." : "Already here.";
  }
  /** Whether the player may move the hero themselves: in the forest, or
   * with Dev mode on. Inside a run the hand moves the hero. */
  get manualMoves() {
    return !!this.run.outside || this.save.settings.devMode;
  }
  /** Inside a run the hand plays from the start, except in Dev mode, where
   * it waits so the player can walk by hand. */
  private get handStartsPlaying() {
    // The browser UI suite starts it paused too, so no snapshot races a card's step.
    return !this.save.settings.devMode && !(globalThis as { __handStartsPaused?: boolean }).__handStartsPaused;
  }
  /** A step the player takes themselves: it drops any queued route and Automove. */
  stepManually(dx: number, dy: number) {
    if (this.fights.encounter) return false;
    if (!this.manualMoves) return this.handMovesNote();
    this.route = [];
    this.auto = false;
    return this.move(dx, dy, true);
  }
  cancelRoute() {
    this.route = [];
  }
  private handMovesNote(): false {
    this.message = `The hand moves you inside a ${MODES[this.mode].words.run}.`;
    return false;
  }
  /** Plays or pauses the hand inside a run. */
  toggleAuto() {
    if (this.run.outside) return;
    // The speed lesson keeps the hand paused until the arrow is pressed,
    // and the first run's until its note is dismissed.
    if (this.teachesSpeed) {
      this.message = "Press › to speed up.";
      return;
    }
    if (this.teachesClimb) {
      this.message = "Press the Stairs card to begin.";
      return;
    }
    this.route = [];
    if (this.auto) this.auto = false;
    else this.playHand();
    // Pausing keeps the path and the card that led it: playing on follows
    // it from where the hero stands. A stuck hand looks again.
    if (this.auto) this.handStuck = false;
    this.message = this.auto ? "The hand takes over." : "Paused · the hand waits.";
  }
  /** Pauses a playing hand while Pathfinder previews a tapped tile's route;
   * true when it paused it, so `resumeAfterPreview` plays it on. */
  pauseForPreview() {
    if (!this.playing || !this.auto) return false;
    this.toggleAuto();
    return !this.auto;
  }
  /** Plays on a hand `pauseForPreview` paused, once the preview is gone,
   * unless the run has ended, a page holds it paused, or it plays already. */
  resumeAfterPreview() {
    if (!this.playing || this.heldPlay || this.auto) return;
    this.toggleAuto();
  }
  /** Pauses the hand while a page covers the board inside a run (the
   * Research page), keeping whether it played and its speed for
   * `resumeFromPage`. */
  pauseForPage() {
    if (this.run.outside || this.heldPlay) return;
    this.heldPlay = { auto: this.auto, speed: this.save.settings.speed };
    this.route = [];
    this.auto = false;
  }
  /** Back on the board: the hand plays or waits, at the speed, as it did
   * when the page opened. */
  resumeFromPage() {
    const held = this.heldPlay;
    this.heldPlay = null;
    if (!held || this.run.outside || this.fallen) return;
    this.save.settings.speed = held.speed;
    this.auto = held.auto;
  }
  /** Sets the hand playing: at 1 step a second if the speed arrows slowed
   * it to 0, and never while the speed or first run's lesson waits. */
  private playHand() {
    if (this.teachesSpeed || this.teachesClimb) {
      this.auto = false;
      return;
    }
    if (this.save.settings.speed <= 0) this.save.settings.speed = 1;
    this.auto = true;
  }
  /** The run's speed arrows: one step a second slower or faster, from 0 to
   * `maxSpeed`. Slowing to 0 pauses the hand, and speeding up from 0 plays
   * it; in the speed lesson, reaching its speed ends the lesson and plays
   * the hand on. Returns whether the speed changed. */
  changeSpeed(by: -1 | 1) {
    if (this.run.outside || this.teachesClimb || (by < 0 && this.teachesSpeed)) return false;
    const from = this.stepsPerSecond, to = Math.max(0, Math.min(this.maxSpeed, from + by));
    if (to === from) return false;
    const lesson = this.teachesSpeed;
    this.save.settings.speed = to;
    if (to === 0) {
      this.route = [];
      this.auto = false;
      this.message = "Paused · the hand waits.";
    } else if (lesson && !this.teachesSpeed) {
      this.save.tutorials.speed = true;
      this.playHand();
      this.handStuck = false;
    } else if (from === 0) this.playHand();
    return true;
  }
  /** Whether the speed lesson waits: ten steps into the Tower's first
   * floor, once Door & Key is owned, slower than its speed, until the
   * player has once sped up to it. */
  get teachesSpeed() {
    return !this.save.tutorials.speed && this.save.settings.speed < LESSON_SPEED && this.speedLessonDue;
  }
  /** Whether the run has come to the speed lesson: inside the Tower, on its
   * first floor, with Door & Key owned and ten steps taken. */
  private get speedLessonDue() {
    const run = this.run;
    return this.mode === "tower" && !run.outside && run.height === 0 && !!this.save.upgrades.cardDoorKey && (run.notes?.steps ?? 0) >= LESSON_STEPS;
  }
  /** The tenth step on the first floor starts the speed lesson, pausing
   * the hand, or, already that fast, passes it by for good. */
  private startSpeedLesson() {
    if (this.save.tutorials.speed || !this.speedLessonDue) return;
    if (this.save.settings.speed >= LESSON_SPEED) this.save.tutorials.speed = true;
    else {
      this.auto = false;
      this.message = "Press › beside play to move faster.";
    }
  }
  /** The forest's Enter button: the hero walks to the entrance, and the
   * run begins as it steps onto it. It ends the `enter` lesson. */
  headForEntrance() {
    if (!this.run.outside) return false;
    if (this.boardLesson === "enter") this.dismissLesson();
    this.walkTo(this.rules.entranceX, ENTRANCE_Y);
    return true;
  }
  /** Goes straight in through the forest's entrance, starting the run, as
   * walking onto it does. */
  enterRun() {
    if (!this.run.outside) return false;
    this.throughEntrance();
    return true;
  }
  /** Through the forest's entrance: into the Tower, or in the Delve, a
   * tournament run asked for, which spends a Ticket (or, with none held,
   * the way to get one). */
  private throughEntrance() {
    if (this.mode === "tower") return this.walkInThen(() => this.enterFromOutside());
    this.auto = false;
    this.cancelRoute();
    this.tournamentRequested = this.save.tournament.tickets > 0 ? "enter" : "ticket";
  }
  /** From the entrance's steps, walks the hero in before `then` (the run
   * begun), when the entrance plays its walk in. */
  private walkInThen(then: () => void) {
    if (!this.animatesEntrance) return then();
    const p = this.run.player;
    this.auto = false;
    this.cancelRoute();
    this.walkIn = { x: p.x, y: p.y + 1, stage: "steps", since: 0, then };
  }
  /** The walk in's next turn, at `now`: up into the arch, then gone, then,
   * once the view has closed in (at once with motion reduced or
   * transitions off), in. Whether it moved on. */
  walkInTurn(now: number) {
    const w = this.walkIn, settings = this.save.settings;
    if (!w) return false;
    if (w.stage === "steps") w.stage = "arch";
    else if (w.stage === "arch") {
      w.stage = "gone";
      w.since = now;
    } else if (settings.reduceMotion || settings.transition === "instant" || now - w.since >= ENTRANCE_ZOOM_MS) {
      this.walkIn = null;
      w.then();
    } else return false;
    return true;
  }
  /** One turn of automatic movement: the hand's step inside a run, or
   * Automove's in the forest. */
  autoTurn() {
    if (!this.run.outside) return this.handTurn();
    const step = chooseStep(this);
    if (step) {
      this.move(step.dx, step.dy, false);
      this.message = step.label;
    } else this.message = `Waiting · no safe route. Explore or end this ${MODES[this.mode].words.run}.`;
  }
  /** One step by the hand: follow the committed path, or, with none, the
   * first card in priority order that can reach a target. When none can,
   * the hero waits and the End Run button lights up. */
  private handTurn() {
    const target = this.targetTurn();
    if (target === true) return;
    this.dropGatedPlan();
    const fresh = !this.cardPlan;
    const next = this.nextHandPlan(), lost = next.lost;
    let plan = next.plan;
    // Before Auto-Climb the hand waits for the player to press a card.
    if (!plan && !this.autoClimbs) return this.awaitCard(lost);
    // Stuck with tiles marked ?: the nearest becomes ! for Deprioritize's card.
    while (!plan && this.handRules.raiseBang()) plan = planHand(this.handRules, this.hand, this.mode);
    this.handStuck = !plan;
    if (!plan) return this.handWaits();
    this.activeCard = plan.card;
    const id = this.held[plan.card];
    this.message = lost ? `${CARDS[lost].name} has no path to a target · ${CARDS[id].name} leads.`
      : target === "lost" ? `Target lost · no path to the tile · ${CARDS[id].name} leads.` : this.cardMessage(id);
    if (fresh) this.handRules.coolDown(id);
    // A card that acts in place takes the turn without a step.
    if (!plan.path.length) {
      this.cardPlan = null;
      if (id === "flyingEnemy") return this.holdTurn();
      const p = this.run.player, key = `${this.rules.lootKey(this.run, p.x, p.y)}:${id}${this.handRules.cardUses(id)}`;
      this.activation.actInPlace(id, this.handRules.scaleOf(id));
      if (id === this.run.focused) this.run.focused = undefined;
      this.activation.activate(plan.card, key);
      return;
    }
    const goal = plan.path[plan.path.length - 1], key = this.rules.lootKey(this.run, goal.x, goal.y);
    const step = plan.path.shift()!, p = this.run.player, from = { x: p.x, y: p.y };
    this.cardPlan = plan.path.length ? plan : null;
    const dash = this.dashFor(id), dashes = fresh && dash > 0 && this.dashable(step.x, step.y);
    // The card's last step onto its target: Skip may make it vanish (or, on
    // the Tower's stairs, climb two floors), and Effective or Dampen scale it.
    const last = !this.cardPlan, rolls = last && this.handRules.rollsSkip(id, step.x, step.y), skips = rolls && this.handRules.skipHits(id);
    if (skips && this.world.tile(step.x, step.y).kind !== "stairs") {
      this.vanish(step.x, step.y);
      if (id === this.run.focused) this.run.focused = undefined;
      return;
    }
    // A dash is one turn: its shots come once it stops.
    const moved = this.move(step.dx, step.dy, true, true, true, { scale: last ? this.handRules.scaleOf(id) : 1, floorSkip: skips, hold: dashes });
    // The board changes only as the hero moves, so a refused step means the
    // plan is stale: drop it and let the next turn choose again.
    if (!moved) {
      this.turnBefore = null;
      return void (this.cardPlan = null);
    }
    const dashed = dashes ? this.dashOn(plan, id, { ...from, dx: step.dx, dy: step.dy }, dash) : true;
    if (dashes) this.endTurn();
    if (!dashed) return;
    if (this.cardPlan) return;
    // The card's last step reaches its target: a press on it is done, and
    // it activates (once a fight into its target has played out). FLYING
    // ENEMY's last step only brings an enemy in reach: nothing activates.
    if (id === this.run.focused) this.run.focused = undefined;
    // Its arrival counts as its activation toward its level.
    if (id === "flyingEnemy") return this.gainCardXp(id, 1);
    const fight = this.fights.encounter;
    // A roll counts once the step is in the undo history (after a fight,
    // once it settles), so undo takes it back with the step.
    if (!fight) {
      if (rolls) this.handRules.skipRolled();
      return this.activation.activate(plan.card, key);
    }
    const settle = fight.settle;
    fight.settle = () => {
      settle();
      if (rolls) this.handRules.skipRolled();
      this.activation.activate(plan.card, key);
    };
  }
  /** Skip: the card's target at (x, y) vanishes in a puff, without effect.
   * A turn of its own, so undo brings it back. */
  private vanish(x: number, y: number) {
    const t = this.world.tile(x, y);
    this.remember(this.snapshot());
    this.handRules.skipRolled();
    this.world.clear(x, y);
    this.vanished = { x, y, at: performance.now() };
    this.message = `Skip · ${t.kind === "enemy" ? enemyTitle(t.enemy!) : SKIPPED_NAMES[t.kind] ?? "the target"} vanished`;
  }
  /** Dash: the first step toward a new target, onto an empty tile, goes on
   * along the path in the same step across up to `tiles` more empty tiles
   * (`dashFor` the card `id`), stopping on the tile before anything else,
   * unless that is the card's target item and a tile of the dash is left:
   * then it ends on the item, taking it (Effective or Dampen scaling it as
   * on any card's last step; with Skip, which may make it vanish, it stops
   * before it, so the item's own step rolls). One turn and one undo.
   * Dashed steps skip Regen but for the first `dashRegenSteps`.
   * Returns false when a step was refused, leaving the target unreached. */
  private dashOn(plan: CardPlan, id: CardId, from: Dash["tiles"][number], dash: number) {
    const p = this.run.player, tiles = [from];
    let moved = true, left = dash;
    const regenerating = this.dashRegenSteps, regen = () => dash - left < regenerating;
    for (; left > 0 && plan.path.length && this.dashable(plan.path[0].x, plan.path[0].y); left--) {
      const at = { x: p.x, y: p.y }, next = plan.path.shift()!;
      if (!this.move(next.dx, next.dy, true, false, regen(), { hold: true })) {
        plan.path = [];
        moved = false;
        break;
      }
      tiles.push({ ...at, dx: next.dx, dy: next.dy });
    }
    const target = plan.path.length === 1 ? plan.path[0] : null;
    let onItem = false;
    if (moved && left > 0 && target && DASH_ONTO.has(this.world.tile(target.x, target.y).kind) && !this.handRules.rollsSkip(id, target.x, target.y)) {
      const at = { x: p.x, y: p.y };
      plan.path.shift();
      moved = this.move(target.dx, target.dy, true, false, regen(), { scale: this.handRules.scaleOf(id), hold: true });
      if (moved) {
        tiles.push({ ...at, dx: target.dx, dy: target.dy });
        onItem = true;
        // Taking the item makes the dash a turn undo stops at.
        this.timeline.eventful();
      }
    }
    this.cardPlan = plan.path.length ? plan : null;
    const last = tiles[tiles.length - 1], end = onItem ? undefined : { x: p.x, y: p.y, dx: last.dx, dy: last.dy };
    if (tiles.length > 1) this.dash = { tiles, end, at: performance.now() };
    if (tiles.length > 1 && end) this.dashedTo = { x: end.x, y: end.y };
    return moved;
  }
  /** Tiles the hand's first step toward a new target may dash across: none
   * without the Dash skill, and one more a Dash research level. */
  get dashTiles() {
    return (this.save.upgrades.dash ? researched(this.save.archives, "dashTiles") : 0) + this.worn.dashTiles;
  }
  /** How many of a Dash's dashed steps regain HP by Regen: none without the
   * Dash Regen skill, and one more a Dash Regen research level. */
  get dashRegenSteps() {
    return this.save.upgrades.dashRegen ? researched(this.save.archives, "dashRegenSteps") : 0;
  }
  /** Tiles card `id`'s first step toward a new target may dash across:
   * `dashTiles`, End Rush's research on STAIRS (toward the stairs, or the
   * Delve's climb), and its Dash badge's value. They add up. */
  dashFor(id: CardId) {
    const end = id === "stairs" && this.save.upgrades.endRush ? researched(this.save.archives, "endRushTiles") : 0;
    const badge = badgeOn(this.run.badges, id, "dash");
    return this.dashTiles + end + (badge ? badgeValue("dash", badge.level) : 0);
  }
  /** Whether a dash may cross (x, y): empty floor (`emptyAt`), or a chest
   * already opened. */
  private dashable(x: number, y: number) {
    return this.emptyAt(x, y) || (this.world.tile(x, y).kind === "openedChest" && this.emptyAt(x, y, true));
  }
  /** Whether (x, y) is empty floor a dash may cross: nothing on it, no torch
   * and no Gem (with `anyKind`, only those last two). */
  private emptyAt(x: number, y: number, anyKind = false) {
    const gem = this.gemFinder.gem;
    return (anyKind || this.world.tile(x, y).kind === "floor") && !(gem && gem.x === x && gem.y === y) &&
      !this.world.torches?.some((t) => t.active && t.x === x && t.y === y);
  }
  /** Drops the committed path when its card's gate badge no longer holds
   * (`HandRules.gateShut`), so the hand chooses a card again. */
  private dropGatedPlan() {
    const plan = this.cardPlan;
    if (plan && this.handRules.gateShut(this.held[plan.card])) this.cardPlan = null;
  }
  /** The path the hand follows this turn: the one committed, else the
   * pressed card's while it has a path to a target (`lost` once it has
   * none), else, with Auto-Climb, the first card's in priority order that
   * can act. */
  private nextHandPlan(): { plan: CardPlan | null; lost: CardId | null } {
    if (this.cardPlan) return { plan: this.cardPlan, lost: null };
    const focused = this.run.focused;
    if (focused) {
      const plan = planHand(this.handRules, this.held, this.mode, this.held.indexOf(focused));
      if (plan) return { plan, lost: null };
      this.run.focused = undefined;
    }
    return { plan: this.autoClimbs ? planHand(this.handRules, this.hand, this.mode) : null, lost: focused ?? null };
  }
  /** Whether the hand plays on by itself once a card reaches its target
   * (Auto-Climb), rather than waiting for the player to press the next. */
  get autoClimbs() {
    return !!this.save.upgrades.autoClimb;
  }
  /** Before Auto-Climb, inside a run: the hero stands waiting for a card
   * to be pressed, with nothing to follow (the board pulses a glow round it
   * until a press sets it moving). */
  get awaitsPress() {
    return this.playing && !this.autoClimbs && !this.auto && !this.handStuck && !this.route.length && !this.targetPath && !this.cardPlan;
  }
  /** Before Auto-Climb, with no card pressed: the hand pauses for the
   * player to press one, or, when none can act, is stuck. */
  private awaitCard(lost: CardId | null) {
    let plan = planHand(this.handRules, this.hand, this.mode);
    while (!plan && this.handRules.raiseBang()) plan = planHand(this.handRules, this.hand, this.mode);
    this.handStuck = !plan;
    if (!plan) return this.handWaits();
    this.cardPlan = null;
    this.activeCard = null;
    this.auto = false;
    this.message = lost ? `${CARDS[lost].name} has no path to a target · press another card.` : "Press a card in your hand to choose the next move.";
  }
  /** No card can act: the hand pauses and End Run lights up. */
  private handWaits() {
    this.cardPlan = null;
    this.activeCard = null;
    this.auto = false;
    this.enemyBlocks = !this.save.upgrades.cardEnemy && this.stuckReport().blockers.some((b) => b.tile.kind === "enemy" && b.why === "noCard");
    this.message = `No card can move · end the ${MODES[this.mode].words.run}, or use an item or skill.`;
  }
  /** What stops the hand while no card can act (`explainStuck`): the run's
   * end dialog shows it. */
  stuckReport(): StuckReport {
    return explainStuck(this.handRules, this.hand);
  }
  /** The status line for card `id` leading the hand. */
  private cardMessage(id: CardId) {
    return `${CARDS[id].name} · ${this.cardText(id)}`;
  }
  /** What card `id` does, as the player is told now (`cardText`): a
   * trader's keys a trade and a smelt's key and heal by its tree
   * (`HandRules.tradeCost`, `smeltCost`, `smeltPercent`). */
  cardText(id: CardId) {
    return cardText(id, this.tournament.unlocked, this.handRules);
  }
  /** After something the player does inside a run (an item used, a skill),
   * a stuck hand checks its cards again and plays on if one can act. */
  private afterPlayerAction() {
    if (!this.handStuck || !this.playing) return;
    const plan = planHand(this.handRules, this.hand, this.mode);
    if (!plan) return;
    this.handStuck = false;
    // Before Auto-Climb the hand waits for a card to be pressed.
    if (!this.autoClimbs) {
      this.message = "Press a card in your hand to choose the next move.";
      return;
    }
    this.cardPlan = plan;
    this.playHand();
  }
  /** A run going inside keeps the hand as it was ordered on the way in,
   * gets its Pocket Money Silver and, above floor 1, its
   * Warp Loot Silver, and fixes its chance of percent potions. */
  private dealHand() {
    noteGoldBoost(this.save, this.slice, this.clock());
    this.run.hand = [...this.save.hand];
    const manual = this.save.upgrades.manualHand ? this.save.manualHand : [];
    if (manual.length) this.run.manual = [...manual];
    else delete this.run.manual;
    const links = keptLinks(this.run.hand, this.save.cardLinks);
    if (links.length) this.run.links = links;
    else delete this.run.links;
    // The Manual hand's cards are held as the hand's are: their badges,
    // trees and bonuses count, though they act only when pressed.
    const held = this.held;
    const badges = this.save.upgrades.cardBadges ? runBadges(this.save.badges, held, this.badges.slots) : {};
    if (Object.keys(badges).length) this.run.badges = badges;
    const trees = runCardTrees(this.save.cardTrees, held);
    if (Object.keys(trees).length) this.run.cardTrees = trees;
    else delete this.run.cardTrees;
    const tree = treeBonus(this.run.cardTrees);
    const pocket = this.startingSilver, loot = this.warpLoot(pocket);
    if (pocket || loot) this.run.silver = snap(pocket + loot);
    this.warpLooted = loot >= 1 ? { silver: loot, at: performance.now() } : null;
    // HEAL's tree raises the chance, up to every potion; whole hundredths
    // of a percent, so the floors come out the same in every engine.
    const chance = Math.min(10_000, Math.floor(trainedAmount(this.save, "findPotion") * treeFactor(tree, "percentPotions")));
    if (chance) this.run.percentPotions = chance;
    else delete this.run.percentPotions;
    const odds = this.chestOddsFor(held, tree);
    if (odds) this.run.chestOdds = odds;
    else delete this.run.chestOdds;
    // DOOR's Skeleton Key and Lock Pick, GOLD DOOR's Transmute, HEART and WOODEN DOOR's
    // Wooden Door Transmute and HEART DOOR's Heart Lock Pick remake the run's doors as each floor is generated.
    if (tree.skeletonKey || tree.lockPick || tree.yellowTransmute || tree.woodTransmute || tree.heartLockPick)
      this.run.doorOdds = { skeleton: Math.min(100, tree.skeletonKey), lockPick: Math.min(100, tree.lockPick), ...(tree.yellowTransmute ? { transmute: Math.min(100, tree.yellowTransmute) } : {}),
        ...(tree.woodTransmute ? { wood: Math.min(100, tree.woodTransmute) } : {}), ...(tree.heartLockPick ? { heartPick: Math.min(100, tree.heartLockPick) } : {}) };
    else delete this.run.doorOdds;
    // CHEST's Treasure Floor makes a floor's shards and potions chests as it is generated.
    if (tree.treasureFloor) this.run.treasureFloor = Math.min(100, tree.treasureFloor);
    else delete this.run.treasureFloor;
    // The hero strikes the enemies each enemy card covers harder (its tree
    // harder still), and with the enemy cards', ENEMY's and TORCH's trees
    // holds more DEF and shroud against theirs, HEAL's more shroud against
    // every enemy and a parry of its own; the enemy cards' trees raise its
    // crits and Lifesteal's ceiling against theirs (combat.ts reads them).
    const p = this.run.player, foes: NonNullable<Player["foeAttack"]> = Object.fromEntries(Object.entries(handBonus(held).foe).map(([id, b]) => [id, b.attack]));
    for (const [card, n] of Object.entries(foeStats(tree, "Attack")) as [FoeTreeCard, number][]) foes[card] = snap((foes[card] ?? 0) + n);
    if (tree.foeAttack) foes.monster = tree.foeAttack;
    if (tree.bossAttack) foes.torch = tree.bossAttack;
    const defense = { ...foeStats(tree, "Defense"), ...(tree.foeDefense ? { monster: tree.foeDefense } : {}), ...(tree.bossDefense ? { torch: tree.bossDefense } : {}) };
    const shroud = { ...foeStats(tree, "Shroud"), ...(tree.shroud ? { monster: tree.shroud } : {}), ...(tree.bossShroud ? { torch: tree.bossShroud } : {}) };
    for (const [k, v] of [["foeAttack", foes], ["foeDefense", defense], ["foeShroud", shroud], ["foeCritChance", foeStats(tree, "CritChance")],
      ["foeCritFactor", foeStats(tree, "CritFactor")], ["foeStealOverheal", foeStats(tree, "StealOverheal")]] as const) {
      if (Object.keys(v).length) (p as Record<string, unknown>)[k] = v;
      else delete p[k];
    }
    if (tree.parry) p.cardParry = tree.parry;
    else delete p.cardParry;
    if (tree.stealOverheal) p.stealOverheal = tree.stealOverheal;
    else delete p.stealOverheal;
    // ATK UP's and DEF UP's Takedown and Tangle cut a boss as a fight with it
    // begins, TORCH's a Greater Boss, and BOSS ENEMY's both (combat.ts's `squaredUp`).
    const cuts = (boss: number, greaterBoss: number, both: number) => ({ ...(boss + both ? { boss: snap(boss + both) } : {}), ...(greaterBoss + both ? { greaterBoss: snap(greaterBoss + both) } : {}) });
    for (const [k, v] of [["takedown", cuts(tree.takedown, tree.greaterTakedown, foeCardStat(tree, "bossEnemy", "Takedown"))],
      ["tangle", cuts(tree.tangle, tree.greaterTangle, foeCardStat(tree, "bossEnemy", "Tangle"))]] as const) {
      if (Object.keys(v).length) p[k] = v;
      else delete p[k];
    }
    // A Power Strike charged on an earlier run doesn't carry over.
    delete p.powerStrike;
    // GOLD KEY's Max HP raises the hero's for the run, as the Max HP badge's does (`heroFactor`).
    const maxHp = treeFactor(tree, "maxHp");
    if (maxHp !== 1) {
      p.maxHp = snap(p.maxHp * maxHp);
      p.hp = snap(p.hp * maxHp);
      if (this.run.loadout) this.run.loadout.maxHp = snap(this.run.loadout.maxHp * maxHp);
    }
    for (const k of ["ignoreUsed", "targetUsed", "regain", "ignored", "targeted", "focused"] as const) delete this.run[k];
  }
  /** A run's chances of Supply and Equipment Chests with `hand`: the
   * hand's (the CHEST card's, and the points its tree adds, `tree`), raised
   * by the worn Supply and Equipment Chest chance; none before Equipment
   * opens or without a card that gives one. */
  private chestOddsFor(hand: readonly CardId[], tree: TreeBonus): ChestOdds | undefined {
    const { chest } = handBonus(hand);
    if (!this.save.equipment.unlocked || !(chest.supply + chest.equipment)) return undefined;
    const find = wornEffects(this.save, this.mode).chestFind;
    return { supply: raised(snap(chest.supply + tree.supplyChance), find), equipment: raised(snap(chest.equipment + tree.equipmentChance), find) };
  }
  /** What the card trees of the run's hand give (`treeBonus`): none in the
   * forest. */
  get treeBonus(): TreeBonus {
    return treeBonus(this.run.outside ? undefined : this.run.cardTrees);
  }
  /** The fastest speed the run's arrows reach: 3 steps a second, and one
   * more a Movement Speed research level. */
  get maxSpeed() {
    return researched(this.save.archives, "moveSpeed") + (this.boons?.playSpeed ?? 0);
  }
  /** What the Tower run's boons change now, or null (none picked, or the
   * Delve). */
  get boons() {
    return this.mode === "tower" && !this.run.outside ? runBoons(this.run as TowerRun, this.save) : null;
  }
  /** What the Gold multipliers read now (`economy/gold-multipliers.ts`): the
   * Shrine Boons line is the boons' Gold factor inside a Tower run once
   * Shrines are open (1 with none), else none. */
  get goldContext(): GoldContext {
    return { save: this.save, mode: this.mode, tier: this.tier, now: this.clock(), shrine: this.shrine.open ? this.boons?.gold ?? 1 : undefined };
  }
  /** The run's boons changed its hero or enemies (`ShrineDesk.sync`): the
   * floor's enemies are read afresh and the hand plans again. */
  boonsChanged() {
    if (this.world instanceof RoomWorld) this.world.foes = weakened((this.run as TowerRun).shrine?.applied?.foes, runFoeCut(this.run));
    this.dropHandPlan();
  }
  /** Research completed: what it changes about the run's boons applies at
   * once, and Auto Pick takes any boons it earned. */
  researchDone() {
    this.shrine.sync();
    this.shrine.autoPick();
  }
  /** Whether fights play out strike by strike: always, until Instant
   * Combat opens the Animate fights setting to turn it off. */
  get animatesFights() {
    return !this.save.upgrades.instantCombat || this.save.settings.fightAnimation;
  }
  /** Steps a second the hand and Automove take: the speed the run's arrows
   * set (0 only while the hand is paused), no faster than research allows;
   * the forest walks at least `FOREST_SPEED`. */
  get stepsPerSecond() {
    const speed = Math.min(this.save.settings.speed, this.maxSpeed);
    return this.run.outside ? Math.max(speed, FOREST_SPEED) : speed;
  }
  /** Steps a second the hero actually takes: `stepsPerSecond`, raised by
   * the movement speed the equipment worn gives. */
  get moveRate() {
    return raised(this.stepsPerSecond, this.worn.moveSpeed);
  }
  /** What the equipment this mode's hero wears does now. */
  get worn() {
    return wornEffects(this.save, this.mode);
  }
  /** What research changes about stepping now: the step rules every move,
   * preview, inspect box and planner resolves with. */
  get stepRules(): StepRules {
    // Regen research raises the HP each step regains by its percent, and HEAL's tree by its own.
    const tree = this.treeBonus;
    const regen = this.run.outside || !this.run.player.regen ? 0
      : snap((this.run.player.regen * researched(this.save.archives, "regenPercent") * treeFactor(tree, "regen")) / 100);
    const worn = this.worn, potionHeal = raised(researched(this.save.archives, "potionHeal"), worn.potionHeal);
    const crit = this.crit, keys = this.handBonus.keys;
    // KEY's tree adds to every colour's percent, the key cards' adding to their own; each colour's own tree multiplies its keys'.
    const found = KEY_ORDER.flatMap((color) => {
      const n = compounded((keys[color]?.percent ?? 0) + tree.keyFind, keyStat(tree, color, "KeyFind"));
      return n ? [[color, n] as const] : [];
    });
    const keyFind = found.length ? { keyFind: Object.fromEntries(found) } : {};
    const overheal = this.overheal;
    return { potionHeal, percentPotion: trainedAmount(this.trainingNow, "potion"), regen, ...(overheal > 1000 ? { overheal } : {}),
      heartToll: researched(this.save.archives, "heartToll"), keyCost: this.keyCost, ...keyFind, ...(this.doorOff ? { doorOff: this.doorOff } : {}),
      ...(tree.doorHeal ? { doorHeal: tree.doorHeal } : {}), ...(tree.yellowLockHeal ? { yellowLockHeal: tree.yellowLockHeal } : {}), ...(tree.keyHeal ? { keyHeal: tree.keyHeal } : {}), ...(tree.keyOverheal ? { keyOverheal: tree.keyOverheal } : {}),
      ...Object.fromEntries(KEY_ORDER.flatMap((color) => (["KeyHeal", "KeyOverheal"] as const).flatMap((part) => (keyStat(tree, color, part) ? [[`${color}${part}`, keyStat(tree, color, part)]] : [])))),
      shardAttack: researched(this.save.archives, "shardAttackPercent") * boonFactor(this.run, "attack") * treeFactor(tree, "attackShard"),
      shardDefense: researched(this.save.archives, "shardDefensePercent") * treeFactor(tree, "defenseShard"),
      ...(tree.potionHeal ? { potionCard: tree.potionHeal } : {}),
      ...(worn.victoryHeal ? { victoryHeal: worn.victoryHeal } : {}), ...(crit ? { crit } : {}) };
  }
  /** How far potions, the smelt cards and badge heals may heal above max HP now,
   * as a multiple of max HP in thousandths (Overheal training, the run's
   * Silver ranks counting, 1,000 until Overheal is owned), with the card
   * trees' Overheal Max added, skill or not. */
  get overheal() {
    return treeOverheal(trainedAmount(this.trainingNow, "overheal"), this.treeBonus);
  }
  /** The most HP the hero may hold now: max HP, raised by Overheal. */
  get hpCeiling() {
    return hpCeiling(this.run.player.maxHp, { overheal: this.overheal });
  }
  /** Revive's chance now (its training, the run's Silver ranks counting),
   * in hundredths of a percent, TORCH's tree's percent added. */
  get reviveChance() {
    return snap(trainedAmount(this.trainingNow, "revive") + this.treeBonus.reviveChance * 100);
  }
  /** The hero's critical strikes now (Critical, Crit % and Crit x training
   * and research, the run's Silver ranks counting), read when a fight is
   * taken or shown; none in the forest. */
  get crit(): CritRule | undefined {
    return this.run.outside ? undefined : critRule({ ...this.trainingNow, archives: this.save.archives }, this.cardCrit);
  }
  /** ENEMY's tree's percents on Crit % and Crit x, for fights and arrows. */
  private get cardCrit() {
    const tree = this.treeBonus;
    return { chance: tree.critChance, factor: tree.critFactor };
  }
  /** How much of a key each key a door takes costs, in tenths of a percent
   * (Key Efficiency research): what steps pay and the door cards plan by. */
  get keyCost() {
    return researched(this.save.archives, "keyCost");
  }
  /** The percent less each kind of door costs, from the door cards the run's
   * hand holds and the DOOR, KEY, HEART DOOR and WOODEN DOOR trees: what
   * steps pay and the door cards plan by; undefined with none. */
  get doorOff() {
    const doors: DoorDiscounts = { ...this.handBonus.doors }, tree = this.treeBonus;
    if (tree.heartLockCost) doors.heart = snap((doors.heart ?? 0) + tree.heartLockCost);
    if (tree.woodKeyCost) doors.woodKeys = tree.woodKeyCost;
    if (tree.woodDurability) doors.woodToll = tree.woodDurability;
    if (tree.doorCost) doors.all = tree.doorCost;
    if (tree.plainDoorCost) doors.plain = tree.plainDoorCost;
    if (tree.heartDoorCost) doors.hearts = tree.heartDoorCost;
    for (const color of KEY_ORDER) if (keyStat(tree, color, "DoorCost")) doors[`${color}Key`] = keyStat(tree, color, "DoorCost");
    return Object.keys(doors).length ? doors : undefined;
  }
  /** Where the Training tab reads its rows' values: this mode's hero, and
   * the run while one is inside (`TrainingView`). */
  get trainingView(): TrainingView {
    return this.run.outside ? { mode: this.mode } : { mode: this.mode, run: this.run };
  }
  /** The upgrades owned and the Training ranks that count now: the hero's
   * own, and those this run bought with Silver. */
  private get trainingNow() {
    return { upgrades: this.save.upgrades, training: ranksInRun(this.save, this.run) };
  }
  /** Silver spent on run training since the page loaded, so the purse's
   * Silver rate counts only what was found (not saved). */
  silverSpent = 0;
  /** Silver held this run. */
  get silver() {
    return this.run.silver ?? 0;
  }
  /** The Silver Warp Loot research adds to a Tower run going inside above
   * floor 1 (a Warp, or a Retry from one), holding `pocket` Silver: its
   * percent of the Silver the floors below would have paid (economy/warp-loot.ts). */
  private warpLoot(pocket: number) {
    const start = this.mode === "tower" ? this.towerRun.start ?? 0 : 0;
    return start ? warpLootSilver(this.save, this.run.tier ?? 1, start, pocket) : 0;
  }
  /** The Silver a run starts with as it goes inside: Pocket Money research
   * and worn Equipment's. */
  get startingSilver() {
    return snap(researched(this.save.archives, "startingSilver") + this.worn.startSilver);
  }
  /** Uses of charge `c` (Ignore, Target) left: this run's inside
   * one, or in the forest what the next run will start with. */
  chargesLeft(c: Charge) {
    return this.run.outside ? chargesPerRun(this.save, c) : chargesLeft(this.save, this.run, c);
  }
  /** Bombs left: this run's (one for each Bomb provision owned, less
   * those thrown), or in the forest what the next run will carry. */
  get bombsLeft() {
    const owned = this.save.provisions.bomb;
    return this.run.outside ? owned : Math.max(0, owned - (this.run.bombsUsed ?? 0));
  }
  /** Uses of provision `id` (Traveler's elixir, Vanguard Banner, Aegis charm)
   * left: this run's (one for each owned, less those used), or in the
   * forest what the next run will carry. */
  provisionsLeft(id: UsedProvision) {
    const owned = this.save.provisions[id];
    return this.run.outside ? owned : Math.max(0, owned - (this.run.provisionsUsed?.[id] ?? 0));
  }
  /** The boost provision `id` has going on (what it added, the turns it
   * has left); none for the elixir, or with none going on. */
  boostOf(id: UsedProvision) {
    return id === "heal" ? undefined : this.run.boosts?.[PROVISION_BOOSTS[id]];
  }
  /** Uses provision `id` at once, after any fight still playing out: the
   * Traveler's elixir fills HP to max HP (`full`, and kept, when HP is
   * there already), and a Vanguard Banner or Aegis charm raises ATK or DEF by
   * `PROVISION_BOOST_PERCENT` for `PROVISION_BOOST_TURNS` turns (`active`,
   * and kept, while one is going on). It is no turn of its own, and undo
   * never takes it back: the heal and the boost reach every copy of the
   * run undo holds, and the use spent rides onto the run undo restores
   * (`RunTimeline.undo`). */
  useProvision(id: UsedProvision): "used" | "full" | "active" | "spent" | "unavailable" {
    if (!this.save.provisions[id] || this.run.outside || this.fallen) return "unavailable";
    if (this.provisionsLeft(id) < 1) return "spent";
    this.fights.finish();
    if (this.fallen) return "unavailable";
    const p = this.run.player, copies = this.timeline.runs();
    if (id === "heal") {
      if (p.hp >= p.maxHp) return "full";
      const healed = snap(p.maxHp - p.hp);
      for (const run of copies) if (run.player.hp > 0) run.player.hp = Math.max(run.player.hp, run.player.maxHp);
      this.recordHeal(healed);
      this.message = "Traveler's elixir · HP full";
    } else {
      const stat = PROVISION_BOOSTS[id];
      if (this.run.boosts?.[stat]) return "active";
      const amount = snap((p[stat] * PROVISION_BOOST_PERCENT) / 100), word = stat === "attack" ? "ATK" : "DEF";
      for (const run of copies) {
        run.player[stat] = snap(run.player[stat] + amount);
        run.boosts = { ...run.boosts, [stat]: { amount, turns: PROVISION_BOOST_TURNS } };
      }
      this.gain(p.x, p.y, `+${wholeChange(amount)} ${word}`, { tile: { kind: stat } });
      this.message = `${id === "edge" ? "Vanguard Banner" : "Aegis charm"} · +${PROVISION_BOOST_PERCENT}% ${word} for ${PROVISION_BOOST_TURNS} turns`;
    }
    for (const run of copies) run.provisionsUsed = { ...run.provisionsUsed, [id]: (run.provisionsUsed?.[id] ?? 0) + 1 };
    this.countProvisionsUsed();
    // The hand plans again, with the hero as it is now.
    this.cardPlan = null;
    this.afterPlayerAction();
    return "used";
  }
  /** Counts the provisions the run has used, Bombs thrown too, toward the
   * missions: undo takes a throw back, so only the run's most counts. */
  private countProvisionsUsed() {
    const run = this.run, used = Object.values(run.provisionsUsed ?? {}).reduce((n, k) => n + (k ?? 0), 0);
    this.missions.mark("provisions", this.mode, run.seed, used + (run.bombsUsed ?? 0));
  }
  /** A turn taken counts down the boosts going on; one run out takes the
   * ATK or DEF it added back off the hero, on every copy of the run undo
   * holds, as it went on. */
  private tickBoosts() {
    const boosts = this.run.boosts;
    if (!boosts) return;
    for (const stat of Object.keys(boosts) as Boosted[]) {
      const boost = boosts[stat]!;
      if (--boost.turns > 0) continue;
      for (const run of this.timeline.runs()) {
        run.player[stat] = snap(Math.max(0, run.player[stat] - boost.amount));
        delete run.boosts?.[stat];
        if (run.boosts && !Object.keys(run.boosts).length) delete run.boosts;
      }
    }
  }
  /** The Gold Key provisions on floor `floor` (from 0, `MODES[mode].floorOf`)
   * reached: a gold key for each owned, on the floor the run goes inside
   * on and then on the first floor `PROVISION_KEY_FLOORS` or more past the
   * last that gave them, so a floor climbed past still counts. They come
   * as a floor begins, which undo never goes back past. */
  private provisionKeys(floor: number) {
    const owned = this.save.provisions.yellowKey, run = this.run;
    if (!owned || (run.keyFloor !== undefined && floor < run.keyFloor + PROVISION_KEY_FLOORS)) return;
    run.keyFloor = floor;
    const p = run.player;
    p.keys.yellow = snap(p.keys.yellow + owned);
    noteKey(run, "yellow", owned);
    this.gain(p.x, p.y, `+${owned} gold key${owned === 1 ? "" : "s"}`, { tile: { kind: "key", color: "yellow" } });
  }
  /** Whether the hero has `c` at all: Ignore's or Target's skill, or a Bomb provision. */
  private owns(c: Armed) {
    return c === "bomb" ? this.save.provisions.bomb > 0 : !!this.save.upgrades[c];
  }
  /** Uses of `c` left. */
  private armedLeft(c: Armed) {
    return c === "bomb" ? this.bombsLeft : this.chargesLeft(c);
  }
  /** Ignore, Target or a Bomb waiting for the board tap that says where. */
  armed: Armed | null = null;
  /** Readies Ignore, Target or a Bomb (or, armed already, puts it away):
   * the next board tap marks, targets or bombs that tile. */
  arm(c: Armed): "armed" | "disarmed" | "unavailable" | "spent" {
    if (!this.owns(c) || this.run.outside || this.fallen) return "unavailable";
    if (this.armed === c) {
      this.armed = null;
      this.message = this.auto ? "The hand takes over." : "Paused · the hand waits.";
      return "disarmed";
    }
    if (this.armedLeft(c) < 1) return "spent";
    this.armed = c;
    this.message = c === "ignore" ? "Ignore · tap a tile the hero won't step on." : c === "target" ? "Target · tap a tile to send the hero there." : "Bomb · tap an enemy to bomb it.";
    return "armed";
  }
  /** The board tap Ignore, Target or a Bomb was armed for, on (x, y):
   * Ignore marks the tile for the rest of the floor, Target sends the hero
   * there, and a Bomb goes off on the enemy there. A tile it can't take (a
   * wall, the hero's own, one already ignored, for Target one out of
   * reach, for a Bomb one with no enemy) costs nothing and keeps it armed. */
  useArmed(x: number, y: number): "used" | "invalid" | "noPath" | "unavailable" {
    const c = this.armed;
    if (!c || !this.owns(c) || this.run.outside || this.fallen || this.armedLeft(c) < 1) {
      this.armed = null;
      return "unavailable";
    }
    return c === "ignore" ? this.ignoreTile(x, y) : c === "target" ? this.targetTile(x, y) : this.bombTile(x, y);
  }
  /** A Bomb going off on (x, y): the enemy there (or a Flying one over it)
   * takes the hero's ATK, its DEF no help, and falls to it as to an arrow,
   * paid as a kill. A tile with no enemy takes no Bomb. The throw is a turn
   * of its own, so undo takes it back, and its kill's Gold can't be paid
   * twice. A fight still playing out counts first. */
  private bombTile(x: number, y: number): "used" | "invalid" | "unavailable" {
    this.fights.finish();
    if (this.fallen) {
      this.armed = null;
      return "unavailable";
    }
    const enemy = foeOn(this.world.tile(x, y));
    if (!enemy) return "invalid";
    this.remember(this.snapshot());
    this.run.bombsUsed = (this.run.bombsUsed ?? 0) + 1;
    this.countProvisionsUsed();
    this.armed = null;
    this.bombed = { x, y, at: performance.now() };
    const damage = this.run.player.attack;
    this.gain(x, y, `−${wholeChange(Math.min(damage, enemy.hp))}`, null, undefined, "hit");
    if (enemy.hp > damage) {
      this.world.wound?.(x, y, damage);
      this.message = `Bomb · ${enemyTitle(enemy)} −${wholeChange(damage)} HP`;
    } else {
      this.world.clear(x, y);
      this.message = [`Bomb · ${enemyTitle(enemy)} defeated`, ...this.finds.kill(enemy, { x, y }, 1, false, 0)].join(" · ");
    }
    // The hand plans again, round what the Bomb left.
    this.cardPlan = null;
    this.afterPlayerAction();
    return "used";
  }
  private ignoreTile(x: number, y: number): "used" | "invalid" {
    if (!this.handRules.ignore(x, y)) return "invalid";
    spendCharge(this.run, "ignore");
    this.armed = null;
    // The hand plans again, round the tile, and a stuck hand looks again.
    this.cardPlan = null;
    this.targetPath = null;
    this.message = "Ignore · the hero won't step there on this floor.";
    this.afterPlayerAction();
    return "used";
  }
  private targetTile(x: number, y: number): "used" | "noPath" {
    const path = planTarget(this.handRules, x, y);
    if (!path) return "noPath";
    this.targetPath = path;
    spendCharge(this.run, "target");
    this.armed = null;
    this.run.targeted = `${x},${y}`;
    this.route = [];
    this.cardPlan = null;
    this.activeCard = null;
    this.handStuck = false;
    this.playHand();
    this.message = "Target · the hero heads for the tile.";
    return "used";
  }
  /** Target's turn: one step along the way to its tile, the last onto it,
   * following the path it committed to and planning again only when that
   * can't be followed. "lost" when the tile is out of reach now (Target is
   * lost, and the hand leads this turn), false when there is none. */
  private targetTurn(): boolean | "lost" {
    const k = this.run.targeted;
    if (!k) return false;
    const [x, y] = k.split(",").map(Number);
    const path = this.targetPath?.length && stillOpen(this.handRules, this.targetPath) ? this.targetPath : planTarget(this.handRules, x, y);
    this.targetPath = null;
    if (!path) {
      this.run.targeted = undefined;
      this.message = "Target lost · no path to the tile.";
      return "lost";
    }
    this.cardPlan = null;
    this.activeCard = null;
    const step = path[0], last = path.length === 1;
    const moved = this.move(step.dx, step.dy, true);
    if (moved && !last) this.targetPath = path.slice(1);
    if (last || !moved) {
      this.run.targeted = undefined;
      if (!moved) this.message = "Target · the way is barred · the hand leads.";
    } else this.message = "Target · the hero heads for the tile.";
    return true;
  }
  /** A new floor climbed for the first time in the run: Ignore More and
   * Target More count it, and each charge regained shows. */
  private regainCharges(at: { x: number; y: number }) {
    for (const c of climbFloor(this.save, this.run)) this.gain(at.x, at.y, `+1 ${c === "ignore" ? "Ignore" : "Target"}`);
  }
  /** A hand card pressed inside a run (the slot `card` of `held`, so past
   * the hand's slots a Manual hand card): it leads the
   * hero to its closest target, ahead of the others (`run.focused`), and
   * the hand plays on to it. Refused while an earlier press still heads
   * for its target (`busy`), and for a card with no path to a target
   * (`noPath`), which costs nothing. The first run's lesson waits on
   * STAIRS, the `keys` lesson ends once DOOR or KEY is pressed, and the
   * `autoClimb` lesson once any card is. */
  focus(card: number): "focused" | "unavailable" | "busy" | "noPath" {
    const id = this.held[card];
    if (this.run.outside || this.fallen || !id) return "unavailable";
    if (this.run.focused) return "busy";
    if (this.teachesClimb && id !== "stairs") return "unavailable";
    const plan = planHand(this.handRules, this.held, this.mode, card);
    if (!plan) return "noPath";
    const lesson = this.boardLesson;
    if (lesson === "climb") this.save.tutorials.climb = true;
    if (lesson === "keys" && (id === "door" || id === "key")) this.save.tutorials.keys = true;
    if (lesson === "autoClimb") this.save.tutorials.autoClimb = true;
    this.run.focused = id;
    this.route = [];
    // During a fight, the path is found again once the hero has stepped in.
    this.cardPlan = this.fights.encounter ? null : plan;
    this.activeCard = card;
    this.handStuck = false;
    this.playHand();
    this.message = this.cardMessage(id);
    return "focused";
  }
  /** Forgets the hand's committed path and which card glows. */
  private dropHandPlan() {
    this.cardPlan = null;
    this.targetPath = null;
    this.activeCard = null;
    this.handStuck = false;
  }
  /** Erases all progress and starts again outside the Tower. */
  eraseAll() {
    // What was bought in the Shop, and its record, outlast the progress, as
    // does Mail, which is the server's (and so what was claimed from it),
    // and the Event Boosters bought.
    const { entitlements, shop, mail, events } = this.save;
    this.save = { ...defaults(), entitlements, shop, mail };
    this.save.events.boosted = events.boosted;
    if (permanentBoost(this.save)) this.save.trainingBoostUntil = BOOST_FOREVER;
    stampProfile(this.save, this.clock());
    this.mode = "tower";
    this.newRun({ outside: true });
  }
  /** Replaces the whole save with `save` (an imported profile, which holds
   * no run) and starts again outside the Tower. */
  replaceSave(save: Save) {
    this.save = save;
    stampProfile(this.save, this.clock());
    this.mode = "tower";
    this.newRun({ outside: true });
  }
  routeStep() {
    const step = this.route.shift();
    if (!step) return false;
    const result = this.move(step.dx, step.dy, true, false);
    if (!result) this.route = [];
    return result;
  }
  /** Starts a new run in this mode, rolling its seed unless `start` gives
   * one, on the first floor unless it gives a `height` (a Warp). */
  newRun({ outside = false, seed = Math.floor(this.rng() * 2 ** 32), height = 0 }: RunStart = {}) {
    // A Gem the last run left lying on a floor is missed.
    if (this.save.gemDrop.out?.mode === this.mode) missGem(this.save.gemDrop);
    this.armed = null;
    this.heldPlay = null;
    this.timeline.reset();
    this.slice.runGold = 0;
    this.slice.runBoostGold = null;
    this.slice.runCurrency = 0;
    this.slice.runRecord = false;
    this.slice.runFinds = defaultFinds();
    this.warpLooted = null;
    this.stopPlay();
    const { player, loadout } = startingHero(this.save, this.mode);
    const core: RunCore = {
      layoutVersion: this.rules.layoutVersion,
      seed,
      height,
      maxHeight: height,
      kills: 0,
      treasures: 0,
      changes: {},
      floor: 0,
      player,
      ...(this.slice.tier > 1 ? { tier: this.slice.tier } : {}),
      // A run begun inside (a mode switched to) starts its notes now; one
      // in the forest starts them as it goes in.
      ...(outside ? {} : { notes: newNotes(this.clock()) }),
    };
    this.run = this.mode === "tower"
      ? { damaged: false, ...core, ...(height > 0 ? { start: height } : {}) }
      : { ...core, milestone: 0 };
    this.run.loadout = loadout;
    // The board is built once below: the forest's, or the run's once its
    // hand is dealt (generating a floor is slow).
    if (outside) {
      this.run.outside = true;
      this.toForestStart();
      this.world = this.forestWorld(seed);
      this.message = this.rules.words.begin;
    } else {
      this.forgetLabyrinth();
      this.dealHand();
      // The hand's badges may add enemies to its floors (More Enemies).
      this.world = this.rules.board(this.run);
    }
    this.slice.run = this.run;
    if (!outside && this.handStartsPlaying) this.playHand();
    else this.auto = false;
    this.dropHandPlan();
    this.paused = false;
  }
  /** Whether a tournament run can begin now: the Tournament open to the
   * player, in a forest, and no run of either mode inside (its cave, in the
   * Delve's forest, begins it). */
  get canBeginTournament() {
    const inside = (run: Run | null) => !!run && !run.outside;
    return this.tournament.unlocked && !!this.run.outside && !inside(this.save.tower.run) && !inside(this.save.delve.run);
  }
  /** Begins a run in tournament `info`, entered on the server as `entry`:
   * spends a Ticket, and goes straight into the league's Delve cave, its
   * records the cave's, its layout and chances from the league's shared
   * seeds, its enemies as strong as the next cave's. False (nothing spent) when it can't begin or
   * no Ticket is held. */
  beginTournament(info: TournamentInfo, entry: string) {
    if (!this.canBeginTournament || !this.tournament.enter(info.id, entry)) return false;
    const back = { mode: this.mode, tier: this.save.delve.tier }, cave = LEAGUE_INFO[info.league].cave;
    this.switchMode("delve", true);
    if (this.slice.tier !== cave) switchTier(this.slice, cave);
    const begin = () => {
      this.newRun({ outside: true, seed: info.seeds.layout });
      const run: TournamentRun = { id: info.id, league: info.league, entry, seeds: { ...info.seeds }, drawn: { game: 0, equipment: 0 }, back };
      this.delveRun.tournament = run;
      this.events.record("tournaments", 1, String(info.id));
      this.enterFromOutside();
      this.message = `Tournament · ${LEAGUE_INFO[info.league].name} League`;
    };
    // Begun from the cave's steps, the hero walks in first.
    const p = this.run.player;
    if (this.run.outside && this.world instanceof OutsideWorld && p.x === this.rules.entranceX && p.y === ENTRANCE_Y) this.walkInThen(begin);
    else begin();
    return true;
  }
  /** Claims a Goals checkpoint's reward (or its premium one) in `tower`
   * once reached; returns it, or null when it isn't ready. */
  claimGoal(tower: number, floor: number, premium: boolean) {
    const reward = claimGoal(this.save, tower, floor, premium);
    if (reward) readyForestRuns(this.save);
    // Its Breakthrough point calls the player to the Breakthrough tree.
    if (reward && !premium) this.save.treeNotices.breakthrough = true;
    // Equipment's Blacksmith, the Tournament's Hall, and the road out to a newly opened tower, open in the forest at once.
    const reshapes = reward?.kind === "tower" || (reward?.kind === "unlock" && (reward.unlock === "equipment" || reward.unlock === "tournament"));
    if (reshapes && this.run.outside) this.world = this.buildWorld();
    // The running Event's first missions come at once.
    if (reward?.kind === "unlock" && reward.unlock === "events") this.events.refresh();
    return reward;
  }
  /** Whether a Tower run in the forest may warp to the checkpoint at `floor`. */
  private canWarpTo(tower: number, floor: number) {
    return this.mode === "tower" && !!this.run.outside && canWarp(this.save, tower, floor);
  }
  /** Warp: from the forest, begins a new Tower run in `tower` at once on
   * the floor after the checkpoint at `floor` (the first of the next ten),
   * once Warp is owned and that checkpoint reached. */
  warp(tower: number, floor: number) {
    if (!this.canWarpTo(tower, floor)) return false;
    if (tower !== this.slice.tier) this.selectTier(tower);
    this.newRun({ outside: true, height: floor });
    this.enterFromOutside();
    this.message = `Warped to floor ${floor + 1}`;
    return true;
  }
  private feedback(text: string, ms = 1300) {
    this.message = text;
    this.effect = {
      text,
      x: this.run.player.x,
      y: this.run.player.y,
      until: performance.now() + ms,
    };
  }
  /** Queues a reward to rise from (x, y), unless the Settings turn off
   * gains of its `kind` (by default, the kind its art raises). */
  gain(x: number, y: number, text: string, art: GainArt | null = null, drop?: Drop, kind: GainKind | null = kindOf(art)) {
    if (kind && !this.save.settings[GAIN_SETTINGS[kind]]) return;
    this.gains.push({ x, y, text, art, ...(drop ? { drop } : {}) });
    if (this.gains.length > MAX_GAINS) this.gains.shift();
  }
  /** Pays the XP for beating `enemy` on equivalent floor `floor`, counting
   * it toward the run's total too. */
  gainXp(enemy: Enemy, floor: number, scale = 1) {
    // Worn Equipment's XP Gain and the card trees' (ENEMY's, and the enemy cards' covering it, added up), each its own factor.
    const bonus = this.treeBonus, xp = tierXp(this.tier, xpForKill(enemy.strength, floor)), gain = this.worn.xpGain, tree = snap(bonus.killXp + foeStat(bonus, enemy, "KillXp"));
    const raisedXp = gain || tree ? Math.round((xp * (100 + gain) * (100 + tree)) / 10_000) : xp;
    this.addXp(scale === 1 ? raisedXp : Math.round(raisedXp * scale));
  }
  /** Adds `xp` to the hero's and the run's, raising the level-up burst
   * when it reaches a new level. */
  addXp(xp: number) {
    const level = levelForXp(this.save.xp);
    this.save.xp += xp;
    this.run.xp = (this.run.xp ?? 0) + xp;
    const reached = levelForXp(this.save.xp);
    if (reached > level) {
      this.levelUpAt = performance.now();
      this.levelUpPoints = TRAINING_PER_LEVEL * (reached - level);
    }
  }
  /** Card `id` gains `xp` toward its levels, each level it reaches queued
   * for the hand's animation. Undo takes it back with the move. */
  gainCardXp(id: CardId, xp: number) {
    for (const level of addCardXp(this.save.cardXp, id, xp, cardMaxLevel(this.save.cardBuys.opened, id))) this.cardLevelUps.push({ card: id, level });
  }
  /** `floors` new floors completed: each card of the hand that never
   * activates (`PASSIVE_CARDS`), or of the Manual hand, gains one XP a floor. */
  private passiveCardXp(floors: number) {
    if (floors <= 0) return;
    for (const id of this.held) if (PASSIVE_CARDS.has(id)) this.gainCardXp(id, floors);
  }
  /** The single path that ends the current run, whether the player
   * accepts defeat or ends it: pays out exactly once and starts the next run
   * in the forest. */
  private finalizeRun(reason: string) {
    const record = this.payout(), gold = this.slice.runGold;
    // A new floor's "A new chamber opens." teaches only the first Tower run.
    if (this.mode === "tower") this.save.tutorials.chamber = true;
    this.forestSeeds.clear();
    // A run that earned its currency sends the player to spend it.
    if (this.slice.runCurrency > 0) this.save.treeNotices.inspiration = true;
    this.route = [];
    const tournament = this.tournamentRun;
    if (tournament) this.tournament.recordScore(tournament.id, tournamentScore(this.run));
    // A tournament run's cave gives way to the tier the player had selected.
    if (tournament && tournament.back.tier !== this.slice.tier) switchTier(this.slice, tournament.back.tier);
    this.newRun({ outside: true });
    if (tournament) this.switchMode(tournament.back.mode, true);
    this.auto = false;
    this.dropHandPlan();
    this.message = `${reason}${record ? " · a new record" : ""}${whole(gold) ? ` · ${whole(gold)} Gold kept` : ""}. ${this.rules.words.begin}`;
  }
  /** The hero fell in a fight: the run waits at 0 HP, the hand paused, for
   * the player to undo the fight or accept defeat. */
  private fallIn(before: MoveSnapshot, enemy: Enemy) {
    this.run.player.hp = 0;
    this.fights.strikeDown();
    this.timeline.fall(before, enemyTitle(enemy));
    this.route = [];
    this.auto = false;
    this.dropHandPlan();
    this.message = `Fallen in combat against ${enemyTitle(enemy)}.`;
  }
  /** Inside a run the hero is still standing in: not in the forest, not
   * fallen. */
  get playing() {
    return !this.run.outside && !this.fallen;
  }
  /** The hero fell in the fight just taken: the run waits at 0 HP, the hand
   * paused, until the player undoes that fight or accepts defeat. */
  get fallen() {
    return !this.run.outside && this.run.player.hp <= 0;
  }
  /** A single orthogonal step while play is live. */
  private canStep(dx: number, dy: number) {
    return !this.busy && Math.abs(dx) + Math.abs(dy) === 1;
  }
  /** One step by (dx, dy); `regen` false for the tiles a Dash crosses after
   * its first step (past its first `dashRegenSteps`), so a dashed turn
   * regains HP once (and once more for each of those). The hand's turn says
   * how a card takes it (`card`). */
  move(dx: number, dy: number, force = true, track = true, regen = true, card: CardStep = {}) {
    if (!this.canStep(dx, dy)) return false;
    const p = this.run.player,
      dest = this.world.step(p.x, p.y, dx, dy);
    if (!dest) {
      this.reject(p.x, p.y, "That edge is closed.");
      return false;
    }
    const t = this.world.tile(dest.x, dest.y);
    // FAST ENEMY's First Strike: a Fast enemy may lose its first strike, by
    // the enemy tile's roll, so the hero strikes first (`met` fights it so).
    const firstStrike = t.kind === "enemy" && !!t.enemy!.fast && this.tileRolls(dest.x, dest.y, FIRST_STRIKE_SALT, foeStat(this.treeBonus, t.enemy!, "FirstStrike"));
    const met: Tile = firstStrike ? { ...t, enemy: (({ fast: _, ...caught }) => caught)(t.enemy!) } : t;
    // The step is resolved once, before any snapshot/undo bookkeeping, so a
    // wall, lock, impervious enemy, or (automation's) declined lethal fight
    // never touches history, damages the player, alters the enemy, or ends the run.
    const rules: StepRules = { ...this.stepRules, ...(regen ? {} : { regen: 0 }), ...(card.scale !== undefined && card.scale !== 1 ? { scale: card.scale } : {}) };
    const resolved = resolveStep(p, met, rules);
    if (resolved.blocked) return this.rejectStep(resolved, t, dest.x, dest.y);
    // DOOR's Secret Knock: a door the hero can open may open for nothing;
    // KEY's Locksmith: a key may be two.
    const lucky = this.luckyStep(t, dest.x, dest.y);
    const outcome = lucky ? resolveStep(p, met, { ...rules, ...lucky }) as StepEffect : resolved;
    if (!force && isLethal(outcome)) {
      this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
      return false;
    }
    const step: TakenStep = { tile: t, outcome, dest, track, quiet: this.emptyAt(dest.x, dest.y), card };
    this.facing = { dx, dy };
    // ENEMY's Surprise Attack, and the enemy cards' covering the enemy, added
    // into one chance: the fight a Dash stopped before, by the enemy tile's roll.
    const dashed = this.dashedTo;
    this.dashedTo = null;
    const surprise = t.kind === "enemy" && !!dashed && dashed.x === p.x && dashed.y === p.y
      && this.tileRolls(dest.x, dest.y, SURPRISE_SALT, snap(this.treeBonus.surpriseAttack + foeStat(this.treeBonus, t.enemy!, "SurpriseAttack")));
    if (surprise) step.surprise = true;
    if (firstStrike) step.firstStrike = true;
    return t.kind === "enemy" ? this.fights.fight(step, met.enemy!, surprise) : this.take(step);
  }
  /** Takes a resolved step: in through its door or fight, then onto the tile. */
  private take(step: TakenStep, revived = 0) {
    if (!this.enter(step, revived)) {
      this.turnBefore = null;
      return false;
    }
    const notes = notesOf(this.run);
    if (notes) notes.steps++;
    this.land(step.tile, step.dest.x, step.dest.y, step.outcome, step.card.floorSkip);
    this.startSpeedLesson();
    this.gemFinder.step();
    if (!step.card.hold) this.endTurn();
    return true;
  }
  /** Commits a resolved step: undo history, stats, and the door or fight on
   * the way in. Returns false when the player fell. */
  private enter({ tile: t, outcome, dest, track, quiet, crits, surprise, firstStrike }: TakenStep, revived: number) {
    const before = this.snapshot();
    this.turnBefore ??= before;
    if (track) this.remember(quiet ? { ...before, quiet: true } : before);
    // A door's Door Heal comes after its drain, which is shown as it was.
    const drained = snap(this.run.player.hp - outcome.player.hp + (t.kind === "door" ? outcome.healed : 0));
    this.applyStats(outcome.player);
    if (t.kind === "door") this.finds.door(t, outcome, drained, dest);
    if (t.kind !== "enemy") return true;
    const extra = outcome.extraDamage ?? 0, p = this.run.player, openers = fightOpeners(p, t.enemy!, !!surprise, !!firstStrike);
    // The fight used up ATK UP's Power Strike.
    delete p.powerStrike;
    // Effective's added damage rises off the hero; Dampen's given back heals.
    if (extra > 0 && p.hp > 0) this.gain(p.x, p.y, `−${wholeChange(extra)} HP`, { heart: true }, undefined, "hit");
    else if (extra < 0) this.recordHeal(-extra);
    return this.winFight({ enemy: t.enemy!, damage: snap(outcome.combat!.damage + extra), at: dest, revived, scale: outcome.scale, instakill: instakill(outcome.combat!), crits, openers }, before);
  }
  /** Moves the player onto the tile and applies what standing there does. */
  private land(t: Tile, x: number, y: number, outcome: StepEffect, floorSkip = false) {
    const p = this.run.player;
    p.x = x;
    p.y = y;
    this.handRules.unmark(x, y);
    // Walking into a torch destroys it immediately: light, collision and
    // sprite all disappear the same frame since rendering only ever draws
    // active torches from this same list.
    const torch = this.world.breakTorchAt?.(x, y);
    if (this.run.outside) {
      if (t.kind === "stairs") this.throughEntrance();
      else if (this.world instanceof OutsideWorld && this.world.isProvingGrounds(x, y)) {
        this.auto = false;
        this.cancelRoute();
        this.provingGroundsRequested = true;
      }
      else if (this.world instanceof OutsideWorld && this.world.atExit(x, y)) this.swapForest();
      return;
    }
    if (torch) this.finds.pickupGold(null, { x, y });
    if (t.kind === "reward") {
      this.run.changes[`${x},${y}`] = { kind: "openedChest", tier: t.tier };
      this.openAreaChest(t.tier);
      return;
    }
    this.finds.pickup(t, x, y, outcome);
    this.consumeTile(t, x, y);
    if (t.kind === "attack") this.chargePowerStrike(x, y);
    if (t.kind === "door") this.doorOpened(x, y, t, !!outcome.free);
    if (t.kind === "key") this.keyChest(x, y, t.color!);
    if (t.kind === "key") this.masterKey(x, y, t.color!);
    if (t.kind !== "stairs") this.callGreaterBoss();
    this.afterStep(t, x, y, floorSkip);
  }
  /** A Tower floor's secret: with every torch on it out, a Greater Boss
   * appears on the open floor nearest the stairs, once a floor a run. It is
   * checked on every step. */
  private callGreaterBoss() {
    const world = this.world;
    if (this.mode !== "tower" || !(world instanceof RoomWorld)) return;
    const run = this.towerRun;
    if (!callsGreaterBoss(world, run.summoned)) return;
    const gem = this.gemFinder.gem, at = greaterBossSpot(world, gem ? [run.player, gem] : [run.player]);
    if (!at) return;
    run.summoned = [...(run.summoned ?? []), world.room];
    this.spawnEnemy(at, greaterBoss(world));
    this.summoned = { ...at, at: performance.now() };
  }
  /** Puts `tile`'s enemy on the floor at `at` mid-run, numbered among the
   * run's spawns (`run.spawns`), so its kill pays its own loot and counts
   * toward missions even where an enemy already fell (`RunPurse.killKey`).
   * Every enemy made during a run, rather than with its floor, comes here. */
  private spawnEnemy(at: { x: number; y: number }, tile: Tile) {
    const spawn = this.run.spawns ?? 0;
    this.run.spawns = spawn + 1;
    this.run.changes[`${at.x},${at.y}`] = { ...tile, enemy: { ...tile.enemy!, spawn } };
  }
  /** Mode-specific progress once the player stands on the new tile,
   * stepped onto from `from`; `floorSkip` as `advanceTowerRoom` takes it. */
  private afterStep(t: Tile, x: number, y: number, floorSkip = false) {
    if (this.mode === "delve") this.afterDelveStep(t, x, y);
    else if (t.kind === "stairs") this.advanceTowerRoom(floorSkip);
    // Undo stays on the floor it was taken on: a step onto another (a
    // Tower's stairs, a Delve floor line or milestone gate either way)
    // forgets the history.
    this.timeline.standOn();
  }
  private rejectStep(outcome: StepBlocked, t: Tile, x: number, y: number): false {
    if (outcome.blocked === "wall") this.reject(x, y, "A wall blocks the way.");
    else if (outcome.blocked === "locked") this.reject(x, y, doorBlockedMessage(t));
    else {
      this.reject(x, y, `Impervious — requires ${outcome.combat.requiredAttack} more ATK`);
    }
    return false;
  }
  private remember(snapshot: MoveSnapshot) {
    this.timeline.remember(snapshot);
  }
  /** A turn of its own begins (a card acting in place): undo can take it
   * back. */
  rememberTurn() {
    this.remember(this.snapshot());
  }
  /** The step being taken pays out (a card activating), so it is a turn
   * undo stops at. */
  eventful() {
    this.timeline.eventful();
  }
  /** Copies resolved stats onto the live player, keeping its object identity. */
  private applyStats(next: Player) {
    const p = this.run.player;
    p.hp = next.hp;
    p.attack = next.attack;
    p.defense = next.defense;
    Object.assign(p.keys, next.keys);
  }
  /** Marks the Tower area as no longer mastered; the Delve has no areas. */
  private markDamaged() {
    if (this.mode === "tower") this.towerRun.damaged = true;
  }
  /** Settles a fight whose damage is already applied. Returns false when
   * the player fell. */
  private winFight(fight: FightEnd, before: MoveSnapshot) {
    const { enemy, at } = fight;
    if (fight.damage > 0) this.markDamaged();
    if (fight.damage > 0) this.events.hurt(this.mode, this.run.seed);
    if (this.run.player.hp <= 0) {
      this.fallIn(before, enemy);
      return false;
    }
    this.message = [fightText(fight), ...this.finds.kill(enemy, at, fight.scale ?? 1, !!fight.instakill, fight.crits)].join(" · ");
    return true;
  }
  /** The end of a turn inside a run (a step, or a whole dash): its shots
   * play out over it as the hero walks its step (volley.ts): the Archer,
   * its arrow ready, shoots the closest enemy in its range, and each Ranged
   * enemy whose cooldown is ready shoots the hero once it is within reach,
   * in the order they fire. Nothing before the third tier unless the hero
   * is an Archer; a turn that climbs to another floor leaves its shooters
   * behind. */
  private endTurn() {
    const before = this.turnBefore;
    this.turnBefore = null;
    const archer = this.isArcher;
    if (!before || this.run.outside || this.fallen) return;
    this.tickBoosts();
    const p = this.run.player, from = before.run.player, sameFloor = this.mode !== "tower" || before.run.height === this.run.height;
    const at = performance.now(), ms = Math.min(TURN_MS, 800 / Math.max(1, this.stepsPerSecond));
    // The board walks a single step at an even pace; anything else it snaps.
    this.turnShown = sameFloor && Math.abs(p.x - from.x) + Math.abs(p.y - from.y) === 1 ? { at, ms, from: { x: from.x, y: from.y }, to: { x: p.x, y: p.y } } : null;
    if ((this.tier < 3 && !archer) || !sameFloor) return;
    const v = this.run.volleys ?? { turn: 0 };
    const out = volleyTurn({ board: this.world, wrap: this.wrap, floorOf: (x, y) => this.floorOf(x, y), hero: p, from, seed: this.run.seed,
      volleys: { ...v, turn: v.turn + 1 }, archer, ranks: { ...this.trainingNow, archives: this.save.archives }, cardCrit: this.cardCrit, handShot: this.handShot });
    this.run.volleys = out.volleys;
    p.hp = out.hp;
    if (out.hurt) {
      this.markDamaged();
      this.events.hurt(this.mode, this.run.seed);
      const taken = out.shots.reduce((sum, s) => (s.by === "enemy" ? snap(sum + s.damage) : sum), 0);
      if (!out.fell) this.message = `Shot · −${wholeChange(taken)} HP`;
    }
    for (const { enemy, at, instakill, crits, thorns } of out.kills)
      this.message = [`${thorns ? "Thorns" : "Arrow"} · ${enemyTitle(enemy)} defeated`, ...this.finds.kill(enemy, at, 1, instakill, crits ? 1 : 0)].join(" · ");
    this.showVolley(out.shots, at, ms);
    if (out.fell) {
      this.fallIn(before, out.fell);
      this.message = `Shot down by ${enemyTitle(out.fell)}.`;
      return;
    }
    // Then the Aggroed enemies close in (enemies/flying.ts), their cooldowns with them.
    const moved = aggroTurn({ board: this.world, changes: this.run.changes, hero: p, floorOf: (x, y) => this.floorOf(x, y), lit: litTorches(this.world), foes: this.run.volleys.foes });
    if (moved.steps.length) {
      if (moved.foes && Object.keys(moved.foes).length) this.run.volleys.foes = moved.foes;
      else delete this.run.volleys.foes;
    }
  }
  /** A turn the hero holds its ground (FLYING ENEMY with a Flying enemy in
   * reach): no step, so no Regen, but a turn all the same, which the undo
   * history keeps quietly and the volley ends. */
  private holdTurn() {
    const before = this.snapshot();
    this.turnBefore = before;
    this.remember({ ...before, quiet: true });
    this.message = `${CARDS.flyingEnemy.name} · holding ground`;
    this.endTurn();
  }
  /** How far the Archer's arrows reach and the board's wrap, which FLYING
   * ENEMY plans by (`HandAt.shotReach`); undefined while the hero can't
   * shoot (not an Archer, or in the forest). */
  get shotReach() {
    return this.isArcher && !this.run.outside ? { range: arrowRange(trainedAmount(this.trainingNow, "attackRange"), this.handShot.range), wrap: this.wrap } : undefined;
  }
  /** What the hand gives the Archer's arrows (`VolleyTurn.handShot`): the
   * cards' Shot ATK, Attack Speed and boss bonus (`handBonus`), each with
   * the card trees' added, and the trees' Range and Charge Shot, the enemy
   * cards' Charge Shot by card. */
  private get handShot(): NonNullable<VolleyTurn["handShot"]> {
    const shot = this.handBonus.shot, tree = this.treeBonus, foeCharge = foeStats(tree, "ChargeShot");
    return { attack: snap(shot.attack + tree.shotAttack), speed: snap(shot.speed + tree.shotSpeed), boss: snap(shot.boss + tree.bossShotAttack),
      ...(tree.shotRange ? { range: tree.shotRange } : {}), ...(tree.chargeShot ? { charge: tree.chargeShot } : {}), ...(Object.keys(foeCharge).length ? { foeCharge } : {}) };
  }
  /** Board columns wrap in the Delve. */
  private get wrap() {
    return this.mode === "delve" ? this.world.width : 0;
  }
  /** The equivalent floor (from 1) an enemy at (x, y) stands on, as its rolls read it. */
  private floorOf(x: number, y: number) {
    const world = this.world;
    return world instanceof World ? Math.floor(world.depth(x, y) / 10) + 1 : this.run.height + 1;
  }
  /** The board flies the turn's shots, each leaving as far into the turn
   * shown from `at` for `ms` as it fired. */
  private showVolley(shots: Shot[], at: number, ms: number) {
    if (!shots.length) return;
    this.volley = { at, ms, shots };
  }
  /** A desk's command counted toward the missions (Training, badges), and
   * the Event's alike. */
  missionDone(type: MissionType, amount: number) {
    this.missions.record(type, amount);
    if (type === "train") this.events.record("training", amount);
    if (type === "badge") this.events.record("badges", amount);
  }
  /** A desk's command counted toward the Event's missions alone (Gems,
   * Equipment pulls and merges). */
  eventDone(type: EventMissionType, amount: number) {
    this.events.record(type, amount);
  }
  /** The Gold killing the enemy at (x, y) would bank now (`instakill`:
   * the hero's first strike ending it), or 0 once its tile is looted. */
  enemyGold(x: number, y: number, instakill = false) {
    const e = foeOn(this.world.tile(x, y));
    return e ? this.purse.killGoldPreview(e, x, y, instakill) : 0;
  }
  /** What the floor the hero stands on can roll (`enemies/odds.ts`): each
   * strength's chance, stats and Gold, and each trait's chance, for the
   * enemy stats box; null in the forest. */
  get enemyOdds() {
    const world = this.world, p = this.run.player;
    if (this.run.outside || !world.typicalEnemy) return null;
    const floor = this.floorOf(p.x, p.y) - 1, depth = floor * STEPS_PER_FLOOR[this.mode], purse = this.purse;
    const greaterBoss = this.mode === "tower" && !!this.towerRun.summoned?.includes(this.run.height);
    const source: OddsSource = { tier: this.tier, floor, enemy: (s) => world.typicalEnemy!(depth, s), gold: (e) => purse.killGoldOf(e), greaterBoss };
    return { floor, strengths: strengthOdds(source), traits: traitOdds(this.tier, floor) };
  }
  /** The Gold opening the treasure chest at (x, y) would bank now, on
   * average, or 0 once its tile is looted. */
  chestGold(x: number, y: number) {
    return this.world.tile(x, y).kind === "treasure" ? this.purse.treasureGoldPreview(x, y) : 0;
  }
  /** What the run finds is paid through its purse. It is built afresh on
   * each use, so it always pays into the save, mode and run of now: an erase,
   * a mode switch and a new run each replace one. */
  get purse() {
    // A tournament run's chances come from the seeds its league shares.
    const t = this.tournamentRun;
    return t
      ? new RunPurse(this.save, this.mode, this.run, runStream(t, "game"), this.clock(), runStream(t, "equipment"))
      : new RunPurse(this.save, this.mode, this.run, this.rng, this.clock());
  }
  /** The numbered tower (or delve) the run climbs. */
  get tier() {
    return this.run.tier ?? 1;
  }
  /** Chooses which opened tier the next run climbs, from the forest: the
   * mode's records become that tier's and a fresh run waits outside it. */
  selectTier(tier: number) {
    if (!this.canSelectTier(tier)) return false;
    // Each tower's forest keeps its seed, and so its weather, until a run begins.
    this.forestSeeds.set(this.forestKey(this.slice.tier), this.run.seed);
    switchTier(this.slice, tier);
    this.newRun({ outside: true, seed: this.forestSeeds.get(this.forestKey(tier)) });
    this.message = `${this.rules.words.tierName} ${tierNumeral(tier)} · ${tierRewardText(tier)}`;
    return true;
  }
  /** Whether the forest may switch to `tier`: opened, and not the one selected. */
  private canSelectTier(tier: number) {
    const slice = this.slice;
    return !!this.run.outside && tier !== slice.tier && tier >= 1 && tier <= slice.tiersOpen;
  }
  /** The forests' seeds, by mode and tier, kept while the player looks
   * between them: the weather comes from the seed, so each stays as it was
   * until a run begins or ends. */
  private forestSeeds = new Map<string, number>();
  private forestKey = (tier: number) => `${this.mode}:${tier}`;
  private enterFromOutside() {
    this.forestSeeds.clear();
    const p = this.run.player;
    this.run.outside = false;
    this.run.notes = newNotes(this.clock());
    this.save.tutorials.enter = true;
    this.save.tutorials.enemy = false;
    this.dealHand();
    p.x = this.rules.entranceX;
    p.y = 0;
    this.world = this.rules.board(this.run);
    this.forgetLabyrinth();
    this.provisionKeys(this.rules.equivalentFloor(this.run.height));
    this.route = [];
    // Inside, the hand takes over from the player (or Automove).
    if (this.handStartsPlaying) this.playHand();
    else this.auto = false;
    this.dropHandPlan();
    this.feedback(this.rules.words.enter);
    this.gemFinder.step();
  }
  /** Whether the door or key at (x, y) on this floor rolls under `chance`
   * percent (DOOR's Secret Knock and Door Chest, KEY's Locksmith and Master
   * Key): by its tile's fixed number, each roll its own `salt`, so undo
   * can't roll it again. */
  private tileRolls(x: number, y: number, salt: number, chance: number) {
    return !!chance && tileRandom(x, y, this.floorSeed ^ salt) * 100 < chance;
  }
  /** What the doors and keys of this floor roll by: the run's seed, and in the Tower the floor's. */
  private get floorSeed() {
    return this.run.seed ^ Math.imul((this.world instanceof RoomWorld ? this.world.room : 0) + 1, 0x9e3779b1);
  }
  /** ATK UP's Power Strike: the ATK shard just taken at (x, y) may charge
   * the hero's next fight, by its tile's fixed number. */
  private chargePowerStrike(x: number, y: number) {
    const p = this.run.player;
    if (p.powerStrike || !this.tileRolls(x, y, POWER_STRIKE_SALT, this.treeBonus.powerStrike)) return;
    p.powerStrike = true;
    this.message = `${this.message ? `${this.message} · ` : ""}Power Strike charged`;
  }
  /** A treasure chest's own rolls at (x, y), by its tile's fixed numbers:
   * CHEST's Double and Triple (both: six times over), and TORCH's Chest Cells. */
  chestRoll(x: number, y: number) {
    const tree = this.treeBonus;
    const multiplier = (this.tileRolls(x, y, CHEST_DOUBLE_SALT, tree.chestDouble) ? 2 : 1) * (this.tileRolls(x, y, CHEST_TRIPLE_SALT, tree.chestTriple) ? 3 : 1);
    return { multiplier, cells: this.tileRolls(x, y, CHEST_CELLS_SALT, tree.chestCells) };
  }
  /** What the door `t` just opened at (x, y) may leave: DOOR's Door Chest
   * an opened treasure chest where it stood, paid as a treasure chest is (a
   * Supply or Equipment Chest at the run's odds), the door cards' chances
   * added for their doors; WOODEN DOOR's Druidic Talent a gold key from a
   * Wooden Door; and, for a drain paid (not on a door opened for nothing,
   * `free`), HEART DOOR's Shroud Growth more shroud for the run. */
  private doorOpened(x: number, y: number, t: Tile, free: boolean) {
    const tree = this.treeBonus, p = this.run.player, rule = doorRule(t);
    this.leaveChest(x, y, DOOR_CHEST_SALT, DOOR_CHEST_KIND_SALT, doorStat(tree, t, "Chest"));
    if (rule.type === "wood" && this.tileRolls(x, y, DRUID_KEY_SALT, tree.druidKey)) {
      p.keys.yellow = snap(p.keys.yellow + 1);
      this.gain(x, y, "+1 gold key", { tile: { kind: "key", color: "yellow" } }, { row: 2, with: true });
      this.message = `${this.message ? `${this.message} · ` : ""}Druidic Talent`;
    }
    if (tree.heartShroud && !free && drainsHp(rule)) p.doorShroud = snap((p.doorShroud ?? 0) + tree.heartShroud);
  }
  /** KEY's Key Chest: the key just picked up at (x, y) may leave an opened
   * treasure chest where it lay, as Door Chest leaves one, by its `color`'s
   * own tree's chance too, added to it. */
  private keyChest(x: number, y: number, color: KeyColor) {
    const tree = this.treeBonus;
    this.leaveChest(x, y, KEY_CHEST_SALT, KEY_CHEST_KIND_SALT, snap(tree.keyChest + keyStat(tree, color, "KeyChest")));
  }
  /** An opened treasure chest left at (x, y) when its tile rolls under
   * `chance` by `salt`, its kind rolled by `kindSalt`, and paid. */
  private leaveChest(x: number, y: number, salt: number, kindSalt: number, chance: number) {
    if (!this.tileRolls(x, y, salt, chance)) return;
    this.run.changes[`${x},${y}`] = { kind: "openedChest" };
    this.finds.treasure(x, y, chestKindAt({ kind: "treasure" }, x, y, this.floorSeed ^ kindSalt, this.run.chestOdds));
  }
  /** The rules a step's lucky roll adds, or null: DOOR's Secret Knock (the
   * door cards' Gold Knock, Heart Knock and Wooden Lock Pick added, for
   * their doors) opens a door for nothing, and KEY's Locksmith makes a key two. */
  private luckyStep(t: Tile, x: number, y: number): Partial<StepRules> | null {
    const tree = this.treeBonus;
    if (t.kind === "door" && this.tileRolls(x, y, SECRET_KNOCK_SALT, doorStat(tree, t, "Knock"))) return { freeDoor: true };
    // The key's colour's own Locksmith adds to KEY's, one roll.
    if (t.kind === "key" && this.tileRolls(x, y, DOUBLE_KEY_SALT, snap(tree.doubleKey + keyStat(tree, t.color!, "DoubleKey")))) return { doubleKey: true };
    return null;
  }
  /** KEY's Master Key: the key just picked up at (x, y) may open every door
   * on its floor at once, for nothing, each paying as a door Secret Knock
   * opened does: its Gold, DOOR's Door Silver and Door Heal, and its Door
   * Chest and Druidic Talent rolls. */
  private masterKey(x: number, y: number, color: KeyColor) {
    const tree = this.treeBonus, every = this.tileRolls(x, y, MASTER_KEY_SALT, tree.masterKey);
    // The key's colour's own Master Key (Master Gold Key…), its own roll, opens the doors with a lock of its colour.
    const mine = !every && this.tileRolls(x, y, COLOR_MASTER_KEY_SALT[color], keyStat(tree, color, "MasterKey"));
    if (!every && !mine) return;
    const all = this.world.floorDoors?.(x, y) ?? [], rules: StepRules = { ...this.stepRules, regen: 0, freeDoor: true };
    const doors = every ? all : all.filter((d) => lockedBy(this.world.tile(d.x, d.y), color));
    for (const d of doors) {
      const t = this.world.tile(d.x, d.y), outcome = resolveStep(this.run.player, t, rules);
      if (outcome.blocked) continue;
      this.applyStats(outcome.player);
      this.finds.door(t, outcome, 0, d);
      this.world.clear(d.x, d.y);
      this.doorOpened(d.x, d.y, t, true);
    }
    if (doors.length) this.message = `${every ? "Master Key" : `Master ${KEY_WORDS[color]} Key`} · ${doors.length} door${doors.length === 1 ? "" : "s"} opened`;
  }
  /** Removes what the step used up: chests stay behind opened, fixtures stay. */
  private consumeTile(t: Tile, x: number, y: number) {
    if (t.kind === "treasure") this.run.changes[`${x},${y}`] = { kind: "openedChest" };
    else if (!PERMANENT_TILES.has(t.kind)) this.world.clear(x, y);
  }
  /** Clears Automove's memory when the labyrinth behind it is gone: a Delve
   * run entering it (a death sends the player to the forest first, so
   * undo keeps the memory), a sealed milestone gate, or a reshaped layout. */
  private forgetLabyrinth() {
    if (this.mode === "delve") this.save.delve.memory = { known: {}, visited: {} };
  }
  private afterDelveStep(t: Tile, x: number, y: number) {
    const world = this.world;
    if (!(world instanceof World)) return;
    // The world keeps the run's milestone and floor itself; the gate's
    // new floor puts the passage out of undo's reach (`afterStep`).
    if (t.kind === "oneway" && world.cross(x, y)) {
      this.forgetLabyrinth();
      this.route = [];
      this.feedback(`Depth ${world.milestone * 100} · the passage seals behind you.`);
    }
    const visited = this.save.delve.memory.visited;
    visited[`${x},${y}`] = (visited[`${x},${y}`] ?? 0) + 1;
    const run = this.delveRun;
    run.top = Math.max(run.top ?? y, y);
    const floorBefore = this.rules.equivalentFloor(run.maxHeight ?? 0);
    run.height = Math.max(run.height, world.depth(x, y));
    run.maxHeight = Math.max(run.maxHeight ?? 0, run.height);
    this.payDelveFloors(floorBefore, { x, y });
    world.maintain(y);
    this.recordProgress();
  }
  /** Each new equivalent floor past `floorBefore` is the Delve's floor
   * climbed (Spare Change, Wishing Well), keyed off the labyrinth's columns
   * (x = -1) so it pays once a run. */
  private payDelveFloors(floorBefore: number, at: { x: number; y: number }) {
    const purse = this.purse, last = this.rules.equivalentFloor(this.run.maxHeight ?? 0);
    this.missions.record("floors", last - floorBefore);
    let gold = 0, silver = 0;
    for (let f = floorBefore + 1; f <= last; f++) {
      gold += purse.floorGold(purse.floorKey(-1, f));
      silver += purse.floorSilver();
      const interest = purse.interest();
      silver += interest;
      this.events.climbed(this.mode, this.run.seed, interest > 0 && interest >= purse.interestCap);
      this.findYellowKey(f, at);
      this.findFloorKeys(f, at);
      this.provisionKeys(f);
      this.regainCharges(at);
      this.floorHeal();
    }
    this.freeTrain(last - floorBefore);
    this.passiveCardXp(last - floorBefore);
    this.finds.coins(at, gold, silver, false);
  }
  /** Free Training for `floors` floors passed, one after another: the
   * levels each floor's rolls give (`rollFreeTraining`) join the run's
   * training as Silver ranks would, costing nothing, and are announced
   * together (`freeTrained`). */
  private freeTrain(floors: number) {
    const given: TrainingId[] = [];
    for (let f = 0; f < floors; f++)
      for (const id of rollFreeTraining(this.save, this.run, this.boons?.freeUp ?? 0, freeUpFactors(this.treeBonus), freeUpChances(this.treeBonus))) {
        this.giveFreeLevel(id);
        given.push(id);
      }
    if (given.length) this.freeTrained = { lines: freeTrainingLines(given), at: performance.now() };
    this.events.record("freeUpgrades", given.length);
  }
  /** Free levels from a trade or a smelt (the traders' Free Utility, the
   * smelts' Free Defense, Offense and Upgrades), each of a group, its pick
   * choosing its row (`freeLevelRow`): they join the run's training as a
   * floor's do, announced the same way. A trade or smelt can be undone, so
   * they count toward no Event. */
  trainFree(levels: readonly (readonly [FreeGroup, number])[]) {
    const given: TrainingId[] = [];
    for (const [group, pick] of levels) {
      const id = freeLevelRow(this.save, this.run, group, pick);
      if (!id) continue;
      this.giveFreeLevel(id);
      given.push(id);
    }
    if (given.length) this.freeTrained = { lines: freeTrainingLines(given), at: performance.now() };
  }
  /** Training row `id` gains a free level for the run, as a Silver rank would, costing nothing. */
  private giveFreeLevel(id: TrainingId) {
    const offer = runTrainingOffer(this.save, this.run, id);
    this.run.training = { ...this.run.training, [id]: offer.bought + 1 };
    this.applyRunTraining(offer);
  }
  /** Find Gold Key: on floor `floor` climbed for the first time in the
   * run, a gold key under the research's chance. The roll is a fixed
   * number per run seed and floor, so undo and a replay find the same
   * keys, and more research only ever adds some. */
  private findYellowKey(floor: number, at: { x: number; y: number }) {
    const chance = researched(this.save.archives, "yellowKeyChance");
    if (!chance || tileRandom(-1, floor, (this.run.seed ^ YELLOW_KEY_SALT) | 0) * 1000 >= chance) return;
    const keys = this.run.player.keys;
    keys.yellow = snap(keys.yellow + 1);
    noteKey(this.run, "yellow", 1);
    this.gain(at.x, at.y, "+1 gold key", { tile: { kind: "key", color: "yellow" } });
  }
  /** The traders' and smelts' Floor Key (Extra Gold, Blue and Red Key): on
   * floor `floor` climbed for the first time in the run, a key of each
   * colour under its chance, a fixed number per run seed, floor and colour,
   * as Find Gold Key's. */
  private findFloorKeys(floor: number, at: { x: number; y: number }) {
    for (const color of KEY_COLORS) {
      const chance = keyStat(this.treeBonus, color, "FloorKey");
      if (!chance || tileRandom(-1, floor, (this.run.seed ^ FLOOR_KEY_SALT[color]) | 0) * 100 >= chance) continue;
      const keys = this.run.player.keys;
      keys[color] = snap(keys[color] + 1);
      noteKey(this.run, color, 1);
      this.gain(at.x, at.y, `+1 ${keyWord(color)}`, { tile: { kind: "key", color } });
    }
  }
  /** The hero takes the stairs; `floorSkip` (Skip on STAIRS) climbs past
   * the next floor too. */
  advanceTowerRoom(floorSkip = false) {
    const purse = this.purse, p = this.run.player;
    // Keyed by the stairs taken, so it pays once a run.
    const gold = purse.floorGold(purse.floorKey(p.x, p.y));
    const highest = this.run.maxHeight ?? this.run.height;
    // Skip on STAIRS climbs past the next floor, which pays nothing; an area
    // climbed past is still judged as its section ends.
    // The floor stood on is the board already built; generating a floor is slow.
    const left = this.world instanceof RoomWorld ? this.world : undefined;
    const skipped = floorSkip ? this.climb.up(left) : null;
    // Floor Skip Reward pays a share of the Gold the floor passed held.
    const skipGold = skipped ? purse.skippedFloorGold(skipped.board) : 0;
    const passed = skipped?.sectionStart ? new AreaLedger(this.save).enter(this.towerRun, skipped.board) : [];
    const { board, sectionStart } = this.climb.up(skipped?.board ?? left);
    // Only a floor new to the run pays Silver: the run's own highest floor
    // gates it.
    let silver = 0;
    if (this.run.height > highest) {
      // Each floor new to the run counts toward a charge's regain, a floor
      // climbed past by Skip too.
      for (let f = highest; f < this.run.height; f++) this.regainCharges(p);
      this.missions.record("floors", this.run.height - highest);
      this.run.maxHeight = this.run.height;
      silver = purse.floorSilver();
      const interest = purse.interest();
      silver += interest;
      // A floor Skip climbs past counts toward the streaks too, on the climb's Interest.
      for (let f = highest; f < this.run.height; f++) this.events.climbed(this.mode, this.run.seed, interest > 0 && interest >= purse.interestCap);
      this.events.best("floor", this.run.height + 1);
      this.findYellowKey(this.run.height, p);
      this.findFloorKeys(this.run.height, p);
      this.provisionKeys(this.run.height);
      this.floorHeal();
      this.freeTrain(this.run.height - highest);
      this.passiveCardXp(this.run.height - highest);
    }
    this.enterTowerFloor(board);
    // A new floor may earn a boon, which Auto Pick takes at once.
    this.shrine.autoPick();
    // The hero keeps every stat into a new section.
    const earned = sectionStart ? new AreaLedger(this.save).enter(this.towerRun, board) : [];
    if (skipped) this.feedback(passed.length ? `Floor Skipped · floors ${this.run.height - TOWER_SECTION}–${this.run.height - 1} ${passed.join(" and ")}` : "Floor Skipped", 1000);
    else if (earned.length) this.feedback(`Floors ${this.run.height - TOWER_SECTION + 1}–${this.run.height} ${earned.join(" and ")} · Reward Granted`);
    // After the first Tower run a plain new floor only says so on the status line.
    else if (this.save.tutorials.chamber) this.message = "A new chamber opens.";
    else this.feedback("A new chamber opens.");
    this.finds.coins(p, snap(gold + skipGold), silver, false);
  }
  /** Stands on the floor the climb just reached. */
  private enterTowerFloor(board: RoomWorld) {
    this.recordProgress();
    this.world = board;
  }
  private get climb() {
    return new TowerClimb(this.towerRun);
  }
  recordProgress() {
    if (this.run.outside) return 0;
    const slice = this.slice;
    const reached = Math.max(slice.reached, this.run.height);
    const earned = milestones(this.rules, slice.reached, reached);
    if (reached > slice.reached) slice.runRecord = true;
    slice.reached = reached;
    slice.best = Math.max(slice.best, reached);
    if (earned) this.rules.pays!.credit(this.save, earned);
    slice.runCurrency += earned;
    return earned;
  }
  /** Whether (x, y) is the forest Blacksmith's building, which opens the
   * Equipment screen when tapped. */
  atBlacksmith(x: number, y: number) {
    return this.run.outside && this.world instanceof OutsideWorld && this.world.isBlacksmith(x, y);
  }
  /** Whether (x, y) is the forest's Tournament Hall, which opens the
   * Tournament page when tapped. */
  atTournamentHall(x: number, y: number) {
    return this.run.outside && this.world instanceof OutsideWorld && this.world.isTournamentHall(x, y);
  }
  /** The heals on a floor reached for the first time in the run, each a
   * share of max HP and shown like a potion's: equipment's (`floorHeal`, up
   * to max HP), then STAIRS' tree's (up to the Overheal ceiling). */
  private floorHeal() {
    const p = this.run.player;
    const heal = (pct: number, ceiling: number) => {
      if (!pct || p.hp <= 0) return;
      const n = snap(healUpTo(p.hp, (p.maxHp * pct) / 100, ceiling) - p.hp);
      if (!n) return;
      p.hp = snap(p.hp + n);
      this.recordHeal(n);
    };
    heal(this.worn.floorHeal, p.maxHp);
    heal(this.treeBonus.floorHeal, this.hpCeiling);
  }
  /** How the current mode differs from the other. */
  private get rules(): ModeProfile {
    return MODES[this.mode];
  }
  /** The current mode's save slice: its run, undo history and records. */
  private get slice(): ModeSave {
    return this.save[this.mode];
  }
  /** The live run as a Tower ascent; only Tower code asks for it. */
  get towerRun(): TowerRun {
    if (this.mode !== "tower") throw new Error("Not a Tower run");
    return this.run as TowerRun;
  }
  /** The live run as a Delve descent; only Delve code asks for it. */
  get delveRun(): DelveRun {
    if (this.mode !== "delve") throw new Error("Not a Delve run");
    return this.run as DelveRun;
  }
  /** The live run's tournament, when it is a tournament run (only a Delve
   * run can be). */
  get tournamentRun(): TournamentRun | undefined {
    return this.mode === "delve" ? this.delveRun.tournament : undefined;
  }
  /** The league whose cave the Delve plays: the tournament run's, or, in
   * the Delve's forest, the player's, whose cave the run it enters will
   * play (`beginTournament`), whichever cave is selected. */
  get delveLeague(): League {
    return this.tournamentRun?.league ?? this.save.tournament.league;
  }
  /** An area reward chest opened: its reward was paid when earned, so it
   * only shows it, with the board's golden burst. The chest stands on the
   * floor after the area's last, whose height is that last floor. */
  private openAreaChest(tier: ChestTier | undefined) {
    const reward = chestReward(tier), now = performance.now();
    const inspiration = reward === "cleared" ? clearedInspiration(this.run.height) : 0;
    const playing = this.areaBursts.filter((b) => now - b.at < AREA_BURST_MS), last = playing.at(-1);
    this.areaBursts = [...playing, { reward, inspiration, at: last ? Math.max(now, last.at + AREA_BURST_MS) : now }];
    this.message = reward === "mastered" ? "Area mastered · checkpoint warp claimed" : `Enemies cleared · +${inspiration} Inspiration`;
  }
  /** Ends the run (the End Run button), or, fallen, accepts defeat. */
  finish(reason: string) {
    this.fights.finish();
    if (this.fallen) this.acceptDefeat();
    else this.finalizeRun(reason);
  }
  /** Inside a run, the hand it went in with; in the forest, the hand the
   * next run will take, as the Deck orders it. */
  get hand(): readonly CardId[] {
    return this.run.hand ?? this.save.hand;
  }
  /** The Manual hand (Manual Hand): inside a run, the one it went in with;
   * in the forest, the next run's. Its cards act only when pressed. */
  get manualHand(): readonly CardId[] {
    return this.run.hand ? this.run.manual ?? [] : this.save.upgrades.manualHand ? this.save.manualHand : [];
  }
  /** Every card held: the hand's, then the Manual hand's. A card's slot in
   * it is the one a press and the hand's plan name, the hand's slots first,
   * so a Manual card's comes after them. */
  get held(): readonly CardId[] {
    const manual = this.manualHand;
    return manual.length ? [...this.hand, ...manual] : this.hand;
  }
  /** Whether the hero is an Archer: a hand (in the forest, the next run's)
   * holds the ARCHER card (`shootsWith`). Its arrows fly only inside a
   * run. */
  get isArcher() {
    return shootsWith(this.held);
  }
  /** What the cards held in the run give (`handBonus`), the Manual hand's
   * too: none in the forest. */
  get handBonus(): HandBonus {
    return handBonus(this.run.outside ? [] : this.held);
  }
  /** Whether a run's Training can be bought with Silver inside it: On the
   * Job owned, or every page shown in Dev mode. */
  get trainsOnTheJob() {
    return !!this.save.upgrades.onTheJob || this.save.settings.devMode;
  }
  /** Buys ranks of Training `id` for this run with its Silver, one or as
   * many as Buy Quantity `quantity` takes (`runTrainingBulk`): they count
   * from the next turn on, until the run ends. Each purchase is a turn of
   * its own, so undo takes it back. Bought while a fight plays out, they
   * count in that fight from its next strike (`fights.retrain`). Refused
   * before On the Job is owned, during a fight shown in summary rounds, for
   * a row whose upgrade isn't owned or at its highest, or without the
   * Silver for them all. */
  trainInRun(id: TrainingId, quantity: BuyQuantity = 1) {
    if (!this.mayTrainInRun) return false;
    const first = runTrainingOffer(this.save, this.run, id);
    if (!first.open || first.maxed) return false;
    const bulk = runTrainingBulk(this.save, this.run, id, quantity, this.free ? Infinity : this.silver);
    if (!bulk.affordable) return false;
    this.remember(this.snapshot());
    if (!this.free) {
      this.run.silver = snap(this.silver - bulk.cost);
      this.silverSpent = snap(this.silverSpent + bulk.cost);
    }
    let hpGain = 0;
    for (let i = 0; i < bulk.count; i++) {
      const offer = runTrainingOffer(this.save, this.run, id);
      this.run.training = { ...this.run.training, [id]: offer.bought + 1 };
      hpGain = snap(hpGain + this.applyRunTraining(offer));
    }
    // A fight playing out goes on with the stats (or Revive) bought.
    if (isStatRow(first.row) || id === "revive") this.fights.retrain(hpGain);
    this.message = `${first.row.name} trained for this ${MODES[this.mode].words.run} · level ${first.level + bulk.count}`;
    // Undo takes the ranks back, so only the run's most bought counts.
    const bought = Object.values(this.run.training ?? {}).reduce((n, k) => n + (k ?? 0), 0);
    this.missions.mark("runTraining", this.mode, this.run.seed, bought);
    this.afterPlayerAction();
    return true;
  }
  /** What a rank bought for the run changes now: a stat, or the chance of
   * percent potions. Returns the max HP it added. */
  private applyRunTraining({ row, level }: RunTrainingOffer) {
    if (isStatRow(row)) return this.raiseRunStat(row, level);
    if (row.id === "findPotion") this.raisePercentPotions();
    return 0;
  }
  /** Whether Training can be bought for the run now: On the Job owned,
   * inside a run, and no fight shown in summary rounds. */
  private get mayTrainInRun() {
    return this.trainsOnTheJob && this.playing && !this.fights.encounter?.summary;
  }
  /** A stat row's rank bought for the run: the hero and the run's loadout
   * gain what the rank from `level` adds (`rankShift`). Returns the max HP
   * it added. */
  private raiseRunStat(row: StatTrainingRow, level: number) {
    return shiftHero(this.run, { [row.stat]: rankShift(this.save, this.mode, row, level, level + 1) }, this.overheal).maxHp ?? 0;
  }
  /** Find Potion bought for the run: its chance of percent potions rises,
   * and the floor stood on shows its new percent potions at once. */
  private raisePercentPotions() {
    const chance = trainedAmount(this.trainingNow, "findPotion");
    this.run.percentPotions = chance;
    if (this.world instanceof RoomWorld) this.world.percentPotions = chance;
  }
  /** The wall clock the Archives' research runs on (ms); tests set it. */
  clock: () => number = () => Date.now();
  /** Records a potion's heal of `n` HP, already applied, where the hero stands. */
  recordHeal(n: number) {
    if (n <= 0) return;
    const p = this.run.player;
    this.lastHeal = { from: p.hp - n, to: p.hp, x: p.x, y: p.y, id: (this.lastHeal?.id ?? 0) + 1 };
  }
}

/** A fight the hero won: the enemy beaten at `at`, the HP it cost, and
 * how many times the hero revived in it. */
/** A fight won: `instakill` when the hero's first strike ended it (Mug). */
type FightEnd = { enemy: Enemy; damage: number; at: { x: number; y: number }; revived: number; scale?: number; instakill?: boolean; crits?: number; openers?: string[] };

/** How Skip's message names what vanished, by tile kind. */
const SKIPPED_NAMES: Partial<Record<Tile["kind"], string>> = { door: "The door", key: "The key", potion: "The potion", attack: "The ATK shard", defense: "The DEF shard", treasure: "The chest", reward: "The chest" };

/** Whether the door `t` has a lock of `color` among its locks. */
function lockedBy(t: Tile, color: KeyColor) {
  const rule = doorRule(t);
  return rule.type === "keys" && rule.keys.includes(color);
}

/** How the status line opens on a fight won. */
function fightText(fight: FightEnd): string {
  return [...(fight.openers ?? []), wonText(fight)].join(" · ");
}
/** What opened a fight of `player` against `enemy`, as the status line
 * names it: ENEMY's Surprise Attack (`surprise`), FAST ENEMY's First
 * Strike (`firstStrike`), ATK UP's Power Strike,
 * and a boss's Takedown and Tangle (Greater, against a Greater Boss). */
function fightOpeners(player: Player, enemy: Enemy, surprise: boolean, firstStrike: boolean) {
  const cut = squaredUp(player, enemy).opening, greater = enemy.strength === "greaterBoss" ? "Greater " : "";
  return [
    ...(surprise ? ["Surprise Attack"] : []),
    ...(firstStrike ? ["First Strike"] : []),
    ...(player.powerStrike ? ["Power Strike"] : []),
    ...(cut?.takedown ? [`${greater}Takedown`] : []),
    ...(cut?.tangle ? [`${greater}Tangle`] : []),
  ];
}
function wonText({ enemy, damage, revived }: FightEnd) {
  if (revived) return `Revived · ${enemyTitle(enemy)} defeated`;
  return damage ? `−${wholeChange(damage)} HP · ${enemyTitle(enemy)} defeated` : "Unscathed victory";
}

