import { routeTo, type Step } from "./pathfinding.ts";
import {
  CHUNK,
  START_X,
  TOWER_START_X,
  essenceReward,
  shardReward,
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
    this.mode = next;
    this.loadMode();
  }
  loadMode() {
    const slice = this.save[this.mode];
    if (!slice.run) {
      this.newRun();
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
    const slice = this.save[this.mode],
      record = this.run.height > slice.best;
    slice.best = Math.max(slice.best, this.run.height);
    const earned = record
      ? this.mode === "delve"
        ? essenceReward(this.run.height, this.run.kills, this.run.treasures)
        : shardReward(this.run.height, this.run.kills, this.run.treasures)
      : 0;
    if (this.mode === "delve")
      this.save.gold += goldReward(this.run.kills, this.run.treasures);
    return { earned, record };
  }
  snapshot(): MoveSnapshot {
    return { run: structuredClone(this.run), best: this.save[this.mode].best };
  }
  restore(snapshot: MoveSnapshot) {
    this.run = structuredClone(snapshot.run);
    this.save[this.mode].run = this.run;
    this.save[this.mode].best = snapshot.best;
    this.world =
      this.mode === "delve"
        ? new World(this.run.seed, this.run.changes, this.run.floor)
        : new RoomWorld(this.run.seed, this.run.height, this.run.changes);
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
  newRun() {
    this.settleRevival();
    this.save[this.mode].history = [];
    this.route = [];
    this.summary = null;
    const u = this.save.upgrades,
      lvl = levelForXp(this.save.xp),
      bonus = levelBonus(lvl),
      g = gear(u.quality),
      seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const player = {
      x: this.mode === "tower" ? TOWER_START_X : START_X,
      y: 0,
      hp: 120 + u.hp * 20 + u.shardHp * 15 + bonus.hp,
      maxHp: 120 + u.hp * 20 + u.shardHp * 15 + bonus.hp,
      attack: 10 + u.attack * 2 + u.shardAttack + bonus.attack + g[0].attack,
      defense: 4 + u.defense + u.shardDefense + bonus.defense + g[1].defense,
      keys: { yellow: u.yellow, blue: u.blue, red: u.red },
      gear: g,
    };
    if (this.mode === "delve") {
      this.run = {
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
        this.newRun();
        if (this.save.upgrades.revive)
          this.save[this.mode].revival = { snapshot: before, earned };
        else this.creditCurrency(earned);
        this.summary = summary;
        this.message =
          this.mode === "tower" ? "Returned to room 1." : "Returned to floor 1.";
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
    this.collect(t);
    if (t.kind !== "floor" && t.kind !== "stairs") this.world.clear(x, y);
    if (this.mode === "delve") {
      this.run.height = Math.max(this.run.height, y);
      (this.world as World).maintain(y);
      this.run.floor = (this.world as World).floor;
    } else if (t.kind === "stairs") {
      this.advanceTowerRoom();
    }
    return true;
  }
  advanceTowerRoom() {
    this.run.height++;
    this.run.changes = {};
    this.world = new RoomWorld(this.run.seed, this.run.height, this.run.changes);
    this.run.player.x = TOWER_START_X;
    this.run.player.y = 0;
    this.feedback("A new chamber opens.");
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
    if (this.mode !== "delve" || this.summary || this.save.gold < item.cost)
      return false;
    this.save.gold -= item.cost;
    const p = this.run.player;
    if (id === "heal") p.hp = p.maxHp;
    if (id === "edge") p.attack += 3;
    if (id === "guard") p.defense += 3;
    this.feedback(`${item.name} used`);
    return true;
  }
}
