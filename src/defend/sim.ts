/** Real-time DEFEND simulation. Units move freely in continuous cell
 * coordinates (1 unit = 1 cell); the procedural city supplies the solid
 * obstacles. Enemies follow a flow field toward the keep in which buildings
 * and walls are passable at a cost (they must be smashed first), so enemies
 * prefer the streets but will break through when that is much shorter.
 *
 * A run starts from a freshly generated city and never resets between
 * waves: whatever is destroyed stays destroyed unless civilians rebuild it. */
import {
  CELL_COUNT,
  CELLS_H,
  CELLS_W,
  cellIndex,
  rng,
  type Rect,
} from "./grid.ts";
import { MinHeap } from "./heap.ts";
import {
  BOMB_DAMAGE,
  BOMB_RADIUS,
  CIVILIAN,
  ENEMIES,
  HOUSE_HP_PER_CELL,
  SOLDIER,
  STRUCTURES,
  archerCooldown,
  archerDamage,
  archerRange,
  civilianCount,
  civilianHp,
  keepHp,
  rebuildSeconds,
  soldierCap,
  soldierLeash,
  soldierScale,
  trainSeconds,
  wallHp,
  watchRadius,
  waveBudget,
  waveHpScale,
  type EnemyKind,
  type UpgradeId,
} from "./catalog.ts";
import { CellType, sideCells, type Building, type CityMap } from "./citygen.ts";

export type Levels = Record<UpgradeId, number>;

export type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cd: number;
  /** Personal offset inside each cell so a crowd spreads across the street. */
  jx: number;
  jy: number;
  distract: number;
  distractT: number;
  rollT: number;
  marked: boolean;
  flash: number;
};

export type Soldier = {
  id: number;
  home: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  cd: number;
  target: number;
  path: number[];
  thinkT: number;
  flash: number;
};

export type Civilian = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  job: number;
  state: "toJob" | "working" | "home";
  work: number;
  path: number[];
  home: number;
  thinkT: number;
  flash: number;
};

export type Arrow = { x: number; y: number; target: number; damage: number; tx: number; ty: number; life: number };
export type Effect = { kind: "boom" | "dust" | "spark"; x: number; y: number; t: number; r: number };
export type SimEvent = { type: "waveStart" | "waveCleared" | "lost"; wave: number };

const STEP = 1 / 30;
/** How long a struck building flashes, in seconds. */
export const BUILDING_FLASH = 0.14;
const BREAK_SECONDS = 3;
const SQRT2 = Math.SQRT2;

export class DefendSim {
  readonly map: CityMap;
  readonly levels: Levels;
  /** 1 while a cell is part of a standing (built) building. */
  readonly solid: Uint8Array;
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;
  /** Built cells per building; == cells.length when intact. */
  readonly built: Int32Array;
  readonly field = new Float64Array(CELL_COUNT);
  /** Seconds left on each building's hit flash. */
  readonly flash: Float32Array;
  /** Cells whose solidity changed since the renderer last drained this. */
  changed: number[] = [];
  enemies: Enemy[] = [];
  soldiers: Soldier[] = [];
  civilians: Civilian[] = [];
  arrows: Arrow[] = [];
  effects: Effect[] = [];
  events: SimEvent[] = [];
  wave = 0;
  time = 0;
  lost = false;
  breakT = 1.5;
  spawnQueue: EnemyKind[] = [];
  spawnT = 0;
  /** Bumped whenever a building is destroyed or rebuilt (static art changes). */
  mapVersion = 0;
  speed = 1;
  private fieldDirty = true;
  private fieldT = 0;
  private acc = 0;
  private nextId = 1;
  private rand: () => number;
  private towerCd = new Map<number, number>();
  private trainT = new Map<number, number>();
  private civilianRespawn: number[] = [];
  private keepId: number;
  private grid: Enemy[][] = Array.from({ length: CELL_COUNT }, () => []);
  private gridUsed: number[] = [];

