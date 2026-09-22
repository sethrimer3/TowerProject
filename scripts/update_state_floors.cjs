const fs = require('fs');

let code = fs.readFileSync('src/state.ts', 'utf8');

// Add import
if (!code.includes('isDeadlocked')) {
  code = 'import { isDeadlocked } from "./analysis.ts";\n' + code;
}

// 1. Persistent Floors handling
const saveLoadCode = `
  saveCurrentFloor() {
    if (this.mode !== "tower") return;
    if (!this.run.floors) this.run.floors = {};
    // Convert Map to plain object for serializability
    const obj = {};
    for (const [k, v] of this.world.cells.entries()) {
      obj[k] = v;
    }
    this.run.floors[this.run.height] = obj;
  }

  loadOrGenerateFloor() {
    if (this.mode !== "tower") return;
    if (this.run.floors && this.run.floors[this.run.height]) {
      const entries = Object.entries(this.run.floors[this.run.height]);
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
}

// update enterTowerFloor to use loadOrGenerateFloor
code = code.replace(
  /this\.world = new RoomWorld\(this\.run\.seed, this\.run\.height\);/,
  `this.world = new RoomWorld(this.run.seed, this.run.height);
    this.loadOrGenerateFloor();`
);

// advanceTowerRoom - save before advancing
code = code.replace(
  /advanceTowerRoom\(\) {/,
  `advanceTowerRoom() {
    this.saveCurrentFloor();`
);

// descendTowerRoom - save before descending
code = code.replace(
  /descendTowerRoom\(\) {/,
  `descendTowerRoom() {
    if (this.run.height <= 0) return;
    this.saveCurrentFloor();`
);

// Add clear hook to save
code = code.replace(
  /if \(t\.kind !== "floor" && t\.kind !== "stairs" && t\.kind !== "oneway"\) this\.world\.clear\(x, y\);/,
  `if (t.kind !== "floor" && t.kind !== "stairs" && t.kind !== "oneway") {
      this.world.clear(x, y);
      this.saveCurrentFloor();
    }`
);
// Also after door open and enemy defeat, we clear/change, so saveCurrentFloor() is good to call at the end of move.

// Inside move(), trigger deadlock detection
const moveEnd = 'return true;\n  }';
const deadlockCheck = `
    this.saveCurrentFloor(); // ensure changes are saved
    if (this.mode === "tower") {
      if (isDeadlocked(this.run)) {
        this.finalizeRun("No viable moves remain", true, before);
        return false;
      }
    }
`;
if (!code.includes('isDeadlocked(this.run)')) {
  code = code.replace(moveEnd, deadlockCheck + '\n    ' + moveEnd);
}

fs.writeFileSync('src/state.ts', code);
