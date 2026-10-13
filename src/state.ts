import { entrance, floorFor } from "./delve/labyrinth.ts";
import { canWear, claimThemes, type GameLook, type ThemeId, type ThemeKind, type UiLook } from "./theme-collection.ts";
import { chooseStep } from "./automation.ts";
import { CARDS, KEY_TO_HP_PERCENT, SIPHONS, TRADER_YELLOW_KEYS, cardText, explainStuck, isSiphon, keptLinks, linkedToNext, planHand, planTarget, stillOpen, walkAll, type CardId, type CardPlan, type CardRules, type SiphonCard, type StuckReport } from "./cards.ts";
import { BADGE_IDS, BADGES, MAX_COPIES, badgeOn, badgesOn, badgeValue, runBadges, type BadgeId, type RunBadge } from "./badges.ts";
import { adsOff, BOOST_FOREVER, permanentBoost } from "./shop/entitlements.ts";
import { noteGoldBoost } from "./gold-boost.ts";
import { offer, type OfferId } from "./shop/offers.ts";
import { purchase, type Refusal } from "./shop/transactions.ts";
import { confirmServerTime } from "./shop/clock.ts";
import { canWarp, claimGoal, goalUnlocked, isArcher } from "./goals.ts";
import { ARROW_COST, arrowBoost, arrowDamage, charged, enemiesWithin, FOE_GAIN, foeRange, foeShotCost, held, ready, shotDamage, spent, type InReach, type Volleys } from "./ranged.ts";
import { missGem } from "./gems.ts";
import { DelvePlan } from "./delve/automove.ts";
import { defaults } from "./save.ts";
import { stampProfile } from "./profile.ts";
import { defaultFinds, newNotes, notesOf, tallyIn } from "./run-notes.ts";
import { drawAt, stream, tileRandom } from "./random.ts";
import { freeTrainingLines, rollFreeTraining } from "./free-training.ts";
import { doorBlockedMessage, doorName, doorRule, drainsHp, KEY_ORDER, pickupGold } from "./doors.ts";
import type { SettingKey } from "./settings.ts";
import { TREES, skillAvailable } from "./skill-trees.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import {
  TOWER_START_X,
  TOWER_SECTION,
  xpForKill,
  xpBase,
  levelForXp,
  TRAINING_PER_LEVEL,
  isStatRow,
  trained,
  cost,
  UPGRADES,
  TRAINING,
  type UpgradeId,
  type TrainingId,
  type KeyColor,
  type StatTrainingRow,
} from "./config.ts";
import {
  type Save,
  type Run,
  type RunCore,
  type TowerRun,
  type DelveRun,
  type ModeSave,
  type Tile,
  type Enemy,
  type Mode,
  type MoveSnapshot,
  type Player,
  type ChestTier,
  type NoticeTree,
} from "./entities.ts";
import { World, LAYOUT_VERSION } from "./delve/world.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import type { Board } from "./board.ts";
import { bout, DEFEAT_MS, guaranteedCrits, heroHpAfter, heroHpDuring, instakill, resume, REVIVE_PAUSE_MS, revivals, summarize, type Bout, type CritRule, type Crits, type Revival } from "./combat.ts";
import { HEART_DOOR_HP, healAfterVictory, isLethal, regenerate, resolveStep, type StepBlocked, type StepEffect, type StepRules, shardStat } from "./step-effects.ts";
import { OUTSIDE_START_Y, OutsideWorld } from "./outside.ts";
import { AREA_BURST_MS, AreaLedger, chestReward, clearedInspiration, type AreaReward } from "./tower/area-ledger.ts";
import { TowerClimb } from "./tower/climb.ts";
import { callsGreaterBoss, greaterBoss, greaterBossSpot } from "./tower/greater-boss.ts";
import { materialDef, MATERIALS } from "./materials.ts";
import { switchTier, tierGold, tierNumeral, tierRewardText, tierXp } from "./tiers.ts";
import { enemyTitle } from "./scaling.ts";
import { snap } from "./exact.ts";
import { enemyStat, keyCount, whole, wholeChange } from "./whole.ts";
import { MODES, milestones, type ModeProfile } from "./modes.ts";
import { boughtInRun, ranksInRun, runTrainingBulk, runTrainingOffer, type RunTrainingOffer } from "./run-training.ts";
import { openQuantities, type BuyQuantity } from "./buy-quantity.ts";
import { attackPerTile, attackRange, attackSpeed, multishotChance, multishotTargets, critRule, keepUndos, loadout, percentPotionChance, potionPercent, reviveChance, statFactor, type TrainingView } from "./loadout.ts";
import { researched } from "./archives.ts";
import { chargesLeft, chargesPerRun, climbFloor, spendCharge, type Charge } from "./run-charges.ts";
import type { MaterialId, MaterialStack } from "./materials.ts";
import { TrainingDesk } from "./game/training-desk.ts";
import { ResearchDesk } from "./game/research-desk.ts";
import { DeckEditor } from "./game/deck-editor.ts";
import { GearDesk } from "./game/gear-desk.ts";
import { GemFinder } from "./game/gem-finder.ts";
import { BadgeDesk } from "./game/badge-desk.ts";
import { RunPurse, type EquipmentLoot } from "./game/run-purse.ts";
import { EquipmentDesk } from "./game/equipment-desk.ts";
import { TournamentDesk } from "./game/tournament-desk.ts";
import { MailDesk } from "./game/mail-desk.ts";
import { MissionDesk } from "./game/mission-desk.ts";
import { EventDesk } from "./game/event-desk.ts";
import { ShrineDesk } from "./game/shrine-desk.ts";
import { boonFactor, runBoons } from "./shrines.ts";
import type { MissionType } from "./missions/catalog.ts";
import type { EventMissionType } from "./events/catalog.ts";
import { LEAGUE_INFO } from "./tournament/leagues.ts";
import { runStream, tournamentScore, type TournamentRun } from "./tournament/run.ts";
import type { TournamentInfo } from "./tournament/server.ts";
import { raised, wornEffects } from "./equipment/effects.ts";
import { RARITY_TIERS, type EquipRarity } from "./equipment/balance.ts";
import { EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, itemDef, type EquipMaterialId } from "./equipment/catalog.ts";
import { readyForestRuns, startingHero } from "./game/hero-sync.ts";
/** How a new run starts: out in the forest or at the entrance, and from
 * which seed (rolled from the game's randomness when left out). */
export type RunStart = { outside?: boolean; seed?: number; height?: number };
/** A lesson shown on the Tower's board (`Game.boardLesson`). */
export type BoardLesson = "climb" | "enter" | "delve";
export type RouteEffects = {
  hp: [number, number];
  attack: [number, number];
  defense: [number, number];
  keys: Partial<Record<KeyColor, [number, number]>>;
};
/** A reward just picked up, or what a door took, to rise from the tile it
 * came from: drawn as its sprite (a tile's contents, marked `spent` for a
 * key a door used, a material, or the heart a Heart Door checked, or with
 * a plus, `raised`, the max HP Max HP's badge added), or as `text` where it
 * has none. A kill's drops carry their `drop` place, so they rise together. */
export type Gain = { x: number; y: number; text: string; art: GainArt | null; drop?: Drop };
/** Where one of a kill's or a chest's drops rises: `row` rows above its tile (below,
 * negative), Gold over Silver over the rest, and whether it starts `with`
 * the drop queued before it rather than after. */
export type Drop = { row: number; with: boolean };
export type GainArt = { tile: Tile; spent?: true } | { material: MaterialId; quantity: number } | { heart: true; raised?: true } | { gem: true } | { coin: Coin } | { cell: true }
  | { equipMaterial: EquipMaterialId; quantity: number } | { equipPiece: string; rarity: EquipRarity };
/** The coin a Gold or Silver gain raises. */
export type Coin = "gold" | "silver";
/** The gains a Settings row can turn off: items picked up, what a door
 * takes, and Gold and Silver found. */
export type GainKind = "item" | "door" | Coin;
const GAIN_SETTINGS = { item: "itemGains", door: "doorGains", gold: "goldGains", silver: "silverGains" } as const satisfies Record<GainKind, SettingKey>;
/** The coin `art` raises, if it is one. */
const coinOf = (art: GainArt | null): Coin | null => (art && "coin" in art ? art.coin : null);
/** A potion's heal: the HP from and to, where the hero stood, and its number. */
export type Heal = { from: number; to: number; x: number; y: number; id: number };
/** A rush: the tiles the hero rushed off in one step, in order, and when
 * (performance time). */
export type Rush = { tiles: { x: number; y: number }[]; at: number };
/** Rewards kept for the board to show; older ones are dropped unseen. */
const MAX_GAINS = 12;
/** The forest's Automove walks at least this many steps a second, however
 * slow the run's arrows were last set. */
const FOREST_SPEED = 3;
/** The speed the second floor's lesson teaches: one press of › from a new
 * hero's 2. */
const LESSON_SPEED = 3;
/** Salts the run seed for Revive's rolls, apart from the world's own. */
const REVIVE_SALT = 0x7e51e;
/** Seeds the critical rolls apart from the revival rolls. */
const CRIT_SALT = 0x3c71c;
/** Salts the run seed for the Archer's critical rolls apart from a fight's. */
const ARROW_SALT = 0xa770e;
const MULTISHOT_SALT = 0x3a17c;
/** How long a shot or arrow flies, at most (ms): it lands as the hero's
 * step ends, sooner at higher speeds. */
const FLIGHT_MS = 220;
/** Salts the run seed for Find Yellow Key's roll on each new floor. */
const YELLOW_KEY_SALT = 0x6e11a;
/** Mixed into the run seed to start Skip's stream of rolls. */
const SKIP_SALT = 0x5c1b7;
/** A step resolved and about to be taken: the tile stepped onto, what it
 * does, where it is, whether it goes in the undo history, and for a fight
 * the hero's critical strikes in it as played (`crits`). */
type TakenStep = { tile: Tile; outcome: StepEffect; dest: { x: number; y: number }; track: boolean; quiet?: boolean; crits?: number };
/** The latest fight as the board shows it: the hero struck from `from`,
 * the enemy (`hp` at the start) stood at `to`, and its strikes land from
 * `start` (performance time). Played out, they are the fight's own; settled
 * at once (`summary`), they are its summary rounds (`summarize`). */
export type ShownFight = { from: { x: number; y: number }; to: { x: number; y: number }; bout: Bout; start: number; hp: number; summary: boolean };
/** A fight being shown before it counts: the hero waits at `from`, the
 * enemy stands at `to`, and nothing changes until `finishEncounter` settles
 * it (at `start + bout.duration`). */
export type Encounter = ShownFight & { enemy: Enemy; outcome: StepEffect; settle: () => void };
/** One shot of a turn's volley (ranged.ts), as the board shows it: a
 * Ranged enemy's at the hero, or the Archer's arrow at an enemy, flying
 * `from` → `to`, and what it did when it landed: the damage that got through
 * (and the shroud's share, a critical arrow's applications, the HP an
 * arrow's Lifesteal restored), and for an arrow the enemy's HP before and
 * after it out of its full HP. */