  constructor(map: CityMap, levels: Levels, seed = 1) {
    this.map = map;
    this.levels = levels;
    this.rand = rng(seed);
    const n = map.buildings.length;
    this.solid = new Uint8Array(CELL_COUNT);
    this.hp = new Float32Array(n);
    this.maxHp = new Float32Array(n);
    this.built = new Int32Array(n);
    this.flash = new Float32Array(n);
    for (const b of map.buildings) {
      const max =
        b.kind === "wall" ? wallHp(levels.wallStrength)
        : b.kind === "house" ? HOUSE_HP_PER_CELL * b.cells.length
        : b.kind === "keep" ? keepHp(levels.keepStrength)
        : STRUCTURES[b.kind].maxHp;
      this.hp[b.id] = this.maxHp[b.id] = max;
      this.built[b.id] = b.cells.length;
      for (const c of b.cells) this.solid[c] = 1;
    }
    this.keepId = map.buildings.find((b) => b.kind === "keep")!.id;
    this.civilianRespawn = Array(civilianCount(levels.civilianCount)).fill(0);
  }

  get keep(): Building {
    return this.map.buildings[this.keepId];
  }
  keepHp() {
    return this.hp[this.keepId];
  }
  keepMaxHp() {
    return this.maxHp[this.keepId];
  }
  intact(b: Building) {
    return this.built[b.id] === b.cells.length;
  }

  /** Advance by real elapsed seconds (fixed internal timestep). */
  update(seconds: number) {
    if (this.lost) return;
    this.acc += Math.min(seconds, 0.25) * this.speed;
    while (this.acc >= STEP && !this.lost) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }

  step(dt: number) {
    this.time += dt;
    this.fieldT -= dt;
    if (this.fieldDirty && this.fieldT <= 0) this.computeField();
    this.runWaves(dt);
    this.indexEnemies();
    this.markEnemies();
    for (const e of this.enemies) this.stepEnemy(e, dt);
    this.stepTowers(dt);
    this.stepArrows(dt);
    this.stepBarracks(dt);
    for (const s of this.soldiers) this.stepSoldier(s, dt);
    this.stepCivilians(dt);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.soldiers = this.soldiers.filter((s) => s.hp > 0);
    this.civilians = this.civilians.filter((c) => c.hp > 0 && !this.atHome(c));
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter((fx) => fx.t < 0.6);
    for (const e of this.enemies) e.flash = Math.max(0, e.flash - dt);
    for (const s of this.soldiers) s.flash = Math.max(0, s.flash - dt);
    for (const c of this.civilians) c.flash = Math.max(0, c.flash - dt);
    for (let i = 0; i < this.flash.length; i++) if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt);
    if (this.hp[this.keepId] <= 0 && !this.lost) {
      this.lost = true;
      this.events.push({ type: "lost", wave: this.wave });
    }
  }

  // ── Waves ─────────────────────────────────────────────────────────────
  private runWaves(dt: number) {
    if (this.spawnQueue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = Math.max(0.2, 0.85 - this.wave * 0.02);
        this.spawnEnemy(this.spawnQueue.pop()!);
      }
      return;
    }
    if (this.enemies.length) return;
    if (this.wave > 0 && this.breakT === BREAK_SECONDS) this.events.push({ type: "waveCleared", wave: this.wave });
    this.breakT -= dt;
    if (this.breakT <= 0) {
      this.wave++;
      this.breakT = BREAK_SECONDS;
      this.spawnQueue = buildWave(this.wave, this.rand);
      this.spawnT = 0;
      this.events.push({ type: "waveStart", wave: this.wave });
    }
  }

  private spawnEnemy(kind: EnemyKind) {
    const def = ENEMIES[kind];
    for (let tries = 0; tries < 20; tries++) {
      const x = 1 + this.rand() * (CELLS_W - 2);
      const y = 0.5 + this.rand() * 2;
      if (this.blocked(x, y)) continue;
      const hp = def.hp * waveHpScale(this.wave);
      this.enemies.push({
        id: this.nextId++,
        kind,
        x,
        y,
        hp,
        maxHp: hp,
        cd: 0,
        jx: (this.rand() - 0.5) * 0.5,
        jy: (this.rand() - 0.5) * 0.5,
        distract: -1,
        distractT: 0,
        rollT: this.rand() * 0.5,
        marked: false,
        flash: 0,
      });
      return;
    }
  }

  // ── Flow field ────────────────────────────────────────────────────────
  /** Cost of stepping into a cell for a ground enemy. */
  private enterCost(i: number): number {
    if (this.solid[i]) {
      const b = this.map.owner[i];
      return 3 + this.hp[b] / 6;
    }
    return this.map.type[i] === CellType.ROAD ? 1 : 1.25;
  }

  computeField() {
    this.fieldDirty = false;
    this.fieldT = 0.25;
    const f = this.field;
    f.fill(Infinity);
    const heap = new MinHeap();
    for (const c of this.keep.cells) {
      f[c] = 0;
      heap.push(c, 0);
    }
    while (heap.size) {
      const i = heap.pop();
      const k = heap.lastKey;
      if (k > f[i]) continue;
      const x = i % CELLS_W,
        y = (i - x) / CELLS_W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
          const n = cellIndex(nx, ny);
          if (dx && dy && (this.solid[cellIndex(x + dx, y)] || this.solid[cellIndex(x, y + dy)] || this.solid[n])) continue;
          const step = this.enterCost(i) * (dx && dy ? SQRT2 : 1);
          // Walking *out of* cell i toward n costs i's price, which makes the
          // field value at n the true cost of the path n → keep.
          const nk = k + (f[i] === 0 ? 1 : step);
          if (nk < f[n]) {
            f[n] = nk;
            heap.push(n, nk);
          }
        }
    }
  }

  // ── Enemies ───────────────────────────────────────────────────────────
  private indexEnemies() {
    for (const i of this.gridUsed) this.grid[i].length = 0;
    this.gridUsed.length = 0;
    for (const e of this.enemies) {
      const i = cellIndex(clampCell(e.x, CELLS_W), clampCell(e.y, CELLS_H));
      if (!this.grid[i].length) this.gridUsed.push(i);
      this.grid[i].push(e);
    }
  }

  /** Enemies within `r` of a point (uses the cell index). */
  enemiesNear(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    const x0 = Math.max(0, Math.floor(x - r)),
      x1 = Math.min(CELLS_W - 1, Math.floor(x + r));
    const y0 = Math.max(0, Math.floor(y - r)),
      y1 = Math.min(CELLS_H - 1, Math.floor(y + r));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        for (const e of this.grid[cellIndex(cx, cy)]) if (e.hp > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) out.push(e);
    return out;
  }

  private markEnemies() {
    for (const e of this.enemies) e.marked = false;
    const r = watchRadius(this.levels.watchRadius);
    for (const b of this.map.buildings) {
      if (b.kind !== "watchTower" || !this.intact(b)) continue;
      const c = center(b.rect);
      for (const e of this.enemiesNear(c.x, c.y, r)) e.marked = true;
    }
  }

  hurtEnemy(e: Enemy, amount: number) {
    if (e.hp <= 0) return;
    e.hp -= e.marked ? amount * 2 : amount;
    e.flash = 0.12;
    if (e.hp <= 0) this.effects.push({ kind: "spark", x: e.x, y: e.y, t: 0, r: ENEMIES[e.kind].size });
  }

  private stepEnemy(e: Enemy, dt: number) {
    const def = ENEMIES[e.kind];
    e.cd -= dt;
    const reach = def.size / 2 + 0.4;
    // Fight any defender in reach first.
    const foe = this.nearestDefender(e.x, e.y, reach + 0.2);
    if (foe) {
      if (e.cd <= 0) {
        e.cd = def.cooldown;
        foe.hp -= def.damage;
        foe.flash = 0.12;
      }
      return;
    }
    if (def.flying) {
      const k = center(this.keep.rect);
      if (rectDist(this.keep.rect, e.x, e.y) <= reach) return this.hitBuilding(e, this.keepId);
      return this.moveToward(e, k.x, k.y, def.speed, dt, true);
    }
    // A house that caught its eye.
    if (e.distract >= 0) {
      const b = this.map.buildings[e.distract];
      e.distractT -= dt;
      if (this.hp[b.id] <= 0 || !this.built[b.id] || e.distractT <= 0) e.distract = -1;
      else if (rectDist(b.rect, e.x, e.y) <= reach) return this.hitBuilding(e, b.id);
      else {
        const p = nearestPoint(b.rect, e.x, e.y);
        if (!this.moveToward(e, p.x, p.y, def.speed, dt)) e.distract = -1;
        return;
      }
    }
    const cx = clampCell(e.x, CELLS_W),
      cy = clampCell(e.y, CELLS_H);
    const here = cellIndex(cx, cy);
    if (rectDist(this.keep.rect, e.x, e.y) <= reach) return this.hitBuilding(e, this.keepId);
    // Pick the neighbouring cell with the lowest field value.
    let best = -1,
      bestV = this.field[here];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
        const n = cellIndex(nx, ny);
        if (dx && dy && (this.solid[cellIndex(cx + dx, cy)] || this.solid[cellIndex(cx, cy + dy)])) continue;
        if (this.field[n] < bestV) {
          bestV = this.field[n];
          best = n;
        }
      }
    if (best < 0) return;
    const bx = best % CELLS_W,
      by = (best - bx) / CELLS_W;
    if (this.solid[best]) {
      // The cheapest way on goes through a building: smash it.
      const bid = this.map.owner[best];
      if (rectDist(this.map.buildings[bid].rect, e.x, e.y) <= reach) return this.hitBuilding(e, bid);
      this.moveToward(e, bx + 0.5, by + 0.5, def.speed, dt);
      return;
    }
    // Streets are lined with temptations.
    e.rollT -= dt;
    if (e.rollT <= 0) {
      e.rollT = 0.5;
      if (def.distraction > 0 && this.rand() < def.distraction * 0.3) {
        for (const n of sideCells({ x: cx, y: cy, w: 1, h: 1 })) {
          const bid = this.map.owner[n];
          if (this.solid[n] && bid >= 0 && this.map.buildings[bid].kind === "house") {
            e.distract = bid;
            e.distractT = 5;
            break;
          }
        }
      }
    }
    this.moveToward(e, bx + 0.5 + e.jx, by + 0.5 + e.jy, def.speed, dt);
  }

  private hitBuilding(e: Enemy, id: number) {
    if (e.cd > 0) return;
    const def = ENEMIES[e.kind];
    e.cd = def.cooldown;
    this.damageBuilding(id, def.damage);
  }

  damageBuilding(id: number, amount: number) {
    if (this.hp[id] <= 0) return;
    this.hp[id] -= amount;
    this.flash[id] = BUILDING_FLASH;
    const b = this.map.buildings[id];
    if (this.hp[id] <= 0) {
      this.hp[id] = 0;
      this.built[id] = 0;
      for (const c of b.cells) this.solid[c] = 0;
      this.changed.push(...b.cells);
      const p = center(b.rect);
      this.effects.push({ kind: "dust", x: p.x, y: p.y, t: 0, r: Math.max(b.rect.w, b.rect.h) * 0.7 });
      this.fieldDirty = true;
      this.mapVersion++;
    }
  }

  private nearestDefender(x: number, y: number, r: number): Soldier | Civilian | null {
    let best: Soldier | Civilian | null = null,
      bd = r * r;
    for (const u of this.soldiers) {
      const d = (u.x - x) ** 2 + (u.y - y) ** 2;
      if (u.hp > 0 && d <= bd) {
        bd = d;
        best = u;
      }
    }
    for (const u of this.civilians) {
      const d = (u.x - x) ** 2 + (u.y - y) ** 2;
      if (u.hp > 0 && d <= bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  /** Steer a unit toward a point with light crowd separation; returns false
   * if it made no headway (stuck against something). */
  private moveToward(u: { x: number; y: number }, tx: number, ty: number, speed: number, dt: number, flying = false): boolean {
    let dx = tx - u.x,
      dy = ty - u.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.02) return true;
    dx /= len;
    dy /= len;
    // Separation from nearby enemies.
    let sx = 0,
      sy = 0;
    for (const o of this.enemiesNear(u.x, u.y, 0.45)) {
      if (o === u) continue;
      const ox = u.x - o.x,
        oy = u.y - o.y;
      const d = Math.hypot(ox, oy) || 0.01;
      sx += (ox / d) * (0.45 - d);
      sy += (oy / d) * (0.45 - d);
    }
    const step = Math.min(len, speed * dt);
    const mx = dx * step + sx * 0.5 * speed * dt * 4;
    const my = dy * step + sy * 0.5 * speed * dt * 4;
    const ox = u.x,
      oy = u.y;
    if (flying) {
      u.x += mx;
      u.y += my;
      return true;
    }
    if (!this.blocked(u.x + mx, u.y)) u.x += mx;
    if (!this.blocked(u.x, u.y + my)) u.y += my;
    return Math.abs(u.x - ox) + Math.abs(u.y - oy) > step * 0.1;
  }

  /** A small body centred at (x, y) would overlap a solid cell or leave the board. */
  blocked(x: number, y: number, r = 0.18): boolean {
    for (const [px, py] of [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ]) {
      if (px < 0 || py < 0 || px >= CELLS_W || py >= CELLS_H) return true;
      if (this.solid[cellIndex(Math.floor(px), Math.floor(py))]) return true;
    }
    return false;
  }

  // ── Towers ────────────────────────────────────────────────────────────
  private stepTowers(dt: number) {
    const range = archerRange(this.levels.archerRange);
    for (const b of this.map.buildings) {
      if (b.kind !== "archerTower" || !this.intact(b)) continue;
      const cd = (this.towerCd.get(b.id) ?? 0) - dt;
      if (cd > 0) {
        this.towerCd.set(b.id, cd);
        continue;
      }
      const c = center(b.rect);
      let target: Enemy | null = null,
        bd = Infinity;
      for (const e of this.enemiesNear(c.x, c.y, range)) {
        const d = (e.x - c.x) ** 2 + (e.y - c.y) ** 2;
        if (d < bd) {
          bd = d;
          target = e;
        }
      }
      if (!target) {
        this.towerCd.set(b.id, 0);
        continue;
      }
      this.towerCd.set(b.id, archerCooldown(this.levels.archerRate));
      this.arrows.push({ x: c.x, y: c.y - 0.6, target: target.id, damage: archerDamage(this.levels.archerDamage), tx: target.x, ty: target.y, life: 2 });
    }
  }

  private stepArrows(dt: number) {
    const byId = new Map(this.enemies.map((e) => [e.id, e]));
    for (const a of this.arrows) {
      a.life -= dt;
      const t = byId.get(a.target);
      if (t && t.hp > 0) {
        a.tx = t.x;
        a.ty = t.y;
      }
      const dx = a.tx - a.x,
        dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      const step = 16 * dt;
      if (d <= step) {
        if (t && t.hp > 0) this.hurtEnemy(t, a.damage);
        a.life = 0;
      } else {
        a.x += (dx / d) * step;
        a.y += (dy / d) * step;
      }
    }
    this.arrows = this.arrows.filter((a) => a.life > 0);
  }

  // ── Soldiers ──────────────────────────────────────────────────────────
  private stepBarracks(dt: number) {
    const cap = soldierCap(this.levels.barracksCapacity);
    for (const b of this.map.buildings) {
      if (b.kind !== "barracks" || !this.intact(b)) continue;
      const alive = this.soldiers.filter((s) => s.home === b.id).length;
      if (alive >= cap) {
        this.trainT.set(b.id, trainSeconds(this.levels.barracksTraining));
        continue;
      }
      const t = (this.trainT.get(b.id) ?? 0) - dt;
      if (t > 0) {
        this.trainT.set(b.id, t);
        continue;
      }
      this.trainT.set(b.id, trainSeconds(this.levels.barracksTraining));
      const door = this.doorOf(b);
      if (door < 0) continue;
      const scale = soldierScale(this.levels.soldierArms);
      this.soldiers.push({
        id: this.nextId++,
        home: b.id,
        x: (door % CELLS_W) + 0.5,
        y: Math.floor(door / CELLS_W) + 0.5,
        hp: SOLDIER.hp * scale,
        maxHp: SOLDIER.hp * scale,
        damage: SOLDIER.damage * scale,
        cd: 0,
        target: -1,
        path: [],
        thinkT: 0,
        flash: 0,
      });
    }
  }

  /** An open cell beside a building, preferring streets. */
  doorOf(b: Building): number {
    const sides = sideCells(b.rect).filter((i) => !this.solid[i]);
    return sides.find((i) => this.map.type[i] === CellType.ROAD) ?? sides[0] ?? -1;
  }

  private stepSoldier(s: Soldier, dt: number) {
    s.cd -= dt;
    s.thinkT -= dt;
    const home = this.map.buildings[s.home];
    const hc = center(home.rect);
    const leash = soldierLeash(this.levels.soldierReach ?? 0);
    const citywide = !Number.isFinite(leash);
    // Citywide patrols go after anything inside the city limits.
    const inReach = (e: Enemy) =>
      citywide ? this.map.city[cellIndex(clampCell(e.x, CELLS_W), clampCell(e.y, CELLS_H))] === 1 : (e.x - hc.x) ** 2 + (e.y - hc.y) ** 2 <= leash ** 2;
    let target = this.enemies.find((e) => e.id === s.target && e.hp > 0) ?? null;
    if (target && !inReach(target)) target = null;
    if (target && Math.hypot(target.x - s.x, target.y - s.y) <= SOLDIER.reach + ENEMIES[target.kind].size / 2) {
      if (s.cd <= 0) {
        s.cd = SOLDIER.cooldown;
        this.hurtEnemy(target, s.damage);
      }
      return;
    }
    if (s.thinkT <= 0) {
      s.thinkT = 0.5;
      // Nearest reachable enemy within the leash of the barracks.
      const candidates = (citywide ? this.enemies.filter(inReach) : this.enemiesNear(hc.x, hc.y, leash))
        .sort((a, b) => (a.x - s.x) ** 2 + (a.y - s.y) ** 2 - ((b.x - s.x) ** 2 + (b.y - s.y) ** 2))
        .slice(0, 3);
      target = null;
      s.path = [];
      for (const e of candidates) {
        const path = this.findPath(s.x, s.y, e.x, e.y, citywide ? 1e9 : leash * 3, citywide ? CELL_COUNT : 4000);
        if (path) {
          target = e;
          s.path = path;
          break;
        }
      }
      s.target = target ? target.id : -1;
      if (!target) {
        const door = this.doorOf(home);
        if (door >= 0 && Math.hypot(s.x - (door % CELLS_W) - 0.5, s.y - Math.floor(door / CELLS_W) - 0.5) > 1.2)
          s.path = this.findPath(s.x, s.y, (door % CELLS_W) + 0.5, Math.floor(door / CELLS_W) + 0.5, 400) ?? [];
      }
    }
    this.followPath(s, target, SOLDIER.speed, dt);
  }

  private followPath(u: { x: number; y: number; path: number[] }, chase: { x: number; y: number } | null, speed: number, dt: number) {
    while (u.path.length) {
      const c = u.path[0];
      const px = (c % CELLS_W) + 0.5,
        py = Math.floor(c / CELLS_W) + 0.5;
      if (Math.hypot(px - u.x, py - u.y) < 0.3) {
        u.path.shift();
        continue;
      }
      // Something was (re)built across the route, or we're wedged: replan.
      if (this.solid[c] || !this.moveToward(u, px, py, speed, dt)) u.path = [];
      return;
    }
    if (chase) this.moveToward(u, chase.x, chase.y, speed, dt);
  }

  /** A* over open cells (8-way, no corner cutting). Returns cell indices from
   * the start's neighbour up to the goal cell, or null. */
  findPath(sx: number, sy: number, gx: number, gy: number, maxCost: number, maxNodes = 4000): number[] | null {
    const start = cellIndex(clampCell(sx, CELLS_W), clampCell(sy, CELLS_H));
    const gcx = clampCell(gx, CELLS_W),
      gcy = clampCell(gy, CELLS_H);
    const goal = cellIndex(gcx, gcy);
    if (this.solid[goal]) return null;
    if (start === goal) return [];
    const g = new Map<number, number>([[start, 0]]);
    const prev = new Map<number, number>();
    const heap = new MinHeap();
    const h = (i: number) => {
      const x = i % CELLS_W,
        y = (i - x) / CELLS_W;
      const ax = Math.abs(x - gcx),
        ay = Math.abs(y - gcy);
      return Math.max(ax, ay) + (SQRT2 - 1) * Math.min(ax, ay);
    };
    heap.push(start, h(start));
    let expanded = 0;
    while (heap.size && expanded++ < maxNodes) {
      const i = heap.pop();
      if (i === goal) {
        const out: number[] = [];
        for (let c = goal; c !== start; c = prev.get(c)!) out.push(c);
        return out.reverse();
      }
      const gi = g.get(i)!;
      if (gi > maxCost) continue;
      const x = i % CELLS_W,
        y = (i - x) / CELLS_W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
          const n = cellIndex(nx, ny);
          if (this.solid[n]) continue;
          if (dx && dy && (this.solid[cellIndex(x + dx, y)] || this.solid[cellIndex(x, y + dy)])) continue;
          const ng = gi + (dx && dy ? SQRT2 : 1);
          if (ng < (g.get(n) ?? Infinity)) {
            g.set(n, ng);
            prev.set(n, i);
            heap.push(n, ng + h(n));
          }
        }
    }
    return null;
  }

  // ── Civilians ─────────────────────────────────────────────────────────
  private stepCivilians(dt: number) {
    // Refill the pool: a slot counts down after its civilian dies.
    const active = this.civilians.length;
    let free = 0;
    for (let i = 0; i < this.civilianRespawn.length; i++) {
      if (this.civilianRespawn[i] > 0) this.civilianRespawn[i] -= dt;
      else free++;
    }
    free -= active;
    if (free > 0) {
      const job = this.pickJob(center(this.keep.rect));
      if (job >= 0) this.spawnCivilian(job);
    }
    for (const c of this.civilians) {
      if (c.hp <= 0) continue;
      c.thinkT -= dt;
      if (c.state === "toJob") {
        if (this.solid[c.job] || !this.jobOpen(c.job, c)) {
          this.assignNext(c);
          continue;
        }
        const jx = (c.job % CELLS_W) + 0.5,
          jy = Math.floor(c.job / CELLS_W) + 0.5;
        if (Math.hypot(jx - c.x, jy - c.y) < 0.35) {
          c.state = "working";
          c.work = 0;
          continue;
        }
        if (!c.path.length && c.thinkT <= 0) {
          c.thinkT = 1;
          c.path = this.findPath(c.x, c.y, jx, jy, 400) ?? [];
          if (!c.path.length && Math.hypot(jx - c.x, jy - c.y) > 1.5) this.assignNext(c, c.job);
        }
        this.followPath(c, { x: jx, y: jy }, CIVILIAN.speed, dt);
      } else if (c.state === "working") {
        if (this.solid[c.job]) {
          this.assignNext(c);
          continue;
        }
        if (this.enemiesNear(c.x, c.y, 2.5).length) {
          // Too dangerous: come back to it later.
          this.assignNext(c, c.job);
          continue;
        }
        c.work += dt;
        if (c.work >= rebuildSeconds(this.levels.rebuildSpeed)) {
          this.rebuildCell(c.job);
          this.assignNext(c);
        }
      } else {
        const hx = center(this.map.buildings[c.home].rect);
        if (!c.path.length && c.thinkT <= 0) {
          c.thinkT = 1;
          const door = this.doorOf(this.map.buildings[c.home]);
          if (door >= 0) c.path = this.findPath(c.x, c.y, (door % CELLS_W) + 0.5, Math.floor(door / CELLS_W) + 0.5, 400) ?? [];
        }
        this.followPath(c, hx, CIVILIAN.speed, dt);
      }
    }
    // Civilians who died free their slot after a delay.
    for (const c of this.civilians)
      if (c.hp <= 0) {
        const slot = this.civilianRespawn.findIndex((t) => t <= 0);
        if (slot >= 0) this.civilianRespawn[slot] = CIVILIAN.respawnSeconds;
      }
  }

  private atHome(c: Civilian): boolean {
    if (c.state !== "home") return false;
    const b = this.map.buildings[c.home];
    return this.intact(b) && rectDist(b.rect, c.x, c.y) < 0.7;
  }

  private jobOpen(cell: number, self?: Civilian): boolean {
    return !this.civilians.some((o) => o !== self && o.hp > 0 && o.state !== "home" && o.job === cell);
  }

  /** Rubble most worth rebuilding: structures, then walls, then houses —
   * nearest first, skipping anything with enemies close by. */
  pickJob(from: { x: number; y: number }, skip = -1): number {
    let best = -1,
      bestScore = Infinity;
    for (const b of this.map.buildings) {
      if (this.intact(b) || b.kind === "keep") continue;
      const tier = b.kind === "house" ? 2 : b.kind === "wall" ? 1 : 0;
      for (const cell of b.cells) {
        if (this.solid[cell] || cell === skip || !this.jobOpen(cell)) continue;
        const x = (cell % CELLS_W) + 0.5,
          y = Math.floor(cell / CELLS_W) + 0.5;
        if (this.enemiesNear(x, y, 3).length) continue;
        const score = tier * 1000 + Math.hypot(x - from.x, y - from.y);
        if (score < bestScore) {
          bestScore = score;
          best = cell;
        }
      }
    }
    return best;
  }

  private assignNext(c: Civilian, skip = -1) {
    c.path = [];
    c.thinkT = 0;
    const job = this.pickJob(c, skip);
    if (job >= 0) {
      c.job = job;
      c.state = "toJob";
    } else {
      c.job = -1;
      c.state = "home";
      c.home = this.nearestHouse(c.x, c.y);
    }
  }

  private nearestHouse(x: number, y: number): number {
    let best = this.keepId,
      bd = Infinity;
    for (const b of this.map.buildings) {
      if (b.kind !== "house" || !this.intact(b)) continue;
      const d = rectDist(b.rect, x, y);
      if (d < bd) {
        bd = d;
        best = b.id;
      }
    }
    return best;
  }

  private spawnCivilian(job: number) {
    const jx = (job % CELLS_W) + 0.5,
      jy = Math.floor(job / CELLS_W) + 0.5;
    const house = this.map.buildings[this.nearestHouse(jx, jy)];
    const door = this.doorOf(house);
    if (door < 0) return;
    const hp = civilianHp(this.levels.civilianHealth);
    this.civilians.push({
      id: this.nextId++,
      x: (door % CELLS_W) + 0.5,
      y: Math.floor(door / CELLS_W) + 0.5,
      hp,
      maxHp: hp,
      job,
      state: "toJob",
      work: 0,
      path: [],
      home: house.id,
      thinkT: 0,
      flash: 0,
    });
  }

  /** Civilians restore a building one cell at a time; it regains its
   * function once the last cell is back. */
  rebuildCell(cell: number) {
    const id = this.map.owner[cell];
    if (id < 0 || this.solid[cell]) return;
    const b = this.map.buildings[id];
    this.solid[cell] = 1;
    this.changed.push(cell);
    this.built[id]++;
    this.hp[id] = Math.min(this.maxHp[id], this.hp[id] + this.maxHp[id] / b.cells.length);
    this.pushOut(cell);
    this.fieldDirty = true;
    this.mapVersion++;
  }

  /** Nudge any unit standing in a cell that just became solid. */
  private pushOut(cell: number) {
    const cx = cell % CELLS_W,
      cy = Math.floor(cell / CELLS_W);
    const units: { x: number; y: number }[] = [...this.enemies.filter((e) => !ENEMIES[e.kind].flying), ...this.soldiers, ...this.civilians];
    for (const u of units) {
      if (Math.floor(u.x) !== cx || Math.floor(u.y) !== cy) continue;
      let best: [number, number] | null = null,
        bd = Infinity;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx,
            ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H || this.solid[cellIndex(nx, ny)]) continue;
          const d = Math.hypot(nx + 0.5 - u.x, ny + 0.5 - u.y);
          if (d < bd) {
            bd = d;
            best = [nx + 0.5, ny + 0.5];
          }
        }
      if (best) [u.x, u.y] = best;
    }
  }

  // ── Consumables ───────────────────────────────────────────────────────
  dropBomb(x: number, y: number) {
    this.indexEnemies();
    for (const e of this.enemiesNear(x, y, BOMB_RADIUS)) this.hurtEnemy(e, BOMB_DAMAGE);
    this.effects.push({ kind: "boom", x, y, t: 0, r: BOMB_RADIUS });
  }
}

