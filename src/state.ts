import {
  CHUNK,
  START_X,
  reward,
  cost,
  UPGRADES,
  type UpgradeId,
} from "./config.ts";
import { gear, type Save, type Run, type Tile } from "./entities.ts";
import { World, LAYOUT_VERSION } from "./generation.ts";
import { predict } from "./combat.ts";
export class Game {
  world!: World;
  run!: Run;
  auto = false;
  paused = false;
  message = "Collect the key ahead, unlock the northern door, and climb.";
  effect = { text: "", x: 0, y: 0, until: 0 };
  summary: null | {
    height: number;
    kills: number;
    earned: number;
    reason: string;
  } = null;
  constructor(public save: Save) {
    if (save.run) {
      this.run = save.run;
      if (this.run.layoutVersion !== LAYOUT_VERSION) {
        // Old consumed-tile coordinates cannot be applied to the new topology.
        // Preserve earned progression and inventory, relocating to this section's entrance.
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
  newRun() {
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
  move(dx: number, dy: number, force = false) {
    if (this.paused || this.summary || Math.abs(dx) + Math.abs(dy) !== 1)
      return false;
    const p = this.run.player,
      x = p.x + dx,
      y = p.y + dy,
      t = this.world.tile(x, y);
    if (t.kind === "wall") return false;
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
        this.finish("Fallen in battle");
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
