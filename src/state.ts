import { entrance, floorFor } from "./delve/labyrinth.ts";
import { buyTheme, canWear, grantAllThemes, type GameLook, type ThemeId, type ThemeKind, type UiLook } from "./theme-collection.ts";
import { chooseStep } from "./automation.ts";
import { CARDS, cardText, explainStuck, handBonus, keptLinks, planHand, planTarget, shootsWith, stillOpen, type CardId, type CardPlan, type HandBonus, type StuckReport } from "./cards.ts";
import { aggroTurn } from "./flying.ts";
import { foeOn } from "./ranged.ts";
import { BADGE_IDS, MAX_COPIES, badgeOn, badgeValue, runBadges } from "./badges.ts";
import { adsOff, BOOST_FOREVER, permanentBoost } from "./shop/entitlements.ts";
import { noteGoldBoost } from "./gold-boost.ts";
import { offer, type OfferId } from "./shop/offers.ts";
import { purchase, type Refusal } from "./shop/transactions.ts";
import { confirmServerTime } from "./shop/clock.ts";
import { canWarp, claimGoal, goalUnlocked } from "./goals.ts";
import { volleyTurn, type Shot, type Volley } from "./volley.ts";
import { missGem } from "./gems.ts";
import { DelvePlan } from "./delve/automove.ts";
import { defaults } from "./save.ts";
import { stampProfile } from "./profile.ts";
import { defaultFinds, newNotes, noteKey, notesOf } from "./run-notes.ts";
import { stream, tileRandom } from "./random.ts";
import { freeTrainingLines, rollFreeTraining } from "./free-training.ts";
import { doorBlockedMessage, doorName, doorRule, drainsHp, KEY_ORDER, pickupGold } from "./doors.ts";
import type { SettingKey } from "./settings.ts";
import { skillAvailable } from "./skill-trees.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import {
  TOWER_START_X,
  TOWER_SECTION,
  xpForKill,
  levelForXp,
  TRAINING_PER_LEVEL,
  isStatRow,
  cost,
  UPGRADES,
  trainedAmount,
  type UpgradeId,
  type TrainingId,
  type StatTrainingRow,
} from "./config.ts";
import type { Save, ModeSave } from "./save-shape.ts";
import type {
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
import { litTorches, type Board } from "./board.ts";
import { instakill, type CritRule } from "./combat.ts";
import { HEART_DOOR_HP, isLethal, resolveStep, type StepBlocked, type StepEffect, type StepRules, shardStat } from "./step-effects.ts";
import { OUTSIDE_START_Y, OutsideWorld } from "./outside.ts";
import { AREA_BURST_MS, AreaLedger, chestReward, clearedInspiration, type AreaReward } from "./tower/area-ledger.ts";
import { TowerClimb } from "./tower/climb.ts";
import { callsGreaterBoss, greaterBoss, greaterBossSpot } from "./tower/greater-boss.ts";
import { strengthOdds, traitOdds, type OddsSource } from "./enemy-odds.ts";
import { STEPS_PER_FLOOR } from "./enemy-curves.ts";
import { materialDef, MATERIALS } from "./materials.ts";
import { switchTier, tierNumeral, tierRewardText, tierXp } from "./tiers.ts";
import type { GoldContext } from "./gold-multipliers.ts";
import { RunTimeline } from "./run-timeline.ts";
import { shiftHero } from "./hero-stats.ts";
import { enemyTitle } from "./scaling.ts";
import { snap } from "./exact.ts";
import { enemyStat, keyCount, whole, wholeChange } from "./whole.ts";
import { MODES, milestones, type ModeProfile } from "./modes.ts";
import { ranksInRun, runTrainingBulk, runTrainingOffer, type RunTrainingOffer } from "./run-training.ts";
import { openQuantities, type BuyQuantity } from "./buy-quantity.ts";
import { critRule, loadout, rankShift, type TrainingView } from "./loadout.ts";
import { researched } from "./archives.ts";
import { chargesLeft, chargesPerRun, climbFloor, spendCharge, type Charge } from "./run-charges.ts";
import type { MaterialId, MaterialStack } from "./materials.ts";
import { TrainingDesk } from "./game/training-desk.ts";
import { ResearchDesk } from "./game/research-desk.ts";
import { DeckEditor } from "./game/deck-editor.ts";
import { GearDesk } from "./game/gear-desk.ts";
import { GemFinder } from "./game/gem-finder.ts";
import { BadgeDesk } from "./game/badge-desk.ts";
import { HandRules } from "./hand-rules.ts";
import { RunPurse, type EquipmentLoot } from "./game/run-purse.ts";
import { EquipmentDesk } from "./game/equipment-desk.ts";
import { TournamentDesk } from "./game/tournament-desk.ts";
import { MailDesk } from "./game/mail-desk.ts";
import { MissionDesk } from "./game/mission-desk.ts";
import { EventDesk } from "./game/event-desk.ts";
import { ShrineDesk } from "./game/shrine-desk.ts";
import { NoticeDesk } from "./game/notice-desk.ts";
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
import { CardActivation } from "./game/card-activation.ts";
import { Finds } from "./game/finds.ts";
import { FightPlayback } from "./game/fight-playback.ts";
import type { Coin, Dash, Drop, Facing, Gain, GainArt, Heal } from "./shown.ts";
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
/** The gains a Settings row can turn off: ATK, DEF and HP changed, keys
 * found, what a door takes, Gold and Silver found, what a fight costs
 * past its strikes, XP gained and the Gold combo. */
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
/** The speed the second floor's lesson teaches: one press of › from a new
 * hero's 2. */
const LESSON_SPEED = 3;
/** How long a shot or arrow flies, at most (ms): it lands as the hero's
 * step ends, sooner at higher speeds. */
const FLIGHT_MS = 220;
/** Salts the run seed for Find Yellow Key's roll on each new floor. */
const YELLOW_KEY_SALT = 0x6e11a;
/** A step resolved and about to be taken: the tile stepped onto, what it
 * does, where it is, whether it goes in the undo history, and for a fight
 * the hero's critical strikes in it as played (`crits`). */
type TakenStep = { tile: Tile; outcome: StepEffect; dest: { x: number; y: number }; track: boolean; quiet?: boolean; crits?: number; card: CardStep };
/** How the hand's turn takes a step: Effective or Dampen on a card's last
 * step (`scale`, what its target's effect is multiplied by; 1 on every
 * other step), Skip on STAIRS succeeding (`floorSkip`: the climb goes up
 * two floors), and a Dash holding the turn open across its tiles (`hold`,
 * so its shots come once it stops). */
export type CardStep = { scale?: number; floorSkip?: boolean; hold?: boolean };
/** Tiles that stay on the board after being stepped on. */
const PERMANENT_TILES = new Set<Tile["kind"]>(["floor", "stairs", "oneway", "openedChest"]);
/** The targets a Dash may end on, a tile of it left: items to take. */
const DASH_ONTO = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "treasure", "reward"]);
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
  /** The latest turn's shots (ranged.ts), for the board to fly and land;
   * undo, a new run or a mode switch clears it. */
  volley: Volley | null = null;
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
  /** When Equipment opened (performance.now()), for the
   * board's burst. */
  /** Where a Greater Boss last appeared, and when (performance.now()), for
   * the board's poof; cleared by undo. */
  summoned: { x: number; y: number; at: number } | null = null;
  /** Where Skip last made a card's target vanish, and when
   * (performance.now()), for the board's poof; cleared by undo. */
  vanished: { x: number; y: number; at: number } | null = null;
  /** The latest dash: the tiles the hero dashed off, in order, and when
   * (performance.now()), for the board's fading echoes of the hero. */
  dash: Dash | null = null;
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
  /** The Deck page's card badges: drawing them with Gems and attaching
   * them to cards. */
  readonly badges = new BadgeDesk(this);
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
  /** In Dev mode, gives every theme not owned yet and returns them, for
   * the player to hear about; otherwise none. */
  claimThemes(): ThemeId[] {
    return this.save.settings.devMode ? grantAllThemes(this.save) : [];
  }
  /** Buys a theme not owned yet (`THEME_PRICE`); false when it can't. */
  buyTheme(id: ThemeId) {
    return buyTheme(this.save, id);
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
    this.fights.finish();
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
    if (!this.run.outside && this.handStartsPlaying && !this.fallen) this.playHand();
    else this.auto = false;
    this.stopPlay();
  }
  /** Stops the play under way, for a run restored, loaded or begun: the
   * route walked, a fight or volley playing out, the hand's plan and a
   * refused step's mark (which would stand on the wrong tile of a new
   * board). */
  private stopPlay() {
    this.route = [];
    this.fights.clear();
    this.volley = null;
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
    this.areaBursts = [];
    this.summoned = null;
    this.vanished = null;
    this.save.xp = snapshot.xp;
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
    return this.paused || this.fallen || !!this.fights.encounter;
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
    while (!plan && this.handRules.raiseBang()) plan = planHand(this.handRules, this.hand, this.mode);
    this.handStuck = !plan;
    if (!plan) return this.handWaits();
    this.activeCard = plan.card;
    const id = this.hand[plan.card];
    this.message = lost ? `Focus lost · ${CARDS[lost].name} has no path to a target · ${CARDS[id].name} leads.`
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
    // The card's last step reaches its target: a focus on it is spent, and
    // it activates (once a fight into its target has played out). FLYING
    // ENEMY's last step only brings an enemy in reach: nothing activates.
    if (id === this.run.focused) this.run.focused = undefined;
    if (id === "flyingEnemy") return;
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
    if (plan && this.handRules.gateShut(this.hand[plan.card])) this.cardPlan = null;
  }
  /** The path the hand follows this turn: the one committed, else the
   * focused card's while it has a path to a target (`lost` once it has
   * none), else the first card's in priority order that can act. */
  private nextHandPlan(): { plan: CardPlan | null; lost: CardId | null } {
    if (this.cardPlan) return { plan: this.cardPlan, lost: null };
    const focused = this.run.focused;
    if (!focused) return { plan: planHand(this.handRules, this.hand, this.mode), lost: null };
    const plan = planHand(this.handRules, this.hand, this.mode, this.hand.indexOf(focused));
    if (plan) return { plan, lost: null };
    this.run.focused = undefined;
    return { plan: planHand(this.handRules, this.hand, this.mode), lost: focused };
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
    return explainStuck(this.handRules, this.hand);
  }
  /** The status line for card `id` leading the hand. */
  private cardMessage(id: CardId) {
    return `${id === this.run.focused ? "Focus · " : ""}${CARDS[id].name} · ${cardText(id, this.save.upgrades)}`;
  }
  /** After something the player does inside a run (an item used, a skill),
   * a stuck hand checks its cards again and plays on if one can act. */
  private afterPlayerAction() {
    if (!this.handStuck || !this.playing) return;
    const plan = planHand(this.handRules, this.hand, this.mode);
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
    const chance = trainedAmount(this.save, "findPotion");
    if (chance) this.run.percentPotions = chance;
    else delete this.run.percentPotions;
    const odds = this.chestOddsFor(this.run.hand);
    if (odds) this.run.chestOdds = odds;
    else delete this.run.chestOdds;
    // The hero strikes the enemies each enemy card covers harder (combat.ts reads it).
    const foes = Object.entries(handBonus(this.run.hand).foe).map(([id, b]) => [id, b.attack]);
    if (foes.length) this.run.player.foeAttack = Object.fromEntries(foes);
    else delete this.run.player.foeAttack;
    this.run.focusUsed = 0;
    for (const k of ["ignoreUsed", "targetUsed", "regain", "ignored", "targeted"] as const) delete this.run[k];
  }
  /** A run's chances of Supply and Equipment Chests with `hand`: the
   * hand's (the CHEST card's), raised by the worn Supply and Equipment Chest
   * chance; none before Equipment opens or without a card that gives one. */
  private chestOddsFor(hand: readonly CardId[]): ChestOdds | undefined {
    const { chest } = handBonus(hand);
    if (!this.save.equipment.unlocked || !(chest.supply + chest.equipment)) return undefined;
    const find = wornEffects(this.save, this.mode).chestFind;
    return { supply: raised(chest.supply, find), equipment: raised(chest.equipment, find) };
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
  /** What the Gold multipliers read now (`gold-multipliers.ts`): the
   * Shrine Boons line is the boons' Gold factor inside a Tower run once
   * Shrines are open (1 with none), else none. */
  get goldContext(): GoldContext {
    return { save: this.save, mode: this.mode, tier: this.tier, now: this.clock(), shrine: this.shrine.open ? this.boons?.gold ?? 1 : undefined };
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
      : snap((this.run.player.regen * researched(this.save.archives, "regenPercent")) / 100);
    const worn = this.worn, potionHeal = raised(researched(this.save.archives, "potionHeal"), worn.potionHeal);
    const crit = this.crit, keys = Object.entries(this.handBonus.keys);
    const keyFind = keys.length ? { keyFind: Object.fromEntries(keys.map(([color, k]) => [color, k.percent])) } : {};
    return { potionHeal, percentPotion: trainedAmount(this.trainingNow, "potion"), regen,
      heartToll: researched(this.save.archives, "heartToll"), keyCost: this.keyCost, ...keyFind,
      shardAttack: researched(this.save.archives, "shardAttackPercent") * boonFactor(this.run, "attack"), shardDefense: researched(this.save.archives, "shardDefensePercent"),
      ...(worn.victoryHeal ? { victoryHeal: worn.victoryHeal } : {}), ...(crit ? { crit } : {}) };
  }
  /** Revive's chance now (its training, the run's Silver ranks counting). */
  get reviveChance() {
    return trainedAmount(this.trainingNow, "revive");
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
    return researched(this.save.archives, "keyCost");
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
    return snap(researched(this.save.archives, "startingSilver") + this.worn.startSilver);
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
    const plan = planHand(this.handRules, this.hand, this.mode, card);
    if (!plan) return "noPath";
    this.run.focusUsed = (this.run.focusUsed ?? 0) + 1;
    this.missions.mark("focus", this.mode, this.run.seed, this.run.focusUsed);
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
    const xp = tierXp(this.tier, xpForKill(enemy.strength, floor)), gain = this.worn.xpGain;
    const raisedXp = gain ? Math.round((xp * (100 + gain)) / 100) : xp;
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
    this.route = [];
    const tournament = this.tournamentRun;
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
    // The step is resolved once, before any snapshot/undo bookkeeping, so a
    // wall, lock, impervious enemy, or (automation's) declined lethal fight
    // never touches history, damages the player, alters the enemy, or ends the run.
    const rules: StepRules = { ...this.stepRules, ...(regen ? {} : { regen: 0 }), ...(card.scale !== undefined && card.scale !== 1 ? { scale: card.scale } : {}) };
    const outcome = resolveStep(p, t, rules);
    if (outcome.blocked) return this.rejectStep(outcome, t, dest.x, dest.y);
    if (!force && isLethal(outcome)) {
      this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
      return false;
    }
    const step: TakenStep = { tile: t, outcome, dest, track, quiet: this.emptyAt(dest.x, dest.y), card };
    this.facing = { dx, dy };
    return t.kind === "enemy" ? this.fights.fight(step, t.enemy!) : this.take(step);
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
    this.gemFinder.step();
    if (!step.card.hold) this.endTurn();
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
    if (t.kind === "door") this.finds.door(t, outcome.keysSpent, drained, dest, outcome.keyAmount);
    if (t.kind !== "enemy") return true;
    const extra = outcome.extraDamage ?? 0, p = this.run.player;
    // Effective's added damage rises off the hero; Dampen's given back heals.
    if (extra > 0 && p.hp > 0) this.gain(p.x, p.y, `−${wholeChange(extra)} HP`, { heart: true }, undefined, "hit");
    else if (extra < 0) this.recordHeal(-extra);
    return this.winFight({ enemy: t.enemy!, damage: snap(outcome.combat!.damage + extra), at: dest, revived, scale: outcome.scale, instakill: instakill(outcome.combat!), crits }, before);
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
      if (t.kind === "stairs") this.enterFromOutside();
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
  /** The end of a turn inside a run (a step, or a whole dash): each Ranged
   * enemy within reach whose cooldown is ready shoots the hero where it now
   * stands, then the Archer, its arrow ready, shoots the closest enemy in
   * its range (ranged.ts). Nothing before the third tier unless the hero is
   * an Archer; a turn that climbs to another floor leaves its shooters behind. */
  private endTurn() {
    const before = this.turnBefore;
    this.turnBefore = null;
    const archer = this.isArcher;
    if (!before || this.run.outside || this.fallen || (this.tier < 3 && !archer)) return;
    if (this.mode === "tower" && before.run.height !== this.run.height) return;
    const v = this.run.volleys ?? { turn: 0 }, p = this.run.player;
    const out = volleyTurn({ board: this.world, wrap: this.wrap, floorOf: (x, y) => this.floorOf(x, y), hero: p, seed: this.run.seed,
      volleys: { ...v, turn: v.turn + 1 }, archer, ranks: { ...this.trainingNow, archives: this.save.archives }, handShot: this.handBonus.shot });
    this.run.volleys = out.volleys;
    p.hp = out.hp;
    if (out.hurt) {
      this.markDamaged();
      this.events.hurt(this.mode, this.run.seed);
      const taken = out.shots.reduce((sum, s) => (s.by === "enemy" ? snap(sum + s.damage) : sum), 0);
      if (!out.fell) this.message = `Shot · −${wholeChange(taken)} HP`;
    }
    for (const { enemy, at, instakill, crits } of out.kills)
      this.message = [`Arrow · ${enemyTitle(enemy)} defeated`, ...this.finds.kill(enemy, at, 1, instakill, crits ? 1 : 0)].join(" · ");
    this.showVolley(out.shots);
    if (out.fell) {
      this.fallIn(before, out.fell);
      this.message = `Shot down by ${enemyTitle(out.fell)}.`;
      return;
    }
    // Then the Aggroed enemies close in (flying.ts), their cooldowns with them.
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
    return this.isArcher && !this.run.outside ? { range: trainedAmount(this.trainingNow, "attackRange"), wrap: this.wrap } : undefined;
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
  /** The board flies the turn's shots, landing as the step ends. */
  private showVolley(shots: Shot[]) {
    if (!shots.length) return;
    this.volley = { at: performance.now(), flight: Math.min(FLIGHT_MS, 800 / Math.max(1, this.stepsPerSecond)), shots };
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
  /** What the floor the hero stands on can roll (`enemy-odds.ts`): each
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
      this.regainCharges(at);
      this.floorHeal();
    }
    this.freeTrain(last - floorBefore);
    this.finds.coins(at, gold, silver, false);
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
    const chance = researched(this.save.archives, "yellowKeyChance");
    if (!chance || tileRandom(-1, floor, (this.run.seed ^ YELLOW_KEY_SALT) | 0) * 1000 >= chance) return;
    const keys = this.run.player.keys;
    keys.yellow = snap(keys.yellow + 1);
    noteKey(this.run, "yellow", 1);
    this.gain(at.x, at.y, "+1 yellow key", { tile: { kind: "key", color: "yellow" } });
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
    const skipped = floorSkip ? this.climb.up() : null;
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
  /** The live run's tournament, when it is a tournament run (only a Delve
   * run can be). */
  get tournamentRun(): TournamentRun | undefined {
    return this.mode === "delve" ? this.delveRun.tournament : undefined;
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
  /** Whether the hero is an Archer: the hand (in the forest, the next
   * run's) holds the ARCHER card (`shootsWith`). Its arrows fly only inside
   * a run. */
  get isArcher() {
    return shootsWith(this.hand);
  }
  /** What the cards of the run's hand give while held (`handBonus`): none
   * in the forest. */
  get handBonus(): HandBonus {
    return handBonus(this.run.outside ? [] : this.hand);
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
    return this.save.upgrades.buyQuantity || this.save.settings.devMode ? openQuantities(researched(this.save.archives, "buyQuantity")) : [];
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
    return this.trainsOnTheJob && this.playing && !this.fights.encounter?.summary;
  }
  /** A stat row's rank bought for the run: the hero and the run's loadout
   * gain what the rank from `level` adds (`rankShift`). Returns the max HP
   * it added. */
  private raiseRunStat(row: StatTrainingRow, level: number) {
    return shiftHero(this.run, { [row.stat]: rankShift(this.save, this.mode, row, level, level + 1) }).maxHp ?? 0;
  }
  /** Find Potion bought for the run: its chance of percent potions rises,
   * and the floor stood on shows its new percent potions at once. */
  private raisePercentPotions() {
    const chance = trainedAmount(this.trainingNow, "findPotion");
    this.run.percentPotions = chance;
    if (this.world instanceof RoomWorld) this.world.percentPotions = chance;
  }
  /** Whether skill `id` can be bought now: open, below its last rank, and
   * paid for by the currency held (anything, with Dev free purchases). */
  canBuySkill(id: UpgradeId) {
    if (!skillAvailable(id, this.save.upgrades)) return false;
    const u = UPGRADES.find((u) => u.id === id)!, n = this.save.upgrades[id];
    const held = u.currency === "courage" ? this.save.delve.courage : this.save.tower.inspiration;
    return n < u.max && (this.free || cost(id, n) <= held);
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
  recordHeal(n: number) {
    if (n <= 0) return;
    const p = this.run.player;
    this.lastHeal = { from: p.hp - n, to: p.hp, x: p.x, y: p.y, id: (this.lastHeal?.id ?? 0) + 1 };
  }
}

/** A fight the hero won: the enemy beaten at `at`, the HP it cost, and
 * how many times the hero revived in it. */
/** A fight won: `instakill` when the hero's first strike ended it (Mug). */
type FightEnd = { enemy: Enemy; damage: number; at: { x: number; y: number }; revived: number; scale?: number; instakill?: boolean; crits?: number };

/** How Skip's message names what vanished, by tile kind. */
/** The screens that keep their own Buy Quantity, and the setting each saves it in. */
export type QuantityScope = "training" | "run" | "provisions";
const QUANTITY_SETTINGS = { training: "buyQuantity", run: "runBuyQuantity", provisions: "provisionBuyQuantity" } as const;
const SKIPPED_NAMES: Partial<Record<Tile["kind"], string>> = { door: "The door", key: "The key", potion: "The potion", attack: "The ATK shard", defense: "The DEF shard", treasure: "The chest", reward: "The chest" };

/** How the status line opens on a fight won. */
function fightText({ enemy, damage, revived }: FightEnd) {
  if (revived) return `Revived · ${enemyTitle(enemy)} defeated`;
  return damage ? `−${wholeChange(damage)} HP · ${enemyTitle(enemy)} defeated` : "Unscathed victory";
}

