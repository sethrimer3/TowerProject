const fs = require('fs');
let code = fs.readFileSync('src/state.ts', 'utf8');

// Unify move
const moveRegex = /move\(dx: number, dy: number, force = true, track = true\) \{[^]*?return true;\n  \}/;
const newMove = `move(dx: number, dy: number, force = true, track = true) {
    if (this.paused || this.summary || Math.abs(dx) + Math.abs(dy) !== 1)
      return false;
    const p = this.run.player, dest = this.world.step(p.x, p.y, dx, dy);
    if (!dest) {
      this.reject(p.x, p.y, "That edge is closed.");
      return false;
    }
    const { x, y } = dest, t = this.world.tile(x, y);
    if (t.kind === "oneway" && dy !== 1) {
      this.reject(x, y, "A magical barrier prevents retreat");
      return false;
    }
    if (t.kind === "wall") {
      this.reject(x, y, "A wall blocks the way.");
      return false;
    }
    if (t.kind === "door" && !p.keys[t.color!]) {
      this.reject(x, y, \`Requires a \${t.color} key.\`);
      return false;
    }
    if (t.kind === "enemy") {
      const pred = predict(p, t.enemy!);
      if (pred.impervious) {
        this.reject(x, y, \`Impervious — requires \${pred.requiredAttack} more ATK\`);
        return false;
      }
    }
    this.settleRevival();
    const before = this.snapshot(), slice = this.save[this.mode];
    if (track) {
      slice.history.push(before);
      slice.history = slice.history.slice(-this.undoCapacity);
    }
    if (t.kind === "door") {
      p.keys[t.color!]--;
      this.run.keysSpent = true;
      this.feedback(\`\${t.color} seal opened\`);
    }
    if (t.kind === "enemy") {
      const enemy = t.enemy!, result = predict(p, enemy);
      p.hp -= result.damage;
      if (result.damage > 0) this.run.damaged = true;
      if (p.hp <= 0) {
        this.run.player.hp = 0;
        const { earned, record } = this.payout();
        this.newRun(true);
        if (this.save.upgrades.revive) {
           this.save[this.mode].revival = { snapshot: before, earned };
        } else {
           this.creditCurrency(earned);
        }
        this.summary = { height: this.run.height, kills: this.run.kills, earned, reason: "Fallen in battle", dead: true, record };
        this.message = "Returned to the forest. Follow the path to begin again.";
        return false;
      }
      this.run.kills++;
      this.gainXp(enemy);
      this.feedback(result.damage ? \`−\${result.damage} HP · \${enemy.name} defeated\` : "Unscathed victory");
    }
    p.x = x;
    p.y = y;
    if (this.run.outside) {
      if (t.kind === "stairs") {
        this.run.outside = false;
        this.newRun();
      } else {
        this.run.floor = Math.max(this.run.floor, y);
      }
      return true;
    }
    this.collect(t);
    if (t.kind !== "floor" && t.kind !== "stairs" && t.kind !== "oneway") {
       this.world.clear(x, y);
       if (this.saveCurrentFloor) this.saveCurrentFloor();
    }
    if (this.mode === "delve") {
      this.run.height = Math.max(this.run.height, y);
      (this.world as any).maintain(y);
      this.run.floor = (this.world as any).floor;
    } else if (t.kind === "stairs") {
      this.advanceTowerRoom();
    } else if (t.kind === "stairsDown") {
      this.descendTowerRoom();
    }
    if (this.mode === "tower") {
       if (this.saveCurrentFloor) this.saveCurrentFloor();
       if (typeof isDeadlocked === "function" && isDeadlocked(this.run)) {
           const { earned, record } = this.payout();
           this.newRun(true);
           this.creditCurrency(earned);
           this.summary = { height: this.run.height, kills: this.run.kills, earned, reason: "No viable moves remain", dead: true, record };
           this.message = "Returned to the forest. Follow the path to begin again.";
           return false;
       }
    }
    return true;
  }`;

if (moveRegex.test(code)) {
  code = code.replace(moveRegex, newMove);
}

// Persistent floors support
const saveLoadCode = `
  saveCurrentFloor() {
    if (this.mode !== "tower") return;
    if (!this.run.floors) this.run.floors = {};
    const obj: any = {};
    for (const [k, v] of this.world.cells.entries()) {
      obj[k] = v;
    }
    this.run.floors[this.run.height] = obj;
  }

  loadOrGenerateFloor() {
    if (this.mode !== "tower") return;
    if (this.run.floors && this.run.floors[this.run.height]) {
      const entries = Object.entries(this.run.floors[this.run.height]) as any;
      this.world.cells = new Map(entries);
    } else {
      (this.world as any).cells = (this.world as any).generate(this.run.seed, this.run.height);
      this.saveCurrentFloor();
    }
  }
`;

if (!code.includes('saveCurrentFloor()')) {
  const enterTowerFloorIdx = code.indexOf('enterTowerFloor() {');
  code = code.substring(0, enterTowerFloorIdx) + saveLoadCode + '\n  ' + code.substring(enterTowerFloorIdx);
  
  code = code.replace(
    /this\.world = new RoomWorld\(this\.run\.seed, this\.run\.height\);/,
    `this.world = new RoomWorld(this.run.seed, this.run.height);
      this.loadOrGenerateFloor();`
  );

  code = code.replace(/advanceTowerRoom\(\) \{/g, `advanceTowerRoom() { this.saveCurrentFloor();`);
  code = code.replace(/descendTowerRoom\(\) \{/g, `descendTowerRoom() { if (this.run.height <= 0) return; this.saveCurrentFloor();`);
}

if (!code.includes('isDeadlocked')) {
  code = 'import { isDeadlocked } from "./analysis.ts";\n' + code;
}

fs.writeFileSync('src/state.ts', code);
