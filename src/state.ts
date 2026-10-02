import { claimBoost, doneAt, finishGems, nextTrainerGems, trainingGold, trainingJob, trainingMs, trainingSlots, workLeft, type TrainingJob } from "./training-jobs.ts";
import { entrance, floorFor } from "./delve/labyrinth.ts";
import { chooseStep } from "./automation.ts";
import { CARDS, deckCards, handSlots, moveCard, nextHandSlotGems, placeCard, planHand, type CardId, type CardPlan } from "./cards.ts";
import { BOOST_FOREVER, goldFactor, permanentBoost } from "./shop/entitlements.ts";
import { offer, type OfferId } from "./shop/offers.ts";
import { purchase, type Refusal } from "./shop/transactions.ts";
import { confirmServerTime } from "./shop/clock.ts";
import { AD_COOLDOWN_MS, AD_GEMS, TRAINING_RESET_GEMS, collectedGem, gemOn, gemSpot, missGem, reachFloor, type GemSpot } from "./gems.ts";
import { DelvePlan } from "./delve/automove.ts";
import { defaults } from "./save.ts";
import { random, stream, tileRandom } from "./random.ts";
import { doorBlockedMessage, doorName, KEY_ORDER } from "./doors.ts";
import { skillAvailable } from "./skill-trees.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import {
  TOWER_START_X,
  TOWER_SECTION,
  xpForKill,
  levelForXp,
  TRAINING,
  TRAINING_PER_LEVEL,
  trainingOpen,
  isStatRow,
  trained,
  cost,
  UPGRADES,
  type UpgradeId,
  type TrainingId,
  type GoldItemId,
  type KeyColor,
  FOCUS_PER_RUN,
  ENEMY_GOLD,
  silverForKill,
  VIEWPORT_TILES,
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
  type ClearTier,
} from "./entities.ts";
import { World, LAYOUT_VERSION } from "./delve/world.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import type { Board } from "./board.ts";
import { bout, heroHpAfter, heroHpDuring, REVIVE_MS, revivals, summarize, type Bout, type CombatPrediction, type Revival } from "./combat.ts";
import { ATTACK_SHARD, DEFENSE_SHARD, isLethal, potionHeal, resolveStep, type StepBlocked, type StepEffect, type StepRules } from "./step-effects.ts";
import { OutsideWorld } from "./outside.ts";
import { ClearLedger } from "./tower/clear-ledger.ts";
import { TowerClimb } from "./tower/climb.ts";
import { materialDef, MATERIALS } from "./materials.ts";
import { rollTreasureLoot } from "./loot.ts";
import { TIERS, TIER_BOSS_FLOOR, switchTier, tierBonus, tierBonusText, tierGold, tierNumeral } from "./tiers.ts";
import { snap } from "./exact.ts";
import { whole, wholeChange, wholeHp } from "./whole.ts";
import { MODES, milestones, type ModeProfile } from "./modes.ts";
import { ranksInRun, runTrainingOffer } from "./run-training.ts";
import { floorGold, floorSilver, keepUndos, killGold, silverBonus, loadout, percentPotionChance, potionPercent, provisionOpen, provisionPrice, reviveChance, trainingMaxed, trainingPoints, trainingSpeed } from "./loadout.ts";
import { RESEARCH, cancelResearch, hastenResearch, hireArchivist, researched, settleArchives, startResearch, type ResearchId, type ResearchRecord } from "./archives.ts";
import { SETTINGS } from "./settings.ts";
import {
  creditMaterials,
  craftEquipment as craftEquipmentItem,
  salvageEquipment as salvageEquipmentItem,
  equipItem as equipItemAction,
  unequipSlot as unequipSlotAction,
  craftConsumable as craftConsumableItem,
  CONSUMABLES,
  type ConsumableId,
} from "./crafting.ts";
import type { EquipmentSlot } from "./equipment.ts";
import type { MaterialId, MaterialStack, MetalId } from "./materials.ts";
/** How a new run starts: out in the forest or at the entrance, and from
 * which seed (rolled from the game's randomness when left out). */
export type RunStart = { outside?: boolean; seed?: number };
export type RouteEffects = {
  hp: [number, number];
  attack: [number, number];
  defense: [number, number];
  keys: Partial<Record<KeyColor, [number, number]>>;
};
/** A reward just picked up, or what a door took, to rise from the tile it
 * came from: drawn as its sprite (a tile's contents, marked `spent` for a
 * key a door used, a material, or the heart a Heart Door checked), or as
 * `text` where it has none. */
export type Gain = { x: number; y: number; text: string; art: GainArt | null };
export type GainArt = { tile: Tile; spent?: true } | { material: MaterialId; quantity: number } | { heart: true } | { gem: true };
/** A potion's heal: the HP from and to, where the hero stood, and its number. */
export type Heal = { from: number; to: number; x: number; y: number; id: number };
/** Rewards kept for the board to show; older ones are dropped unseen. */
const MAX_GAINS = 12;
/** Salts the run seed for Revive's rolls, apart from the world's own. */
const REVIVE_SALT = 0x7e51e;
/** Salts the run seed for where a Gem lies on a floor. */
const GEM_SALT = 0x6e3a1;
/** The latest fight as the board shows it: the hero struck from `from`,
 * the enemy (`hp` at the start) stood at `to`, and its strikes land from
 * `start` (performance time). Played out, they are the fight's own; settled
 * at once (`summary`), they are its summary rounds (`summarize`). */
export type ShownFight = { from: { x: number; y: number }; to: { x: number; y: number }; bout: Bout; start: number; hp: number; summary: boolean };
/** A fight being shown before it counts: the hero waits at `from`, the
 * enemy stands at `to`, and nothing changes until `finishEncounter` settles
 * it (at `start + bout.duration`). */