export type Shot = { by: "hero" | "enemy"; from: { x: number; y: number }; to: { x: number; y: number }; damage: number; shrouded?: number; crit?: number; charged?: boolean; healed?: number; before?: number; hp?: number; full?: number };
/** A turn's shots, flying from `at` (performance time) for `flight` ms. */
export type Volley = { at: number; flight: number; shots: Shot[] };
/** Tiles that stay on the board after being stepped on. */
const PERMANENT_TILES = new Set<Tile["kind"]>(["floor", "stairs", "oneway", "openedChest"]);
/** The targets a Rush may end on, a tile of it left: items to take. */
const RUSH_ONTO = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "treasure", "reward"]);
export class Game {
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
  /** The hand's card that made the latest step, to show it glowing. */
  activeCard: number | null = null;
  /** No card in the hand can act: the hand pauses, and the run ends only
   * when the player ends it. Each thing the player does (an item used, a
   * skill) checks the hand again, and it plays on once a card can act. */
  handStuck = false;
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
  /** Whether something settles fights played out (the app's frame loop).
   * A game without one (tests, tools) settles every fight at once, whatever
   * the Animate fights setting says. */
  playsFights = false;
  /** The fight being played out, if any; steps wait until it settles. */
  encounter: Encounter | null = null;
  /** The latest fight, for the board's damage numbers and the enemy's HP
   * bar; cleared by undo and when the run or mode changes. Only a game that
   * plays fights (`playsFights`) shows them. */
  fight: ShownFight | null = null;
  /** The latest turn's shots (ranged.ts), for the board to fly and land;
   * undo, a new run or a mode switch clears it. */
  volley: Volley | null = null;
  /** The snapshot from before the turn being taken, for a shot that fells
   * the hero, and whether a Rush holds the turn open across its tiles. */
  private turnBefore: MoveSnapshot | null = null;
  private holdTurn = false;
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
  /** When each of the latest fight's revivals begins (performance.now()),
   * for the board's golden fire, once its skull is over; emptied by undo. */
  revivedAt: number[] = [];
  /** When the hero was last struck down (performance.now()): each strike
   * of the latest fight that revived it, and the fall that ended a run,
   * for the board's skull; emptied by undo. The defeat dialog waits for
   * it (`defeatShownUntil`). */
  struckDown: number[] = [];
  /** The area rewards whose chests were opened, each with when its golden
   * burst starts (performance.now()): a chest opened while another's burst
   * plays waits for it to end. Emptied by undo. */
  areaBursts: { reward: AreaReward; inspiration: number; at: number }[] = [];
  /** When Equipment opened (performance.now()), for the
   * board's burst. */
  /** Where a Greater Boss last appeared, and when (performance.now()), for
   * the board's poof; cleared by undo. */
  summoned: { x: number; y: number; at: number } | null = null;
  /** Where Skip last made a card's target vanish, and when
   * (performance.now()), for the board's poof; cleared by undo. */
  vanished: { x: number; y: number; at: number } | null = null;
  /** Effective or Dampen on the step being taken: what the card's target's
   * effect is multiplied by; 1 on every other step. */
  private stepScale = 1;
  /** Skip on STAIRS succeeded: the climb goes up two floors. */
  private floorSkip = false;
  /** The latest rush: the tiles the hero rushed off, in order, and when
   * (performance.now()), for the board's fading echoes of the hero. */
  rush: Rush | null = null;
  /** Delve Automove's committed route and last weighed decisions. */
  readonly delvePlan = new DelvePlan();
  /** The Training tab's commands. */
  readonly training = new TrainingDesk(this);
  /** The Archives' commands. */
  readonly research = new ResearchDesk(this);
  /** The Deck page's commands over the next run's hand. */
  readonly deck = new DeckEditor(this);
  /** The Gear page's commands: provisions, crafting and equipment. */
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
  /** The Deck page's card badges: drawing them with Gems and attaching
   * them to cards. */
  readonly badges = new BadgeDesk(this);
  /** The Shrines' commands: a Tower run's boons and the Shrine Boons page's
   * choices. */
  readonly shrine = new ShrineDesk(this);
  /** `rng` is the game's randomness: new run seeds, enemy drops and
   * treasure loot all draw from it (the `game` stream unless given), so a
   * seeded stream replays a game and no visual effect can shift it. */
  constructor(public save: Save, private rng: () => number = stream("game")) {
    // A Delve run left inside (the page reloaded mid-run) opens where it
    // was: no tab leads to the Delve, only the forest's sign.
    const inside = (run: Run | null) => !!run && !run.outside;
    // A tournament run plays in the Delve whether or not it is open.
    if ((save.upgrades.delve || save.delve.run?.tournament) && inside(save.delve.run) && !inside(save.tower.run)) this.mode = "delve";
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
  /** Undos the run has left to spend. */
  get undosLeft() {
    return Math.max(0, this.undoCapacity - (this.run.undosUsed ?? 0));
  }
  /** Whether undo can take a move back: one is left and a move is held. */
  get canUndo() {
    return this.undosLeft > 0 && this.slice.history.length > 0;
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
    this.save.delve.courage = 999_999_999;
    for (const material of MATERIALS) this.save.materials[material.id] = 999_999_999;
    this.save.upgrades.delve = 1;
    this.save.upgrades.legacy = 1;
    // The Deck page with its Badges box, and every badge at the top level.
    for (const id of ["combatStance", "buildout", "cardBadges"] as const) this.save.upgrades[id] = Math.max(1, this.save.upgrades[id]);
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
  /** Adds the themes the save has earned (Dev mode's floors earn them all)
   * and returns them, for the player to hear about. */
  claimThemes(): ThemeId[] {
    return claimThemes(this.save);
  }
  /** Equips an owned theme's look, or Classic; false while it isn't owned. */
  wearTheme(kind: ThemeKind, look: string) {
    if (!canWear(this.save, kind, look)) return false;
    if (kind === "ui") this.save.settings.uiTheme = look as UiLook;
    else this.save.settings.gameTheme = look as GameLook;
    return true;
  }
  /** Makes `next` the active mode. A mode with no run yet starts one inside
   * (a new game's first), or in its forest when `outside`. */
  switchMode(next: Mode, outside = false) {
    if (next === "delve" && !this.save.upgrades.delve) return;
    this.enterMode(next, outside);
  }
  /** Makes `next` the active mode, the Delve's even before it opens (a
   * tournament run plays there). */
  private enterMode(next: Mode, outside: boolean) {
    if (next === this.mode) return;
    this.finishEncounter();
    this.armed = null;
    this.mode = next;
    if (next === "delve" && this.save.upgrades.delve) this.save.tutorials.delve = true;
    this.loadMode(outside);
  }
  /** Whether the forest's sign leads to the other mode's forest: in the
   * forest, once Into the depths is owned. */
  get canSwapForest() {
    return !!this.run.outside && !!this.save.upgrades.delve && !this.fallen;
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
  /** The lesson waiting on the Tower's board: in a new game's first run,
   * `climb`, which holds the hand paused until dismissed; in the forest,
   * `enter`, until dismissed or a run goes inside from the forest; then,
   * once Into the depths is owned, `delve`, until the Delve is opened. */
  get boardLesson(): BoardLesson | null {
    if (this.mode !== "tower") return null;
    const { climb, enter, delve } = this.save.tutorials;
    if (!this.run.outside) return climb || this.fallen ? null : "climb";
    if (!enter) return "enter";
    return this.save.upgrades.delve && !delve ? "delve" : null;
  }
  /** Dismisses the `climb` or `enter` lesson (the `delve` lesson waits on
   * the Delve tab); dismissing `climb` sets the hand playing. */
  dismissLesson() {
    const lesson = this.boardLesson;
    if (lesson === "climb") {
      this.save.tutorials.climb = true;
      if (this.handStartsPlaying) this.playHand();
    } else if (lesson === "enter") this.save.tutorials.enter = true;
    else return false;
    return true;
  }
  /** Whether the first run's lesson holds the hand paused. */
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
    this.route = [];
    if (!this.run.outside && this.handStartsPlaying && !this.fallen) this.playHand();
    else this.auto = false;
    this.dropHandPlan();
    this.encounter = null;
    this.fight = null;
    this.volley = null;
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
    this.save.delve.history = [];
    this.save.delve.fall = null;
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
    run.layoutVersion = TOWER_LAYOUT_VERSION;
    run.changes = {};
    run.player.x = TOWER_START_X;
    run.player.y = 0;
  }
  /** Pays what the run still owes; returns whether it set a new record. */
  private payout(): boolean {
    const record = this.run.height > this.slice.reached;
    this.recordProgress();
    this.purse.gold(tierGold(this.tier, this.rules.endGold(this.run)));
    return record;
  }
  snapshot(): MoveSnapshot {
    return { run: structuredClone(this.run), best: this.slice.best, xp: this.save.xp, silver: this.save.profile.earned.silver };
  }
  restore(snapshot: MoveSnapshot) {
    // The snapshot's board brings back any chest it had; area rewards are
    // paid when earned, so opening one again pays nothing.
    this.adoptRun(this.rewound(snapshot.run));
    // Lifetime achievements are never rolled back by movement undo, but XP
    // (and any level it reached) is: the kill it paid for is undone.
    this.recordProgress();
    if (levelForXp(snapshot.xp) < levelForXp(this.save.xp)) this.levelUpAt = -Infinity;
    this.revivedAt = [];
    this.struckDown = [];
    this.areaBursts = [];
    this.summoned = null;
    this.vanished = null;
    this.save.xp = snapshot.xp;
    // The Silver found since is taken back with the run, so it was never earned.
    if (snapshot.silver !== undefined) this.save.profile.earned.silver = Math.min(this.save.profile.earned.silver, snapshot.silver);
    this.route = [];
    // Undo pauses the hand, so the player can act before it carries on.
    this.auto = false;
    this.dropHandPlan();
    this.encounter = null;
    this.fight = null;
    this.volley = null;
    this.paused = false;
    this.blocked.until = 0;
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
    // A fight still playing out counts first, so undo takes it back.
    this.finishEncounter();
    this.armed = null;
    const slice = this.slice;
    if (!this.undosLeft) return false;
    // Fallen, undo spends one and takes back the fight the hero fell in.
    const fall = this.fallen ? slice.fall : null;
    let snapshot = slice.history.pop();
    if (!snapshot) return false;
    // A step onto empty floor is seldom worth resuming at: undo goes on
    // back past a run of them to before the last turn that did something.
    while (!fall && snapshot.quiet && slice.history.length) snapshot = slice.history.pop()!;
    slice.fall = null;
    // An undo spent is gone for the run: the count rides onto the run restored.
    const used = (this.run.undosUsed ?? 0) + 1;
    this.restore(fall?.snapshot ?? snapshot);
    this.run.undosUsed = used;
    slice.history = keepUndos(slice.history, this.undosLeft);
    this.feedback(fall ? "Fatal fight undone · the hand waits" : "Move undone");
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
    return this.paused || this.fallen || !!this.encounter;
  }
  walkTo(x: number, y: number) {
    if (this.busy) return;
    if (!this.manualMoves) {
      this.handMovesNote();
      return;
    }
    this.auto = false;
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
    if (this.encounter) return false;
    if (!this.manualMoves) return this.handMovesNote();
    this.route = [];
    this.auto = false;
    return this.move(dx, dy, true);
  }
  cancelRoute() {
    this.route = [];
  }
  private handMovesNote(): false {
    this.message = "The hand moves you inside a run.";
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
      this.message = "Tap the note to begin.";
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
  /** Whether the speed lesson waits: inside a run past the first floor,
   * slower than its speed, until the player has once sped up to it. */
  get teachesSpeed() {
    return !this.run.outside && !this.save.tutorials.speed && this.save.settings.speed < LESSON_SPEED && this.pastFirstFloor;
  }
  private get pastFirstFloor() {
    return this.rules.equivalentFloor(this.run.maxHeight ?? this.run.height) >= 1;
  }
  /** Reaching the second floor starts the speed lesson, pausing the hand,
   * or, already that fast, passes it by for good. */
  private startSpeedLesson() {
    if (this.save.tutorials.speed || !this.pastFirstFloor) return;
    if (this.save.settings.speed >= LESSON_SPEED) this.save.tutorials.speed = true;
    else {
      this.auto = false;
      this.message = "Press › beside play to move faster.";
    }
  }
  /** The forest's Enter button: goes straight in through the entrance,
   * starting the run, as walking onto it does. */
  enterRun() {
    if (!this.run.outside) return false;
    this.enterFromOutside();
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
    } else this.message = "Waiting · no safe route. Explore or retire this ascent.";
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
    // Stuck with tiles marked ?: the nearest becomes ! for Deprioritize's card.
    while (!plan && this.raiseBang()) plan = planHand(this, this.hand, this.mode);
    this.handStuck = !plan;
    if (!plan) return this.handWaits();
    this.activeCard = plan.card;
    const id = this.hand[plan.card];
    this.message = lost ? `Focus lost · ${CARDS[lost].name} has no path to a target · ${CARDS[id].name} leads.`
      : target === "lost" ? `Target lost · no path to the tile · ${CARDS[id].name} leads.` : this.cardMessage(id);
    if (fresh) this.coolDown(id);
    // A card that acts in place takes the turn without a step.
    if (!plan.path.length) {
      this.cardPlan = null;
      const p = this.run.player, key = `${this.rules.lootKey(this.run, p.x, p.y)}:${id}${this.cardUses(id)}`;
      this.actInPlace(id, this.scaleOf(id));
      if (id === this.run.focused) this.run.focused = undefined;
      this.activate(plan.card, key);
      return;
    }
    const goal = plan.path[plan.path.length - 1], key = this.rules.lootKey(this.run, goal.x, goal.y);
    const step = plan.path.shift()!, p = this.run.player, from = { x: p.x, y: p.y };
    this.cardPlan = plan.path.length ? plan : null;
    const rush = this.rushFor(id), rushes = fresh && rush > 0 && this.rushable(step.x, step.y);
    // The card's last step onto its target: Skip may make it vanish (or, on
    // the Tower's stairs, climb two floors), and Effective or Dampen scale it.
    const last = !this.cardPlan, rolls = last && this.rollsSkip(id, step.x, step.y), skips = rolls && this.skipRoll() < this.skipChance(id);
    if (skips && this.world.tile(step.x, step.y).kind !== "stairs") {
      this.vanish(step.x, step.y);
      if (id === this.run.focused) this.run.focused = undefined;
      return;
    }
    this.floorSkip = skips;
    this.stepScale = last ? this.scaleOf(id) : 1;
    // The board changes only as the hero moves, so a refused step means the
    // plan is stale: drop it and let the next turn choose again.
    // A rush is one turn: its shots come once it stops.
    this.holdTurn = rushes;
    const moved = this.move(step.dx, step.dy, true);
    this.stepScale = 1;
    this.floorSkip = false;
    if (!moved) {
      this.holdTurn = false;
      this.turnBefore = null;
      return void (this.cardPlan = null);
    }
    const rushed = rushes ? this.rushOn(plan, id, from, rush) : true;
    if (rushes) {
      this.holdTurn = false;
      this.endTurn();
    }
    if (!rushed) return;
    if (this.cardPlan) return;
    // The card's last step reaches its target: a focus on it is spent, and
    // it activates (once a fight into its target has played out).
    if (id === this.run.focused) this.run.focused = undefined;
    const fight = this.encounter;
    // A roll counts once the step is in the undo history (after a fight,
    // once it settles), so undo takes it back with the step.
    if (!fight) {
      if (rolls) this.skipRolled();
      return this.activate(plan.card, key);
    }
    const settle = fight.settle;
    fight.settle = () => {
      settle();
      if (rolls) this.skipRolled();
      this.activate(plan.card, key);
    };
  }
  /** What card `card`'s badges change about planning it (`planHand`
   * asks), each badge's rules together: a gate closes it while its
   * condition fails (any one closed closes it), and Stairward and Skip Open
   * Nodes count only on floors they aren't cooling down on. */
  cardRules(card: CardId): CardRules | undefined {
    if (this.run.outside) return undefined;
    let rules: CardRules | undefined;
    for (const badge of badgesOn(this.run.badges, card)) {
      const r = this.badgeRules(card, badge);
      if (!r) continue;
      const closed = rules?.closed || r.closed;
      rules = { ...rules, ...r };
      if (closed) rules.closed = true;
    }
    return rules;
  }
  /** What one of card `card`'s badges changes about planning it. */
  private badgeRules(card: CardId, badge: RunBadge): CardRules | undefined {
    const v = badgeValue(badge.id, badge.level, badge.pick), p = this.run.player;
    switch (badge.id) {
      case "hpGate": return { closed: !(p.hp < snap((p.maxHp * v) / 100)) };
      case "yellowGate": return { closed: !(p.keys.yellow < v) };
      case "blueGate": return { closed: !(p.keys.blue < v) };
      case "redGate": return { closed: !(p.keys.red < v) };
      case "yellowAtLeast": return { closed: !(p.keys.yellow >= v) };
      case "blueAtLeast": return { closed: !(p.keys.blue >= v) };
      case "redAtLeast": return { closed: !(p.keys.red >= v) };
      case "stairward": return this.cooled("stairward", v) ? { stairward: true } : undefined;
      case "skipOpen": return this.cooled("skipOpen", v) ? { skipOpen: { skipped: new Set(this.skipMarks), skip: (x, y) => this.skipTile(x, y) } } : undefined;
      case "charge": return { charge: v };
      case "effective": case "dampen": return { scale: this.scaleOf(card) };
      case "deprioritize": {
        const m = this.floorMarks;
        if (m.bangs.length) return { bang: new Set(m.bangs) };
        return m.made < v ? { deprioritize: (x, y) => this.markTile(x, y) } : { closed: true };
      }
      default: return undefined;
    }
  }
  /** What card `card`'s Effective or Dampen multiplies its target's effect
   * by when it activates: 1 with neither. */
  private scaleOf(card: CardId) {
    const badge = badgesOn(this.run.badges, card).find((b) => BADGES[b.id].kind === "scale");
    if (!badge || this.run.outside) return 1;
    const v = badgeValue(badge.id, badge.level, badge.pick);
    return (100 + (badge.id === "effective" ? v : -v)) / 100;
  }
  /** Whether Skip on card `card` rolls for its target at (x, y): never for
   * a boss, the Delve's STAIRS card's climb (no stairs), or a torch (no tile
   * to vanish). */
  private rollsSkip(card: CardId, x: number, y: number) {
    if (!badgeOn(this.run.badges, card, "skip") || this.run.outside || card === "torch") return false;
    const t = this.world.tile(x, y);
    if (t.kind === "enemy" && (t.enemy!.strength === "boss" || t.enemy!.strength === "greaterBoss")) return false;
    return card !== "stairs" || t.kind === "stairs";
  }
  /** Skip's chance on card `card`, as a fraction. */
  private skipChance(card: CardId) {
    const badge = badgeOn(this.run.badges, card, "skip")!;
    return badgeValue(badge.id, badge.level, badge.pick) / 100;
  }
  /** Skip's next roll: the next number of its own stream, started from the
   * run seed (the floors' seed), so a run of the same seed played the same
   * way skips the same targets. `run.skipRolls` counts those drawn. */
  private skipRoll() {
    const n = this.run.skipRolls ?? 0;
    return drawAt(this.run.seed ^ SKIP_SALT, n);
  }
  /** Skip's roll is spent: the stream moves on. */
  private skipRolled() {
    this.run.skipRolls = (this.run.skipRolls ?? 0) + 1;
  }
  /** Skip: the card's target at (x, y) vanishes in a puff, without effect.
   * A turn of its own, so undo brings it back. */
  private vanish(x: number, y: number) {
    const t = this.world.tile(x, y);
    this.remember(this.snapshot());
    this.skipRolled();
    this.world.clear(x, y);
    this.vanished = { x, y, at: performance.now() };
    this.message = `Skip · ${t.kind === "enemy" ? enemyTitle(t.enemy!) : SKIPPED_NAMES[t.kind] ?? "the target"} vanished`;
  }
  /** Deprioritize's marks on this floor: none yet on a floor it hasn't
   * marked. */
  private get floorMarks() {
    const m = this.run.marks, floor = this.badgeFloor;
    return m && !this.run.outside && m.floor === floor ? m : { floor, made: 0, tiles: [] as string[], bangs: [] as string[] };
  }
  /** Deprioritize passes over (x, y): marked ? for the rest of the floor. */
  private markTile(x: number, y: number) {
    const m = (this.run.marks = this.floorMarks), k = `${x},${y}`;
    if (!m.tiles.includes(k)) m.tiles.push(k);
    m.made++;
  }
  /** The tiles marked ? on this floor, which no card's path crosses
   * (`planHand` reads it). */
  get marked(): ReadonlySet<string> {
    return new Set(this.floorMarks.tiles);
  }
  /** The ? and ! marks on this floor, for the board. */
  get badgeMarks() {
    const m = this.floorMarks;
    return { asked: m.tiles, bangs: m.bangs };
  }
  /** The hand is stuck: the ? nearest the hero by walk becomes !, which
   * Deprioritize's card heads for. False with none left to raise. */
  private raiseBang() {
    const m = this.floorMarks;
    if (!m.tiles.length) return false;
    const away = walkAll(this, this.run.player, m.tiles);
    const far = (t: string) => away.get(t) ?? Infinity;
    const k = m.tiles.reduce((best, t) => (far(t) < far(best) ? t : best));
    this.run.marks = { ...m, tiles: m.tiles.filter((t) => t !== k), bangs: [...m.bangs, k] };
    return true;
  }
  /** Stepping on a marked tile clears its mark. */
  private unmark(x: number, y: number) {
    const m = this.run.marks, k = `${x},${y}`;
    if (!m || (!m.tiles.includes(k) && !m.bangs.includes(k))) return;
    this.run.marks = { ...m, tiles: m.tiles.filter((t) => t !== k), bangs: m.bangs.filter((t) => t !== k) };
  }
  /** Whether card `id` rests greyed out for the rest of the floor:
   * Deprioritize with every mark made and no ! to head for. */
  cardResting(id: CardId) {
    const badge = badgeOn(this.run.badges, id, "deprioritize");
    if (!badge || this.run.outside) return false;
    const m = this.floorMarks;
    return !m.bangs.length && m.made >= badgeValue(badge.id, badge.level, badge.pick);
  }
  /** The floor card badges count by: the Tower floor, or the Delve's
   * equivalent floor where the hero stands. */
  private get badgeFloor() {
    return this.rules.equivalentFloor(this.rules.progressAt(this.run, this.run.player.y));
  }
  /** Whether a cooling-down badge works on this floor: never used, used
   * on this floor already, or `every` floors on from the last it worked on. */
  private cooled(kind: "stairward" | "skipOpen", every: number) {
    const last = this.run.badgeFloors?.[kind], floor = this.badgeFloor;
    return last === undefined || last === floor || floor - last >= every;
  }
  /** A cooling-down badge works on this floor: it rests from here. */
  private markUsed(kind: "stairward" | "skipOpen") {
    (this.run.badgeFloors ??= {})[kind] = this.badgeFloor;
  }
  /** A new plan for card `id` under Stairward counts as its use. */
  private coolDown(id: CardId) {
    if (badgeOn(this.run.badges, id, "stairward") && this.cardRules(id)?.stairward) this.markUsed("stairward");
  }
  /** The doors and monsters Skip Open Nodes passed over on this floor, as
   * points, for the planner and the board's marks. */
  get skipMarks(): string[] {
    const skipped = this.run.skipped;
    return skipped && !this.run.outside && skipped.floor === this.badgeFloor ? skipped.tiles : [];
  }
  /** Skip Open Nodes passes over (x, y) for the rest of the floor. */
  private skipTile(x: number, y: number) {
    const floor = this.badgeFloor;
    if (this.run.skipped?.floor !== floor) this.run.skipped = { floor, tiles: [] };
    const k = `${x},${y}`;
    if (!this.run.skipped.tiles.includes(k)) this.run.skipped.tiles.push(k);
    this.markUsed("skipOpen");
  }
  /** Card `card` of the hand activates: each of its badges pays what it
   * gives, top slot first. Gold is paid once per target (`key`, gated by
   * lootedTiles like a kill's), since undo can't take it back; HP, Silver
   * and XP are the run's or in its undo snapshot. */
  private activate(card: number, key: string) {
    const id = this.hand[card], badges = id ? badgesOn(this.run.badges, id) : [];
    if (!badges.length || !this.playing) return;
    // Paying out makes the step it ends a turn undo stops at.
    delete this.slice.history.at(-1)?.quiet;
    for (const badge of badges) this.payBadge(card, key, badge);
  }
  /** One of hand card `card`'s badges pays what it gives on activation. */
  private payBadge(card: number, key: string, badge: RunBadge) {
    const id = this.hand[card], v = badgeValue(badge.id, badge.level, badge.pick), p = this.run.player;
    switch (badge.id) {
      case "hp": return this.raiseMaxHp(v, badge.id);
      case "hpPercent": return this.badgeHeal(snap((p.maxHp * v) / 100), badge.id);
      case "silverTouch": return this.gainCoins(p, 0, this.purse.silver(v));
      case "goldTouch": return this.gainCoins(p, this.purse.badgeGold(`badge:${id}:${key}`, v), 0, false);
      case "goldback":
        if (card !== this.hand.length - 1) return;
        // The combo is the run's, so undo takes an activation back; the
        // next Gold found spends it (RunPurse).
        this.run.goldCombo = (this.run.goldCombo ?? 0) + v;
        // Drawn as "×2" and the Gold coin.
        return this.gain(p.x, p.y, `×${this.run.goldCombo} Gold`, { coin: "gold" }, undefined, null);
      case "xp": {
        const xp = Math.round((v * xpBase(this.badgeFloor)) / xpBase(0));
        this.addXp(xp);
        return this.gain(p.x, p.y, `+${xp} XP`);
      }
    }
  }
  /** Max HP's badge: the hero's max HP (and the run's loadout, as a rank
   * of training bought for the run) rises by `n`, with the HP to fill it. */
  private raiseMaxHp(n: number, id: BadgeId) {
    const p = this.run.player, kept = this.run.loadout;
    n = snap(n * boonFactor(this.run, "maxHp"));
    p.maxHp = snap(p.maxHp + n);
    p.hp = snap(p.hp + n);
    if (kept) kept.maxHp = snap(kept.maxHp + n);
    this.gain(p.x, p.y, `+${wholeChange(n)} max HP`, { heart: true, raised: true });
    this.message = `${BADGES[id].name} · +${wholeChange(n)} max HP`;
  }
  /** Heals up to `n` HP for badge `id`, as a potion's heal shows. */
  private badgeHeal(n: number, id: BadgeId) {
    const p = this.run.player, healed = snap(Math.min(p.maxHp - p.hp, n));
    if (healed <= 0) return;
    p.hp = snap(p.hp + healed);
    this.recordHeal(healed);
    this.message = `${BADGES[id].name} · +${wholeChange(healed)} HP`;
  }
  /** Whether a card that acts in place can act now (`planHand` asks),
   * inside a run only: a siphon while enough of its training levels are
   * left for its next use, BK TRADER while 3 yellow keys are held, and YK TO
   * HP while a yellow key is held and its whole heal would land. */
  canAct(card: CardId) {
    if (this.run.outside) return false;
    const p = this.run.player;
    if (isSiphon(card)) return this.siphonLevel(card) >= this.siphonCost(card);
    if (card === "blueTrader") return p.keys.yellow >= TRADER_YELLOW_KEYS;
    if (card === "keyToHp") return p.keys.yellow >= 1 && snap(p.maxHp - p.hp) >= this.keyHeal();
    return false;
  }
  /** Times card `card`, one that acts in place, has acted this run. */
  cardUses(card: CardId) {
    return this.run.cardUses?.[card] ?? 0;
  }
  /** YK TO HP's heal: 10% of max HP. */
  private keyHeal() {
    return snap((this.run.player.maxHp * KEY_TO_HP_PERCENT) / 100);
  }
  /** The run's training level of the row siphon `card` drains (Max HP for
   * KEY SIPHON, DEF for BK SIPHON, ATK for RK SIPHON): the hero's own ranks
   * and those bought with Silver this run, less the levels it siphoned (1
   * for the first use, 2 for the second, and so on); 0 outside a run. */
  siphonLevel(card: SiphonCard) {
    if (this.run.outside) return 0;
    const uses = this.cardUses(card), row = SIPHONS[card].row;
    return this.save.training[row] + boughtInRun(this.run, row) - (uses * (uses + 1)) / 2;
  }
  /** The training levels siphon `card`'s next use takes: one more than the
   * last. */
  siphonCost(card: SiphonCard) {
    return this.cardUses(card) + 1;
  }
  /** A card that acts in place takes its turn, with no step: a turn of its
   * own, so undo takes it back. Effective and Dampen scale what it gives
   * (`scale`), never what it costs. */
  private actInPlace(card: CardId, scale = 1) {
    const p = this.run.player;
    this.remember(this.snapshot());
    if (isSiphon(card)) this.siphon(card, scale);
    else if (card === "blueTrader") {
      p.keys.yellow = snap(p.keys.yellow - TRADER_YELLOW_KEYS);
      p.keys.blue = snap(p.keys.blue + scale);
      this.noteKey("blue", scale);
      this.gain(p.x, p.y, `−${TRADER_YELLOW_KEYS} yellow keys`, { tile: { kind: "key", color: "yellow" } });
      this.gain(p.x, p.y, `+${keyCount(scale)} blue key`, { tile: { kind: "key", color: "blue" } });
    } else if (card === "keyToHp") {
      const healed = snap(Math.min(p.maxHp - p.hp, snap(this.keyHeal() * scale)));
      p.keys.yellow = snap(p.keys.yellow - 1);
      p.hp = snap(p.hp + healed);
      this.gain(p.x, p.y, "−1 yellow key", { tile: { kind: "key", color: "yellow" } });
      this.recordHeal(healed);
    }
    (this.run.cardUses ??= {})[card] = this.cardUses(card) + 1;
  }
  /** A siphon's turn: the run's top levels of its training row (its
   * `siphonCost`) traded for a key of its colour. The hero and the run's
   * loadout lose what those levels add (times the stat's research), for the rest of
   * the run only (max HP: HP falls only as far as the new max). */
  private siphon(card: SiphonCard, scale: number) {
    const { row: id, color } = SIPHONS[card], level = this.siphonLevel(card), levels = this.siphonCost(card);
    const p = this.run.player;
    const row = TRAINING.find((t) => t.id === id) as StatTrainingRow;
    const stat = row.stat as "maxHp" | "attack" | "defense";
    const loss = snap((trained(row, level) - trained(row, level - levels)) * statFactor(this.save, stat) * boonFactor(this.run, stat));
    p[stat] = snap(p[stat] - loss);
    if (stat === "maxHp") p.hp = Math.min(p.hp, p.maxHp);
    if (this.run.loadout) this.run.loadout[stat] = snap(this.run.loadout[stat] - loss);
    p.keys[color] = snap(p.keys[color] + scale);
    this.noteKey(color, scale);
    const lost = stat === "maxHp" ? `−${wholeChange(loss)} max HP` : `−${wholeChange(loss)} ${stat === "attack" ? "ATK" : "DEF"}`;
    this.gain(p.x, p.y, lost, stat === "maxHp" ? { heart: true } : { tile: { kind: stat } });
    this.gain(p.x, p.y, `+${keyCount(scale)} ${color} key`, { tile: { kind: "key", color } });
  }
  /** Rush: the first step toward a new target, onto an empty tile, goes on
   * along the path in the same step across up to `tiles` more empty tiles
   * (`rushFor` the card `id`), stopping on the tile before anything else,
   * unless that is the card's target item and a tile of the rush is left:
   * then it ends on the item, taking it (Effective or Dampen scaling it as
   * on any card's last step; with Skip, which may make it vanish, it stops
   * before it, so the item's own step rolls). One turn and one undo.
   * Rushed steps skip Regen but for the first `rushRegenSteps`.
   * Returns false when a step was refused, leaving the target unreached. */
  private rushOn(plan: CardPlan, id: CardId, from: { x: number; y: number }, rush: number) {
    const p = this.run.player, tiles = [from];
    let moved = true, left = rush;
    const regenerating = this.rushRegenSteps, regen = () => rush - left < regenerating;
    for (; left > 0 && plan.path.length && this.rushable(plan.path[0].x, plan.path[0].y); left--) {
      const at = { x: p.x, y: p.y }, next = plan.path.shift()!;
      if (!this.move(next.dx, next.dy, true, false, regen())) {
        plan.path = [];
        moved = false;
        break;
      }
      tiles.push(at);
    }
    const target = plan.path.length === 1 ? plan.path[0] : null;
    if (moved && left > 0 && target && RUSH_ONTO.has(this.world.tile(target.x, target.y).kind) && !this.rollsSkip(id, target.x, target.y)) {
      const at = { x: p.x, y: p.y };
      plan.path.shift();
      this.stepScale = this.scaleOf(id);
      moved = this.move(target.dx, target.dy, true, false, regen());
      this.stepScale = 1;
      if (moved) {
        tiles.push(at);
        // Taking the item makes the rush a turn undo stops at.
        delete this.slice.history.at(-1)?.quiet;
      }
    }
    this.cardPlan = plan.path.length ? plan : null;
    if (tiles.length > 1) this.rush = { tiles, at: performance.now() };
    return moved;
  }
  /** Tiles the hand's first step toward a new target may rush across: none
   * without the Rush skill, and one more a Rush research level. */
  get rushTiles() {
    return (this.save.upgrades.rush ? researched(this.save.archives, "rushTiles", 0) : 0) + this.worn.rushTiles;
  }
  /** How many of a Rush's rushed steps regain HP by Regen: none without the
   * Rush Regen skill, and one more a Rush Regen research level. */
  get rushRegenSteps() {
    return this.save.upgrades.rushRegen ? researched(this.save.archives, "rushRegenSteps", 0) : 0;
  }
  /** Tiles card `id`'s first step toward a new target may rush across:
   * `rushTiles`, End Rush's research on STAIRS (toward the stairs, or the
   * Delve's climb), and its Rush badge's value. They add up. */
  rushFor(id: CardId) {
    const end = id === "stairs" && this.save.upgrades.endRush ? researched(this.save.archives, "endRushTiles", 0) : 0;
    const badge = badgeOn(this.run.badges, id, "rush");
    return this.rushTiles + end + (badge ? badgeValue("rush", badge.level) : 0);
  }
  /** Whether a rush may cross (x, y): empty floor (`emptyAt`), or a chest
   * already opened. */
  private rushable(x: number, y: number) {
    return this.emptyAt(x, y) || (this.world.tile(x, y).kind === "openedChest" && this.emptyAt(x, y, true));
  }
  /** Whether (x, y) is empty floor a rush may cross: nothing on it, no torch
   * and no Gem (with `anyKind`, only those last two). */
  private emptyAt(x: number, y: number, anyKind = false) {
    const gem = this.gemFinder.gem;
    return (anyKind || this.world.tile(x, y).kind === "floor") && !(gem && gem.x === x && gem.y === y) &&
      !this.world.torches?.some((t) => t.active && t.x === x && t.y === y);
  }
  /** Drops the committed path when its card's gate badge (HP <, YK ≥, …)
   * no longer holds, so the hand chooses a card again: walking on, Regen
   * may have lifted HP past an HP < limit. A focused card ignores its gate. */
  private dropGatedPlan() {
    const plan = this.cardPlan;
    if (!plan) return;
    const id = this.hand[plan.card];
    if (!badgesOn(this.run.badges, id).some((b) => BADGES[b.id].kind === "gate") || id === this.run.focused) return;
    if (this.cardRules(id)?.closed) this.cardPlan = null;
  }
  /** The path the hand follows this turn: the one committed, else the
   * focused card's while it has a path to a target (`lost` once it has
   * none), else the first card's in priority order that can act. */
  private nextHandPlan(): { plan: CardPlan | null; lost: CardId | null } {
    if (this.cardPlan) return { plan: this.cardPlan, lost: null };
    const focused = this.run.focused;
    if (!focused) return { plan: planHand(this, this.hand, this.mode), lost: null };
    const plan = planHand(this, this.hand, this.mode, this.hand.indexOf(focused));
    if (plan) return { plan, lost: null };
    this.run.focused = undefined;
    return { plan: planHand(this, this.hand, this.mode), lost: focused };
  }
  /** No card can act: the hand pauses and End Run lights up. */
  private handWaits() {
    this.cardPlan = null;
    this.activeCard = null;
    this.auto = false;
    this.message = "No card can move · end the run, or use an item or skill.";
  }
  /** What stops the hand while no card can act (`explainStuck`): the run's
   * end dialog shows it. */
  stuckReport(): StuckReport {
    return explainStuck(this, this.hand);
  }
  /** The status line for card `id` leading the hand. */
  private cardMessage(id: CardId) {
    return `${id === this.run.focused ? "Focus · " : ""}${CARDS[id].name} · ${cardText(id, this.save.upgrades)}`;
  }
  /** After something the player does inside a run (an item used, a skill),
   * a stuck hand checks its cards again and plays on if one can act. */
  private afterPlayerAction() {
    if (!this.handStuck || !this.playing) return;
    const plan = planHand(this, this.hand, this.mode);
    if (!plan) return;
    this.handStuck = false;
    this.cardPlan = plan;
    this.playHand();
  }
  /** A run going inside keeps the hand as it was ordered on the way in,
   * gets its Focus uses and its Pocket Money Silver, and fixes its chance
   * of percent potions. */
  private dealHand() {
    noteGoldBoost(this.save, this.slice, this.clock());
    this.run.hand = [...this.save.hand];
    const links = keptLinks(this.run.hand, this.save.cardLinks);
    if (links.length) this.run.links = links;
    else delete this.run.links;
    const badges = this.save.upgrades.cardBadges ? runBadges(this.save.badges, this.run.hand, this.badges.slots) : {};
    if (Object.keys(badges).length) this.run.badges = badges;
    const pocket = this.startingSilver;
    if (pocket) this.run.silver = pocket;
    const chance = percentPotionChance(this.save);
    if (chance) this.run.percentPotions = chance;
    else delete this.run.percentPotions;
    this.run.focusUsed = 0;
    for (const k of ["ignoreUsed", "targetUsed", "regain", "ignored", "targeted"] as const) delete this.run[k];
  }
  /** The fastest speed the run's arrows reach: 3 steps a second, and one
   * more a Movement Speed research level. */
  get maxSpeed() {
    return 3 + researched(this.save.archives, "moveSpeed", 0) + (this.boons?.playSpeed ?? 0);
  }
  /** What the Tower run's boons change now, or null (none picked, or the
   * Delve). */
  get boons() {
    return this.mode === "tower" && !this.run.outside ? runBoons(this.run as TowerRun, this.save) : null;
  }
  /** The Gold bonus breakdown's Shrine Boons line: the boons' Gold factor
   * inside a Tower run once Shrines are open (1 with none), else none. */
  get shrineGold() {
    return this.shrine.open ? this.boons?.gold ?? 1 : undefined;
  }
  /** The run's boons changed its hero or enemies (`ShrineDesk.sync`): the
   * floor's enemies are read afresh and the hand plans again. */
  boonsChanged() {
    if (this.world instanceof RoomWorld) this.world.foes = (this.run as TowerRun).shrine?.applied?.foes;
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
    // Regen research raises the HP each step regains by its percent.
    const regen = this.run.outside || !this.run.player.regen ? 0
      : snap((this.run.player.regen * researched(this.save.archives, "regenPercent", 100)) / 100);
    const worn = this.worn, potionHeal = raised(researched(this.save.archives, "potionHeal", 100), worn.potionHeal);
    const crit = this.crit;
    return { potionHeal, percentPotion: potionPercent(this.trainingNow), regen,
      heartToll: researched(this.save.archives, "heartToll", 100), keyCost: this.keyCost,
      shardAttack: researched(this.save.archives, "shardAttackPercent", 100) * boonFactor(this.run, "attack"), shardDefense: researched(this.save.archives, "shardDefensePercent", 100),
      ...(worn.victoryHeal ? { victoryHeal: worn.victoryHeal } : {}), ...(crit ? { crit } : {}) };
  }
  /** The hero's critical strikes now (Critical, Crit % and Crit x training
   * and research, the run's Silver ranks counting), read when a fight is
   * taken or shown; none in the forest. */
  get crit(): CritRule | undefined {
    return this.run.outside ? undefined : critRule({ ...this.trainingNow, archives: this.save.archives });
  }
  /** How much of a key each key a door takes costs, in tenths of a percent
   * (Key Efficiency research): what steps pay and the door cards plan by. */
  get keyCost() {
    return researched(this.save.archives, "keyCost", 1000);
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
  /** The Silver a run starts with as it goes inside: Pocket Money research
   * and worn Equipment's. */
  get startingSilver() {
    return snap(researched(this.save.archives, "startingSilver", 0) + this.worn.startSilver);
  }
  /** Focus uses left: this run's inside one, or in the forest what the
   * next run will start with. */
  get focusLeft() {
    return this.chargesLeft("focus");
  }
  /** Uses of charge `c` (Focus, Ignore, Target) left: this run's inside
   * one, or in the forest what the next run will start with. */
  chargesLeft(c: Charge) {
    return this.run.outside ? chargesPerRun(this.save, c) : chargesLeft(this.save, this.run, c);
  }
  /** Ignore or Target waiting for the board tap that says where. */
  armed: "ignore" | "target" | null = null;
  /** Readies Ignore or Target (or, armed already, puts it away): the next
   * board tap marks or targets that tile. */
  arm(c: "ignore" | "target"): "armed" | "disarmed" | "unavailable" | "spent" {
    if (!this.save.upgrades[c] || this.run.outside || this.fallen) return "unavailable";
    if (this.armed === c) {
      this.armed = null;
      this.message = this.auto ? "The hand takes over." : "Paused · the hand waits.";
      return "disarmed";
    }
    if (this.chargesLeft(c) < 1) return "spent";
    this.armed = c;
    this.message = c === "ignore" ? "Ignore · tap a tile the hero won't step on." : "Target · tap a tile to send the hero there.";
    return "armed";
  }
  /** The board tap Ignore or Target was armed for, on (x, y): Ignore marks
   * the tile for the rest of the floor, and Target sends the hero there.
   * A tile it can't take (a wall, the hero's own, one already ignored, or
   * for Target one out of reach) costs nothing and keeps it armed. */
  useArmed(x: number, y: number): "used" | "invalid" | "noPath" | "unavailable" {
    const c = this.armed;
    if (!c || !this.save.upgrades[c] || this.run.outside || this.fallen || this.chargesLeft(c) < 1) {
      this.armed = null;
      return "unavailable";
    }
    return c === "ignore" ? this.ignoreTile(x, y) : this.targetTile(x, y);
  }
  /** The tiles Ignore marked on this floor, which no card's path nor
   * Target's crosses (`planHand` reads it). */
  get ignored(): ReadonlySet<string> {
    const m = this.run.ignored;
    return new Set(m && !this.run.outside && m.floor === this.badgeFloor ? m.tiles : []);
  }
  private ignoreTile(x: number, y: number): "used" | "invalid" {
    const p = this.run.player, k = `${x},${y}`;
    if (this.world.tile(x, y).kind === "wall" || (p.x === x && p.y === y) || this.ignored.has(k)) return "invalid";
    const floor = this.badgeFloor;
    if (this.run.ignored?.floor !== floor) this.run.ignored = { floor, tiles: [] };
    this.run.ignored.tiles.push(k);
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
    const path = planTarget(this, x, y);
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
    const path = this.targetPath?.length && stillOpen(this, this.targetPath) ? this.targetPath : planTarget(this, x, y);
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
  /** A new floor climbed for the first time in the run: Refocus, Ignore
   * More and Target More count it, and each charge regained shows. */
  private regainCharges(at: { x: number; y: number }) {
    for (const c of climbFloor(this.save, this.run)) this.gain(at.x, at.y, `+1 ${c === "focus" ? "Focus" : c === "ignore" ? "Ignore" : "Target"}`);
  }
  /** Puts the hand's card in slot `card` ahead of the others until it
   * reaches its target, spending a Focus use; the hand plays on to it. A
   * card with no path to a target fails and costs nothing, and the card
   * already moving the hero can't be focused. */
  focus(card: number): "focused" | "unavailable" | "active" | "spent" | "noPath" {
    const id = this.hand[card];
    if (!this.save.upgrades.focus || this.run.outside || this.fallen || !id) return "unavailable";
    if (this.run.focused === id || (card === this.activeCard && !this.handStuck)) return "active";
    if (this.focusLeft < 1) return "spent";
    const plan = planHand(this, this.hand, this.mode, card);
    if (!plan) return "noPath";
    this.run.focusUsed = (this.run.focusUsed ?? 0) + 1;
    this.missions.mark("focus", this.mode, this.run.seed, this.run.focusUsed);
    this.run.focused = id;
    this.route = [];
    // During a fight, the path is found again once the hero has stepped in.
    this.cardPlan = this.encounter ? null : plan;
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
  /** Settles the fight being played out, as if it had played to the end.
   * Returns whether there was one. */
  finishEncounter() {
    const fight = this.encounter;
    if (!fight) return false;
    this.encounter = null;
    fight.settle();
    return true;
  }
  /** The hero's HP as the HUD shows it at `now` (performance time): during
   * a fight being played out, what the strikes so far have left. */
  shownHp(now: number) {
    const fight = this.encounter, hp = this.run.player.hp;
    return fight ? heroHpDuring(fight.bout, hp, now - fight.start) : hp;
  }
  /** The HP the fight being played out leaves the hero with once its last
   * strike lands (the HP now while there is none). */
  fightEndHp() {
    const fight = this.encounter, hp = this.run.player.hp;
    return fight ? heroHpDuring(fight.bout, hp, Infinity) : hp;
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
    this.slice.fall = null;
    this.slice.history = [];
    this.slice.runGold = 0;
    this.slice.runBoostGold = null;
    this.slice.runCurrency = 0;
    this.slice.runRecord = false;
    this.slice.runFinds = defaultFinds();
    this.route = [];
    this.encounter = null;
    this.fight = null;
    this.volley = null;
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
    this.world = this.rules.board(this.run);
    if (outside) {
      this.run.outside = true;
      this.toForestStart();
      this.world = this.forestWorld(seed);
      this.message = "Follow the forest path to the entrance.";
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
   * player, in a forest, and no run of either mode inside. */
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
    this.enterMode("delve", true);
    if (this.slice.tier !== cave) switchTier(this.slice, cave);
    this.newRun({ outside: true, seed: info.seeds.layout });
    const run: TournamentRun = { id: info.id, league: info.league, entry, seeds: { ...info.seeds }, drawn: { game: 0, equipment: 0 }, back };
    this.delveRun.tournament = run;
    this.events.record("tournaments", 1, String(info.id));
    this.enterFromOutside();
    this.message = `Tournament · ${LEAGUE_INFO[info.league].name} League`;
    return true;
  }
  /** Claims a Goals checkpoint's reward (or its premium one) in `tower`
   * once reached; returns it, or null when it isn't ready. */
  claimGoal(tower: number, floor: number, premium: boolean) {
    const reward = claimGoal(this.save, tower, floor, premium);
    if (reward) readyForestRuns(this.save);
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
  /** Queues `drops` (a kill's or a chest's) to rise from `at` together,
   * stacked a row apart from row `top` down. */
  private gainDrops(at: { x: number; y: number }, drops: { text: string; art: GainArt }[], top = 0) {
    drops.forEach(({ text, art }, i) => this.gain(at.x, at.y, text, art, { row: top - i, with: i > 0 }));
  }
  /** Queues a reward to rise from (x, y), unless the Settings turn off
   * gains of its `kind` (by default, a coin's Gold or Silver). */
  gain(x: number, y: number, text: string, art: GainArt | null = null, drop?: Drop, kind: GainKind | null = coinOf(art)) {
    if (kind && !this.save.settings[GAIN_SETTINGS[kind]]) return;
    this.gains.push({ x, y, text, art, ...(drop ? { drop } : {}) });
    if (this.gains.length > MAX_GAINS) this.gains.shift();
  }
  /** Pays the XP for beating `enemy` on equivalent floor `floor`, counting
   * it toward the run's total too. */
  gainXp(enemy: Enemy, floor: number, scale = 1) {
    const xp = tierXp(this.tier, xpForKill(enemy.strength, floor)), gain = this.worn.xpGain;
    const raisedXp = gain ? Math.round((xp * (100 + gain)) / 100) : xp;
    this.addXp(scale === 1 ? raisedXp : Math.round(raisedXp * scale));
  }
  /** Adds `xp` to the hero's and the run's, raising the level-up burst
   * when it reaches a new level. */
  private addXp(xp: number) {
    const level = levelForXp(this.save.xp);
    this.save.xp += xp;
    this.run.xp = (this.run.xp ?? 0) + xp;
    const reached = levelForXp(this.save.xp);
    if (reached > level) {
      this.levelUpAt = performance.now();
      this.levelUpPoints = TRAINING_PER_LEVEL * (reached - level);
    }
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
    if (this.slice.runCurrency > 0) this.save.treeNotices[this.rules === MODES.tower ? "inspiration" : "courage"] = true;
    this.slice.history = [];
    this.route = [];
    const tournament = this.mode === "delve" ? this.delveRun.tournament : undefined;
    if (tournament) this.tournament.recordScore(tournament.id, tournamentScore(this.run));
    // A tournament run's cave gives way to the tier the player had selected.
    if (tournament && tournament.back.tier !== this.slice.tier) switchTier(this.slice, tournament.back.tier);
    this.newRun({ outside: true });
    if (tournament) this.enterMode(tournament.back.mode, true);
    this.auto = false;
    this.dropHandPlan();
    this.message = `${reason}${record ? " · a new record" : ""}${whole(gold) ? ` · ${whole(gold)} Gold kept` : ""}. Follow the forest path to begin again.`;
  }
  /** The hero fell in a fight: the run waits at 0 HP, the hand paused, for
   * the player to undo the fight or accept defeat. */
  private fallIn(before: MoveSnapshot, enemy: Enemy) {
    this.run.player.hp = 0;
    this.struckDown = [...this.struckDown, performance.now()];
    this.slice.fall = { snapshot: before, by: enemyTitle(enemy) };
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
  /** One step by (dx, dy); `regen` false for the tiles a Rush crosses after
   * its first step (past its first `rushRegenSteps`), so a rushed turn
   * regains HP once (and once more for each of those). */
  move(dx: number, dy: number, force = true, track = true, regen = true) {
    if (!this.canStep(dx, dy)) return false;
    const p = this.run.player,
      dest = this.world.step(p.x, p.y, dx, dy);
    if (!dest) {
      this.reject(p.x, p.y, "That edge is closed.");
      return false;
    }
    const t = this.world.tile(dest.x, dest.y);
    // The step is resolved once, before any snapshot/undo bookkeeping, so a
    // wall, lock, impervious enemy, or (automation's) declined lethal fight
    // never touches history, damages the player, alters the enemy, or ends the run.
    const rules: StepRules = { ...this.stepRules, ...(regen ? {} : { regen: 0 }), ...(this.stepScale !== 1 ? { scale: this.stepScale } : {}) };
    const outcome = resolveStep(p, t, rules);
    if (outcome.blocked) return this.rejectStep(outcome, t, dest.x, dest.y);
    if (!force && isLethal(outcome)) {
      this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
      return false;
    }
    const step: TakenStep = { tile: t, outcome, dest, track, quiet: this.emptyAt(dest.x, dest.y) };
    return t.kind === "enemy" ? this.fightStep(step, t.enemy!) : this.take(step);
  }
  /** Steps into `enemy`. A strike that would fell the hero may revive it
   * instead (Revive), so a lost fight is played out strike by strike to see
   * how it ends, as is one with critical strikes that may land;
   * a game that plays fights shows it on the board. */
  private fightStep(step: TakenStep, enemy: Enemy) {
    const p = this.run.player, outcome = step.outcome;
    const revive = isLethal(outcome) ? this.revival(step.dest) : undefined, crits = this.critRolls(step.dest);
    if (!this.playsFights && !revive && !crits) return this.take(step);
    const fight = bout(p, enemy, revive, crits), start = performance.now(), rose = revivals(fight).length;
    step.crits = critHits(fight);
    // Critical strikes change how long the fight lasts, so it ends as it was played.
    if (crits) this.restate(outcome, fight);
    else if (rose) {
      const rules = this.stepRules;
      outcome.player.hp = regenerate(healAfterVictory(afterExtra(heroHpAfter(fight, p.hp), outcome.extraDamage, p.maxHp), p.maxHp, rules), p.maxHp, rules);
      outcome.combat = { ...outcome.combat!, survivable: outcome.player.hp > 0 };
    }
    if (this.playsFights) return this.showFight(step, enemy, fight, start);
    if (rose) this.showRevivals(start, revivals(fight));
    return this.take(step, rose);
  }
  /** Shows `fight` on the board. Animate fights plays it out strike by
   * strike before it counts; otherwise it shows in summary rounds, and only
   * one with a revival waits, for each round after the revival's fire. */
  private showFight(step: TakenStep, enemy: Enemy, fight: Bout, start: number) {
    const p = this.run.player, animate = this.animatesFights, rose = revivals(fight).length;
    const shown = animate ? fight : summarize(fight, REVIVE_PAUSE_MS);
    this.fight = { from: { x: p.x, y: p.y }, to: step.dest, bout: shown, start, hp: enemy.hp, summary: !animate };
    this.showRevivals(start, revivals(shown));
    if (!animate && !rose) return this.take(step, rose);
    // The same fight, so the board shows it as it plays out.
    const encounter: Encounter = Object.assign(this.fight, { enemy, outcome: step.outcome, settle: () => {
      // Training bought as it plays out replays the rest: count the crits as played.
      if (!encounter.summary) step.crits = critHits(encounter.bout);
      this.take(step, revivals(encounter.bout).length);
    } });
    this.encounter = encounter;
    return true;
  }
  /** The board shows each revival (`at`, ms into a fight that began at
   * `start`): the skull as the strike lands, then, once it is over, the fire. */
  private showRevivals(start: number, at: number[]) {
    this.struckDown = at.map((t) => start + t);
    this.revivedAt = this.struckDown.map((t) => t + DEFEAT_MS);
  }
  /** When the skull over the hero last struck down is over, so the defeat
   * dialog may open (performance time; -Infinity when there was none). */
  get defeatShownUntil() {
    return Math.max(-Infinity, ...this.struckDown) + DEFEAT_MS;
  }
  /** Whether each strike at (x, y) that would fell the hero revives it: a
   * fixed number per run, floor, tile and strike, under the Revive chance,
   * so taking the fight back and fighting it again ends the same way, and
   * more Revive training only ever adds revivals. */
  private revival(at: { x: number; y: number }): Revival | undefined {
    const chance = reviveChance(this.trainingNow);
    if (!chance || this.run.outside) return undefined;
    const floor = this.mode === "tower" ? this.run.height + 1 : 0,
      seed = this.run.seed ^ REVIVE_SALT ^ Math.imul(floor, 0x9e3779b1);
    return (strike) => tileRandom(at.x, at.y, (seed ^ Math.imul(strike + 1, 0x85ebca6b)) | 0) * 10000 < chance;
  }
  /** The hero's critical rolls for the fight at (x, y): a fixed number per
   * run, floor, tile and strike, so taking the fight back and fighting it
   * again lands the same crits, and more Crit % only ever adds some. Chance
   * of 100% or more lands that many applications of the factor for certain,
   * and the rest rolls for one more. */
  private critRolls(at: { x: number; y: number }): Crits | undefined {
    const rule = this.crit;
    if (!rule) return undefined;
    const floor = this.mode === "tower" ? this.run.height + 1 : 0, seed = this.run.seed ^ CRIT_SALT ^ Math.imul(floor, 0x9e3779b1);
    const sure = guaranteedCrits(rule.chance), rest = snap(rule.chance - 100 * sure);
    return { factor: rule.factor, applications: (strike) => sure + (tileRandom(at.x, at.y, (seed ^ Math.imul(strike + 1, 0x85ebca6b)) | 0) * 100 < rest ? 1 : 0) };
  }
  /** Takes a resolved step: in through its door or fight, then onto the tile. */
  private take(step: TakenStep, revived = 0) {
    if (!this.enter(step, revived)) {
      this.turnBefore = null;
      return false;
    }
    const notes = notesOf(this.run);
    if (notes) notes.steps++;
    this.land(step.tile, step.dest.x, step.dest.y, step.outcome);
    this.gemFinder.step();
    if (!this.holdTurn) this.endTurn();
    return true;
  }
  /** Commits a resolved step: undo history, stats, and the door or fight on
   * the way in. Returns false when the player fell. */
  private enter({ tile: t, outcome, dest, track, quiet, crits }: TakenStep, revived: number) {
    const before = this.snapshot();
    this.turnBefore ??= before;
    if (track) this.remember(quiet ? { ...before, quiet: true } : before);
    const drained = snap(this.run.player.hp - outcome.player.hp);
    this.applyStats(outcome.player);
    if (t.kind === "door") this.openDoor(t, outcome.keysSpent, drained, dest, outcome.keyAmount);
    if (t.kind !== "enemy") return true;
    const extra = outcome.extraDamage ?? 0, p = this.run.player;
    // Effective's added damage rises off the hero; Dampen's given back heals.
    if (extra > 0 && p.hp > 0) this.gain(p.x, p.y, `−${wholeChange(extra)} HP`, { heart: true });
    else if (extra < 0) this.recordHeal(-extra);
    return this.winFight({ enemy: t.enemy!, damage: snap(outcome.combat!.damage + extra), at: dest, revived, scale: outcome.scale, instakill: instakill(outcome.combat!), crits }, before);
  }
  /** Moves the player onto the tile and applies what standing there does. */
  private land(t: Tile, x: number, y: number, outcome: StepEffect) {
    const p = this.run.player, from = { x: p.x, y: p.y };
    p.x = x;
    p.y = y;
    this.unmark(x, y);
    // Walking into a torch destroys it immediately: light, collision and
    // sprite all disappear the same frame since rendering only ever draws
    // active torches from this same list.
    const torch = this.world.breakTorchAt?.(x, y);
    if (this.run.outside) {
      if (t.kind === "stairs") this.enterFromOutside();
      else if (this.world instanceof OutsideWorld && this.world.atExit(x, y)) this.swapForest();
      return;
    }
    if (torch) this.payPickup(null, { x, y });
    if (t.kind === "reward") {
      this.run.changes[`${x},${y}`] = { kind: "openedChest", tier: t.tier };
      this.openAreaChest(t.tier);
      return;
    }
    this.collect(t, x, y, outcome);
    this.consumeTile(t, x, y);
    if (t.kind !== "stairs") this.callGreaterBoss();
    this.afterStep(t, x, y, from);
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
    run.changes[`${at.x},${at.y}`] = greaterBoss(world);
    this.summoned = { ...at, at: performance.now() };
  }
  /** Mode-specific progress once the player stands on the new tile,
   * stepped onto from `from`. */
  private afterStep(t: Tile, x: number, y: number, from: { x: number; y: number }) {
    if (this.mode === "delve") this.afterDelveStep(t, x, y, from);
    else if (t.kind === "stairs") this.advanceTowerRoom();
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
    const slice = this.slice;
    slice.history.push(snapshot);
    slice.history = keepUndos(slice.history, this.undosLeft);
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
  /** Each key the door took rises from it with a minus sign; a door that
   * takes HP (a Heart Door, down to 1, or a Wooden Door broken without a
   * key) raises a heart with the HP it took (a toll, not damage: it never
   * costs an area's mastery). */
  private openDoor(t: Tile, keysSpent: KeyColor[], drained: number, at: { x: number; y: number }, amount = 1) {
    const n = keysSpent.length, rule = doorRule(t), notes = notesOf(this.run);
    if (notes) tallyIn(notes.doors, doorName(t));
    for (const color of keysSpent) this.gain(at.x, at.y, `−${keyCount(amount)} ${color} key`, { tile: { kind: "key", color }, spent: true }, undefined, "door");
    if (!n || (drainsHp(rule) && drained > 0)) this.gain(at.x, at.y, `−${wholeChange(drained)} HP`, { heart: true }, undefined, "door");
    this.payPickup(t, at);
    const spent = amount === 1 ? `${n} key${n === 1 ? "" : "s"} spent` : `${keyCount(snap(n * amount))} keys spent`;
    if (rule.type === "wood" && !n) this.message = `${doorName(t)} broken down · −${wholeChange(drained)} HP`;
    else this.message = `${doorName(t)} opened${n ? ` · ${spent}` : ""}${drainsHp(rule) ? (this.run.player.hp > HEART_DOOR_HP ? " · HP drained" : " · HP drained to 1") : ""}`;
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
    this.message = [fightText(fight), ...this.payKill(enemy, at, fight.scale ?? 1, !!fight.instakill, fight.crits)].join(" · ");
    return true;
  }
  /** Pays a kill at `at` (a fight won, or an arrow's): counted, its XP,
   * Silver, Gold and loot. Returns what it found, as the status line names it. */
  private payKill(enemy: Enemy, at: { x: number; y: number }, scale: number, instakill: boolean, crits?: number) {
    this.run.kills++;
    this.countKill(enemy, at);
    const floor = this.rules.equivalentFloor(this.rules.progressAt(this.run, at.y));
    this.gainXp(enemy, floor, scale);
    // Silver belongs to the run, so it isn't gated like Gold: undo takes it back.
    const purse = this.purse, silver = purse.killSilver(enemy, floor, scale);
    const { gold, cells, equipment } = purse.enemyLoot(enemy, at.x, at.y, scale, instakill);
    const cellsFound = cells ? [cellsText(cells)] : [];
    const found = equipmentGains(equipment);
    // Gold over Silver at the tile, the rest below.
    this.gainDrops(at, [
      ...(gold ? [{ text: `+${wholeChange(gold)} Gold`, art: { coin: "gold" as const } }] : []),
      { text: `+${wholeChange(silver)} Silver`, art: { coin: "silver" } },
      ...cellsFound.map((text) => ({ text, art: { cell: true as const } })),
      ...found,
    ], gold ? 1 : 0);
    if (equipment?.item || equipment?.salvaged) this.events.record("equipment", 1, this.missionKey(at));
    if (equipment?.item) this.slice.runFinds.equipment++;
    if (crits) this.events.record("crits", crits, this.missionKey(at));
    return [...coinsText(gold, silver), ...cellsFound, ...found.map((g) => g.text)];
  }
  /** The end of a turn inside a run (a step, or a whole rush): each Ranged
   * enemy within reach whose cooldown is ready shoots the hero where it now
   * stands, then the Archer, its arrow ready, shoots the closest enemy in
   * its range (ranged.ts). Nothing before the third tier unless the hero is
   * an Archer; a turn that climbs to another floor leaves its shooters behind. */
  private endTurn() {
    const before = this.turnBefore;
    this.turnBefore = null;
    const archer = isArcher(this.save);
    if (!before || this.run.outside || this.fallen || (this.tier < 3 && !archer)) return;
    if (this.mode === "tower" && before.run.height !== this.run.height) return;
    const v: Volleys = { ...(this.run.volleys ?? { turn: 0 }) };
    v.turn++;
    const shots: Shot[] = [], range = attackRange(this.trainingNow);
    const fell = this.foesShoot(v, shots, range);
    if (fell) {
      this.run.volleys = v;
      this.showVolley(shots);
      this.fallIn(before, fell);
      this.message = `Shot down by ${enemyTitle(fell)}.`;
      return;
    }
    if (archer) this.loose(v, shots, range);
    this.run.volleys = v;
    this.showVolley(shots);
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
  /** Each Ranged enemy's cooldown runs a turn, and those within reach that
   * are ready shoot the hero. Returns the enemy whose shot felled it, if one did. */
  private foesShoot(v: Volleys, shots: Shot[], range: number): Enemy | null {
    const p = this.run.player, foes = { ...v.foes }, costs = new Map<string, number>();
    for (const k of Object.keys(foes)) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      if (this.world.tile(x, y).enemy?.ranged) foes[k] = charged(foes[k], FOE_GAIN)!;
      else delete foes[k];
    }
    let fell: Enemy | null = null, hurt = false;
    for (const { x, y, tile } of enemiesWithin(this.world, p, foeRange(range), this.wrap)) {
      if (!tile.enemy.ranged) continue;
      const k = `${x},${y}`, cost = foeShotCost(this.floorOf(x, y));
      costs.set(k, cost);
      if (!ready(foes[k], cost)) continue;
      const { damage, shrouded } = shotDamage(p, tile.enemy);
      foes[k] = spent(foes[k], cost);
      p.hp = snap(Math.max(0, p.hp - damage));
      shots.push({ by: "enemy", from: { x, y }, to: { x: p.x, y: p.y }, damage, ...(shrouded ? { shrouded } : {}) });
      if (damage > 0) hurt = true;
      if (!p.hp) {
        fell = tile.enemy;
        break;
      }
    }
    // A shooter that didn't shoot waits full once it is ready.
    for (const k of Object.keys(foes)) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      const kept = held(foes[k], costs.get(k) ?? foeShotCost(this.floorOf(x, y)));
      if (kept === undefined) delete foes[k];
      else foes[k] = kept;
    }
    if (Object.keys(foes).length) v.foes = foes;
    else delete v.foes;
    if (hurt) {
      this.markDamaged();
      this.events.hurt(this.mode, this.run.seed);
      const taken = shots.reduce((sum, s) => snap(sum + s.damage), 0);
      if (!fell) this.message = `Shot · −${wholeChange(taken)} HP`;
    }
    return fell;
  }
  /** The Archer's cooldown runs a turn, and once ready it shoots the
   * closest enemy within its range that an arrow can hurt, its ATK raised by
   * ATK / Tile for the distance and by Charged Shot for the turns it waited
   * (`arrowBoost`). A multishot (`multishot`) fires the same charge at up
   * to Multishot Targets of the closest enemies it can hurt, each arrow with
   * the first's Charged Shot, its own ATK / Tile and its own critical roll.
   * A ready arrow with no target waits for one, counting the turn toward
   * Charged Shot once that is researched. */
  private loose(v: Volleys, shots: Shot[], range: number) {
    const p = this.run.player, perTile = attackPerTile(this.trainingNow), percent = researched(this.save.archives, "chargedShotPercent", 0);
    const boost = (d2: number) => arrowBoost(perTile, d2, percent, v.waited ?? 0);
    const hurts = (e: InReach) => arrowDamage(p, e.tile.enemy, 0, 1, boost(e.d2)) > 0;
    let hero = charged(v.hero, attackSpeed(this.trainingNow));
    const inReach = ready(hero, ARROW_COST) ? enemiesWithin(this.world, p, range, this.wrap) : [];
    const target = inReach.find(hurts);
    if (target) {
      hero = spent(hero, ARROW_COST);
      const targets = this.multishot(v.turn) ? inReach.filter(hurts).slice(0, multishotTargets(this.trainingNow)) : [target];
      for (const t of targets) this.shoot(t, v.turn, shots, boost(t.d2), !!(percent && v.waited));
      delete v.waited;
    }
    hero = held(hero, ARROW_COST);
    if (hero === undefined) delete v.hero;
    else v.hero = hero;
    if (!target && hero === undefined && percent > 0) v.waited = (v.waited ?? 0) + 1;
  }
  /** Whether the Archer's shot on turn `turn` is a multishot: a fixed
   * number per run, turn and the hero's tile under Multishot Chance. */
  private multishot(turn: number) {
    const chance = multishotChance(this.trainingNow), p = this.run.player;
    return chance > 0 && tileRandom(p.x, p.y, (this.run.seed ^ MULTISHOT_SALT ^ Math.imul(turn, 0x85ebca6b)) | 0) * 10_000 < chance;
  }
  /** The Archer's arrow lands on `target`: one strike's damage, its ATK
   * multiplied by `boost` and critical rolls counted, healing by
   * Lifesteal; it wounds the enemy, or fells it and pays the kill. A
   * `charged` arrow's number wears a gold outline. */
  private shoot({ x, y, tile }: InReach, turn: number, shots: Shot[], boost = 1, chargedShot = false) {
    const p = this.run.player, enemy = tile.enemy, rule = this.crit;
    let applications = 0;
    if (rule) {
      const sure = guaranteedCrits(rule.chance), rest = snap(rule.chance - 100 * sure);
      applications = sure + (tileRandom(x, y, (this.run.seed ^ ARROW_SALT ^ Math.imul(turn, 0x85ebca6b)) | 0) * 100 < rest ? 1 : 0);
    }
    const damage = arrowDamage(p, enemy, applications, rule?.factor ?? 1, boost), left = snap(Math.max(0, enemy.hp - damage));
    const healed = p.lifesteal ? snap(Math.min(p.maxHp - p.hp, (damage * p.lifesteal) / 100)) : 0;
    if (healed > 0) p.hp = snap(p.hp + healed);
    shots.push({ by: "hero", from: { x: p.x, y: p.y }, to: { x, y }, damage, ...(applications ? { crit: applications } : {}), ...(chargedShot ? { charged: true } : {}), ...(healed > 0 ? { healed } : {}),
      before: enemy.hp, hp: left, full: snap(enemy.hp + (tile.wound ?? 0)) });
    if (left > 0) {
      this.world.wound?.(x, y, damage);
      return;
    }
    // One arrow felling an unwounded enemy is an instakill, as Mug pays it.
    this.world.clear(x, y);
    this.message = [`Arrow · ${enemyTitle(enemy)} defeated`, ...this.payKill(enemy, { x, y }, 1, !tile.wound, applications ? 1 : 0)].join(" · ");
  }
  /** The board flies the turn's shots, landing as the step ends. */
  private showVolley(shots: Shot[]) {
    if (!shots.length) return;
    this.volley = { at: performance.now(), flight: Math.min(FLIGHT_MS, 800 / Math.max(1, this.stepsPerSecond)), shots };
  }
  /** A kill counts toward the missions and the Event for its strength, once a tile. */
  private countKill(enemy: Enemy, at: { x: number; y: number }) {
    const s = enemy.strength;
    const type: MissionType & EventMissionType = s === "boss" || s === "greaterBoss" ? "bosses" : s === "strong" ? "strong" : s === "elite" ? "elite" : "basic";
    this.missions.record(type, 1, this.missionKey(at));
    this.events.record(type, 1, this.missionKey(at));
  }
  /** What a kill or pickup at `at` counts as for the missions: the mode
   * and its loot key, so undo bringing the tile back can't count it again. */
  private missionKey(at: { x: number; y: number }) {
    return `${this.mode}:${this.rules.lootKey(this.run, at.x, at.y)}`;
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
  /** Raises the Gold and Silver just found from `at`, each only when some
   * was; a kill always shows its Silver. */
  private gainCoins(at: { x: number; y: number }, gold: number, silver: number, alwaysSilver = true) {
    if (gold) this.gain(at.x, at.y, `+${wholeChange(gold)} Gold`, { coin: "gold" });
    if (silver || alwaysSilver) this.gain(at.x, at.y, `+${wholeChange(silver)} Silver`, { coin: "silver" });
  }
  /** The Gold killing the enemy at (x, y) would bank now (`instakill`:
   * the hero's first strike ending it), or 0 once its tile is looted. */
  enemyGold(x: number, y: number, instakill = false) {
    const t = this.world.tile(x, y);
    return t.kind === "enemy" ? this.purse.killGoldPreview(t.enemy!, x, y, instakill) : 0;
  }
  /** What the run finds is paid through its purse. */
  private get purse() {
    // A tournament run's chances come from the seeds its league shares.
    const t = this.mode === "delve" ? this.delveRun.tournament : undefined;
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
    this.dealHand();
    p.x = this.rules.entranceX;
    p.y = 0;
    this.world = this.rules.board(this.run);
    this.forgetLabyrinth();
    this.route = [];
    // Inside, the hand takes over from the player (or Automove).
    if (this.handStartsPlaying) this.playHand();
    else this.auto = false;
    this.dropHandPlan();
    this.feedback(this.rules.words.enter);
    this.gemFinder.step();
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
  private afterDelveStep(t: Tile, x: number, y: number, from: { x: number; y: number }) {
    const world = this.world;
    if (!(world instanceof World)) return;
    // Undo stays on the floor it was taken on: crossing a floor line (each
    // ten depth, either way) forgets the history.
    const floorAt = (at: { x: number; y: number }) => this.rules.equivalentFloor(world.depth(at.x, at.y));
    if (floorAt(from) !== floorAt({ x, y })) this.save.delve.history = [];
    // The world keeps the run's milestone and floor itself.
    if (t.kind === "oneway" && world.cross(x, y)) {
      this.forgetLabyrinth();
      this.save.delve.history = []; // Milestone passages cannot be reversed with undo.
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
      this.regainCharges(at);
      this.floorHeal();
    }
    this.freeTrain(last - floorBefore);
    this.gainCoins(at, gold, silver, false);
  }
  /** Free Training for `floors` floors passed, one after another: the
   * levels each floor's rolls give (`rollFreeTraining`) join the run's
   * training as Silver ranks would, costing nothing, and are announced
   * together (`freeTrained`). */
  private freeTrain(floors: number) {
    const given: TrainingId[] = [];
    for (let f = 0; f < floors; f++)
      for (const id of rollFreeTraining(this.save, this.run, this.boons?.freeUp ?? 0)) {
        const offer = runTrainingOffer(this.save, this.run, id);
        this.run.training = { ...this.run.training, [id]: offer.bought + 1 };
        this.applyRunTraining(offer);
        given.push(id);
      }
    if (given.length) this.freeTrained = { lines: freeTrainingLines(given), at: performance.now() };
    this.events.record("freeUpgrades", given.length);
  }
  /** Find Yellow Key: on floor `floor` climbed for the first time in the
   * run, a yellow key under the research's chance. The roll is a fixed
   * number per run seed and floor, so undo and a replay find the same
   * keys, and more research only ever adds some. */
  private findYellowKey(floor: number, at: { x: number; y: number }) {
    const chance = researched(this.save.archives, "yellowKeyChance", 0);
    if (!chance || tileRandom(-1, floor, (this.run.seed ^ YELLOW_KEY_SALT) | 0) * 1000 >= chance) return;
    const keys = this.run.player.keys;
    keys.yellow = snap(keys.yellow + 1);
    this.noteKey("yellow", 1);
    this.gain(at.x, at.y, "+1 yellow key", { tile: { kind: "key", color: "yellow" } });
  }
  advanceTowerRoom() {
    // Undo stays on the floor it was taken on: climbing forgets the history.
    this.slice.history = [];
    const purse = this.purse, p = this.run.player;
    // Keyed by the stairs taken, so it pays once a run.
    const gold = purse.floorGold(purse.floorKey(p.x, p.y));
    const highest = this.run.maxHeight ?? this.run.height;
    // Skip on STAIRS climbs past the next floor, which pays nothing; an area
    // climbed past is still judged as its section ends.
    const skipped = this.floorSkip ? this.climb.up() : null;
    // Floor Skip Reward pays a share of the Gold the floor passed held.
    const skipGold = skipped ? purse.skippedFloorGold(skipped.board) : 0;
    const passed = skipped?.sectionStart ? new AreaLedger(this.save).enter(this.towerRun, skipped.board) : [];
    const { board, sectionStart } = this.climb.up();
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
      this.floorHeal();
      this.freeTrain(this.run.height - highest);
    }
    this.enterTowerFloor(board);
    // A new floor may earn a boon, which Auto Pick takes at once.
    this.shrine.autoPick();
    // The hero keeps every stat into a new section.
    const earned = sectionStart ? new AreaLedger(this.save).enter(this.towerRun, board) : [];
    if (skipped) this.feedback(passed.length ? `Floor Skipped · floors ${this.run.height - TOWER_SECTION}–${this.run.height - 1} ${passed.join(" and ")}` : "Floor Skipped", 1000);
    else if (earned.length) this.feedback(`Floors ${this.run.height - TOWER_SECTION + 1}–${this.run.height} ${earned.join(" and ")} · reward ahead`);
    // After the first Tower run a plain new floor only says so on the status line.
    else if (this.save.tutorials.chamber) this.message = "A new chamber opens.";
    else this.feedback("A new chamber opens.");
    this.gainCoins(p, snap(gold + skipGold), silver, false);
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
    this.rules.credit(this.save, earned);
    slice.runCurrency += earned;
    this.startSpeedLesson();
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
  /** Equipment's heal on a floor reached for the first time in the run (a
   * share of max HP, by `floorHeal`), shown like a potion's. */
  private floorHeal() {
    const pct = this.worn.floorHeal, p = this.run.player;
    if (!pct || p.hp <= 0) return;
    const n = snap(Math.min(p.maxHp - p.hp, (p.maxHp * pct) / 100));
    p.hp = snap(p.hp + n);
    this.recordHeal(n);
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
  /** An area reward chest opened: its reward was paid when earned, so it
   * only shows it, with the board's golden burst. The chest stands on the
   * floor after the area's last, whose height is that last floor. */
  private openAreaChest(tier: ChestTier | undefined) {
    const reward = chestReward(tier), now = performance.now();
    const inspiration = reward === "cleared" ? clearedInspiration(this.run.height) : 0;
    const playing = this.areaBursts.filter((b) => now - b.at < AREA_BURST_MS), last = playing.at(-1);
    this.areaBursts = [...playing, { reward, inspiration, at: last ? Math.max(now, last.at + AREA_BURST_MS) : now }];
    this.message = reward === "mastered" ? "Area mastered · checkpoint warp unlocked" : `Enemies cleared · +${inspiration} Inspiration`;
  }
  /** Pickup rewards and treasure payouts; stats were already applied. */
  private collect(t: Tile, x: number, y: number, outcome: StepEffect) {
    const text = pickupText(t, outcome, this.stepRules);
    this.notePickup(t, outcome);
    if (text) {
      this.gain(x, y, text, { tile: { ...t } }, undefined, "item");
      this.payPickup(t, { x, y });
      if (t.kind === "potion") this.recordHeal(outcome.healed);
      if (t.kind === "potion") this.missions.record("potions", 1, this.missionKey({ x, y }));
      if (t.kind === "potion") this.events.record("potions", 1, this.missionKey({ x, y }));
      if (t.kind === "key" && t.color !== "yellow") this.missions.record(t.color === "blue" ? "blueKeys" : "redKeys", 1, this.missionKey({ x, y }));
      this.message = text;
    }
    if (t.kind === "treasure") this.openTreasure(x, y);
  }
  /** Gold Bonus's Gold for taking `t` (a torch when null) off the floor at
   * `at`, or opening it (a door), rising a row up at the same time as the
   * item's own gain (a door's last key or HP) where it has one. */
  private payPickup(t: Tile | null, at: { x: number; y: number }) {
    const gold = this.purse.pickupGold(at.x, at.y, pickupGold(t));
    if (gold) this.gain(at.x, at.y, `+${wholeChange(gold)} Gold`, { coin: "gold" }, { row: 1, with: !!t });
  }
  /** A pickup counted in the run's notes: a key (by colour, under a
   * badge's scale), a potion, or an ATK or DEF shard. */
  private notePickup(t: Tile, outcome: StepEffect) {
    const notes = notesOf(this.run);
    if (!notes) return;
    if (t.kind === "key") this.noteKey(t.color!, outcome.keyAmount ?? 1);
    else if (t.kind === "potion") notes.potions++;
    else if (t.kind === "attack") notes.attackShards++;
    else if (t.kind === "defense") notes.defenseShards++;
  }
  /** A key obtained (picked up, traded or siphoned), counted in the run's notes. */
  private noteKey(color: KeyColor, amount: number) {
    const notes = notesOf(this.run);
    if (notes) tallyIn(notes.keys, color, amount);
  }
  /** A treasure chest: counted, and paid once per physical chest (undo and
   * reopening can't pay it again). */
  private openTreasure(x: number, y: number) {
    this.run.treasures++;
    this.events.record("chests", 1, this.missionKey({ x, y }));
    const loot = this.purse.treasure(x, y);
    if (!loot) return;
    // The Gold at the tile, the materials below it, rising together.
    this.gainDrops({ x, y }, [
      { text: `+${wholeChange(loot.gold)} Gold`, art: { coin: "gold" } },
      ...loot.materials.map((m) => ({ text: materialText(m), art: { material: m.id, quantity: m.quantity } })),
    ]);
    this.message = [`+${wholeChange(loot.gold)} Gold`, ...loot.materials.map(materialText)].join(" · ");
  }
  /** Ends the run (the End Run button), or, fallen, accepts defeat. */
  finish(reason: string) {
    this.finishEncounter();
    if (this.fallen) this.acceptDefeat();
    else this.finalizeRun(reason);
  }
  /** Inside a run, the hand it went in with; in the forest, the hand the
   * next run will take, as the Deck orders it. */
  get hand(): readonly CardId[] {
    return this.run.hand ?? this.save.hand;
  }
  /** For each card of the hand, whether it is linked to the next (Card
   * Groups): the run's links, or in the forest the saved ones. */
  get links(): readonly boolean[] {
    return linkedToNext(this.hand, this.run.hand ? this.run.links ?? [] : this.save.cardLinks);
  }
  /** Whether a tapped tile shows the route there and its totals: the
   * Courage skill Pathfinder owned, or Dev mode. */
  get showsRoutes() {
    return !!this.save.upgrades.pathfinder || this.save.settings.devMode;
  }
  /** Whether a run's Training can be bought with Silver inside it: On the
   * Job owned, or every page shown in Dev mode. */
  get trainsOnTheJob() {
    return !!this.save.upgrades.onTheJob || this.save.settings.devMode;
  }
  /** Buys the Shop's offer `id` at `serverNow`, a server time confirmed
   * for this purchase (the Shop's clock records it): with its price, or,
   * for a real-money offer, once the store confirms it was paid (`paid`);
   * Dev free purchases pay nothing. Returns why it was refused, or null
   * once bought. */
  buyOffer(id: OfferId, serverNow: number, paid = false): Refusal | null {
    const o = offer(id);
    if (!o) return "locked";
    confirmServerTime(this.save.shop.clock, serverNow, this.clock());
    // The Event Booster is the running event's.
    if (o.item?.kind === "eventBoost") this.events.refresh();
    this.training.settle();
    const pace = this.training.pace;
    const t = purchase(this.save, o, serverNow, this.payment(paid));
    if (typeof t === "string") return t;
    // A pack's training speed starts from now.
    this.training.repace(pace);
    // Ad-Disable's ×1.5 Gold is for good: the Gold ad's stored time goes.
    if (adsOff(this.save)) this.save.goldBoostUntil = 0;
    if (id === "dailyGems") this.events.record("freeGems");
    this.message = o.item?.kind === "entitlement" ? `${t.item}: yours for good` : `+${t.item}`;
    return null;
  }
  /** How a Shop purchase is paid: for nothing (Dev), by the store, or with its price. */
  private payment(paid: boolean) {
    if (this.free) return "free";
    return paid ? "store" : "price";
  }
  /** Buys ranks of Training `id` for this run with its Silver, one or as
   * many as Buy Quantity `quantity` takes (`runTrainingBulk`): they count
   * from the next turn on, until the run ends. Each purchase is a turn of
   * its own, so undo takes it back. Bought while a fight plays out, they
   * count in that fight from its next strike (`retrainFight`). Refused
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
    if (this.encounter && (isStatRow(first.row) || id === "revive")) this.retrainFight(this.encounter, hpGain);
    this.message = `${first.row.name} trained for this run · level ${first.level + bulk.count}`;
    // Undo takes the ranks back, so only the run's most bought counts.
    const bought = Object.values(this.run.training ?? {}).reduce((n, k) => n + (k ?? 0), 0);
    this.missions.mark("runTraining", this.mode, this.run.seed, bought);
    this.afterPlayerAction();
    return true;
  }
  /** The Buy Quantity choices open: x1 once the Buy Quantity skill is owned
   * (or in Dev mode), and one more per level of its research; none before. */
  get buyQuantities(): readonly BuyQuantity[] {
    return this.save.upgrades.buyQuantity || this.save.settings.devMode ? openQuantities(researched(this.save.archives, "buyQuantity", 0)) : [];
  }
  /** How many ranks a press buys on `scope`'s screen (the Training tab,
   * the run's training bar, or the Gear page's provisions, each its own
   * saved choice): the quantity chosen, while it is open, else one. */
  buyQuantityFor(scope: QuantityScope): BuyQuantity {
    const chosen = this.save.settings[QUANTITY_SETTINGS[scope]];
    return this.buyQuantities.includes(chosen) ? chosen : 1;
  }
  /** How many ranks a Training tab press buys. */
  get buyQuantity(): BuyQuantity {
    return this.buyQuantityFor("training");
  }
  /** Chooses `scope`'s Buy Quantity (the Training tab's by default), if it is open. */
  setBuyQuantity(q: BuyQuantity, scope: QuantityScope = "training") {
    if (!this.buyQuantities.includes(q)) return false;
    this.save.settings[QUANTITY_SETTINGS[scope]] = q;
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
    return this.trainsOnTheJob && this.playing && !this.encounter?.summary;
  }
  /** A stat row's rank bought for the run: the hero and the run's loadout
   * gain what the rank from `level` adds, times the stat's research. Returns the
   * max HP it added. */
  private raiseRunStat(row: StatTrainingRow, level: number) {
    const stat = row.stat, p = this.run.player,
      gain = snap((trained(row, level + 1) - trained(row, level)) * statFactor(this.save, stat) * boonFactor(this.run, stat));
    p[stat] = snap((p[stat] ?? 0) + gain);
    const kept = this.run.loadout;
    if (kept) kept[stat] = snap((kept[stat] ?? 0) + gain);
    // More maximum HP comes with the HP to fill it.
    if (stat === "maxHp") p.hp = snap(p.hp + gain);
    return stat === "maxHp" ? gain : 0;
  }
  /** Find Potion bought for the run: its chance of percent potions rises,
   * and the floor stood on shows its new percent potions at once. */
  private raisePercentPotions() {
    const chance = percentPotionChance(this.trainingNow);
    this.run.percentPotions = chance;
    if (this.world instanceof RoomWorld) this.world.percentPotions = chance;
  }
  /** Training bought while a fight plays out counts in it from the first
   * strike not yet swinging: the fight plays on from there with the hero's
   * stats as they are now (more max HP raising the HP left by `hpGain`),
   * and the step commits the new ending once it is over. */
  private retrainFight(fight: Encounter, hpGain: number) {
    const p = this.run.player, strikes = fight.bout.strikes, elapsed = performance.now() - fight.start;
    let from = strikes.findIndex((s) => s.start > elapsed);
    if (from < 0) from = strikes.length;
    let hp = p.hp, shroud = p.shroud ?? 0;
    for (const s of strikes.slice(0, from)) {
      if (s.by === "hero") {
        // Lifesteal's heal, and the HP shown with it, rise with the max HP bought.
        if (s.heroHp !== undefined) hp = s.heroHp = snap(s.heroHp + hpGain);
        continue;
      }
      // The HP shown so far rises with the max HP bought.
      if (s.hp) s.hp = snap(s.hp + hpGain);
      hp = s.hp;
      shroud = snap(Math.max(0, shroud - (s.shrouded ?? 0)));
    }
    fight.bout = resume(fight.bout, from, { player: { ...p, hp, shroud }, enemy: fight.enemy, revives: this.revival(fight.to), crits: this.critRolls(fight.to) });
    this.showRevivals(fight.start, revivals(fight.bout));
    this.restate(fight.outcome, fight.bout);
    Object.assign(fight.outcome.player, { attack: p.attack, defense: p.defense, maxHp: p.maxHp });
  }
  /** Makes `o`, a fight's resolved step, end as the fight `played` does: the
   * damage taken, the HP left and whether the hero lives, and whether the
   * first strike won (or the enemy's thorns felled it). */
  private restate(o: StepEffect, played: Bout) {
    const p = this.run.player, damage = snap(played.strikes.reduce((sum, s) => (s.by === "enemy" ? sum + s.damage : sum), 0));
    // A badge's scale adds to (or gives back) the new fight's damage.
    if (o.scale) o.extraDamage = snap(damage * o.scale - damage);
    const rules = this.stepRules, fought = afterExtra(heroHpAfter(played, p.hp), o.extraDamage, p.maxHp);
    o.player.hp = regenerate(healAfterVictory(fought, p.maxHp, rules), p.maxHp, rules);
    const { thornKill: _, ...combat } = o.combat!, last = played.strikes.at(-1);
    o.combat = { ...combat, turns: played.strikes.filter((s) => s.by === "hero").length, damage, survivable: fought > 0, ...(last?.thornHp === 0 && fought > 0 ? { thornKill: true as const } : {}) };
  }
  /** Whether skill `id` can be bought now: open, below its last rank, and
   * paid for by the currency held (anything, with Dev free purchases). */
  canBuySkill(id: UpgradeId) {
    if (!skillAvailable(id, this.save.upgrades)) return false;
    const u = UPGRADES.find((u) => u.id === id)!, n = this.save.upgrades[id];
    const held = u.currency === "courage" ? this.save.delve.courage : this.save.tower.inspiration;
    return n < u.max && (this.free || cost(id, n) <= held);
  }
  /** Whether `tree`'s tab (and the Upgrades button leading to it) wears a
   * dot: in the forest, after a run that earned the tree's currency
   * (Inspiration from the Tower, Courage from the Delve), while a skill in
   * it can be bought (so never while the tree is locked). Showing that tree
   * clears it. */
  treeWaiting(tree: NoticeTree) {
    return this.save.treeNotices[tree] && !!this.run.outside &&
      TREES.find((t) => t.id === tree)!.nodes.some((n) => this.canBuySkill(n.id));
  }
  buy(id: UpgradeId) {
    if (!this.canBuySkill(id)) return false;
    const u = UPGRADES.find((u) => u.id === id)!, n = this.save.upgrades[id];
    if (!this.spendTreeCurrency(u.currency === "courage", cost(id, n))) return false;
    this.save.upgrades[id]++;
    readyForestRuns(this.save);
    return true;
  }
  /** Pays `price` in Courage, or else Inspiration (nothing with Dev free
   * purchases); false when short. */
  private spendTreeCurrency(courage: boolean, price: number) {
    if (this.free) return true;
    const save = this.save;
    if (price > (courage ? save.delve.courage : save.tower.inspiration)) return false;
    if (courage) save.delve.courage -= price;
    else save.tower.inspiration -= price;
    return true;
  }
  /** The wall clock the Archives' research runs on (ms); tests set it. */
  clock: () => number = () => Date.now();
  /** Records a potion's heal of `n` HP, already applied, where the hero stands. */
  private recordHeal(n: number) {
    if (n <= 0) return;
    const p = this.run.player;
    this.lastHeal = { from: p.hp - n, to: p.hp, x: p.x, y: p.y, id: (this.lastHeal?.id ?? 0) + 1 };
  }
}

/** A fight the hero won: the enemy beaten at `at`, the HP it cost, and
 * how many times the hero revived in it. */
/** A fight won: `instakill` when the hero's first strike ended it (Mug). */
type FightEnd = { enemy: Enemy; damage: number; at: { x: number; y: number }; revived: number; scale?: number; instakill?: boolean; crits?: number };
/** How many of a fight's strikes were the hero's critical ones. */
const critHits = (fight: Bout) => fight.strikes.filter((s) => s.by === "hero" && s.crit).length;

/** HP left after a fight's own damage, `hp`, once a badge's scale has
 * added `extra` (or, below 0, given it back, up to `maxHp`). */
const afterExtra = (hp: number, extra = 0, maxHp = Infinity) => (extra ? snap(Math.min(maxHp, Math.max(0, hp - extra))) : hp);
/** How Skip's message names what vanished, by tile kind. */
/** The screens that keep their own Buy Quantity, and the setting each saves it in. */
export type QuantityScope = "training" | "run" | "provisions";
const QUANTITY_SETTINGS = { training: "buyQuantity", run: "runBuyQuantity", provisions: "provisionBuyQuantity" } as const;
const SKIPPED_NAMES: Partial<Record<Tile["kind"], string>> = { door: "The door", key: "The key", potion: "The potion", attack: "The ATK shard", defense: "The DEF shard", treasure: "The chest", reward: "The chest" };

/** How the status line opens on a fight won. */
/** Cells found, as "+3 Cells" (to two decimals when a badge's scale left
 * a fraction). */
const cellsText = (cells: number) => `+${keyCount(cells)} ${keyCount(cells) === "1" ? "Cell" : "Cells"}`;
function fightText({ enemy, damage, revived }: FightEnd) {
  if (revived) return `Revived · ${enemyTitle(enemy)} defeated`;
  return damage ? `−${wholeChange(damage)} HP · ${enemyTitle(enemy)} defeated` : "Unscathed victory";
}

/** What a kill gave toward Equipment: the status line's words for each, and
 * the icon that rises off the board for it (a material with its count, or
 * the piece itself). */
function equipmentGains(loot: EquipmentLoot | null): { text: string; art: GainArt }[] {
  if (!loot) return [];
  const gains: { text: string; art: GainArt }[] = [];
  if (loot.materials) gains.push({ text: `+${loot.materials.quantity} ${EQUIP_MATERIALS[loot.materials.id].name}`, art: { equipMaterial: loot.materials.id, quantity: loot.materials.quantity } });
  if (loot.item) gains.push({ text: `${RARITY_TIERS[loot.item.rarity].name} ${itemDef(loot.item.def)!.name}!`, art: { equipPiece: loot.item.def, rarity: loot.item.rarity } });
  if (loot.salvaged) gains.push({ text: `${loot.salvaged.auto ? "Auto-salvaged" : "Inventory full"} · +${loot.salvaged.quantity} ${EQUIP_MATERIALS[loot.salvaged.id].name}`, art: { equipMaterial: loot.salvaged.id, quantity: loot.salvaged.quantity } });
  return gains;
}
/** A kill's Gold (when it paid any) and Silver, as the status line names them. */
const coinsText = (gold: number, silver: number) => [...(gold ? [`+${wholeChange(gold)} Gold`] : []), `+${wholeChange(silver)} Silver`];

/** What picking up `t` shows: the key, the HP a potion healed, or the
 * shard's stat under `rules`; null for anything else. */
function pickupText(t: Tile, outcome: StepEffect, rules: StepRules) {
  switch (t.kind) {
    case "key": return `+${keyCount(outcome.keyAmount ?? 1)} ${t.color} key`;
    case "potion": return `+${wholeChange(outcome.healed)} HP`;
    case "attack": return `+${enemyStat(shardStat(t, rules))} attack`;
    case "defense": return `+${enemyStat(shardStat(t, rules))} defense`;
    default: return null;
  }
}

/** "+2 Slime Gels": a material reward as the board and status line name it. */
const materialText = (m: MaterialStack) => `+${m.quantity} ${materialDef(m.id).name}${m.quantity > 1 ? "s" : ""}`;
