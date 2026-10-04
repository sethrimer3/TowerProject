import { entrance, floorFor } from "./delve/labyrinth.ts";
import { chooseStep } from "./automation.ts";
import { CARDS, cardText, planHand, type CardId, type CardPlan, type CardRules } from "./cards.ts";
import { BADGES, badgeValue, runBadges, type BadgeId } from "./badges.ts";
import { BOOST_FOREVER, permanentBoost } from "./shop/entitlements.ts";
import { offer, type OfferId } from "./shop/offers.ts";
import { purchase, type Refusal } from "./shop/transactions.ts";
import { confirmServerTime } from "./shop/clock.ts";
import { canWarp, claimGoal } from "./goals.ts";
import { missGem } from "./gems.ts";
import { DelvePlan } from "./delve/automove.ts";
import { defaults } from "./save.ts";
import { stream, tileRandom } from "./random.ts";
import { doorBlockedMessage, doorName, KEY_ORDER } from "./doors.ts";
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
  FOCUS_PER_RUN,
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
  type NoticeTree,
} from "./entities.ts";
import { World, LAYOUT_VERSION } from "./delve/world.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import type { Board } from "./board.ts";
import { bout, heroHpAfter, heroHpDuring, resume, REVIVE_MS, revivals, summarize, type Bout, type Revival } from "./combat.ts";
import { isLethal, potionHeal, regenerate, resolveStep, type StepBlocked, type StepEffect, type StepRules, shardGain } from "./step-effects.ts";
import { OutsideWorld } from "./outside.ts";
import { ClearLedger } from "./tower/clear-ledger.ts";
import { TowerClimb } from "./tower/climb.ts";
import { materialDef, MATERIALS } from "./materials.ts";
import { TIERS, TIER_BOSS_FLOOR, switchTier, tierGold, tierNumeral, tierRewardText, tierXp } from "./tiers.ts";
import { enemyTitle } from "./scaling.ts";
import { snap } from "./exact.ts";
import { enemyStat, whole, wholeChange } from "./whole.ts";
import { MODES, milestones, type ModeProfile } from "./modes.ts";
import { boughtInRun, ranksInRun, runTrainingBulk, runTrainingOffer, type RunTrainingOffer } from "./run-training.ts";
import { openQuantities, type BuyQuantity } from "./buy-quantity.ts";
import { keepUndos, loadout, percentPotionChance, potionPercent, reviveChance } from "./loadout.ts";
import { researched } from "./archives.ts";
import { SETTINGS } from "./settings.ts";
import { CONSUMABLES, type ConsumableId } from "./crafting.ts";
import type { MaterialId, MaterialStack } from "./materials.ts";
import { TrainingDesk } from "./game/training-desk.ts";
import { ResearchDesk } from "./game/research-desk.ts";
import { DeckEditor } from "./game/deck-editor.ts";
import { GearDesk } from "./game/gear-desk.ts";
import { GemFinder } from "./game/gem-finder.ts";
import { BadgeDesk } from "./game/badge-desk.ts";
import { RunPurse } from "./game/run-purse.ts";
import { readyForestRuns, startingHero } from "./game/hero-sync.ts";
/** How a new run starts: out in the forest or at the entrance, and from
 * which seed (rolled from the game's randomness when left out). */
export type RunStart = { outside?: boolean; seed?: number; height?: number };
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
export type GainArt = { tile: Tile; spent?: true } | { material: MaterialId; quantity: number } | { heart: true } | { gem: true } | { coin: Coin };
/** The coin a Gold or Silver gain raises. */
export type Coin = "gold" | "silver";
/** A potion's heal: the HP from and to, where the hero stood, and its number. */
export type Heal = { from: number; to: number; x: number; y: number; id: number };
/** A rush: the tiles the hero rushed off in one step, in order, and when
 * (performance time). */
export type Rush = { tiles: { x: number; y: number }[]; at: number };
/** Rewards kept for the board to show; older ones are dropped unseen. */
const MAX_GAINS = 12;
/** Salts the run seed for Revive's rolls, apart from the world's own. */
const REVIVE_SALT = 0x7e51e;
/** A step resolved and about to be taken: the tile stepped onto, what it
 * does, where it is, and whether it goes in the undo history. */