export type Encounter = ShownFight & { settle: () => void };
/** Tiles that stay on the board after being stepped on. */
const PERMANENT_TILES = new Set<Tile["kind"]>(["floor", "stairs", "stairsDown", "oneway", "openedChest"]);
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
  /** The hand's card that made the latest step, to show it glowing. */
  activeCard: number | null = null;
  /** No card in the hand can act: the hand pauses, and the run ends only
   * when the player ends it. Each thing the player does (an item used, a
   * skill) checks the hand again, and it plays on once a card can act. */
  handStuck = false;
  paused = false;
  message = "";
  effect = { text: "", x: 0, y: 0, until: 0 };
  /** Rewards picked up since the board last took them, oldest first. */
  gains: Gain[] = [];
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
  /** When each of the latest fight's revivals lands (performance.now()),
   * for the board's golden fire; emptied by undo. */
  revivedAt: number[] = [];
  /** Where and when (performance.now()) the latest Gem was collected, for
   * the board's sparkle. */
  gemSparkle: { x: number; y: number; at: number } | null = null;
  /** Delve Automove's committed route and last weighed decisions. */
  readonly delvePlan = new DelvePlan();
  /** `rng` is the game's randomness: new run seeds, enemy drops and
   * treasure loot all draw from it (the `game` stream unless given), so a
   * seeded stream replays a game and no visual effect can shift it. */
  constructor(public save: Save, private rng: () => number = stream("game")) {
    this.loadMode();
  }
  /** Dev: whether every purchase is allowed and costs nothing (and research
   * takes no time). */
  get free() {
    return this.save.settings.freePurchases;
  }
  get undoCapacity() {
    return loadout(this.save).undoCapacity;
  }
  /** Grants unlimited currency, every Tower section, and every game mode.
   * Reversible: turning Dev Mode back off leaves the grants in place, since
   * there is no meaningful "undo" for progress the player has already seen. */
  setDevMode(on: boolean) {
    this.save.settings.devMode = on;
    if (!on) return;
    this.save.gold = 999_999_999;
    this.save.gems = 999_999_999;
    this.save.tower.inspiration = 999_999_999;
    this.save.delve.courage = 999_999_999;
    for (const material of MATERIALS) {
      if (material.category === "metal" || material.category.startsWith("monster-")) {
        this.save.materials[material.id] = 999_999_999;
      }
    }
    this.save.upgrades.delve = 1;
    this.save.upgrades.legacy = 1;
    const maxSection = Math.max(20, ...Object.keys(this.save.tower.sectionHp).map(Number)) + 5;
    for (let s = 1; s <= maxSection; s++) this.save.tower.sectionHp[s] ??= 999;
    this.save.tower.reached = Math.max(this.save.tower.reached, maxSection * TOWER_SECTION);
    this.save.tower.best = Math.max(this.save.tower.best, this.save.tower.reached);
    this.save.delve.reached = Math.max(this.save.delve.reached, maxSection * TOWER_SECTION);
    this.save.delve.best = Math.max(this.save.delve.best, this.save.delve.reached);
  }
  switchMode(next: Mode) {
    if (next === this.mode) return;
    if (next === "delve" && !this.save.upgrades.delve) return;
    this.finishEncounter();
    this.claimRewards();
    this.mode = next;
    this.loadMode();
  }
  loadMode() {
    const run = this.slice.run;
    if (!run) this.newRun();
    else {
      if (!run.outside) this.upgradeLayout();
      this.adoptRun(run);
    }
    this.syncRewards();
    this.recordProgress();
    this.route = [];
    this.auto = !this.run.outside && this.handStartsPlaying && !this.fallen;
    this.dropHandPlan();
    this.encounter = null;
    this.fight = null;
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
    return r.outside ? new OutsideWorld(r.seed, this.mode) : this.rules.board(r);
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
  /** The floor's geometry changed: stand at its entrance, and let
   * syncRewards pay out any clear chests whose old spots may now be wall. */
  private reshapeTower(run: TowerRun) {
    run.layoutVersion = TOWER_LAYOUT_VERSION;
    run.changes = {};
    run.floors = {};
    run.player.x = TOWER_START_X;
    run.player.y = 0;
  }
  /** Pays what the run still owes; returns whether it set a new record. */
  private payout(): boolean {
    const record = this.run.height > this.slice.reached;
    this.recordProgress();
    this.claimRewards();
    this.creditGold(tierGold(this.tier, this.rules.endGold(this.run)));
    return record;
  }
  snapshot(): MoveSnapshot {
    return { run: structuredClone(this.run), best: this.slice.best, xp: this.save.xp };
  }
  restore(snapshot: MoveSnapshot) {
    this.claimRewards();
    // The snapshot's board brings back any chest it had; one already paid
    // pays nothing when opened again.
    this.adoptRun(this.rewound(snapshot.run));
    this.syncRewards();
    // Lifetime achievements are never rolled back by movement undo, but XP
    // (and any level it reached) is: the kill it paid for is undone.
    this.recordProgress();
    if (levelForXp(snapshot.xp) < levelForXp(this.save.xp)) this.levelUpAt = -Infinity;
    this.revivedAt = [];
    this.save.xp = snapshot.xp;
    this.route = [];
    // Undo pauses the hand, so the player can act before it carries on.
    this.auto = false;
    this.dropHandPlan();
    this.encounter = null;
    this.fight = null;
    this.paused = false;
    this.blocked.until = 0;
  }
  /** A copy of an earlier state of the run. Damage taken and keys spent on
   * this floor stay on record, so undo never wins back a better clear tier. */
  private rewound(past: Run): Run {
    const run = structuredClone(past);
    if (this.mode !== "tower") return run;
    const now = this.towerRun, then = run as TowerRun;
    const sameRun = now.seed === then.seed;
    if (sameRun && now.damaged) then.damaged = true;
    if (sameRun && now.height === then.height && now.keysSpent) then.keysSpent = true;
    return run;
  }
  undo() {
    // A fight still playing out counts first, so undo takes it back.
    this.finishEncounter();
    const slice = this.slice;
    // Fallen, undo spends one and takes back the fight the hero fell in.
    const fall = this.fallen ? slice.fall : null;
    const snapshot = slice.history.pop();
    if (!snapshot) return false;
    slice.fall = null;
    this.restore(fall?.snapshot ?? snapshot);
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
  walkTo(x: number, y: number) {
    if (this.paused || this.fallen || this.encounter) return;
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
    if (route.length) {
      const slice = this.slice;
      slice.history.push(this.snapshot());
      slice.history = keepUndos(slice.history, this.undoCapacity);
    }
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
    this.route = [];
    this.auto = !this.auto;
    // Pausing keeps the path and the card that led it: playing on follows
    // it from where the hero stands. A stuck hand looks again.
    if (this.auto) this.handStuck = false;
    this.message = this.auto ? "The hand takes over." : "Paused · the hand waits.";
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
    let plan = this.cardPlan, lost: CardId | null = null;
    const focused = this.run.focused;
    if (!plan && focused) {
      // The focused card keeps the lead while it has a path to a target.
      plan = planHand(this, this.hand, this.mode, this.hand.indexOf(focused));
      if (!plan) {
        this.run.focused = undefined;
        lost = focused;
      }
    }
    plan ??= planHand(this, this.hand, this.mode);
    this.handStuck = !plan;
    if (!plan) {
      this.cardPlan = null;
      this.activeCard = null;
      this.auto = false;
      this.message = "No card can move · end the run, or use an item or skill.";
      return;
    }
    const step = plan.path.shift()!;
    this.cardPlan = plan.path.length ? plan : null;
    this.activeCard = plan.card;
    const id = this.hand[plan.card];
    this.message = lost
      ? `Focus lost · ${CARDS[lost].name} has no path to a target · ${CARDS[id].name} leads.`
      : `${id === this.run.focused ? "Focus · " : ""}${CARDS[id].name} · ${CARDS[id].text}`;
    // The board changes only as the hero moves, so a refused step means the
    // plan is stale: drop it and let the next turn choose again.
    if (!this.move(step.dx, step.dy, true)) this.cardPlan = null;
    // The focused card's last step reaches its target: the focus is spent.
    else if (!this.cardPlan && id === this.run.focused) this.run.focused = undefined;
  }
  /** After something the player does inside a run (an item used, a skill),
   * a stuck hand checks its cards again and plays on if one can act. */
  private afterPlayerAction() {
    if (!this.handStuck || !this.playing) return;
    const plan = planHand(this, this.hand, this.mode);
    if (!plan) return;
    this.handStuck = false;
    this.cardPlan = plan;
    this.auto = true;
  }
  /** A run going inside keeps the hand as it was ordered on the way in,
   * gets its Focus uses, and fixes its chance of percent potions. */
  private dealHand() {
    this.run.hand = [...this.save.hand];
    const chance = percentPotionChance(this.save);
    if (chance) this.run.percentPotions = chance;
    else delete this.run.percentPotions;
    this.run.focusUsed = 0;
  }
  /** The fastest Movement speed the player may choose: 3 steps a second,
   * and one more a Movement Speed research level. */
  get maxSpeed() {
    return 3 + researched(this.save.archives, "moveSpeed", 0);
  }
  /** Whether fights play out strike by strike: always, until Instant
   * Combat opens the Animate fights setting to turn it off. */
  get animatesFights() {
    return !this.save.upgrades.instantCombat || this.save.settings.fightAnimation;
  }
  /** Steps a second the hand and Automove take: the Movement speed setting,
   * no faster than research allows, once Movement Speed is owned; otherwise
   * the setting's default. */
  get stepsPerSecond() {
    return this.save.upgrades.moveSpeed ? Math.min(this.save.settings.speed, this.maxSpeed) : SETTINGS.speed.default;
  }
  /** Focus uses a run starts with: none without the Focus skill, and more
   * with Focus Count research. */
  private get focusPerRun() {
    return this.save.upgrades.focus ? researched(this.save.archives, "focusPerRun", FOCUS_PER_RUN) : 0;
  }
  /** What research changes about stepping now: the step rules every move,
   * preview, inspect box and planner resolves with. */
  get stepRules(): StepRules {
    return { potionHeal: researched(this.save.archives, "potionHeal", 100), percentPotion: potionPercent(this.trainingNow) };
  }
  /** The upgrades owned and the Training ranks that count now: the hero's
   * own, and those this run bought with Silver. */
  private get trainingNow() {
    return { upgrades: this.save.upgrades, training: ranksInRun(this.save, this.run) };
  }
  /** Silver held this run. */
  get silver() {
    return this.run.silver ?? 0;
  }
  /** Focus uses left: this run's inside one, or in the forest what the
   * next run will start with. */
  get focusLeft() {
    if (this.run.outside) return this.focusPerRun;
    return Math.max(0, this.focusPerRun - (this.run.focusUsed ?? 0));
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
    this.run.focused = id;
    this.route = [];
    // During a fight, the path is found again once the hero has stepped in.
    this.cardPlan = this.encounter ? null : plan;
    this.activeCard = card;
    this.handStuck = false;
    this.auto = true;
    this.message = `Focus · ${CARDS[id].name} · ${CARDS[id].text}`;
    return "focused";
  }
  /** Forgets the hand's committed path and which card glows. */
  private dropHandPlan() {
    this.cardPlan = null;
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
  /** Erases all progress and starts again outside the Tower. */
  eraseAll() {
    // What was bought in the Shop, and its record, outlast the progress.
    const { entitlements, shop } = this.save;
    this.save = { ...defaults(), entitlements, shop };
    if (permanentBoost(this.save)) this.save.trainingBoostUntil = BOOST_FOREVER;
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
   * one. */
  newRun({ outside = false, seed = Math.floor(this.rng() * 2 ** 32) }: RunStart = {}) {
    if (this.run) this.claimRewards();
    // A Gem the last run left lying on a floor is missed.
    if (this.save.gemDrop.out?.mode === this.mode) missGem(this.save.gemDrop);
    this.slice.fall = null;
    this.slice.history = [];
    this.slice.runGold = 0;
    this.slice.runCurrency = 0;
    this.route = [];
    this.encounter = null;
    this.fight = null;
    // Tower ascents begin at the first floor of the chosen section.
    const section = this.mode === "tower" ? this.startSection() : 0,
      height = section * TOWER_SECTION;
    const { player, loadout } = this.startingHero(this.mode, height);
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
    };
    this.run = this.mode === "tower"
      ? { damaged: false, keysSpent: false, ...core }
      : { ...core, milestone: 0 };
    this.run.loadout = loadout;
    this.world = this.rules.board(this.run);
    if (outside) {
      this.run.outside = true;
      this.world = new OutsideWorld(seed, this.mode);
      this.message = "Follow the forest path to the entrance.";
    } else {
      this.forgetLabyrinth();
      this.dealHand();
    }
    this.slice.run = this.run;
    this.auto = !outside && this.handStartsPlaying;
    this.dropHandPlan();
    this.paused = false;
  }
  /** The hero a run in `mode` starting at `height` gets with everything
   * owned now, standing at the entrance's row, and the loadout it keeps. */
  private startingHero(mode: Mode, height: number) {
    const { attack, defense, maxHp, shroud, keys } = loadout(this.save);
    // Only a hero with a shroud carries one.
    const withShroud = shroud ? { shroud } : {};
    const hp = mode === "tower" ? this.sectionStartHp(height / TOWER_SECTION, maxHp) : maxHp;
    return {
      player: { x: MODES[mode].entranceX, y: 0, hp, maxHp, attack, defense, ...withShroud, keys } as Player,
      loadout: { attack, defense, maxHp, ...withShroud },
    };
  }
  /** A run still in the forest hasn't started: after anything bought,
   * unlocked, trained or equipped, it takes everything owned now, as if it
   * had just begun. */
  private readyForestRuns() {
    for (const mode of ["tower", "delve"] as const) {
      const run = this.save[mode].run;
      if (!run?.outside) continue;
      const { player, loadout } = this.startingHero(mode, run.height);
      run.player = { ...player, x: run.player.x, y: run.player.y };
      run.loadout = loadout;
    }
  }
  /** A Tower section can be started in once its first floor has been
   * reached (which records its starting HP); section 0 always can. */
  sectionUnlocked(section: number) {
    return section === 0 || !!this.save.tower.sectionHp[section];
  }
  startSection() {
    const s = this.save.tower.startSection;
    return this.sectionUnlocked(s) ? s : 0;
  }
  /** Section 0 starts at full HP; later sections start with the best HP
   * the player ever arrived there with (never above current max HP). */
  private sectionStartHp(section: number, maxHp: number) {
    return section === 0 ? maxHp : Math.min(maxHp, this.save.tower.sectionHp[section]);
  }
  /** Choose where future ascents begin. A Tower run still on the forest
   * path hasn't entered yet, so it moves to the new section at once; a run
   * already inside keeps going and the choice applies to the next one. */
  setStartSection(section: number) {
    if (!this.sectionUnlocked(section)) return false;
    this.save.tower.startSection = section;
    const run = this.save.tower.run;
    if (run?.outside) {
      run.height = run.maxHeight = section * TOWER_SECTION;
      run.floors = {};
      run.changes = {};
      run.player.hp = this.sectionStartHp(section, run.player.maxHp);
      this.save.tower.history = [];
    }
    return true;
  }
  private feedback(text: string) {
    this.message = text;
    this.effect = {
      text,
      x: this.run.player.x,
      y: this.run.player.y,
      until: performance.now() + 1300,
    };
  }
  /** Queues a reward to rise from (x, y). */
  private gain(x: number, y: number, text: string, art: GainArt | null = null) {
    this.gains.push({ x, y, text, art });
    if (this.gains.length > MAX_GAINS) this.gains.shift();
  }
  /** Pays the XP for beating `enemy` on equivalent floor `floor`, counting
   * it toward the run's total too. */
  gainXp(enemy: Enemy, floor: number) {
    const level = levelForXp(this.save.xp), xp = tierBonus(this.tier, xpForKill(enemy.strength, floor));
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
    this.slice.history = [];
    this.route = [];
    this.newRun({ outside: true });
    this.auto = false;
    this.dropHandPlan();
    this.message = `${reason}${record ? " · a new record" : ""}${whole(gold) ? ` · ${whole(gold)} Gold kept` : ""}. Follow the forest path to begin again.`;
  }
  /** The hero fell in a fight: the run waits at 0 HP, the hand paused, for
   * the player to undo the fight or accept defeat. */
  private fallIn(before: MoveSnapshot, enemy: Enemy) {
    this.run.player.hp = 0;
    this.slice.fall = { snapshot: before, by: enemy.name };
    this.route = [];
    this.auto = false;
    this.dropHandPlan();
    this.message = `Fallen in combat against ${enemy.name}.`;
  }
  /** Keys every physical enemy kill / treasure chest by seed (+height for
   * Tower, whose x/y space is reused per room) so persistent loot can be
   * gated outside `run` — undoing a kill/chest reverts the tile, but never
   * re-grants the reward for the same physical kill/chest. */
  private lootKey(x: number, y: number): string {
    return this.rules.lootKey(this.run, x, y);
  }
  /** Inside a run the hero is still standing in: not in the forest, not
   * fallen. */
  private get playing() {
    return !this.run.outside && !this.fallen;
  }
  /** The hero fell in the fight just taken: the run waits at 0 HP, the hand
   * paused, until the player undoes that fight or accepts defeat. */
  get fallen() {
    return !this.run.outside && this.run.player.hp <= 0;
  }
  /** A single orthogonal step while play is live. */
  private canStep(dx: number, dy: number) {
    return !this.paused && !this.fallen && !this.encounter && Math.abs(dx) + Math.abs(dy) === 1;
  }
  move(dx: number, dy: number, force = true, track = true) {
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
    const outcome = resolveStep(p, t, this.stepRules);
    if (outcome.blocked) return this.rejectStep(outcome, t, dest.x, dest.y);
    if (!force && isLethal(outcome)) {
      this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
      return false;
    }
    const shows = t.kind === "enemy" && this.playsFights, animate = shows && this.animatesFights;
    // A strike that would fell the hero may revive it instead (Revive), so
    // a lost fight is played out strike by strike to see how it ends.
    const revive = isLethal(outcome) ? this.revival(dest) : undefined;
    const fight = shows || revive ? bout(p, t.enemy!, revive) : null, start = performance.now();
    const rose = fight ? revivals(fight) : [];
    if (fight && rose.length) {
      outcome.player.hp = heroHpAfter(fight, p.hp);
      outcome.combat = { ...outcome.combat!, survivable: outcome.player.hp > 0 };
    }
    if (shows) {
      // Animate fights plays the fight out strike by strike before it
      // counts; otherwise it shows in summary rounds, and only one with a
      // revival waits, for each round after the revival's fire.
      const shown = animate ? fight! : summarize(fight!, REVIVE_MS);
      this.fight = { from: { x: p.x, y: p.y }, to: dest, bout: shown, start, hp: t.enemy!.hp, summary: !animate };
      this.revivedAt = shown.strikes.filter((s) => s.revived).map((s) => start + s.at);
      if (animate || rose.length) {
        // The same fight, so the board shows it as it plays out.
        this.encounter = Object.assign(this.fight, { settle: () => this.take(t, outcome, dest, track, rose.length) });
        return true;
      }
      return this.take(t, outcome, dest, track, rose.length);
    }
    if (rose.length) this.revivedAt = [start];
    return this.take(t, outcome, dest, track, rose.length);
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
  /** Takes a resolved step: in through its door or fight, then onto the tile. */
  private take(t: Tile, outcome: StepEffect, dest: { x: number; y: number }, track: boolean, revived = 0) {
    if (!this.enter(t, outcome, dest, track, revived)) return false;
    this.land(t, dest.x, dest.y, outcome);
    this.gemStep();
    return true;
  }
  /** Commits a resolved step: undo history, stats, and the door or fight on
   * the way in. Returns false when the player fell. */
  private enter(t: Tile, outcome: StepEffect, dest: { x: number; y: number }, track: boolean, revived: number) {
    const before = this.snapshot();
    if (track) this.remember(before);
    const drained = snap(this.run.player.hp - outcome.player.hp);
    this.applyStats(outcome.player);
    if (t.kind === "door") this.openDoor(t, outcome.keysSpent, drained, dest);
    return t.kind !== "enemy" || this.winFight(t.enemy!, outcome.combat!, before, dest, revived);
  }
  /** Moves the player onto the tile and applies what standing there does. */
  private land(t: Tile, x: number, y: number, outcome: StepEffect) {
    const p = this.run.player;
    p.x = x;
    p.y = y;
    // Walking into a torch destroys it immediately: light, collision and
    // sprite all disappear the same frame since rendering only ever draws
    // active torches from this same list.
    this.world.breakTorchAt?.(x, y);
    if (this.run.outside) {
      if (t.kind === "stairs") this.enterFromOutside();
      return;
    }
    if (t.kind === "reward") {
      this.run.changes[`${x},${y}`] = { kind: "openedChest", tier: t.tier };
      this.claimRewards(t.tier, { x, y });
      return;
    }
    this.collect(t, x, y, outcome);
    this.consumeTile(t, x, y);
    this.checkClear();
    this.afterStep(t, x, y);
  }
  /** Mode-specific progress once the player stands on the new tile. */
  private afterStep(t: Tile, x: number, y: number) {
    if (this.mode === "delve") this.afterDelveStep(t, x, y);
    else if (t.kind === "stairs") this.advanceTowerRoom();
    else if (t.kind === "stairsDown") this.descendTowerRoom();
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
    slice.history = keepUndos(slice.history, this.undoCapacity);
  }
  /** Copies resolved stats onto the live player, keeping its object identity. */
  private applyStats(next: Player) {
    const p = this.run.player;
    p.hp = next.hp;
    p.attack = next.attack;
    p.defense = next.defense;
    Object.assign(p.keys, next.keys);
  }
  /** Marks the Tower floor as no longer cleared without damage, or
   * without spending keys; the Delve has no clear tiers. */
  private mar(what: "damaged" | "keysSpent") {
    if (this.mode === "tower") this.towerRun[what] = true;
  }
  /** Each key the door took rises from it with a minus sign; a Heart Door,
   * which takes the hero's HP down to 1 instead, raises a heart. */
  private openDoor(t: Tile, keysSpent: KeyColor[], drained: number, at: { x: number; y: number }) {
    const n = keysSpent.length;
    if (n) this.mar("keysSpent");
    if (drained > 0) this.mar("damaged");
    for (const color of keysSpent) this.gain(at.x, at.y, `−1 ${color} key`, { tile: { kind: "key", color }, spent: true });
    if (!n) this.gain(at.x, at.y, `−${wholeChange(drained)} HP`, { heart: true });
    this.message = `${doorName(t)} opened${n ? ` · ${n} key${n === 1 ? "" : "s"} spent` : " · HP drained to 1"}`;
  }
  /** Settles a fight whose damage is already applied. Returns false when
   * the player fell. */
  private winFight(enemy: Enemy, combat: CombatPrediction, before: MoveSnapshot, at: { x: number; y: number }, revived: number) {
    if (combat.damage > 0) this.mar("damaged");
    if (this.run.player.hp <= 0) {
      this.fallIn(before, enemy);
      return false;
    }
    this.run.kills++;
    const floor = this.rules.equivalentFloor(this.rules.progressAt(this.run, at.y));
    this.gainXp(enemy, floor);
    // Silver belongs to the run, so it isn't gated like Gold: undo takes it back.
    const silver = this.creditSilver(silverForKill(enemy.strength, floor));
    const { gold, drops } = this.creditEnemyLoot(enemy, at.x, at.y);
    if (gold) this.gain(at.x, at.y, `+${wholeChange(gold)} Gold`);
    this.gain(at.x, at.y, `+${wholeChange(silver)} Silver`);
    for (const d of drops) this.gain(at.x, at.y, materialText(d), { material: d.id, quantity: d.quantity });
    const opened = enemy.strength === "boss" && floor >= TIER_BOSS_FLOOR && this.openNextTier();
    this.message = [revived ? `Revived · ${enemy.name} defeated` : combat.damage ? `−${wholeChange(combat.damage)} HP · ${enemy.name} defeated` : "Unscathed victory",
      ...(gold ? [`+${wholeChange(gold)} Gold`] : []), `+${wholeChange(silver)} Silver`, ...drops.map(materialText),
      ...(opened ? [`${this.rules.words.tierName} ${tierNumeral(this.slice.tiersOpen)} opened`] : [])].join(" · ");
    return true;
  }
  /** Adds Silver found in the run, raised by Silver Bonus training and
   * research (the two multiplied), fractions and all; returns what it
   * added. */
  private creditSilver(base: number) {
    const silver = snap((base * silverBonus(this.trainingNow) * researched(this.save.archives, "silverBonus", 100)) / 10_000);
    this.run.silver = snap(this.silver + silver);
    return silver;
  }
  /** Banks Gold found in the run, fractions and all (`snap`), times the
   * Shop's coin packs owned; returns what it banked. */
  private creditGold(found: number) {
    const gold = snap(found * goldFactor(this.save));
    this.save.gold = snap(this.save.gold + gold);
    this.slice.runGold = snap(this.slice.runGold + gold);
    return gold;
  }
  /** The numbered tower (or delve) the run climbs. */
  get tier() {
    return this.run.tier ?? 1;
  }
  /** Beating the floor-100 boss of the highest tier opened opens the next;
   * undo never closes it again. */
  private openNextTier() {
    const slice = this.slice;
    if (this.tier !== slice.tiersOpen || slice.tiersOpen >= TIERS) return false;
    slice.tiersOpen++;
    return true;
  }
  /** Chooses which opened tier the next run climbs, from the forest: the
   * mode's records become that tier's and a fresh run waits outside it. */
  selectTier(tier: number) {
    const slice = this.slice;
    if (!this.run.outside || tier < 1 || tier > slice.tiersOpen || tier === slice.tier) return false;
    switchTier(slice, tier);
    this.newRun({ outside: true });
    this.message = `${this.rules.words.tierName} ${tierNumeral(tier)} · ${tierBonusText(tier)} Gold & XP`;
    return true;
  }
  /** An enemy's Gold (by its strength) and material drops. Both are gated
   * by lootedTiles (outside `run`), so undo can restore the enemy but can
   * never pay for it twice. */
  private creditEnemyLoot(enemy: Enemy, x: number, y: number): { gold: number; drops: MaterialStack[] } {
    const slice = this.slice,
      key = this.lootKey(x, y);
    if (slice.lootedTiles[key]) return { gold: 0, drops: [] };
    slice.lootedTiles[key] = true;
    // Gold / Kill training and research, multiplied, then the tier's bonus.
    const raised = snap((ENEMY_GOLD[enemy.strength] * killGold(this.trainingNow) * researched(this.save.archives, "killGold", 100)) / 10_000);
    const gold = this.creditGold(tierGold(this.tier, raised));
    const drops = this.rules.enemyDrops(enemy.name, this.rng);
    creditMaterials(this.save, drops);
    return { gold, drops };
  }
  private enterFromOutside() {
    const p = this.run.player;
    this.run.outside = false;
    this.dealHand();
    p.x = this.rules.entranceX;
    p.y = 0;
    this.world = this.rules.board(this.run);
    this.forgetLabyrinth();
    this.route = [];
    // Inside, the hand takes over from the player (or Automove).
    this.auto = this.handStartsPlaying;
    this.dropHandPlan();
    this.feedback(this.rules.words.enter);
    this.gemStep();
  }
  /** The floor a Gem belongs to: the Tower floor the hero stands on, or in
   * the Delve the furthest equivalent floor reached. */
  private get gemFloor() {
    const r = this.run;
    return this.mode === "tower" ? r.height : this.rules.equivalentFloor(r.maxHeight ?? r.height);
  }
  /** The Gem lying on the floor the board shows, if any. */
  get gem(): GemSpot | null {
    return this.run.outside ? null : gemOn(this.save.gemDrop, this.mode, this.run.seed, this.gemFloor);
  }
  /** The hero stands somewhere new inside a run: it takes a Gem lying on
   * its tile, a Gem left on another floor is missed, and on a new floor
   * (once the last Gem's cooldown is over) a new one may appear: on a plain
   * tile the hero can walk to, in the Delve within the view. */
  private gemStep() {
    if (!this.playing) return;
    const drop = this.save.gemDrop, p = this.run.player, gem = this.gem;
    if (gem && gem.x === p.x && gem.y === p.y) this.takeGem(gem);
    if (!reachFloor(drop, this.mode, this.run.seed, this.gemFloor, this.clock())) return;
    const view = Math.floor(VIEWPORT_TILES / 2);
    const [minY, maxY] = this.mode === "tower" ? [0, Infinity] : [p.y - view, p.y + view];
    // Where it lies is fixed for the run and floor, like the floor itself.
    const spot = gemSpot(this.world, p, minY, maxY, random(this.run.seed ^ GEM_SALT ^ Math.imul(this.gemFloor + 1, 0x9e3779b1)));
    if (spot) drop.out = { mode: this.mode, seed: this.run.seed, floor: this.gemFloor, ...spot };
  }
  /** Pays the Gem and starts the cooldown to the next; it vanishes in a sparkle. */
  private takeGem(gem: GemSpot) {
    this.save.gems++;
    collectedGem(this.save.gemDrop, this.clock());
    this.gemSparkle = { x: gem.x, y: gem.y, at: performance.now() };
    this.gain(gem.x, gem.y, "+1 Gem", { gem: true });
  }
  /** Collects the Gem at (x, y) on the board, tapped from anywhere; false
   * when none lies there. */
  collectGemAt(x: number, y: number) {
    const gem = this.gem;
    if (!gem || gem.x !== x || gem.y !== y) return false;
    this.takeGem(gem);
    this.message = "+1 Gem";
    return true;
  }
  /** Whether the ad's Gems can be claimed now. */
  get adReady() {
    return this.clock() >= this.save.gemDrop.adReadyAt;
  }
  /** Claims the ad's Gems, and the button waits out its cooldown. No ad
   * plays yet: this is where watching one will be hooked up. */
  claimAdGems() {
    if (!this.adReady) return false;
    this.save.gems += AD_GEMS;
    this.save.gemDrop.adReadyAt = this.clock() + AD_COOLDOWN_MS;
    this.message = `+${AD_GEMS} Gems`;
    return true;
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
    // The world keeps the run's milestone and floor itself.
    if (t.kind === "oneway" && world.cross(x, y)) {
      this.forgetLabyrinth();
      this.save.delve.history = []; // Milestone passages cannot be reversed with undo.
      this.route = [];
      this.feedback(`Depth ${world.milestone * 100} · the passage seals behind you.`);
    }
    const visited = this.save.delve.memory.visited;
    visited[`${x},${y}`] = (visited[`${x},${y}`] ?? 0) + 1;
    const floorBefore = this.rules.equivalentFloor(this.run.maxHeight ?? 0);
    this.run.height = Math.max(this.run.height, world.depth(x, y));
    this.run.maxHeight = Math.max(this.run.maxHeight ?? 0, this.run.height);
    // Each new equivalent floor is the Delve's floor climbed (Spare Change),
    // keyed off the labyrinth's columns (x = -1) so it pays once a run.
    let gold = 0, silver = 0;
    for (let f = floorBefore + 1; f <= this.rules.equivalentFloor(this.run.maxHeight); f++) {
      gold += this.payFloorGold(this.lootKey(-1, f));
      silver += this.payFloorSilver();
    }
    if (gold) this.gain(x, y, `+${wholeChange(gold)} Gold`);
    if (silver) this.gain(x, y, `+${wholeChange(silver)} Silver`);
    world.maintain(y);
    this.recordProgress();
  }
  advanceTowerRoom() {
    this.claimRewards();
    // Keyed by the stairs taken, so a floor pays once a run, whatever undo does.
    const gold = this.payFloorGold(this.lootKey(this.run.player.x, this.run.player.y));
    const highest = this.run.maxHeight ?? this.run.height;
    const { board, sectionStart } = this.climb.up();
    // Silver belongs to the run, so the run's own highest floor gates it:
    // undo takes back the Silver and the record together.
    let silver = 0;
    if (this.run.height > highest) {
      this.run.maxHeight = this.run.height;
      silver = this.payFloorSilver();
    }
    this.enterTowerFloor(board);
    if (sectionStart) this.enterTowerSection();
    else this.feedback("A new chamber opens.");
    if (gold) this.gain(this.run.player.x, this.run.player.y, `+${wholeChange(gold)} Gold`);
    if (silver) this.gain(this.run.player.x, this.run.player.y, `+${wholeChange(silver)} Silver`);
  }
  /** Spare Change: Gold for a floor climbed for the first time in the run,
   * its Gold / Floor raised by research and the tier's bonus. Gated by
   * `key` in lootedTiles, like a kill's Gold; returns what it paid. */
  private payFloorGold(key: string) {
    const base = floorGold(this.trainingNow), slice = this.slice;
    if (!base || slice.lootedTiles[key]) return 0;
    slice.lootedTiles[key] = true;
    return this.creditGold(tierGold(this.tier, snap((base * researched(this.save.archives, "floorGold", 100)) / 100)));
  }
  /** Wishing Well: Silver for a floor climbed for the first time in the
   * run, its Silver / Floor raised by research, then by Silver Bonus.
   * Returns what it paid. */
  private payFloorSilver() {
    const base = floorSilver(this.trainingNow);
    return base ? this.creditSilver(snap((base * researched(this.save.archives, "floorSilver", 100)) / 100)) : 0;
  }
  /** Crossing into a new 10-floor section: the way down is sealed (its
   * first room has no down stairs), ATK/DEF gathered from items in the
   * last section are dropped, and the HP carried in becomes this section's
   * starting HP if it beats the previous best. */
  private enterTowerSection() {
    const section = this.run.height / TOWER_SECTION,
      p = this.run.player,
      base = this.run.loadout ?? loadout(this.save),
      best = this.save.tower.sectionHp[section] ?? 0;
    p.attack = base.attack;
    p.defense = base.defense;
    if (p.hp > best) this.save.tower.sectionHp[section] = p.hp;
    this.feedback(
      `Floor ${this.run.height + 1} · ATK/DEF reset` +
        (p.hp > best ? ` · new best start HP ${wholeHp(p.hp)}` : ""),
    );
  }
  /** Step back onto the stairs at the foot of the current room, returning
   * to the previous room exactly as it was left: cleared tiles stay clear,
   * surviving enemies and unclaimed loot are still there to finish off. */
  descendTowerRoom() {
    if (this.climb.sealedBelow) return;
    this.claimRewards();
    this.enterTowerFloor(this.climb.down()!.board);
    this.feedback("You descend to the room below.");
  }
  /** Stands on the floor the climb just reached, as it was left. Keys reset
   * per visit; damage taken anywhere in the run keeps counting toward the
   * whole-ascent Gold clear. */
  private enterTowerFloor(board: RoomWorld) {
    this.towerRun.keysSpent = false;
    this.recordProgress();
    this.world = board;
    this.syncRewards();
  }
  private get climb() {
    return new TowerClimb(this.towerRun);
  }
  recordProgress() {
    if (this.run.outside) return 0;
    const slice = this.slice;
    const reached = Math.max(slice.reached, this.run.height);
    const earned = milestones(this.rules, slice.reached, reached);
    slice.reached = reached;
    slice.best = Math.max(slice.best, reached);
    this.rules.credit(this.save, earned);
    slice.runCurrency += earned;
    return earned;
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
  /** Clear rewards live in the Tower's log, beside this run. */
  private get ledger() {
    return new ClearLedger(this.save.tower);
  }
  private syncRewards() {
    if (this.mode === "tower" && this.world instanceof RoomWorld) this.ledger.settle(this.towerRun);
  }
  /** Pays clear rewards: the chest opened at `at`, or every tier still owed. */
  private claimRewards(tier?: ClearTier, at?: { x: number; y: number }) {
    if (this.mode !== "tower") return 0;
    const earned = tier ? this.ledger.open(tier, this.towerRun) : this.ledger.claimAll(this.towerRun);
    if (!earned) return 0;
    const text = `+${earned} Inspiration`;
    if (at) {
      this.gain(at.x, at.y, text);
      this.message = `${text} · clear reward`;
    } else this.feedback(`${text} · clear reward${earned > 1 ? "s" : ""}`);
    return earned;
  }
  /** Once a Tower floor has no enemies or doors left, earns its clear tiers
   * and sets their chests by the stairs. */
  private checkClear() {
    if (this.mode !== "tower") return;
    for (const tier of this.ledger.check(this.world, this.towerRun))
      this.feedback(`${tier[0].toUpperCase() + tier.slice(1)} clear · reward by the stairs`);
  }
  /** Pickup rewards and treasure payouts; stats were already applied. */
  private collect(t: Tile, x: number, y: number, outcome: StepEffect) {
    const text = t.kind === "key" ? `+1 ${t.color} key`
      : t.kind === "potion" ? `+${wholeChange(outcome.healed)} HP`
      : t.kind === "attack" ? `+${ATTACK_SHARD} attack`
      : t.kind === "defense" ? `+${DEFENSE_SHARD} defense`
      : null;
    if (text) {
      this.gain(x, y, text, { tile: { ...t } });
      if (t.kind === "potion") this.recordHeal(outcome.healed);
      this.message = text;
    }
    if (t.kind === "treasure") {
      this.run.treasures++;
      // Generated treasure never upgrades gear directly — it always grants
      // Gold, plus independent chances at metal, an Empty Vial, and gems.
      // Gated by lootedTiles so undo/reopen can't duplicate the payout.
      const key = this.lootKey(x, y);
      const slice = this.slice;
      if (!slice.lootedTiles[key]) {
        slice.lootedTiles[key] = true;
        const E = this.rules.equivalentFloor(this.rules.progressAt(this.run, y));
        const loot = rollTreasureLoot(E, this.rng);
        const gold = this.creditGold(tierGold(this.tier, loot.gold));
        creditMaterials(this.save, loot.materials);
        this.gain(x, y, `+${wholeChange(gold)} Gold`);
        for (const m of loot.materials) this.gain(x, y, materialText(m), { material: m.id, quantity: m.quantity });
        this.message = [`+${wholeChange(gold)} Gold`, ...loot.materials.map(materialText)].join(" · ");
      }
    }
  }
  /** Ends the run (the End Run button), or, fallen, accepts defeat. */
  finish(reason: string) {
    this.finishEncounter();
    if (this.fallen) this.acceptDefeat();
    else this.finalizeRun(reason);
  }
  /** Spends training points on one rank of a stat; false if short. */
  /** Inside a run, the hand it went in with; in the forest, the hand the
   * next run will take, as the Deck orders it. */
  get hand(): readonly CardId[] {
    return this.run.hand ?? this.save.hand;
  }
  /** Moves the hand's card in slot `from` to slot `to`, the cards between
   * shifting over one (Combat Stance, in the forest only). */
  arrangeHand(from: number, to: number) {
    const n = this.save.hand.length;
    if (!this.save.upgrades.handOrdering || !this.run.outside || !(from >= 0 && from < n && to >= 0 && to < n)) return false;
    this.save.hand = moveCard(this.save.hand, from, to);
    return true;
  }
  /** Puts a deck card into the hand's first empty slot (Buildout, in
   * the forest only). */
  addToHand(id: CardId) {
    const hand = this.save.hand;
    if (!this.canChooseCards || !deckCards(this.save.upgrades).includes(id) || hand.includes(id) || hand.length >= handSlots(this.save)) return false;
    hand.push(id);
    return true;
  }
  /** Drops a deck card on hand slot `slot` (Buildout, in the forest only):
   * into the slot with room in the hand, or in a full one in place of the
   * card there, which goes back to the deck (`placeCard`). */
  placeInHand(id: CardId, slot: number) {
    const hand = this.save.hand, slots = handSlots(this.save);
    if (!this.canChooseCards || !deckCards(this.save.upgrades).includes(id) || hand.includes(id) || !(slot >= 0 && slot < slots)) return false;
    const next = placeCard(hand, id, slot, slots);
    if (!next) return false;
    this.save.hand = next;
    return true;
  }
  /** Takes a card out of the hand, back to the deck; STAIRS always stays. */
  removeFromHand(id: CardId) {
    const hand = this.save.hand;
    if (!this.canChooseCards || id === "stairs" || !hand.includes(id)) return false;
    this.save.hand = hand.filter((c) => c !== id);
    return true;
  }
  private get canChooseCards() {
    return !!this.save.upgrades.combatStance && !!this.run.outside;
  }
  /** Whether the Training skill's tab and commands are open: owned, or
   * every page shown in Dev mode. */
  private get trainingOpen() {
    return !!this.save.upgrades.training || this.save.settings.devMode;
  }
  /** Whether one more rank of `id` can be trained at all: its row shows,
   * and it isn't at its most. */
  private canTrain(id: TrainingId) {
    const row = TRAINING.find((t) => t.id === id)!;
    return this.trainingOpen && trainingOpen(row, this.save.upgrades) && !trainingMaxed(this.save, id);
  }
  /** Buys one more rank of `id` with training points: it counts at once,
   * whether or not a trainer is training the stat too. Refused without the
   * Training skill, at the stat's most, or without the points. With Dev
   * free purchases it costs nothing. */
  train(id: TrainingId) {
    this.settleTraining();
    const row = TRAINING.find((t) => t.id === id)!;
    if (!this.canTrain(id) || (!this.free && trainingPoints(this.save).left < row.cost)) return false;
    return this.changeLoadout(() => {
      if (!this.free) this.save.trainingPaid[id].points += row.cost;
      this.save.training[id]++;
    });
  }
  /** Pays a trainer `trainingGold` to train one more rank of `id`: it
   * takes `trainingMs` of the wall clock (less any time credit, used up
   * first) and counts once that has passed (`settleTraining`). Refused
   * without the Training skill, for a stat already in training or at its
   * most, with every trainer busy, or without the Gold. With Dev free
   * purchases it costs nothing and counts at once. */
  trainWithGold(id: TrainingId) {
    this.settleTraining();
    const row = TRAINING.find((t) => t.id === id)!, jobs = this.save.trainingJobs, ranks = this.save.training[id];
    if (!this.canTrain(id) || trainingJob(jobs, id)) return false;
    if (this.free) return this.changeLoadout(() => { this.save.training[id]++; });
    const gold = trainingGold(row.cost, ranks);
    if (jobs.length >= trainingSlots(this.save) || this.save.gold < gold) return false;
    const now = this.clock(), ms = trainingMs(ranks, trainingSpeed(this.save)),
      credit = Math.min(ms, this.save.trainingCredit);
    this.save.gold = snap(this.save.gold - gold);
    this.save.trainingCredit -= credit;
    jobs.push({ id, startedAt: now, completesAt: doneAt(ms - credit, this.save.trainingBoostUntil, now), gold, ms });
    // Time credit can cover the whole rank.
    this.settleTraining();
    return true;
  }
  /** The training time (ms, at the normal rate) the rank of `id` in
   * training still needs: what its timer shows. */
  trainingLeft(id: TrainingId) {
    const job = trainingJob(this.save.trainingJobs, id);
    return job ? workLeft(job.completesAt, this.save.trainingBoostUntil, this.clock()) : 0;
  }
  /** Stops the training of `id`, giving its Gold back and the time already
   * spent on it as time credit. */
  cancelTraining(id: TrainingId) {
    const jobs = this.save.trainingJobs, job = trainingJob(jobs, id);
    if (!job) return false;
    this.refundJob(job);
    this.save.trainingJobs = jobs.filter((j) => j !== job);
    return true;
  }
  private refundJob(job: TrainingJob) {
    this.save.gold = snap(this.save.gold + job.gold);
    this.save.trainingCredit += Math.max(0, Math.round(job.ms - this.trainingLeft(job.id)));
  }
  /** Finishes the rank of `id` in training now, for `finishGems` of the
   * training time its timer shows (none with Dev free purchases). */
  finishTraining(id: TrainingId) {
    const job = trainingJob(this.save.trainingJobs, id);
    if (!job) return false;
    const gems = this.free ? 0 : finishGems(this.trainingLeft(id));
    if (this.save.gems < gems) return false;
    this.save.gems -= gems;
    job.completesAt = Math.min(job.completesAt, this.clock());
    return this.settleTraining() > 0;
  }
  /** Buys the next trainer with Gems: one more stat can train at once. */
  buyTrainer() {
    const price = nextTrainerGems(this.save);
    if (price === null || (!this.free && this.save.gems < price)) return false;
    if (!this.free) this.save.gems -= price;
    this.save.trainers++;
    return true;
  }
  /** Claims an hour more of the training boost (an ad will pay for it; for
   * now it is free), up to `BOOST_MAX_MS` banked: while it lasts, ranks in
   * training go twice as fast. Each rank's due time moves to match. */
  claimTrainingBoost() {
    this.settleTraining();
    const now = this.clock(), old = this.save.trainingBoostUntil, until = claimBoost(old, now);
    if (until === null) return false;
    for (const job of this.save.trainingJobs) job.completesAt = doneAt(workLeft(job.completesAt, old, now), until, now);
    this.save.trainingBoostUntil = until;
    return true;
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
    this.settleTraining();
    const boosted = permanentBoost(this.save);
    const t = purchase(this.save, o, serverNow, this.free ? "free" : paid ? "store" : "price");
    if (typeof t === "string") return t;
    if (!boosted && permanentBoost(this.save)) this.boostForever();
    this.message = o.item?.kind === "entitlement" ? `${t.item}: yours for good` : `+${t.item}`;
    return null;
  }
  /** The trainers' ×2 boost runs for good from now: each rank in training
   * is due when its training left at double speed is done. */
  private boostForever() {
    const now = this.clock(), old = this.save.trainingBoostUntil;
    for (const job of this.save.trainingJobs) job.completesAt = doneAt(workLeft(job.completesAt, old, now), BOOST_FOREVER, now);
    this.save.trainingBoostUntil = BOOST_FOREVER;
  }
  /** Ranks trainers finished and not yet announced, oldest first; the app
   * takes them for its notifications. */
  trainingDone: { id: TrainingId; level: number }[] = [];
  /** Counts the ranks whose training the clock has reached, saying so in the
   * status line and queuing them in `trainingDone`; returns how many. A run
   * inside gains each at once. */
  settleTraining() {
    const now = this.clock(), due = this.save.trainingJobs.filter((j) => j.completesAt <= now);
    if (!due.length) return 0;
    this.changeLoadout(() => {
      this.save.trainingJobs = this.save.trainingJobs.filter((j) => !due.includes(j));
      for (const j of due) {
        const paid = this.save.trainingPaid[j.id];
        this.save.training[j.id]++;
        paid.gold = snap(paid.gold + j.gold);
        paid.ms += j.ms;
        this.trainingDone.push({ id: j.id, level: this.save.training[j.id] });
      }
    });
    this.message = `Training · ${due.map((j) => TRAINING.find((t) => t.id === j.id)!.name).join(", ")} complete.`;
    return due.length;
  }
  /** Buys one rank of Training `id` for this run with its Silver: it counts
   * from the next turn on, until the run ends. Each purchase is a turn of
   * its own, so undo takes it back. Refused during a fight, for a row whose
   * upgrade isn't owned or at its highest, or without the Silver. */
  trainInRun(id: TrainingId) {
    if (!this.playing || this.encounter) return false;
    const offer = runTrainingOffer(this.save, this.run, id);
    if (!offer.open || offer.maxed || (!this.free && this.silver < offer.price)) return false;
    this.remember(this.snapshot());
    if (!this.free) this.run.silver = snap(this.silver - offer.price);
    this.run.training = { ...this.run.training, [id]: offer.bought + 1 };
    const row = offer.row;
    if (isStatRow(row)) {
      const level = levelForXp(this.save.xp), stat = row.stat,
        gain = snap(trained(row, offer.level + 1, level) - trained(row, offer.level, level));
      for (const stats of [this.run.player, this.run.loadout]) if (stats) stats[stat] = snap((stats[stat] ?? 0) + gain);
      // More maximum HP comes with the HP to fill it.
      if (stat === "maxHp") this.run.player.hp = snap(this.run.player.hp + gain);
    } else if (id === "findPotion") {
      const chance = percentPotionChance(this.trainingNow);
      this.run.percentPotions = chance;
      // The floor stood on shows its new percent potions at once.
      if (this.world instanceof RoomWorld) this.world.percentPotions = chance;
    }
    this.message = `${row.name} trained for this run · level ${offer.level + 1}`;
    this.afterPlayerAction();
    return true;
  }
  /** Resets a Training stat to no ranks for `TRAINING_RESET_GEMS` Gems
   * (none with Dev free purchases), returning what its ranks were paid
   * with: the training points, the Gold, and the trainers' time as time
   * credit. A rank still in training is stopped, the same way. */
  resetTraining(id: TrainingId) {
    this.settleTraining();
    const ranks = this.save.training[id], job = trainingJob(this.save.trainingJobs, id);
    if ((!ranks && !job) || (!this.free && this.save.gems < TRAINING_RESET_GEMS)) return false;
    return this.changeLoadout(() => {
      const paid = this.save.trainingPaid[id];
      if (!this.free) this.save.gems -= TRAINING_RESET_GEMS;
      if (job) this.refundJob(job);
      this.save.gold = snap(this.save.gold + paid.gold);
      this.save.trainingCredit += paid.ms;
      this.save.trainingPaid[id] = { points: 0, gold: 0, ms: 0 };
      this.save.training[id] = 0;
      this.save.trainingJobs = this.save.trainingJobs.filter((j) => j.id !== id);
    });
  }
  /** Buys the next hand slot with Gems (Larger Hand opens them); the next
   * run's hand can hold one more card. */
  buyHandSlot() {
    const price = nextHandSlotGems(this.save);
    if (price === null || (!this.free && this.save.gems < price)) return false;
    if (!this.free) this.save.gems -= price;
    this.save.handSlots++;
    return true;
  }
  buy(id: UpgradeId) {
    if (!skillAvailable(id, this.save.upgrades)) return false;
    const u = UPGRADES.find((u) => u.id === id)!;
    const n = this.save.upgrades[id],
      price = cost(id, n),
      balance =
        u.currency === "courage" ? this.save.delve.courage : this.save.tower.inspiration;
    if (n >= u.max || (!this.free && price > balance)) return false;
    if (!this.free) {
      if (u.currency === "courage") this.save.delve.courage -= price;
      else this.save.tower.inspiration -= price;
    }
    this.save.upgrades[id]++;
    this.readyForestRuns();
    return true;
  }
  /** The wall clock the Archives' research runs on (ms); tests set it. */
  clock: () => number = () => Date.now();
  /** Sets archivist `slot` to research `id`'s next level, paying its Gold. */
  startResearch(slot: number, id: ResearchId) {
    this.settleResearch();
    const started = this.archivesOpen && startResearch(this.save, slot, id, this.clock());
    // Free purchases' research takes no time: it completes now.
    if (started && this.free) this.settleResearch();
    return started;
  }
  /** Stops archivist `slot`'s research, refunding its Gold and keeping the
   * time already spent on it for when it starts again. */
  cancelResearch(slot: number) {
    return cancelResearch(this.save, slot, this.clock());
  }
  /** Whether archivist `slot` starts the next level on its own. */
  setAutoContinue(slot: number, on: boolean) {
    const s = this.save.archives.slots[slot];
    if (s) s.autoContinue = on;
  }
  /** Dev mode: finishes archivist `slot`'s research now. */
  finishResearchNow(slot: number) {
    const job = this.save.archives.slots[slot]?.job;
    if (!this.save.settings.devMode || !job) return [];
    hastenResearch(this.save.archives, slot, Math.max(0, job.completesAt - this.clock()));
    return this.settleResearch();
  }
  /** Whether the Archives' commands are open: the skill owned, or every
   * page shown in Dev mode. */
  private get archivesOpen() {
    return !!this.save.upgrades.archives || this.save.settings.devMode;
  }
  hireArchivist() {
    return this.archivesOpen && hireArchivist(this.save);
  }
  /** Research completed and not yet announced, oldest first; the app takes
   * them for its notifications. */
  researchDone: ResearchRecord[] = [];
  /** Completes the research that the clock has reached, saying so in the
   * status line and queuing it in `researchDone`. */
  settleResearch(): ResearchRecord[] {
    const done = settleArchives(this.save, this.clock());
    if (done.length) this.readyForestRuns();
    this.researchDone.push(...done);
    const last = done.at(-1);
    if (last) this.message = `Archives · ${RESEARCH[last.research].name} level ${last.level} complete.`;
    return done;
  }
  /** Buys one more `id` provision. Provisions last for good, so like
   * training it reaches a run already inside at once. */
  buyGold(id: GoldItemId) {
    const price = provisionPrice(this.save, id);
    if (!provisionOpen(this.save, id) || (!this.free && this.save.gold < price)) return false;
    return this.changeLoadout(() => {
      if (!this.free) this.save.gold -= price;
      this.save.provisions[id]++;
    });
  }
  /** A gear change or training applies at once to the runs of both modes: a
   * run inside gains or loses exactly what it changed in the loadout, so
   * ATK/DEF gathered from items and the provisions it started with are kept,
   * and a run still in the forest takes everything owned now. */
  private changeLoadout(change: () => boolean | void) {
    const before = loadout(this.save);
    if (change() === false) return false;
    const after = loadout(this.save);
    for (const mode of ["tower", "delve"] as const) {
      const run = this.save[mode].run;
      if (!run || run.outside) continue;
      for (const stats of [run.player, run.loadout])
        if (stats)
          for (const stat of ["attack", "defense", "maxHp", "shroud"] as const) {
            const change = snap(after[stat] - before[stat]);
            if (change) stats[stat] = snap((stats[stat] ?? 0) + change);
          }
      const p = run.player;
      p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
      // Keys a provision adds come into the hand at once.
      for (const color of ["yellow", "blue", "red"] as const) p.keys[color] = Math.max(0, p.keys[color] + after.keys[color] - before.keys[color]);
    }
    this.readyForestRuns();
    return true;
  }
  craftEquipment(slot: EquipmentSlot, metal: MetalId, enhancements: MaterialStack[]) {
    return craftEquipmentItem(this.save, slot, metal, enhancements);
  }
  salvageEquipment(itemId: string) {
    return salvageEquipmentItem(this.save, itemId);
  }
  equipItem(itemId: string) {
    return this.changeLoadout(() => equipItemAction(this.save, itemId));
  }
  unequipSlot(slot: EquipmentSlot) {
    this.changeLoadout(() => unequipSlotAction(this.save, slot));
  }
  craftConsumable(id: ConsumableId) {
    return craftConsumableItem(this.save, id);
  }
  useConsumable(id: ConsumableId) {
    if (!this.playing || this.encounter || (this.save.consumables[id] ?? 0) <= 0) return false;
    const def = CONSUMABLES.find(c => c.id === id)!;
    const p = this.run.player;
    const n = snap(Math.min(p.maxHp - p.hp, potionHeal(def.healAmount, this.stepRules)));
    p.hp = snap(p.hp + n);
    this.save.consumables[id]--;
    this.recordHeal(n);
    this.message = `${def.name} · +${wholeChange(n)} HP`;
    this.afterPlayerAction();
    return true;
  }
  /** Records a potion's heal of `n` HP, already applied, where the hero stands. */
  private recordHeal(n: number) {
    if (n <= 0) return;
    const p = this.run.player;
    this.lastHeal = { from: p.hp - n, to: p.hp, x: p.x, y: p.y, id: (this.lastHeal?.id ?? 0) + 1 };
  }
}

/** "+2 Slime Gels": a material reward as the board and status line name it. */
const materialText = (m: MaterialStack) => `+${m.quantity} ${materialDef(m.id).name}${m.quantity > 1 ? "s" : ""}`;
