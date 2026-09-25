/** DEFEND towers and their projectiles. Archer towers shoot the nearest
 * enemy in range with homing arrows; cannon towers lob a shell at the
 * nearest ground enemy (not too close), which bursts where the target stood
 * when it fired. */
import {
  archerCooldown,
  archerDamage,
  archerRange,
  CANNON_RANGE,
  cannonCooldown,
  cannonDamage,
  cannonSplash,
  ENEMIES,
} from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center, nearest } from "./pathing.ts";
import type { DefendSim } from "./sim.ts";

/** Cannons won't fire at anything closer than this (cells). */
const CANNON_MIN = 1.5;
/** Arrow speed, cells per second. */
const ARROW_SPEED = 16;

export class Towers {
  /** Seconds until each tower may fire again. */
  readonly cooldown = new Map<number, number>();

  step(sim: DefendSim, dt: number) {
    for (const b of sim.map.buildings) {
      if (!sim.intact(b)) continue;
      if (b.kind === "cannonTower") this.stepCannon(sim, b, dt);
      else if (b.kind === "archerTower") this.stepArcherTower(sim, b, dt);
    }
  }

  /** Counts the tower's cooldown down; true once it may fire. */
  private ready(b: Building, dt: number) {
    const cd = (this.cooldown.get(b.id) ?? 0) - dt;
    if (cd <= 0) return true;
    this.cooldown.set(b.id, cd);
    return false;
  }

  private stepArcherTower(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    const c = center(b.rect);
    const target = nearest(sim.enemiesNear(c.x, c.y, archerRange(sim.levels.archerRange)), c);
    if (!target) return this.cooldown.set(b.id, 0);
    this.cooldown.set(b.id, archerCooldown(sim.levels.archerRate));
    sim.arrows.push({ x: c.x, y: c.y - 0.6, target: target.id, damage: archerDamage(sim.levels.archerDamage), tx: target.x, ty: target.y, life: 2 });
  }

  private stepCannon(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    const c = center(b.rect);
    const ground = sim.enemiesNear(c.x, c.y, CANNON_RANGE).filter(
      (e) => !ENEMIES[e.kind].flying && (e.x - c.x) ** 2 + (e.y - c.y) ** 2 > CANNON_MIN * CANNON_MIN,
    );
    const target = nearest(ground, c);
    if (!target) return this.cooldown.set(b.id, 0);
    this.cooldown.set(b.id, cannonCooldown(sim.levels.cannonRate));
    const dist = Math.sqrt((target.x - c.x) ** 2 + (target.y - c.y) ** 2);
    sim.shells.push({
      x0: c.x,
      y0: c.y - 0.4,
      x1: target.x,
      y1: target.y,
      t: 0,
      dur: 0.45 + dist * 0.07,
      damage: cannonDamage(sim.levels.cannonDamage),
      r: cannonSplash(sim.levels.cannonDamage),
    });
  }
}

/** Arrows home in on their target (or where it died) and hit on arrival. */
export function stepArrows(sim: DefendSim, dt: number) {
  const byId = new Map(sim.enemies.map((e) => [e.id, e]));
  for (const a of sim.arrows) {
    a.life -= dt;
    const t = byId.get(a.target);
    const alive = t !== undefined && t.hp > 0;
    if (alive) {
      a.tx = t.x;
      a.ty = t.y;
    }
    const dx = a.tx - a.x,
      dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    const step = ARROW_SPEED * dt;
    if (d > step) {
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      continue;
    }
    if (alive) sim.hurtEnemy(t, a.damage);
    a.life = 0;
  }
  sim.arrows = sim.arrows.filter((a) => a.life > 0);
}

/** Shells fly their arc and burst on landing. */
export function stepShells(sim: DefendSim, dt: number) {
  for (const s of sim.shells) {
    s.t += dt;
    if (s.t >= s.dur) sim.explode(s.x1, s.y1, { r: s.r, damage: s.damage, friendlyFire: !sim.levels.cannonSafe });
  }
  sim.shells = sim.shells.filter((s) => s.t < s.dur);
}