export function buildWave(wave: number, rand: () => number): EnemyKind[] {
  let budget = waveBudget(wave);
  const kinds = Object.values(ENEMIES).filter((d) => d.firstWave <= wave && !d.boss);
  const out: EnemyKind[] = [];
  while (budget > 0) {
    const pool = kinds.filter((d) => d.cost <= budget);
    if (!pool.length) break;
    const total = pool.reduce((s, d) => s + d.weight, 0);
    let r = rand() * total;
    const pick = pool.find((d) => (r -= d.weight) < 0) ?? pool[0];
    out.push(pick.kind);
    budget -= pick.cost;
  }
  // Every 10th wave brings warlords — one per ten waves — at the back of
  // the horde (the queue spawns from its end, so they go at the front).
  if (wave > 0 && wave % 10 === 0) for (let n = 0; n < wave / 10; n++) out.unshift("warlord");
  return out;
}

const clampCell = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v)));
export const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
function nearestPoint(r: Rect, x: number, y: number) {
  return { x: Math.max(r.x, Math.min(r.x + r.w, x)), y: Math.max(r.y, Math.min(r.y + r.h, y)) };
}
function rectDist(r: Rect, x: number, y: number) {
  const p = nearestPoint(r, x, y);
  return Math.hypot(p.x - x, p.y - y);
}
