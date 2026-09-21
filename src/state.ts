import { routeTo, type Step } from "./pathfinding.ts";
import {
  CHUNK,
  START_X,
  reward,
  cost,
  UPGRADES,
  type UpgradeId,
} from "./config.ts";
import {
  gear,
  type Save,
  type Run,
  type Tile,
  type MoveSnapshot,
} from "./entities.ts";
import { World, LAYOUT_VERSION } from "./generation.ts";
import { predict } from "./combat.ts";
export class Game {
  world!: World;
  run!: Run;
  route: Step[] = [];
  blocked = { x: 0, y: 0, until: 0 };
  auto = false;
  paused = false;
  message = "Defeat the entrance guardian, claim the keys, and climb.";
  effect = { text: "", x: 0, y: 0, until: 0 };
  summary: null | {
    height: number;
    kills: number;
    earned: number;
    reason: string;
    dead?: boolean;
  } = null;
  constructor(public save: Save) {
    if (save.run) {
      this.run = save.run;
      if (this.run.layoutVersion !== LAYOUT_VERSION) {
        // Old consumed-tile coordinates cannot be applied to the new topology.
        // Preserve earned progression and inventory, relocating to this section's entrance.
        this.save.history = [];
        if (this.save.revival) this.save.essence += this.save.revival.earned;
        this.save.revival = null;
        this.run.layoutVersion = LAYOUT_VERSION;
        this.run.changes = {};
        this.run.player.x = START_X;
        this.run.player.y = Math.floor(this.run.player.y / CHUNK) * CHUNK;
        this.run.floor = Math.min(this.run.floor, this.run.player.y);
        this.message =
          "The tower has reshaped. Progress kept; returned to this section’s entrance.";
      }
      this.world = new World(this.run.seed, this.run.changes, this.run.floor);
    } else this.newRun();
  }
  get undoCapacity() {
    return 1 + this.save.upgrades.undos;
  }
  settleRevival() {
    if (this.save.revival) {
      this.save.essence += this.save.revival.earned;
      this.save.revival = null;
    }
  }
  snapshot(): MoveSnapshot {
    return { run: structuredClone(this.run), best: this.save.best };
  }
  restore(snapshot: MoveSnapshot) {
    this.run = structuredClone(snapshot.run);
    this.save.run = this.run;
    this.save.best = snapshot.best;
    this.world = new World(this.run.seed, this.run.changes, this.run.floor);
    this.route = [];
    this.auto = false;
    this.summary = null;
    this.paused = false;
    this.blocked.until = 0;
  }
  undo() {
    if (this.save.revival) {
      const snapshot = this.save.revival.snapshot;
      this.save.revival = null;
      this.save.history = [];
      this.restore(snapshot);
      this.feedback("Revived - fatal move undone");
      return true;
    }
    if (this.summary) return false;
    const snapshot = this.save.history.pop();
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
    this.save.history = [];
    this.route = [];
    this.summary = null;
    const u = this.save.upgrades,
      g = gear(u.quality);
    this.run = {
      layoutVersion: LAYOUT_VERSION,
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      height: 0,
      kills: 0,
      treasures: 0,
      changes: {},
      floor: 0,
      player: {
        x: START_X,
        y: 0,
        hp: 120 + u.hp * 20,
        maxHp: 120 + u.hp * 20,
        attack: 10 + u.attack * 2 + g[0].attack,
        defense: 4 + u.defense + g[1].defense,
        keys: { yellow: u.yellow, blue: u.blue, red: u.red },
        gear: g,
      },
    };
    this.world = new World(this.run.seed, this.run.changes);
    this.save.run = this.run;
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
    const before = this.snapshot();
    this.save.history.push(before);
    this.save.history = this.save.history.slice(-this.undoCapacity);
    if (t.kind === "door") {
      if (!p.keys[t.color!]) {
        this.feedback(`Requires an ${t.color} key.`);
        return false;
      }
      p.keys[t.color!]--;
      this.feedback(`${t.color} seal opened`);
    }
    if (t.kind === "enemy") {
      const result = predict(p, t.enemy!);
      if (!result.survivable && !force) {
        this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
        return false;
      }
      p.hp -= result.damage;
      if (p.hp <= 0) {
        p.hp = 0;
        const earned = reward(
          this.run.height,
          this.run.kills,
          this.run.treasures,
        );
        const summary = {
          height: this.run.height,
          kills: this.run.kills,
          earned,
          reason: "Fallen in battle",
          dead: true,
        };
        this.newRun();
        if (this.save.upgrades.revive)
          this.save.revival = { snapshot: before, earned };
        else this.save.essence += earned;
        this.summary = summary;
        this.message = "Returned to floor 1.";
        return false;
      }
      this.run.kills++;
      this.feedback(
        result.damage
          ? `−${result.damage} HP · ${t.enemy!.name} defeated`
          : "Unscathed victory",
      );
    }
    p.x = x;
    p.y = y;
    this.collect(t);
    if (t.kind !== "floor" && t.kind !== "stairs") this.world.clear(x, y);
    this.run.height = Math.max(this.run.height, y);
    this.save.best = Math.max(this.save.best, this.run.height);
    this.world.maintain(y);
    this.run.floor = this.world.floor;
    return true;
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
    this.save.history = [];
    this.route = [];
    const earned = reward(this.run.height, this.run.kills, this.run.treasures);
    this.save.essence += earned;
    this.save.best = Math.max(this.save.best, this.run.height);
    this.summary = {
      height: this.run.height,
      kills: this.run.kills,
      earned,
      reason,
    };
    this.save.run = null;
    this.auto = false;
  }
  buy(id: UpgradeId) {
    const u = UPGRADES.find((u) => u.id === id)!;
    const n = this.save.upgrades[id],
      price = cost(id, n);
    if (n >= u.max || price > this.save.essence) return false;
    this.save.essence -= price;
    this.save.upgrades[id]++;
    return true;
  }
}
