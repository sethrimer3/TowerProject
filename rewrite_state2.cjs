const fs = require('fs');

let stateCode = fs.readFileSync('src/state.ts', 'utf8');

// 1. Unify death/deadlock/retire logic
// In Game class:
// add `finalizeRun(reason: string, dead: boolean)`
const finalizeCode = `
  finalizeRun(reason: string, dead: boolean, preFightSnapshot?: any) {
    this.run.player.hp = Math.max(0, this.run.player.hp);
    const { earned, record } = this.payout();
    const summary = {
      height: this.run.height,
      kills: this.run.kills,
      earned,
      reason,
      dead,
      record,
    };
    this.newRun(dead);
    if (dead && preFightSnapshot && this.save.upgrades.revive) {
      this.save[this.mode].revival = { snapshot: preFightSnapshot, earned };
    } else {
      this.creditCurrency(earned);
    }
    this.summary = summary;
    this.message = "Returned to the forest. Follow the path to begin again.";
  }
`;

let finishIdx = stateCode.indexOf('finish(reason: string)');
if (finishIdx !== -1) {
  // replace finish logic if needed, or just insert finalizeRun
  stateCode = stateCode.substring(0, finishIdx) + finalizeCode + '\n  ' + stateCode.substring(finishIdx);
}

// 2. Rewrite move()
let moveStart = stateCode.indexOf('  move(dx: number, dy: number');
let moveEnd = stateCode.indexOf('  undo() {'); // next method
let oldMove = stateCode.substring(moveStart, moveEnd);

let newMove = `  move(dx: number, dy: number, force = true, track = true) {
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
    
    if (t.kind === "oneway" && dy !== 1) {
      this.reject(x, y, "A magical barrier prevents retreat");
      return false;
    }

    if (t.kind === "wall") {
      this.reject(x, y, "A wall blocks the way.");
      return false;
    }

    if (t.kind === "enemy") {
      const pred = predict(p, t.enemy!);
      if (pred.impervious) {
        this.reject(x, y, \`Impervious — requires \${pred.requiredAttack} more ATK\`);
        return false;
      }
    }

    if (t.kind === "door" && !p.keys[t.color!]) {
      this.reject(x, y, \`Requires a \${t.color} key.\`);
      return false;
    }

    this.settleRevival();
    const before = this.snapshot(),
      slice = this.save[this.mode];
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
      const enemy = t.enemy!,
        result = predict(p, enemy);
      p.hp -= result.damage;
      if (result.damage > 0) this.run.damaged = true;
      if (p.hp <= 0) {
        this.finalizeRun("Fallen in battle", true, before);
        return false;
      }
      this.run.kills++;
      this.save.xp++;
    } else {
      this.run.player.x = x;
      this.run.player.y = y;
    }

    this.collect(t);
    if (t.kind !== "floor" && t.kind !== "stairs" && t.kind !== "oneway") this.world.clear(x, y);

    if (this.mode === "delve") {
      this.run.height = Math.max(this.run.height, y);
      (this.world as any).maintain(y);
      this.run.floor = (this.world as any).floor;
    } else if (t.kind === "stairs") {
      this.advanceTowerRoom();
    } else if (t.kind === "stairsDown") {
      this.descendTowerRoom();
    }

    // Deadlock detection here? Or let caller do it?
    // The prompt says "implement as a clear reusable state-analysis function".
    // I'll call it later.
    
    return true;
  }
`;

stateCode = stateCode.replace(oldMove, newMove);

// update `finish` to use `finalizeRun("Voluntarily retired", false)`
stateCode = stateCode.replace(
  /finish\(reason: string\)[^]*?\}\s*undo\(\)/,
  `finish(reason: string) {
    this.finalizeRun(reason, false);
  }
  
  undo()`
);

fs.writeFileSync('src/state.ts', stateCode);
