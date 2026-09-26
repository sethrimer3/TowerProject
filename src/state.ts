import { entrance, floorFor } from "./delve/labyrinth.ts";
import { isDeadlocked } from "./analysis.ts";
import { doorBlockedMessage, doorName, KEY_ORDER } from "./doors.ts";
import { skillAvailable } from "./skill-trees.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import {
  CHUNK,
  START_X,
  TOWER_START_X,
  TOWER_SECTION,
  goldReward,
  xpForKill,
  levelForXp,
  levelBonus,
  cost,
  UPGRADES,
  GOLD_SHOP,
  type UpgradeId,
  type GoldItemId,
  type KeyColor,
} from "./config.ts";
import {
  type Save,
  type Run,
  type Tile,
  type Enemy,
  type Mode,
  type MoveSnapshot,
  type Player,
  type ClearTier,
  type FloorRecord,
  type RewardChest,
} from "./entities.ts";
import {
  World,
  RoomWorld,
  LAYOUT_VERSION,
  TOWER_LAYOUT_VERSION,
  type Board,
} from "./generation.ts";
import type { CombatPrediction } from "./combat.ts";
import { ATTACK_SHARD, DEFENSE_SHARD, isLethal, resolveStep, type StepBlocked, type StepEffect } from "./step-effects.ts";
import { OutsideWorld } from "./outside.ts";
import { getEquivalentFloor, materialDef, MATERIALS } from "./materials.ts";
import { rollEnemyDrops, rollTreasureLoot, towerEnemyDrops } from "./loot.ts";
import {
  creditMaterials,
  getEquippedBonuses,
  craftEquipment as craftEquipmentItem,
  salvageEquipment as salvageEquipmentItem,
  equipItem as equipItemAction,
  unequipSlot as unequipSlotAction,
  craftConsumable as craftConsumableItem,
  CONSUMABLES,
  type ConsumableId,
} from "./crafting.ts";
import type { EquipmentSlot } from "./equipment.ts";
import type { MaterialStack, MetalId } from "./materials.ts";
export type RouteEffects = {
  hp: [number, number];
  attack: [number, number];
  defense: [number, number];
  keys: Partial<Record<KeyColor, [number, number]>>;
};
/** Tiles that stay on the board after being stepped on. */
const PERMANENT_TILES = new Set<Tile["kind"]>(["floor", "stairs", "stairsDown", "oneway", "openedChest"]);
/** A Tower floor is cleared once no enemy or door is left on it. */
function roomCleared(world: RoomWorld) {
  return ![...world.cells.keys()].some(k => {
    const [x, y] = k.split(",").map(Number);
    return ["enemy", "door"].includes(world.tile(x, y).kind);
  });
}
/** Silver for any clear, gold without damage, platinum without keys as well. */
function clearTiers(run: Run): ClearTier[] {
  const tiers: ClearTier[] = ["silver"];
  if (run.damaged === false) {
    tiers.push("gold");
    if (run.keysSpent === false) tiers.push("platinum");
  }
  return tiers;
}
/** Plain floor tiles reachable from the stairs, closest first, where clear
 * rewards go. */
