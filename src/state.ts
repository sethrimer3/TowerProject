import { skillAvailable } from "./skill-trees.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import {
  CHUNK,
  START_X,
  TOWER_START_X,
  goldReward,
  xpForKill,
  levelForXp,
  levelBonus,
  cost,
  UPGRADES,
  GOLD_SHOP,
  type UpgradeId,
  type GoldItemId,
} from "./config.ts";
import {
  gear,
  type Save,
  type Run,
  type Tile,
  type Enemy,
  type Mode,
  type MoveSnapshot,
} from "./entities.ts";
import {
  World,
  RoomWorld,
  LAYOUT_VERSION,
  TOWER_LAYOUT_VERSION,
  type Board,
} from "./generation.ts";
import { predict } from "./combat.ts";
import { OutsideWorld } from "./outside.ts";
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
    record: boolean;
  } = null;
  constructor(public save: Save) {
    this.loadMode();
  }
  get undoCapacity() {
    const u = this.save.upgrades;
    return 1 + u.undos + u.shardUndos;
  }
  switchMode(next: Mode) {
    if (next === this.mode) return;
    if (next === "delve" && !this.save.upgrades.delve) return;
    this.claimRewards();
    this.mode = next;
    this.loadMode();
  }
  loadMode() {
    const slice = this.save[this.mode];
    if (!slice.run) {
      this.newRun();
    } else if (slice.run.outside) {
      this.run = slice.run;
      this.world = new OutsideWorld(this.run.seed, this.mode);
    } else if (this.mode === "delve") {
      this.run = slice.run;
      if (this.run.layoutVersion !== LAYOUT_VERSION) {
        // Old consumed-tile coordinates cannot be applied to the new topology.
        // Preserve earned progression and inventory, relocating to this section's entrance.
        this.save.delve.history = [];
        if (this.save.delve.revival)
          this.save.delve.essence += this.save.delve.revival.earned;
        this.save.delve.revival = null;
        this.run.layoutVersion = LAYOUT_VERSION;
        this.run.changes = {};
        this.run.player.x = START_X;
        this.run.player.y = Math.floor(this.run.player.y / CHUNK) * CHUNK;
        this.run.floor = Math.min(this.run.floor, this.run.player.y);
        this.message =
          "The tower has reshaped. Progress kept; returned to this section’s entrance.";
      }
      this.world = new World(this.run.seed, this.run.changes, this.run.floor);
    } else {
      this.run = slice.run;
      if (this.run.layoutVersion !== TOWER_LAYOUT_VERSION) {
        this.run.layoutVersion = TOWER_LAYOUT_VERSION;
        this.run.changes = {};
      }
      this.world = new RoomWorld(
        this.run.seed,
        this.run.height,
        this.run.changes,
      );
    }
    this.syncRewards();
    this.recordProgress();
    this.route = [];
    this.auto = false;
    this.summary = null;
    this.blocked = { x: 0, y: 0, until: 0 };
    if (!this.message)
      this.message =
        this.mode === "tower"
          ? "Defeat the entrance guardian and find the stairs."
          : "Defeat the entrance guardian, claim the keys, and climb.";
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
    const damaged = this.run.seed === snapshot.run.seed && this.run.damaged;
    const keysSpent = this.run.seed === snapshot.run.seed && this.run.height === snapshot.run.height && this.run.keysSpent;
    this.run = structuredClone(snapshot.run);
    if (damaged) this.run.damaged = true;
    if (keysSpent) this.run.keysSpent = true;
    this.save[this.mode].run = this.run;
    // Lifetime achievements are never rolled back by movement undo.
    this.world =
      this.run.outside ? new OutsideWorld(this.run.seed, this.mode) : this.mode === "delve"
        ? new World(this.run.seed, this.run.changes, this.run.floor)
        : new RoomWorld(this.run.seed, this.run.height, this.run.changes);
    this.syncRewards();
    this.recordProgress();
    this.route = [];
    this.auto = false;
    this.summary = null;
    this.paused = false;
    this.blocked.until = 0;
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
  walkTo(x: number, y: number) {
    if (this.paused || this.summary) return;
    this.auto = false;
    const route = routeTo(this, x, y);
    if (!route) {
      this.reject(x, y, "No route to that space.");
      return;
    }
    this.route = route;
    this.message = route.length ? "Walking to destination." : "Already here.";
  }
  routeStep() {
    const step = this.route.shift();
    if (!step) return false;
    const result = this.move(step.dx, step.dy, true);
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
      lvl = levelForXp(this.save.xp),
      bonus = levelBonus(lvl),
      g = gear(u.quality),
      seed = crypto.getRandomValues(new Uint32Array(1))[0],
      maxHp = 120 + u.hp * 20 + u.shardHp * 15 + bonus.hp + prov.heal * 20;
    const player = {
      x: this.mode === "tower" ? TOWER_START_X : START_X,
      y: 0,
      hp: maxHp,
      maxHp,
      attack:
        10 + u.attack * 2 + u.shardAttack + bonus.attack + g[0].attack + prov.edge * 3,
      defense:
        4 + u.defense + u.shardDefense + bonus.defense + g[1].defense + prov.guard * 3,
      keys: { yellow: u.yellow, blue: u.blue, red: u.red },
      gear: g,
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
        height: 0,
        kills: 0,
        treasures: 0,
        changes: {},
        floor: 0,
        player,
      };
      this.world = new RoomWorld(this.run.seed, 0, this.run.changes);
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
  move(dx: number, dy: number, force = true) {
    if (this.paused || this.summary || Math.abs(dx) + Math.abs(dy) !== 1)
      return false;
    const p = this.run.player,
      dest = this.world.step(p.x, p.y, dx, dy);
    if (!dest) {
      this.reject(p.x, p.y, "That edge is closed.");
      return false;
    }
    const { x, y } = dest,
      t = this.world.tile(x, y);
    if (t.kind === "wall") {
      this.reject(x, y, "A wall blocks the way.");
      return false;
    }
    if (t.kind === "door" && !p.keys[t.color!]) {
      this.reject(x, y, `Requires a ${t.color} key.`);
      return false;
    }
    if (t.kind === "enemy" && !force && !predict(p, t.enemy!).survivable)
      return false;
    this.settleRevival();
    const before = this.snapshot(),
      slice = this.save[this.mode];
    slice.history.push(before);
    slice.history = slice.history.slice(-this.undoCapacity);
    if (t.kind === "door") {
      if (!p.keys[t.color!]) {
        this.feedback(`Requires an ${t.color} key.`);
        return false;
      }
      p.keys[t.color!]--;
      this.run.keysSpent = true;
      this.feedback(`${t.color} seal opened`);
    }
    if (t.kind === "enemy") {
      const enemy = t.enemy!,
        result = predict(p, enemy);
      if (!result.survivable && !force) {
        this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
        return false;
      }
      p.hp -= result.damage;
      if (result.damage > 0) this.run.damaged = true;
      if (p.hp <= 0) {
        p.hp = 0;
        const { earned, record } = this.payout();
        const summary = {
          height: this.run.height,
          kills: this.run.kills,
          earned,
          reason: "Fallen in battle",
          dead: true,
          record,
        };
        this.newRun(true);
        if (this.save.upgrades.revive)
          this.save[this.mode].revival = { snapshot: before, earned };
        else this.creditCurrency(earned);
        this.summary = summary;
        this.message =
          "Returned to the forest. Follow the path to begin again.";
        return false;
      }
      this.run.kills++;
      this.gainXp(enemy);
      this.feedback(
        result.damage
          ? `−${result.damage} HP · ${enemy.name} defeated`
          : "Unscathed victory",
      );
    }
    p.x = x;
    p.y = y;
    if (this.run.outside) {
      if (t.kind === "stairs") {
        this.run.outside = false;
        p.x = this.mode === "tower" ? TOWER_START_X : START_X;
        p.y = 0;
        this.world = this.mode === "tower"
          ? new RoomWorld(this.run.seed, 0, this.run.changes)
          : new World(this.run.seed, this.run.changes);
        this.route = [];
        this.feedback(this.mode === "tower" ? "You enter the tower." : "You enter the mountain cave.");
      }
      return true;
    }
    if (t.kind === "reward") {
      this.claimRewards(t.tier);
      return true;
    }
    this.collect(t);
    if (t.kind !== "floor" && t.kind !== "stairs" && t.kind !== "oneway") this.world.clear(x, y);
    this.checkClear();
    if (this.mode === "delve") {
      this.run.height = Math.max(this.run.height, y);
      (this.world as World).maintain(y);
      this.run.floor = (this.world as World).floor;
      this.recordProgress();
    } else if (t.kind === "stairs") {
      this.advanceTowerRoom();
    }
    return true;
  }
  advanceTowerRoom() {
    this.claimRewards();
    this.run.height++;
    this.run.keysSpent = false;
    this.run.rewards = [];
    this.recordProgress();
    this.run.changes = {};
    this.world = new RoomWorld(this.run.seed, this.run.height, this.run.changes);
    this.run.player.x = TOWER_START_X;
    this.run.player.y = 0;
    this.feedback("A new chamber opens.");
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
    this.run.rewards = (this.run.rewards ?? []).filter(c => record?.earned.includes(c.tier) && !record.claimed.includes(c.tier));
    this.world.rewards = this.run.rewards;
    // Earned rewards survive undo, reload, and replacement of an old run.
    for (const [floor, entry] of Object.entries(this.save.tower.log)) {
      for (const tier of entry.earned) {
        if (!entry.claimed.includes(tier) && (Number(floor) !== this.run.height || !this.run.rewards.some(c => c.tier === tier))) {
          entry.claimed.push(tier);
          this.save.tower.shards++;
        }
      }
    }
  }
  claimRewards(tier?: import("./entities.ts").ClearTier) {
    if (this.mode !== "tower") return 0;
    let earned = 0;
    for (const entry of Object.values(this.save.tower.log)) {
      for (const t of entry.earned) if ((!tier || tier === t) && !entry.claimed.includes(t)) {
        entry.claimed.push(t);
        earned++;
      }
    }
    this.save.tower.shards += earned;
    this.syncRewards();
    if (earned) this.feedback(`+${earned} Inspiration · clear reward${earned > 1 ? "s" : ""}`);
    return earned;
  }
  checkClear() {
    if (this.run.outside || !(this.world instanceof RoomWorld)) return;
    const world = this.world;
    if ([...world.cells.keys()].some(k => {
      const [x, y] = k.split(",").map(Number);
      return ["enemy", "door"].includes(world.tile(x, y).kind);
    })) return;
    const entry = this.save.tower.log[this.run.height] ??= { earned: [], claimed: [] };
    const tiers: import("./entities.ts").ClearTier[] = ["silver"];
    if (this.run.damaged === false) {
      tiers.push("gold");
      if (this.run.keysSpent === false) tiers.push("platinum");
    }
    const stairs = [...world.cells].find(([, t]) => t.kind === "stairs");
    if (!stairs) return;
    const [sx, sy] = stairs[0].split(",").map(Number);
    // Walk outward from the stairs so rewards occupy the closest reachable spaces.
    const queue = [{ x: sx, y: sy }], seen = new Set([stairs[0]]);
    const spots: { x: number; y: number }[] = [];
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      if (world.tile(n.x, n.y).kind === "floor") spots.push(n);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const dest = world.step(n.x, n.y, dx, dy);
        if (!dest) continue;
        const key = `${dest.x},${dest.y}`;
        if (seen.has(key) || world.tile(dest.x, dest.y).kind === "wall") continue;
        seen.add(key); queue.push(dest);
      }
    }
    this.run.rewards ??= [];
    for (const tier of tiers) if (!entry.earned.includes(tier)) {
      entry.earned.push(tier);
      const spot = spots.shift();
      if (spot) this.run.rewards.push({ ...spot, tier });
      else { entry.claimed.push(tier); this.save.tower.shards++; }
      this.feedback(`${tier[0].toUpperCase() + tier.slice(1)} clear · reward by the stairs`);
    }
    world.rewards = this.run.rewards;
  }
  collect(t: Tile) {
    const p = this.run.player;
    if (t.kind === "key") {
      p.keys[t.color!]++;
      this.feedback(`+1 ${t.color} key`);
    }
    if (t.kind === "potion") {
      const n = Math.min(p.maxHp - p.hp, 35);
      p.hp += n;
      this.feedback(`+${n} HP`);
    }
    if (t.kind === "attack") {
      p.attack += 2;
      this.feedback("+2 attack");
    }
    if (t.kind === "defense") {
      p.defense++;
      this.feedback("+1 defense");
    }
    if (t.kind === "treasure") {
      this.run.treasures++;
      const q = p.gear[0].quality + 1;
      p.gear = gear(q);
      p.attack += 2;
      p.defense++;
      this.feedback("Heirloom found · +2 ATK / +1 DEF");
    }
  }
  finish(reason: string) {
    if (this.summary) return;
    this.settleRevival();
    this.save[this.mode].history = [];
    this.route = [];
    const { earned, record } = this.payout();
    this.creditCurrency(earned);
    this.summary = {
      height: this.run.height,
      kills: this.run.kills,
      earned,
      reason,
      record,
    };
    this.save[this.mode].run = null;
    this.auto = false;
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
}