type TakenStep = { tile: Tile; outcome: StepEffect; dest: { x: number; y: number }; track: boolean };
/** The latest fight as the board shows it: the hero struck from `from`,
 * the enemy (`hp` at the start) stood at `to`, and its strikes land from
 * `start` (performance time). Played out, they are the fight's own; settled
 * at once (`summary`), they are its summary rounds (`summarize`). */
export type ShownFight = { from: { x: number; y: number }; to: { x: number; y: number }; bout: Bout; start: number; hp: number; summary: boolean };
/** A fight being shown before it counts: the hero waits at `from`, the
 * enemy stands at `to`, and nothing changes until `finishEncounter` settles
 * it (at `start + bout.duration`). */
export type Encounter = ShownFight & { enemy: Enemy; outcome: StepEffect; settle: () => void };
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
  /** The Deck page's card badges: drawing them with Gems and attaching
   * them to cards. */
  readonly badges = new BadgeDesk(this);
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
    for (const material of MATERIALS) {
      if (material.category === "metal" || material.category.startsWith("monster-")) {
        this.save.materials[material.id] = 999_999_999;
      }
    }
    this.save.upgrades.delve = 1;
    this.save.upgrades.legacy = 1;
    const maxSection = 25;
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
    this.purse.gold(tierGold(this.tier, this.rules.endGold(this.run)));
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
    if (now.seed !== then.seed) return run;
    const sameFloor = now.height === then.height;
    if (now.damaged) then.damaged = true;
    if (sameFloor && now.keysSpent) then.keysSpent = true;
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
    const fresh = !this.cardPlan;
    const { plan, lost } = this.nextHandPlan();
    this.handStuck = !plan;
    if (!plan) return this.handWaits();
    this.activeCard = plan.card;
    const id = this.hand[plan.card];
    this.message = lost ? `Focus lost · ${CARDS[lost].name} has no path to a target · ${CARDS[id].name} leads.` : this.cardMessage(id);
    if (fresh) this.coolDown(id);
    // A card that acts in place takes the turn without a step.
    if (!plan.path.length) {
      this.cardPlan = null;
      const p = this.run.player, key = `${this.rules.lootKey(this.run, p.x, p.y)}:siphon${this.run.siphoned ?? 0}`;
      this.siphon();
      if (id === this.run.focused) this.run.focused = undefined;
      this.activate(plan.card, key);
      return;
    }
    const goal = plan.path[plan.path.length - 1], key = this.rules.lootKey(this.run, goal.x, goal.y);
    const step = plan.path.shift()!, p = this.run.player, from = { x: p.x, y: p.y };
    this.cardPlan = plan.path.length ? plan : null;
    const rushes = fresh && this.rushTiles > 0 && this.emptyAt(step.x, step.y);
    // The board changes only as the hero moves, so a refused step means the
    // plan is stale: drop it and let the next turn choose again.
    if (!this.move(step.dx, step.dy, true)) return void (this.cardPlan = null);
    if (rushes && !this.rushOn(plan, from)) return;
    if (this.cardPlan) return;
    // The card's last step reaches its target: a focus on it is spent, and
    // it activates (once a fight into its target has played out).
    if (id === this.run.focused) this.run.focused = undefined;
    const fight = this.encounter;
    if (!fight) return this.activate(plan.card, key);
    const settle = fight.settle;
    fight.settle = () => {
      settle();
      this.activate(plan.card, key);
    };
  }
  /** What card `card`'s badge changes about planning it (`planHand`
   * asks): a gate closes it while its condition fails, and Stairward and
   * Skip Open Nodes count only on floors they aren't cooling down on. */
  cardRules(card: CardId): CardRules | undefined {
    const badge = this.run.badges?.[card];
    if (!badge || this.run.outside) return undefined;
    const v = badgeValue(badge.id, badge.level, badge.pick), p = this.run.player;
    switch (badge.id) {
      case "hpGate": return { closed: !(p.hp < snap((p.maxHp * v) / 100)) };
      case "yellowGate": return { closed: !(p.keys.yellow < v) };
      case "blueGate": return { closed: !(p.keys.blue < v) };
      case "redGate": return { closed: !(p.keys.red < v) };
      case "stairward": return this.cooled("stairward", v) ? { stairward: true } : undefined;
      case "skipOpen": return this.cooled("skipOpen", v) ? { skipOpen: { skipped: new Set(this.skipMarks), skip: (x, y) => this.skipTile(x, y) } } : undefined;
      case "charge": return { charge: v };
      default: return undefined;
    }
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
    if (this.run.badges?.[id]?.id === "stairward" && this.cardRules(id)?.stairward) this.markUsed("stairward");
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
  /** Card `card` of the hand activates: its badge pays what it gives.
   * Gold is paid once per target (`key`, gated by lootedTiles like a kill's),
   * since undo can't take it back; HP, Silver and XP are the run's or in
   * its undo snapshot. */
  private activate(card: number, key: string) {
    const id = this.hand[card], badge = id && this.run.badges?.[id];
    if (!badge || !this.playing) return;
    const v = badgeValue(badge.id, badge.level, badge.pick), p = this.run.player;
    switch (badge.id) {
      case "hp": return this.badgeHeal(v, badge.id);
      case "hpPercent": return this.badgeHeal(snap((p.maxHp * v) / 100), badge.id);
      case "silverTouch": return this.gainCoins(p, 0, this.purse.silver(v));
      case "goldTouch": return this.gainCoins(p, this.purse.badgeGold(`badge:${id}:${key}`, v), 0, false);
      case "goldback":
        if (card === this.hand.length - 1) this.gainCoins(p, this.purse.badgeGold(`badge:${id}:${key}`, v), 0, false);
        return;
      case "xp": {
        const xp = Math.round((v * xpBase(this.badgeFloor)) / xpBase(0));
        this.addXp(xp);
        return this.gain(p.x, p.y, `+${xp} XP`);
      }
    }
  }
  /** Heals up to `n` HP for badge `id`, as a potion's heal shows. */
  private badgeHeal(n: number, id: BadgeId) {
    const p = this.run.player, healed = snap(Math.min(p.maxHp - p.hp, n));
    if (healed <= 0) return;
    p.hp = snap(p.hp + healed);
    this.recordHeal(healed);
    this.message = `${BADGES[id].name} · +${wholeChange(healed)} HP`;
  }
  /** Whether a card that acts in place can act now (`planHand` asks):
   * KEY SIPHON, inside a run, while enough Max HP training levels are left
   * for its next use. */
  canAct(card: CardId) {
    return card === "keySiphon" && this.siphonLevel >= this.siphonCost;
  }
  /** The run's Max HP training level, as KEY SIPHON drains it: the hero's
   * own ranks and those bought with Silver this run, less the levels
   * siphoned (1 for the first use, 2 for the second, and so on); 0 outside
   * a run. */
  get siphonLevel() {
    if (this.run.outside) return 0;
    const uses = this.run.siphoned ?? 0;
    return this.save.training.hp + boughtInRun(this.run, "hp") - (uses * (uses + 1)) / 2;
  }
  /** The Max HP training levels KEY SIPHON's next use takes: one more than
   * the last. */
  get siphonCost() {
    return (this.run.siphoned ?? 0) + 1;
  }
  /** KEY SIPHON: a turn with no step that trades the run's top Max HP
   * training levels (`siphonCost` of them) for a yellow key. The hero and
   * the run's loadout lose the max HP those levels add at the hero's level,
   * for the rest of the run only, HP falling only as far as the new max; it
   * is a turn of its own, so undo takes it back. */
  private siphon() {
    const level = this.siphonLevel, levels = this.siphonCost, p = this.run.player, heroLevel = levelForXp(this.save.xp);
    const row = TRAINING.find((t) => t.id === "hp") as StatTrainingRow;
    const loss = snap(trained(row, level, heroLevel) - trained(row, level - levels, heroLevel));
    this.remember(this.snapshot());
    p.maxHp = snap(p.maxHp - loss);
    p.hp = Math.min(p.hp, p.maxHp);
    if (this.run.loadout) this.run.loadout.maxHp = snap(this.run.loadout.maxHp - loss);
    p.keys.yellow++;
    this.run.siphoned = levels;
    this.gain(p.x, p.y, `−${wholeChange(loss)} max HP`, { heart: true });
    this.gain(p.x, p.y, "+1 yellow key", { tile: { kind: "key", color: "yellow" } });
  }
  /** Rush: the first step toward a new target, onto an empty tile, goes on
   * along the path in the same step across up to `rushTiles` more empty
   * tiles, stopping on the tile before anything else. One turn and one undo.
   * Returns false when a step was refused, leaving the target unreached. */
  private rushOn(plan: CardPlan, from: { x: number; y: number }) {
    const p = this.run.player, tiles = [from];
    let moved = true;
    for (let left = this.rushTiles; left > 0 && plan.path.length && this.emptyAt(plan.path[0].x, plan.path[0].y); left--) {
      const at = { x: p.x, y: p.y }, next = plan.path.shift()!;
      if (!this.move(next.dx, next.dy, true, false, false)) {
        plan.path = [];
        moved = false;
        break;
      }
      tiles.push(at);
    }
    this.cardPlan = plan.path.length ? plan : null;
    if (tiles.length > 1) this.rush = { tiles, at: performance.now() };
    return moved;
  }
  /** Tiles the hand's first step toward a new target may rush across: none
   * without the Rush skill, and one more a Rush research level. */
  get rushTiles() {
    return this.save.upgrades.rush ? researched(this.save.archives, "rushTiles", 0) : 0;
  }
  /** Whether (x, y) is empty floor a rush may cross: nothing on it, no torch
   * and no Gem. */
  private emptyAt(x: number, y: number) {
    const gem = this.gemFinder.gem;
    return this.world.tile(x, y).kind === "floor" && !(gem && gem.x === x && gem.y === y) &&
      !this.world.torches?.some((t) => t.active && t.x === x && t.y === y);
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
    this.auto = true;
  }
  /** A run going inside keeps the hand as it was ordered on the way in,
   * gets its Focus uses and its Pocket Money Silver, and fixes its chance
   * of percent potions. */
  private dealHand() {
    this.run.hand = [...this.save.hand];
    const badges = this.save.upgrades.cardBadges ? runBadges(this.save.badges, this.run.hand) : {};
    if (Object.keys(badges).length) this.run.badges = badges;
    const pocket = researched(this.save.archives, "startingSilver", 0);
    if (pocket) this.run.silver = pocket;
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
    // Regen research raises the HP each step regains by its percent.
    const regen = this.run.outside || !this.run.player.regen ? 0
      : snap((this.run.player.regen * researched(this.save.archives, "regenPercent", 100)) / 100);
    return { potionHeal: researched(this.save.archives, "potionHeal", 100), percentPotion: potionPercent(this.trainingNow), regen };
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
    this.message = this.cardMessage(id);
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
   * one, on the first floor unless it gives a `height` (a Warp). */
  newRun({ outside = false, seed = Math.floor(this.rng() * 2 ** 32), height = 0 }: RunStart = {}) {
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
  /** Claims a Goals checkpoint's reward (or its premium one) in `tower`
   * once reached; returns it, or null when it isn't ready. */
  claimGoal(tower: number, floor: number, premium: boolean) {
    const reward = claimGoal(this.save, tower, floor, premium);
    if (reward) readyForestRuns(this.save);
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
  gain(x: number, y: number, text: string, art: GainArt | null = null) {
    this.gains.push({ x, y, text, art });
    if (this.gains.length > MAX_GAINS) this.gains.shift();
  }
  /** Pays the XP for beating `enemy` on equivalent floor `floor`, counting
   * it toward the run's total too. */
  gainXp(enemy: Enemy, floor: number) {
    this.addXp(tierXp(this.tier, xpForKill(enemy.strength, floor)));
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
    // A run that earned its currency sends the player to spend it.
    if (this.slice.runCurrency > 0) this.save.treeNotices[this.rules === MODES.tower ? "inspiration" : "courage"] = true;
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
   * its first step, so a rushed turn regains HP once. */
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
    const outcome = resolveStep(p, t, regen ? this.stepRules : { ...this.stepRules, regen: 0 });
    if (outcome.blocked) return this.rejectStep(outcome, t, dest.x, dest.y);
    if (!force && isLethal(outcome)) {
      this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
      return false;
    }
    const step: TakenStep = { tile: t, outcome, dest, track };
    return t.kind === "enemy" ? this.fightStep(step, t.enemy!) : this.take(step);
  }
  /** Steps into `enemy`. A strike that would fell the hero may revive it
   * instead (Revive), so a lost fight is played out strike by strike to see
   * how it ends; a game that plays fights shows it on the board. */
  private fightStep(step: TakenStep, enemy: Enemy) {
    const p = this.run.player, outcome = step.outcome;
    const revive = isLethal(outcome) ? this.revival(step.dest) : undefined;
    if (!this.playsFights && !revive) return this.take(step);
    const fight = bout(p, enemy, revive), start = performance.now(), rose = revivals(fight).length;
    if (rose) {
      outcome.player.hp = regenerate(heroHpAfter(fight, p.hp), p.maxHp, this.stepRules);
      outcome.combat = { ...outcome.combat!, survivable: outcome.player.hp > 0 };
    }
    if (this.playsFights) return this.showFight(step, enemy, fight, start);
    if (rose) this.revivedAt = [start];
    return this.take(step, rose);
  }
  /** Shows `fight` on the board. Animate fights plays it out strike by
   * strike before it counts; otherwise it shows in summary rounds, and only
   * one with a revival waits, for each round after the revival's fire. */
  private showFight(step: TakenStep, enemy: Enemy, fight: Bout, start: number) {
    const p = this.run.player, animate = this.animatesFights, rose = revivals(fight).length;
    const shown = animate ? fight : summarize(fight, REVIVE_MS);
    this.fight = { from: { x: p.x, y: p.y }, to: step.dest, bout: shown, start, hp: enemy.hp, summary: !animate };
    this.revivedAt = shown.strikes.filter((s) => s.revived).map((s) => start + s.at);
    if (!animate && !rose) return this.take(step, rose);
    // The same fight, so the board shows it as it plays out.
    const encounter: Encounter = Object.assign(this.fight, { enemy, outcome: step.outcome, settle: () => this.take(step, revivals(encounter.bout).length) });
    this.encounter = encounter;
    return true;
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
  private take(step: TakenStep, revived = 0) {
    if (!this.enter(step, revived)) return false;
    this.land(step.tile, step.dest.x, step.dest.y, step.outcome);
    this.gemFinder.step();
    return true;
  }
  /** Commits a resolved step: undo history, stats, and the door or fight on
   * the way in. Returns false when the player fell. */
  private enter({ tile: t, outcome, dest, track }: TakenStep, revived: number) {
    const before = this.snapshot();
    if (track) this.remember(before);
    const drained = snap(this.run.player.hp - outcome.player.hp);
    this.applyStats(outcome.player);
    if (t.kind === "door") this.openDoor(t, outcome.keysSpent, drained, dest);
    return t.kind !== "enemy" || this.winFight({ enemy: t.enemy!, damage: outcome.combat!.damage, at: dest, revived }, before);
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
  private winFight(fight: FightEnd, before: MoveSnapshot) {
    const { enemy, at } = fight;
    if (fight.damage > 0) this.mar("damaged");
    if (this.run.player.hp <= 0) {
      this.fallIn(before, enemy);
      return false;
    }
    this.run.kills++;
    const floor = this.rules.equivalentFloor(this.rules.progressAt(this.run, at.y));
    this.gainXp(enemy, floor);
    // Silver belongs to the run, so it isn't gated like Gold: undo takes it back.
    const purse = this.purse, silver = purse.killSilver(enemy, floor);
    const { gold, drops } = purse.enemyLoot(enemy, at.x, at.y);
    this.gainCoins(at, gold, silver);
    for (const d of drops) this.gain(at.x, at.y, materialText(d), { material: d.id, quantity: d.quantity });
    const opened = enemy.strength === "boss" && floor >= TIER_BOSS_FLOOR && this.openNextTier();
    this.message = [fightText(fight), ...coinsText(gold, silver), ...drops.map(materialText),
      ...(opened ? [`${this.rules.words.tierName} ${tierNumeral(this.slice.tiersOpen)} opened`] : [])].join(" · ");
    return true;
  }
  /** Raises the Gold and Silver just found from `at`, each only when some
   * was; a kill always shows its Silver. */
  private gainCoins(at: { x: number; y: number }, gold: number, silver: number, alwaysSilver = true) {
    if (gold) this.gain(at.x, at.y, `+${wholeChange(gold)} Gold`, { coin: "gold" });
    if (silver || alwaysSilver) this.gain(at.x, at.y, `+${wholeChange(silver)} Silver`, { coin: "silver" });
  }
  /** What the run finds is paid through its purse. */
  private get purse() {
    return new RunPurse(this.save, this.mode, this.run, this.rng);
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
    if (!this.canSelectTier(tier)) return false;
    switchTier(this.slice, tier);
    this.newRun({ outside: true });
    this.message = `${this.rules.words.tierName} ${tierNumeral(tier)} · ${tierRewardText(tier)}`;
    return true;
  }
  /** Whether the forest may switch to `tier`: opened, and not the one selected. */
  private canSelectTier(tier: number) {
    const slice = this.slice;
    return !!this.run.outside && tier !== slice.tier && tier >= 1 && tier <= slice.tiersOpen;
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
    let gold = 0, silver = 0;
    for (let f = floorBefore + 1; f <= last; f++) {
      gold += purse.floorGold(purse.floorKey(-1, f));
      silver += purse.floorSilver();
    }
    this.gainCoins(at, gold, silver, false);
  }
  advanceTowerRoom() {
    this.claimRewards();
    const purse = this.purse, p = this.run.player;
    // Keyed by the stairs taken, so a floor pays once a run, whatever undo does.
    const gold = purse.floorGold(purse.floorKey(p.x, p.y));
    const highest = this.run.maxHeight ?? this.run.height;
    const { board, sectionStart } = this.climb.up();
    // Silver belongs to the run, so the run's own highest floor gates it:
    // undo takes back the Silver and the record together.
    let silver = 0;
    if (this.run.height > highest) {
      this.run.maxHeight = this.run.height;
      silver = purse.floorSilver();
    }
    this.enterTowerFloor(board);
    // A new section's first floor is sealed below; the hero keeps every stat.
    this.feedback(sectionStart ? `Floor ${this.run.height + 1} · the way down is sealed` : "A new chamber opens.");
    this.gainCoins(p, gold, silver, false);
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
    const text = pickupText(t, outcome);
    if (text) {
      this.gain(x, y, text, { tile: { ...t } });
      if (t.kind === "potion") this.recordHeal(outcome.healed);
      this.message = text;
    }
    if (t.kind === "treasure") this.openTreasure(x, y);
  }
  /** A treasure chest: counted, and paid once per physical chest (undo and
   * reopening can't pay it again). */
  private openTreasure(x: number, y: number) {
    this.run.treasures++;
    const loot = this.purse.treasure(x, y);
    if (!loot) return;
    this.gain(x, y, `+${wholeChange(loot.gold)} Gold`, { coin: "gold" });
    for (const m of loot.materials) this.gain(x, y, materialText(m), { material: m.id, quantity: m.quantity });
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
    this.training.settle();
    const boosted = permanentBoost(this.save);
    const t = purchase(this.save, o, serverNow, this.payment(paid));
    if (typeof t === "string") return t;
    // A Premium Pass's boost runs for good from now.
    if (!boosted && permanentBoost(this.save)) this.training.boostForever();
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
    if (!this.free) this.run.silver = snap(this.silver - bulk.cost);
    let hpGain = 0;
    for (let i = 0; i < bulk.count; i++) {
      const offer = runTrainingOffer(this.save, this.run, id);
      this.run.training = { ...this.run.training, [id]: offer.bought + 1 };
      hpGain = snap(hpGain + this.applyRunTraining(offer));
    }
    // A fight playing out goes on with the stats (or Revive) bought.
    if (this.encounter && (isStatRow(first.row) || id === "revive")) this.retrainFight(this.encounter, hpGain);
    this.message = `${first.row.name} trained for this run · level ${first.level + bulk.count}`;
    this.afterPlayerAction();
    return true;
  }
  /** The Buy Quantity choices open: x1 once the Buy Quantity skill is owned
   * (or in Dev mode), and one more per level of its research; none before. */
  get buyQuantities(): readonly BuyQuantity[] {
    return this.save.upgrades.buyQuantity || this.save.settings.devMode ? openQuantities(researched(this.save.archives, "buyQuantity", 0)) : [];
  }
  /** How many ranks a Training press buys: the quantity chosen, while it is open, else one. */
  get buyQuantity(): BuyQuantity {
    const chosen = this.save.settings.buyQuantity;
    return this.buyQuantities.includes(chosen) ? chosen : 1;
  }
  /** Chooses the Buy Quantity, if it is open. */
  setBuyQuantity(q: BuyQuantity) {
    if (!this.buyQuantities.includes(q)) return false;
    this.save.settings.buyQuantity = q;
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
   * gain what the rank from `level` adds at the hero's level. Returns the
   * max HP it added. */
  private raiseRunStat(row: StatTrainingRow, level: number) {
    const heroLevel = levelForXp(this.save.xp), stat = row.stat, p = this.run.player,
      gain = snap(trained(row, level + 1, heroLevel) - trained(row, level, heroLevel));
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
      if (s.by !== "enemy") continue;
      // The HP shown so far rises with the max HP bought.
      if (s.hp) s.hp = snap(s.hp + hpGain);
      hp = s.hp;
      shroud = snap(Math.max(0, shroud - (s.shrouded ?? 0)));
    }
    fight.bout = resume(fight.bout, from, { player: { ...p, hp, shroud }, enemy: fight.enemy, revives: this.revival(fight.to) });
    this.revivedAt = fight.bout.strikes.filter((s) => s.revived).map((s) => fight.start + s.at);
    const o = fight.outcome, fought = heroHpAfter(fight.bout, p.hp), end = regenerate(fought, p.maxHp, this.stepRules),
      damage = snap(fight.bout.strikes.reduce((sum, s) => (s.by === "enemy" ? sum + s.damage : sum), 0));
    Object.assign(o.player, { hp: end, attack: p.attack, defense: p.defense, maxHp: p.maxHp });
    o.combat = { ...o.combat!, damage, survivable: fought > 0 };
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
  useConsumable(id: ConsumableId) {
    if (!this.canUse(id)) return false;
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
  /** Whether a crafted consumable `id` can be used now: one held, inside a
   * run, with no fight playing out. */
  private canUse(id: ConsumableId) {
    return this.playing && !this.encounter && (this.save.consumables[id] ?? 0) > 0;
  }
  /** Records a potion's heal of `n` HP, already applied, where the hero stands. */
  private recordHeal(n: number) {
    if (n <= 0) return;
    const p = this.run.player;
    this.lastHeal = { from: p.hp - n, to: p.hp, x: p.x, y: p.y, id: (this.lastHeal?.id ?? 0) + 1 };
  }
}

/** A fight the hero won: the enemy beaten at `at`, the HP it cost, and
 * how many times the hero revived in it. */
type FightEnd = { enemy: Enemy; damage: number; at: { x: number; y: number }; revived: number };

/** How the status line opens on a fight won. */
function fightText({ enemy, damage, revived }: FightEnd) {
  if (revived) return `Revived · ${enemyTitle(enemy)} defeated`;
  return damage ? `−${wholeChange(damage)} HP · ${enemyTitle(enemy)} defeated` : "Unscathed victory";
}

/** A kill's Gold (when it paid any) and Silver, as the status line names them. */
const coinsText = (gold: number, silver: number) => [...(gold ? [`+${wholeChange(gold)} Gold`] : []), `+${wholeChange(silver)} Silver`];

/** What picking up `t` shows: the key, the HP a potion healed, or the
 * shard's stat; null for anything else. */
function pickupText(t: Tile, outcome: StepEffect) {
  switch (t.kind) {
    case "key": return `+1 ${t.color} key`;
    case "potion": return `+${wholeChange(outcome.healed)} HP`;
    case "attack": return `+${enemyStat(shardGain(t))} attack`;
    case "defense": return `+${enemyStat(shardGain(t))} defense`;
    default: return null;
  }
}

/** "+2 Slime Gels": a material reward as the board and status line name it. */
const materialText = (m: MaterialStack) => `+${m.quantity} ${materialDef(m.id).name}${m.quantity > 1 ? "s" : ""}`;