function rewardSpots(world: RoomWorld, stairs: string) {
  const [sx, sy] = stairs.split(",").map(Number);
  const queue = [{ x: sx, y: sy }], seen = new Set([stairs]);
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (world.tile(n.x, n.y).kind === "floor") spots.push(n);
    const fresh = openNeighbours(world, n).filter(d => !seen.has(`${d.x},${d.y}`));
    for (const d of fresh) seen.add(`${d.x},${d.y}`);
    queue.push(...fresh);
  }
  return spots;
}
/** The non-wall tiles one step from `n`. */
function openNeighbours(world: RoomWorld, n: { x: number; y: number }) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => world.step(n.x, n.y, dx, dy))
    .filter((d): d is { x: number; y: number } => !!d && world.tile(d.x, d.y).kind !== "wall");
}
export class Game {
  mode: Mode = "tower";
  world!: Board;
  run!: Run;
  route: Step[] = [];
  blocked = { x: 0, y: 0, until: 0 };
  auto = false;
  paused = false;
  message = "";
  effect = { text: "", x: 0, y: 0, until: 0 };
  summary: null | {
    height: number;
    kills: number;
    earned: number;
    reason: string;
    dead?: boolean;
    /** True when the fatal move happened while Automove was on — the
     * summary page is skipped and the player is dropped outside directly. */
    autoDeath?: boolean;
    record: boolean;
  } = null;
  constructor(public save: Save) {
    this.loadMode();
  }
  get undoCapacity() {
    const u = this.save.upgrades;
    return 1 + u.undos + u.shardUndos;
  }
  /** Keep run.floors[height] pointed at the live run.changes object so
   * existing code that mutates run.changes still edits the right room,
   * while other visited rooms keep their own state to return to. */
  linkTowerFloor() {
    this.run.floors ??= {};
    this.run.floors[this.run.height] = this.run.changes;
  }
  /** Grants unlimited currency, every Tower section, and every game mode.
   * Reversible: turning Dev Mode back off leaves the grants in place, since
   * there is no meaningful "undo" for progress the player has already seen. */
  setDevMode(on: boolean) {
    this.save.settings.devMode = on;
    if (!on) return;
    this.save.gold = 999_999_999;
    this.save.tower.shards = 999_999_999;
    this.save.delve.essence = 999_999_999;
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
    this.claimRewards();
    this.mode = next;
    this.loadMode();
  }
  loadMode() {
    const run = this.save[this.mode].run;
    if (!run) this.newRun();
    else {
      if (!run.outside) this.upgradeLayout(run);
      this.adoptRun(run);
    }
    this.syncRewards();
    this.recordProgress();
    this.route = [];
    this.auto = false;
    this.summary = null;
    this.blocked = { x: 0, y: 0, until: 0 };
  }
  /** Makes `run` the live run of this mode and rebuilds its board. */
  adoptRun(run: Run) {
    this.run = run;
    this.save[this.mode].run = run;
    if (!run.outside && this.mode === "tower") this.linkTowerFloor();
    this.world = this.buildWorld();
  }
  /** The live run's board, regenerated from its seed and changes. */
  buildWorld(): Board {
    const r = this.run;
    if (r.outside) return new OutsideWorld(r.seed, this.mode);
    if (this.mode === "delve") return new World(r.seed, r.changes, r.floor, r.delveMilestone ?? 0);
    return new RoomWorld(r.seed, r.height, r.changes);
  }
  /** Map edits saved under an older layout can't be applied to the new one:
   * they are dropped, and progress, stats and inventory are kept. */
  upgradeLayout(run: Run) {
    if (this.mode === "delve") {
      if (run.layoutVersion !== LAYOUT_VERSION) this.reshapeDelve(run);
    } else if (run.layoutVersion !== TOWER_LAYOUT_VERSION) this.reshapeTower(run);
  }
  /** Returns the player to their section's entrance on the new labyrinth. */
  reshapeDelve(run: Run) {
    this.save.delve.history = [];
    if (this.save.delve.revival)
      this.save.delve.essence += this.save.delve.revival.earned;
    this.save.delve.revival = null;
    run.layoutVersion = LAYOUT_VERSION;
    run.changes = {};
    run.delveMilestone = Math.floor(run.height / 100);
    Object.assign(run.player, entrance(run.seed, run.delveMilestone));
    run.floor = floorFor(run.seed, run.delveMilestone);
    run.delveVisited = {};
    this.message =
      "The tower has reshaped. Progress kept; returned to this section’s entrance.";
  }
  /** The floor's geometry changed: stand at its entrance, and let
   * syncRewards pay out any clear chests whose old spots may now be wall. */
  reshapeTower(run: Run) {
    run.layoutVersion = TOWER_LAYOUT_VERSION;
    run.changes = {};
    run.floors = {};
    run.player.x = TOWER_START_X;
    run.player.y = 0;
    run.rewards = [];
  }
  settleRevival() {
    const slice = this.save[this.mode];
    if (slice.revival) {
      this.creditCurrency(slice.revival.earned);
      slice.revival = null;
    }
  }
  creditCurrency(earned: number) {
    if (this.mode === "delve") this.save.delve.essence += earned;
    else this.save.tower.shards += earned;
  }
  payout(): { earned: number; record: boolean } {
    const record = this.run.height > this.save[this.mode].reached;
    this.recordProgress();
    this.claimRewards();
    if (this.mode === "delve")
      this.save.gold += goldReward(this.run.kills, this.run.treasures);
    return { earned: 0, record };
  }
  snapshot(): MoveSnapshot {
    return { run: structuredClone(this.run), best: this.save[this.mode].best };
  }
  restore(snapshot: MoveSnapshot) {
    this.claimRewards();
    this.adoptRun(this.rewound(snapshot.run));
    this.restoreRewards();
    // Lifetime achievements are never rolled back by movement undo.
    this.recordProgress();
    this.route = [];
    this.auto = false;
    this.summary = null;
    this.paused = false;
    this.blocked.until = 0;
  }
  /** A copy of an earlier state of the run. Damage taken and keys spent on
   * this floor stay on record, so undo never wins back a better clear tier. */
  rewound(past: Run): Run {
    const sameRun = this.run.seed === past.seed;
    const damaged = sameRun && this.run.damaged;
    const keysSpent = sameRun && this.run.height === past.height && this.run.keysSpent;
    const run = structuredClone(past);
    if (damaged) run.damaged = true;
    if (keysSpent) run.keysSpent = true;
    return run;
  }
  /** Settles the restored run's clear chests against the log. A movement undo
   * restores the board snapshot even though the payout is lifetime state, so
   * a chest the undo brings back stays; reopening it remains payout-gated. */
  restoreRewards() {
    const undone = [...(this.run.rewards ?? [])];
    this.syncRewards();
    if (!(this.world instanceof RoomWorld)) return;
    const rewards = this.run.rewards!;
    for (const chest of undone) if (
      !rewards.some(c => c.x === chest.x && c.y === chest.y && c.tier === chest.tier) &&
      this.run.changes[`${chest.x},${chest.y}`]?.kind !== "openedChest"
    ) rewards.push(chest);
    this.world.rewards = rewards;
  }
  undo() {
    const slice = this.save[this.mode];
    if (slice.revival) {
      const snapshot = slice.revival.snapshot;
      slice.revival = null;
      slice.history = [];
      this.restore(snapshot);
      this.feedback("Revived - fatal move undone");
      return true;
    }
    if (this.summary) return false;
    const snapshot = slice.history.pop();
    if (!snapshot) return false;
    this.restore(snapshot);
    this.feedback("Move undone");
    return true;
  }
  reject(x: number, y: number, message: string) {
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
      const outcome = resolveStep(end, this.world.tile(step.x, step.y));
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
    if (this.paused || this.summary) return;
    this.auto = false;
    const route = routeTo(this, x, y);
    if (!route) {
      this.reject(x, y, "No route to that space.");
      return;
    }
    // The whole tap-to-walk route counts as a single undo step, not one per tile.
    if (route.length) {
      this.settleRevival();
      const slice = this.save[this.mode];
      slice.history.push(this.snapshot());
      slice.history = slice.history.slice(-this.undoCapacity);
    }
    this.route = route;
    this.message = route.length ? "Walking to destination." : "Already here.";
  }
  routeStep() {
    const step = this.route.shift();
    if (!step) return false;
    const result = this.move(step.dx, step.dy, true, false);
    if (!result) this.route = [];
    return result;
  }
  newRun(outside = false) {
    if (this.run) this.claimRewards();
    this.settleRevival();
    this.save[this.mode].history = [];
    this.route = [];
    this.summary = null;
    const u = this.save.upgrades,
      prov = this.save.provisions,
      seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const { attack, defense, maxHp } = this.combatStats();
    // Tower ascents begin at the first floor of the chosen section.
    const section = this.mode === "tower" ? this.startSection() : 0,
      height = section * TOWER_SECTION;
    const player = {
      x: this.mode === "tower" ? TOWER_START_X : START_X,
      y: 0,
      hp: this.sectionStartHp(section, maxHp),
      maxHp,
      attack,
      defense,
      keys: { yellow: u.yellow, blue: u.blue, red: u.red },
    };
    for (const item of GOLD_SHOP) prov[item.id] = 0;
    if (this.mode === "delve") {
      this.run = {
        damaged: false,
        keysSpent: false,
        rewards: [],
        layoutVersion: LAYOUT_VERSION,
        seed,
        height: 0,
        maxHeight: 0,
        kills: 0,
        treasures: 0,
        changes: {},
        floor: 0,
        player,
      };
      this.world = new World(this.run.seed, this.run.changes);
    } else {
      this.run = {
        damaged: false,
        keysSpent: false,
        rewards: [],
        layoutVersion: TOWER_LAYOUT_VERSION,
        seed,
        height,
        maxHeight: height,
        kills: 0,
        treasures: 0,
        changes: {},
        floors: {},
        floor: 0,
        player,
        baseStats: { attack, defense },
      };
      this.linkTowerFloor();
      this.world = new RoomWorld(this.run.seed, height, this.run.changes);
    }
    if (outside) {
      this.run.outside = true;
      this.world = new OutsideWorld(seed, this.mode);
      this.message = "Follow the forest path to the entrance.";
    }
    this.save[this.mode].run = this.run;
    this.auto = false;
    this.paused = false;
  }
  /** ATK/DEF/max HP from baseline + permanent upgrades + level bonus +
   * equipped gear + this run's provisions. */
  combatStats() {
    const u = this.save.upgrades,
      prov = this.save.provisions,
      bonus = levelBonus(levelForXp(this.save.xp));
    // "quality" (Heirloom steel) predates crafted equipment; its ranks are
    // folded in here as the equivalent starter-gear bonus it used to grant
    // via the old gear() helper, so existing investment stays meaningful.
    const baseAttack = 10 + u.attack * 2 + u.shardAttack + bonus.attack + (2 + u.quality * 2);
    const baseDefense = 4 + u.defense + u.shardDefense + bonus.defense + (1 + u.quality);
    const baseMaxHp = 120 + u.hp * 20 + u.shardHp * 15 + bonus.hp;
    // Equipped crafted gear: flat bonuses first, then percentage bonuses
    // applied to the resulting total; temporary run provisions apply last.
    const equip = getEquippedBonuses(this.save);
    return {
      attack: Math.round((baseAttack + equip.flatAttack) * (1 + equip.percentAttack)) + prov.edge * 3,
      defense: Math.round((baseDefense + equip.flatDefense) * (1 + equip.percentDefense)) + prov.guard * 3,
      maxHp: Math.round((baseMaxHp + equip.flatMaxHp) * (1 + equip.percentMaxHp)) + prov.heal * 20,
    };
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
  sectionStartHp(section: number, maxHp: number) {
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
  feedback(text: string) {
    this.message = text;
    this.effect = {
      text,
      x: this.run.player.x,
      y: this.run.player.y,
      until: performance.now() + 1300,
    };
  }
  gainXp(enemy: Enemy) {
    this.save.xp += xpForKill(enemy.tier, enemy.attack);
  }
  /** The single path that ends the current run, whether by death, by a
   * detected deadlock, or by the player choosing to retire. Captures the
   * dying run's stats into the summary before any new run is created, pays
   * out exactly once, and only opens a Revive opportunity for an actual
   * fatal player choice (never for a deadlock or a manual retire). */
  finalizeRun(
    reason: string,
    options: { dead?: boolean; allowRevive?: boolean; preFatalSnapshot?: MoveSnapshot } = {},
  ) {
    if (this.summary) return;
    const { dead = false, allowRevive = false, preFatalSnapshot } = options;
    const wasAuto = this.auto;
    this.settleRevival();
    // Capture the dying run's own stats — height/kills/record — and pay out
    // rewards while `this.run` still refers to this run, before newRun()
    // (below) replaces it.
    const { earned, record } = this.payout();
    this.save[this.mode].history = [];
    this.route = [];
    // Automove keeps running through death only when the player has
    // researched Steadfast wayfinder and switched off the default
    // turn-off-on-death behavior.
    const keepAuto =
      dead &&
      wasAuto &&
      !!this.save.upgrades.autoPersist &&
      this.save.settings.autoOffOnDeath === false;
    const summary = {
      height: this.run.height,
      kills: this.run.kills,
      earned,
      reason,
      dead,
      autoDeath: dead && wasAuto,
      record,
    };
    if (dead) this.newRun(true);
    else this.save[this.mode].run = null;
    if (allowRevive && dead && preFatalSnapshot && this.save.upgrades.revive)
      this.save[this.mode].revival = { snapshot: preFatalSnapshot, earned };
    else if (dead) this.creditCurrency(earned);
    this.summary = summary;
    this.auto = keepAuto;
    if (dead)
      this.message = "Returned to the forest. Follow the path to begin again.";
  }
  /** Runs only after a meaningful Tower state change (never every frame):
   * a defeated enemy, a collected pickup, a consumed door, or a floor
   * transition. Lethal (but non-impervious) enemies never count as viable
   * progress here, matching automation's own avoidance of them. */
  checkDeadlock() {
    if (this.mode !== "tower" || !this.playing) return;
    if (isDeadlocked(this.run))
      this.finalizeRun("No viable moves remain", { dead: false });
  }
  /** Keys every physical enemy kill / treasure chest by seed (+height for
   * Tower, whose x/y space is reused per room) so persistent loot can be
   * gated outside `run` — undoing a kill/chest reverts the tile, but never
   * re-grants the reward for the same physical kill/chest. */
  lootKey(x: number, y: number): string {
    return this.mode === "tower"
      ? `${this.run.seed}:${this.run.height}:${x},${y}`
      : `${this.run.seed}:${x},${y}`;
  }
  /** Inside a run that hasn't ended: not in the forest, no summary showing. */
  get playing() {
    return !this.run.outside && !this.summary;
  }
  /** A single orthogonal step while play is live. */
  canStep(dx: number, dy: number) {
    return !this.paused && !this.summary && Math.abs(dx) + Math.abs(dy) === 1;
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
    const outcome = resolveStep(p, t);
    if (outcome.blocked) return this.rejectStep(outcome, t, dest.x, dest.y);
    if (!force && isLethal(outcome)) {
      this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
      return false;
    }
    if (!this.enter(t, outcome, dest, track)) return false;
    this.land(t, dest.x, dest.y, outcome);
    return true;
  }
  /** Commits a resolved step: undo history, stats, and the door or fight on
   * the way in. Returns false when the player fell. */
  enter(t: Tile, outcome: StepEffect, dest: { x: number; y: number }, track: boolean) {
    this.settleRevival();
    const before = this.snapshot();
    if (track) this.remember(before);
    this.applyStats(outcome.player);
    if (t.kind === "door") this.openDoor(t, outcome.keysSpent);
    return t.kind !== "enemy" || this.winFight(t.enemy!, outcome.combat!, before, dest);
  }
  /** Moves the player onto the tile and applies what standing there does. */
  land(t: Tile, x: number, y: number, outcome: StepEffect) {
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
      this.claimRewards(t.tier);
      return;
    }
    this.collect(t, x, y, outcome);
    this.consumeTile(t, x, y);
    this.checkClear();
    this.afterStep(t, x, y);
  }
  /** Mode-specific progress once the player stands on the new tile. */
  afterStep(t: Tile, x: number, y: number) {
    if (this.mode === "delve") this.afterDelveStep(t, x, y);
    else if (t.kind === "stairs") this.advanceTowerRoom();
    else if (t.kind === "stairsDown") this.descendTowerRoom();
    if (t.kind !== "floor" && t.kind !== "oneway") this.checkDeadlock();
  }
  rejectStep(outcome: StepBlocked, t: Tile, x: number, y: number): false {
    if (outcome.blocked === "wall") this.reject(x, y, "A wall blocks the way.");
    else if (outcome.blocked === "locked") this.reject(x, y, doorBlockedMessage(t));
    else {
      this.reject(x, y, `Impervious — requires ${outcome.combat.requiredAttack} more ATK`);
      this.checkDeadlock();
    }
    return false;
  }
  remember(snapshot: MoveSnapshot) {
    const slice = this.save[this.mode];
    slice.history.push(snapshot);
    slice.history = slice.history.slice(-this.undoCapacity);
  }
  /** Copies resolved stats onto the live player, keeping its object identity. */
  applyStats(next: Player) {
    const p = this.run.player;
    p.hp = next.hp;
    p.attack = next.attack;
    p.defense = next.defense;
    Object.assign(p.keys, next.keys);
  }
  openDoor(t: Tile, keysSpent: KeyColor[]) {
    const n = keysSpent.length;
    if (n) this.run.keysSpent = true;
    this.feedback(`${doorName(t)} opened${n ? ` · ${n} key${n === 1 ? "" : "s"} spent` : " · full HP"}`);
  }
  /** Settles a fight whose damage is already applied. Returns false (and ends
   * the run, allowing Revive) when the player fell. */
  winFight(enemy: Enemy, combat: CombatPrediction, before: MoveSnapshot, at: { x: number; y: number }) {
    if (combat.damage > 0) this.run.damaged = true;
    if (this.run.player.hp <= 0) {
      this.finalizeRun("Fallen in battle", {
        dead: true,
        allowRevive: true,
        preFatalSnapshot: before,
      });
      return false;
    }
    this.run.kills++;
    this.gainXp(enemy);
    const dropText = this.creditEnemyDrops(enemy, at.x, at.y);
    this.feedback(
      (combat.damage
        ? `−${combat.damage} HP · ${enemy.name} defeated`
        : "Unscathed victory") + dropText,
    );
    return true;
  }
  /** Persistent drops are gated by lootedTiles (outside `run`), so undo can
   * restore the enemy but can never duplicate its material reward. */
  creditEnemyDrops(enemy: Enemy, x: number, y: number): string {
    const slice = this.save[this.mode],
      key = this.lootKey(x, y);
    if (slice.lootedTiles[key]) return "";
    slice.lootedTiles[key] = true;
    const drops = this.mode === "tower" ? towerEnemyDrops(enemy.name) : rollEnemyDrops(enemy.name, Math.random);
    if (!drops.length) return "";
    creditMaterials(this.save, drops);
    return " · +" + drops.map(d => `${d.quantity} ${materialDef(d.id).name}${d.quantity > 1 ? "s" : ""}`).join(", +");
  }
  enterFromOutside() {
    const p = this.run.player;
    this.run.outside = false;
    p.x = this.mode === "tower" ? TOWER_START_X : START_X;
    p.y = 0;
    if (this.mode === "tower") {
      this.linkTowerFloor();
      this.world = new RoomWorld(this.run.seed, this.run.height, this.run.changes);
    } else {
      this.world = new World(this.run.seed, this.run.changes);
    }
    this.route = [];
    this.feedback(this.mode === "tower" ? "You enter the tower." : "You enter the mountain cave.");
  }
  /** Removes what the step used up: chests stay behind opened, fixtures stay. */
  consumeTile(t: Tile, x: number, y: number) {
    if (t.kind === "treasure") this.run.changes[`${x},${y}`] = { kind: "openedChest" };
    else if (!PERMANENT_TILES.has(t.kind)) this.world.clear(x, y);
  }
  afterDelveStep(t: Tile, x: number, y: number) {
    const world = this.world as World;
    if (t.kind === "oneway" && world.cross(x, y)) {
      this.run.delveMilestone = world.milestone;
      this.run.delveVisited = {};
      this.run.delveKnown = {};
      this.save.delve.history = []; // Milestone passages cannot be reversed with undo.
      this.route = [];
      this.feedback(`Depth ${world.milestone * 100} · the passage seals behind you.`);
    }
    const visited = this.run.delveVisited ??= {};
    visited[`${x},${y}`] = (visited[`${x},${y}`] ?? 0) + 1;
    this.run.height = Math.max(this.run.height, world.depth(x, y));
    this.run.maxHeight = Math.max(this.run.maxHeight ?? 0, this.run.height);
    world.maintain(y);
    this.run.floor = world.floor;
    this.recordProgress();
  }
  advanceTowerRoom() {
    this.claimRewards();
    this.run.height++;
    this.run.maxHeight = Math.max(this.run.maxHeight ?? 0, this.run.height);
    this.enterTowerFloor();
    this.run.player.x = TOWER_START_X;
    this.run.player.y = 0;
    if (this.run.height % TOWER_SECTION === 0) this.enterTowerSection();
    else this.feedback("A new chamber opens.");
  }
  /** Crossing into a new 10-floor section: the way down is sealed (its
   * first room has no down stairs), ATK/DEF gathered from items in the
   * last section are dropped, and the HP carried in becomes this section's
   * starting HP if it beats the previous best. */
  enterTowerSection() {
    const section = this.run.height / TOWER_SECTION,
      p = this.run.player,
      base = this.run.baseStats ?? this.combatStats(),
      best = this.save.tower.sectionHp[section] ?? 0;
    p.attack = base.attack;
    p.defense = base.defense;
    if (p.hp > best) this.save.tower.sectionHp[section] = p.hp;
    this.feedback(
      `Floor ${this.run.height + 1} · ATK/DEF reset` +
        (p.hp > best ? ` · new best start HP ${p.hp}` : ""),
    );
  }
  /** Step back onto the stairs at the foot of the current room, returning
   * to the previous room exactly as it was left: cleared tiles stay clear,
   * surviving enemies and unclaimed loot are still there to finish off. */
  descendTowerRoom() {
    if (this.run.height % TOWER_SECTION === 0) return;
    this.claimRewards();
    this.run.height--;
    this.enterTowerFloor();
    const stairs = [...(this.world as RoomWorld).cells].find(
      ([, t]) => t.kind === "stairs",
    );
    if (stairs) {
      const [sx, sy] = stairs[0].split(",").map(Number);
      this.run.player.x = sx;
      this.run.player.y = sy;
    } else {
      this.run.player.x = TOWER_START_X;
      this.run.player.y = 0;
    }
    this.feedback("You descend to the room below.");
  }
  /** Enter a Tower room by height, reusing its persistent mutations when it
   * was already visited (run.floors[height] IS run.changes for that floor —
   * a live reference, not a copy — so every clear() written through
   * RoomWorld.changes during that visit is already saved; nothing further
   * needs to happen when leaving). Keys reset per visit; damage taken
   * anywhere in the run keeps counting toward the whole-ascent Gold clear. */
  enterTowerFloor() {
    this.run.keysSpent = false;
    this.run.rewards = [];
    this.recordProgress();
    this.run.floors ??= {};
    this.run.changes = this.run.floors[this.run.height] ??= {};
    this.world = new RoomWorld(this.run.seed, this.run.height, this.run.changes);
    this.syncRewards();
  }
  recordProgress() {
    if (this.run.outside) return 0;
    const slice = this.save[this.mode];
    const reached = Math.max(slice.reached, this.run.height);
    const divisor = this.mode === "tower" ? 1 : 10;
    const earned = Math.floor(reached / divisor) - Math.floor(slice.reached / divisor);
    slice.reached = reached;
    slice.best = Math.max(slice.best, reached);
    this.creditCurrency(earned);
    return earned;
  }
  syncRewards() {
    if (!(this.world instanceof RoomWorld)) return;
    const record = this.save.tower.log[this.run.height];
    const unopened = (c: RewardChest) => record?.earned.includes(c.tier) && !record.claimed.includes(c.tier);
    this.run.rewards = (this.run.rewards ?? []).filter(unopened);
    this.world.rewards = this.run.rewards;
    // Earned rewards survive undo, reload, and replacement of an old run.
    for (const [floor, entry] of Object.entries(this.save.tower.log)) {
      for (const tier of entry.earned) {
        if (!entry.claimed.includes(tier) && !this.chestStands(Number(floor), tier)) {
          entry.claimed.push(tier);
          this.save.tower.shards++;
        }
      }
    }
  }
  /** Whether a chest for `tier` still stands on `floor`, the current floor. */
  chestStands(floor: number, tier: ClearTier) {
    return floor === this.run.height && this.run.rewards!.some(c => c.tier === tier);
  }
  claimRewards(tier?: ClearTier) {
    if (this.mode !== "tower") return 0;
    let earned = 0;
    const wanted = (t: ClearTier) => !tier || tier === t;
    for (const entry of Object.values(this.save.tower.log)) {
      for (const t of entry.earned) if (wanted(t) && !entry.claimed.includes(t)) {
        entry.claimed.push(t);
        earned++;
      }
    }
    this.save.tower.shards += earned;
    this.syncRewards();
    if (earned) this.feedback(`+${earned} Inspiration · clear reward${earned > 1 ? "s" : ""}`);
    return earned;
  }
  /** Once a Tower floor has no enemies or doors left, earns its clear tiers
   * and sets their chests by the stairs. */
  checkClear() {
    if (this.run.outside || !(this.world instanceof RoomWorld)) return;
    const world = this.world;
    if (!roomCleared(world)) return;
    const entry = this.save.tower.log[this.run.height] ??= { earned: [], claimed: [] };
    const tiers = clearTiers(this.run);
    const stairs = [...world.cells].find(([, t]) => t.kind === "stairs");
    if (!stairs) return;
    const spots = rewardSpots(world, stairs[0]);
    this.run.rewards ??= [];
    for (const tier of tiers) if (!entry.earned.includes(tier)) this.earnClear(entry, tier, spots.shift());
    world.rewards = this.run.rewards;
  }
  /** Records a clear tier and sets its chest on `spot`, or pays it out
   * straight away when the floor has no room left. */
  earnClear(entry: FloorRecord, tier: ClearTier, spot?: { x: number; y: number }) {
    entry.earned.push(tier);
    if (spot) this.run.rewards!.push({ ...spot, tier });
    else { entry.claimed.push(tier); this.save.tower.shards++; }
    this.feedback(`${tier[0].toUpperCase() + tier.slice(1)} clear · reward by the stairs`);
  }
  /** Pickup feedback and treasure payouts; stats were already applied. */
  collect(t: Tile, x: number, y: number, outcome: StepEffect) {
    if (t.kind === "key") this.feedback(`+1 ${t.color} key`);
    if (t.kind === "potion") this.feedback(`+${outcome.healed} HP`);
    if (t.kind === "attack") this.feedback(`+${ATTACK_SHARD} attack`);
    if (t.kind === "defense") this.feedback(`+${DEFENSE_SHARD} defense`);
    if (t.kind === "treasure") {
      this.run.treasures++;
      // Generated treasure never upgrades gear directly — it always grants
      // Gold, plus independent chances at metal, an Empty Vial, and gems.
      // Gated by lootedTiles so undo/reopen can't duplicate the payout.
      const key = this.lootKey(x, y);
      const slice = this.save[this.mode];
      if (!slice.lootedTiles[key]) {
        slice.lootedTiles[key] = true;
        const E = getEquivalentFloor(this.mode, this.mode === "tower" ? this.run.height : y);
        const loot = rollTreasureLoot(E, Math.random);
        this.save.gold += loot.gold;
        creditMaterials(this.save, loot.materials);
        const extra = loot.materials.map(m => `+${m.quantity} ${materialDef(m.id).name}${m.quantity > 1 ? "s" : ""}`);
        this.feedback([`+${loot.gold} Gold`, ...extra].join(" · "));
      }
    }
  }
  finish(reason: string) {
    this.finalizeRun(reason, { dead: false });
  }
  buy(id: UpgradeId) {
    if (!skillAvailable(id, this.save.upgrades)) return false;
    const u = UPGRADES.find((u) => u.id === id)!;
    const n = this.save.upgrades[id],
      price = cost(id, n),
      balance =
        u.currency === "essence" ? this.save.delve.essence : this.save.tower.shards;
    if (n >= u.max || price > balance) return false;
    if (u.currency === "essence") this.save.delve.essence -= price;
    else this.save.tower.shards -= price;
    this.save.upgrades[id]++;
    return true;
  }
  buyGold(id: GoldItemId) {
    const item = GOLD_SHOP.find((g) => g.id === id)!;
    if (this.save.gold < item.cost) return false;
    this.save.gold -= item.cost;
    this.save.provisions[id]++;
    return true;
  }
  /** Recomputes equip-derived combat stats for both Tower and Delve runs
   * from scratch (base upgrades/level + equipped gear), without touching
   * run history. Called after any equip/unequip so gear changes apply
   * immediately in an active run, in both modes at once. */
  recomputeCombatStats() {
    const { attack, defense, maxHp } = this.combatStats();
    for (const mode of ["tower", "delve"] as const) {
      const run = this.save[mode].run;
      if (!run || run.outside) continue;
      run.player.attack = attack;
      run.player.defense = defense;
      run.player.maxHp = maxHp;
      if (mode === "tower") run.baseStats = { attack, defense };
      run.player.hp = Math.max(1, Math.min(run.player.hp, maxHp));
    }
  }
  craftEquipment(slot: EquipmentSlot, metal: MetalId, enhancements: MaterialStack[]) {
    return craftEquipmentItem(this.save, slot, metal, enhancements);
  }
  salvageEquipment(itemId: string) {
    return salvageEquipmentItem(this.save, itemId);
  }
  equipItem(itemId: string) {
    const ok = equipItemAction(this.save, itemId);
    if (ok) this.recomputeCombatStats();
    return ok;
  }
  unequipSlot(slot: EquipmentSlot) {
    unequipSlotAction(this.save, slot);
    this.recomputeCombatStats();
  }
  craftConsumable(id: ConsumableId) {
    return craftConsumableItem(this.save, id);
  }
  useConsumable(id: ConsumableId) {
    if (!this.playing || (this.save.consumables[id] ?? 0) <= 0) return false;
    const def = CONSUMABLES.find(c => c.id === id)!;
    const p = this.run.player;
    const n = Math.min(p.maxHp - p.hp, def.healAmount);
    p.hp += n;
    this.save.consumables[id]--;
    this.feedback(`${def.name} · +${n} HP`);
    return true;
  }
}
