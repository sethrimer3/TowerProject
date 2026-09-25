import type { Tile } from "./entities.ts";
import { TILE_PX, waterAt, type Crate, type DecorSource, type TileDecor } from "./decor.ts";
import { GRASS, PixelBatch, withAlpha, WOOD } from "./decor-sprites.ts";

/** Decor's live state and how it reacts to the hero: crates that splinter
 * underfoot, tall grass that rustles and remembers being pushed through,
 * spores puffed from mushrooms, and ripples and splashes in pools. Owns the
 * particles, their physics, and how they are drawn. */

export type Particle = {
  gx: number; gy: number; z: number; vx: number; vy: number; vz: number;
  w: number; h: number; color: string; life: number; age: number;
  kind: "splinter" | "dust" | "drop" | "leaf" | "spore";
  glow?: boolean;
};
export type Ripple = { gx: number; gy: number; t0: number; life: number; speed: number };

export type TileAt = (x: number, y: number) => Tile;
/** One frame's update: seconds since the last, the time (ms), the hero's
 * interpolated tile position, and the board. */
export type EffectFrame = {
  src: DecorSource; dt: number; now: number; hx: number; hy: number; tileAt: TileAt; reduceMotion: boolean;
};

const tkey = (x: number, y: number) => `${x},${y}`;
/** Speed (tiles a second) above which the hero counts as moving. */
const WALKING = 0.4;

export class DecorEffects {
  /** Crates broken this session, by source + tile. */
  broken = new Set<string>();
  particles: Particle[] = [];
  ripples: Ripple[] = [];
  /** The hero's position at the last update, in tiles. */
  hero = { x: 0, y: 0 };
  /** Recent disturbance of each tall-grass tile (0..1), for its wobble. */
  private stir = new Map<string, number>();
  private heroTile = "";
  private lastRipple = 0;
  private inWater = false;

  /** `plan` returns a tile's decor, or null while it waits to be planned. */
  constructor(private plan: (x: number, y: number) => TileDecor | null) {}

  /** Drops the moving effects when the board changes. */
  reset() {
    this.particles = [];
    this.ripples = [];
    this.stir.clear();
  }

  /** Whether anything live is still settling (flying pieces, spreading
   * ripples, grass still wobbling), so the frame rate shouldn't drop yet. */
  get busy() {
    const moving = (p: Particle) => p.kind !== "splinter" || p.z > 0 || Math.abs(p.vx) + Math.abs(p.vy) > 0.5;
    return this.ripples.length > 0 || this.stir.size > 0 || this.particles.some(moving);
  }

  isBroken(key: string, x: number, y: number) {
    return this.broken.has(`${key}:${tkey(x, y)}`);
  }

  /** How much tile (x, y)'s tall grass is still wobbling (0..1). */
  stirAt(x: number, y: number) {
    return this.stir.get(tkey(x, y)) ?? 0;
  }

  /** Advances live effects and reacts to the hero: breaking crates,
   * stirring grass, rippling water. */
  update(f: EffectFrame) {
    const tx = Math.round(f.hx), ty = Math.round(f.hy);
    const dir = { x: f.hx - this.hero.x, y: f.hy - this.hero.y };
    const speed = Math.hypot(dir.x, dir.y) / Math.max(f.dt, 1e-3);
    this.hero = { x: f.hx, y: f.hy };
    const close = Math.hypot(f.hx - tx, f.hy - ty) < 0.45;
    const d = this.plan(tx, ty), standing = f.tileAt(tx, ty).kind === "floor";
    if (d && close && standing) this.stepOnto(f, { x: tx, y: ty }, d, dir);
    if (close) this.heroTile = tkey(tx, ty);
    this.settleStir(f.dt);
    if (speed > WALKING) this.stirAround(f, tx, ty);
    this.wade(f, speed);
    this.ripples = this.ripples.filter((r) => f.now - r.t0 < r.life);
    this.stepParticles(f.dt, f.tileAt);
  }

  /** Crates splinter the moment the hero steps onto them; grass and
   * mushrooms react once per tile entered. */
  private stepOnto(f: EffectFrame, at: { x: number; y: number }, d: TileDecor, dir: { x: number; y: number }) {
    const here = tkey(at.x, at.y), crate = `${f.src.key}:${here}`;
    if (d.crates.length && !this.broken.has(crate)) {
      this.broken.add(crate);
      if (!f.reduceMotion) this.shatter(at, d.crates, dir, f.now);
    }
    if (here === this.heroTile || f.reduceMotion) return;
    if (d.thicket) this.rustle(at.x, at.y);
    if (d.plants.some((p) => p.kind === "mushrooms")) this.puff(at.x, at.y, d);
  }

  /** Tall grass nearby remembers being pushed through, then settles. */
  private settleStir(dt: number) {
    for (const [k, e] of this.stir) {
      const next = e * Math.exp(-dt * 2.2);
      if (next < 0.01) this.stir.delete(k);
      else this.stir.set(k, next);
    }
  }

  private stirAround(f: EffectFrame, tx: number, ty: number) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy, near = 1 - Math.hypot(f.hx - x, f.hy - y);
        if (near > 0 && this.plan(x, y)?.thicket) this.stir.set(tkey(x, y), Math.min(1, this.stirAt(x, y) + near * f.dt * 5));
      }
  }

  /** Water around the hero's feet: a splash on entering, then ripples,
   * quicker while walking. */
  private wade(f: EffectFrame, speed: number) {
    const fgx = Math.round(f.hx * TILE_PX + 12), fgy = Math.round(-f.hy * TILE_PX + 20);
    const wet = waterAt(f.src, fgx, fgy);
    if (wet && !f.reduceMotion) {
      if (!this.inWater) this.splash(fgx, fgy, f.now);
      const walking = speed > WALKING;
      if (f.now - this.lastRipple > (walking ? 120 : 1500)) {
        this.lastRipple = f.now;
        this.ripples.push({ gx: fgx, gy: fgy, t0: f.now, life: walking ? 900 : 1600, speed: walking ? 13 : 8 });
      }
    }
    this.inWater = wet;
  }

  // ---------------------------------------------------------------- spawning

  /** Pieces fly on, away from the hero's step (screen y is down). */
  private shatter(at: { x: number; y: number }, crates: Crate[], dir: { x: number; y: number }, now: number) {
    const rng = mulberry(Math.floor(now) ^ (at.x * 73856093) ^ (at.y * 19349663));
    const push = Math.hypot(dir.x, dir.y) || 1;
    const fling = { x: dir.x / push, y: -dir.y / push };
    for (const c of crates) {
      const center = { x: at.x * TILE_PX + c.x + c.w / 2, y: -at.y * TILE_PX + c.y + c.h / 2 };
      const count = c.kind === "barrel" ? 7 : 9;
      for (let k = 0; k < count; k++) this.particles.push(splinter(rng, c, center, fling));
      for (let k = 0; k < 5; k++) this.particles.push(dust(rng, center));
    }
    this.trimParticles();
  }

  private rustle(x: number, y: number) {
    const rng = mulberry(x * 92821 + y * 68917 + this.particles.length);
    for (let k = 0; k < 4; k++)
      this.particles.push({
        gx: x * TILE_PX + 4 + rng() * 16, gy: -y * TILE_PX + 8 + rng() * 12, z: 5 + rng() * 4,
        vx: (rng() - 0.5) * 30, vy: (rng() - 0.5) * 16, vz: 10 + rng() * 20,
        w: 1, h: 2, color: GRASS[2 + Math.floor(rng() * 3)], life: 1.6 + rng(), age: 0, kind: "leaf",
      });
    this.trimParticles();
  }

  private puff(x: number, y: number, d: TileDecor) {
    const glow = d.plants.some((p) => p.kind === "mushrooms" && p.glow);
    const rng = mulberry(x * 1231 + y * 7717 + this.particles.length);
    for (const p of d.plants) {
      if (p.kind !== "mushrooms") continue;
      for (let k = 0; k < 7; k++)
        this.particles.push({
          gx: x * TILE_PX + p.i + (rng() - 0.5) * 4, gy: -y * TILE_PX + p.j - 1, z: 2,
          vx: (rng() - 0.5) * 16, vy: (rng() - 0.5) * 8, vz: 8 + rng() * 10,
          w: 1, h: 1, color: glow ? "rgba(170,255,200,0.9)" : "rgba(220,210,180,0.75)",
          life: 1.4 + rng() * 1.2, age: 0, kind: "spore", glow,
        });
    }
    this.trimParticles();
  }

  private splash(gx: number, gy: number, now: number) {
    const rng = mulberry(gx * 31 + gy * 17 + Math.floor(now));
    for (let k = 0; k < 6; k++) {
      const a = rng() * Math.PI * 2;
      this.particles.push({
        gx, gy, z: 1, vx: Math.cos(a) * 26, vy: Math.sin(a) * 16, vz: 40 + rng() * 30,
        w: 1, h: 1, color: "rgba(190,225,240,0.85)", life: 0.6, age: 0, kind: "drop",
      });
    }
    this.ripples.push({ gx, gy, t0: now, life: 1100, speed: 16 });
  }

  private trimParticles() {
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  // ---------------------------------------------------------------- physics

  /** Simple top-down physics: height with gravity and bounce, ground
   * friction, and wall collisions that bounce pieces back into the room. */
  private stepParticles(dt: number, tileAt: TileAt) {
    const solid = (gx: number, gy: number) => {
      const k = tileAt(Math.floor(gx / TILE_PX), -Math.floor(gy / TILE_PX)).kind;
      return k === "wall" || k === "door";
    };
    for (const p of this.particles) {
      p.age += dt;
      if (p.kind === "dust") drift(p, dt);
      else if (p.kind === "spore") float(p, dt);
      else tumble(p, dt, solid);
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  // ---------------------------------------------------------------- drawing

  /** Glowing spores, drawn as light over the darkness (`k` = glow strength). */
  drawSporeGlow(px: PixelBatch, k: number) {
    for (const p of this.particles) {
      if (!glowing(p)) continue;
      const a = k * (1 - p.age / p.life);
      px.add(`rgba(150,255,190,${a.toFixed(2)})`, Math.round(p.gx), Math.round(p.gy - p.z));
    }
  }

  /** Every other particle, with a ground shadow under flying splinters. */
  drawParticles(px: PixelBatch) {
    for (const p of this.particles) {
      if (glowing(p)) continue;
      const alpha = p.kind === "dust" ? 1 - p.age / p.life : Math.min(1, (p.life - p.age) / 0.8);
      if (alpha > 0) drawParticle(px, p, alpha);
    }
  }

  /** Grows `add`'s box around every particle drawParticles would draw. */
  particleBounds(add: (ax: number, ay: number, bx: number, by: number) => void) {
    for (const p of this.particles) {
      if (glowing(p)) continue;
      const size = p.kind === "dust" ? p.w + p.age * 4 + 1 : Math.max(p.w, p.h);
      add(p.gx - size, p.gy - p.z - size, p.gx + size + 1, p.gy + size + 2);
    }
  }
}

const glowing = (p: Particle) => p.kind === "spore" && !!p.glow;

function splinter(rng: () => number, c: Crate, center: { x: number; y: number }, fling: { x: number; y: number }): Particle {
  const wood = WOOD[c.tone % WOOD.length];
  const a = rng() * Math.PI * 2, sp = 30 + rng() * 70;
  const plank = rng() < 0.6, upright = plank && rng() < 0.4;
  return {
    gx: center.x + (rng() - 0.5) * c.w * 0.6, gy: center.y + (rng() - 0.5) * c.h * 0.6, z: c.lift + 3 + rng() * 4,
    vx: Math.cos(a) * sp + fling.x * 45, vy: Math.sin(a) * sp * 0.8 + fling.y * 45, vz: 50 + rng() * 70,
    w: upright ? 1 : plank ? 3 + Math.floor(rng() * 2) : 1, h: upright ? 2 : 1, color: wood[Math.floor(rng() * 3)],
    life: 14 + rng() * 6, age: 0, kind: "splinter",
  };
}

function dust(rng: () => number, center: { x: number; y: number }): Particle {
  const a = rng() * Math.PI * 2;
  return {
    gx: center.x, gy: center.y, z: 2, vx: Math.cos(a) * 18, vy: Math.sin(a) * 12, vz: 6 + rng() * 8,
    w: 2, h: 2, color: "rgba(170,150,120,0.5)", life: 0.7 + rng() * 0.4, age: 0, kind: "dust",
  };
}

function drift(p: Particle, dt: number) {
  p.gx += p.vx * dt; p.gy += p.vy * dt; p.z += p.vz * dt;
  p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3;
}

function float(p: Particle, dt: number) {
  p.gx += (p.vx + Math.sin(p.age * 3 + p.gy) * 4) * dt; p.gy += p.vy * dt; p.z += p.vz * dt;
  p.vz *= 1 - dt * 0.8; p.vx *= 1 - dt * 1.5;
}

/** Splinters, leaves and drops: they fall, bounce off walls, and land. */
function tumble(p: Particle, dt: number, solid: (gx: number, gy: number) => boolean) {
  const leaf = p.kind === "leaf";
  if (leaf) p.vx += Math.sin(p.age * 5 + p.gx) * 30 * dt;
  const nx = p.gx + p.vx * dt;
  if (solid(nx, p.gy)) p.vx = -p.vx * 0.45; else p.gx = nx;
  const ny = p.gy + p.vy * dt;
  if (solid(p.gx, ny)) p.vy = -p.vy * 0.45; else p.gy = ny;
  p.vz -= (leaf ? 40 : 320) * dt;
  p.z += p.vz * dt;
  if (p.z <= 0) land(p, dt);
}

/** Splinters bounce while they hit hard; everything else stops and slides. */
function land(p: Particle, dt: number) {
  p.z = 0;
  const splinter = p.kind === "splinter";
  if (splinter && Math.abs(p.vz) > 18) {
    p.vz = -p.vz * 0.32;
    p.vx *= 0.62; p.vy *= 0.62;
    return;
  }
  p.vz = 0;
  const f = Math.exp(-dt * (splinter ? 9 : 4));
  p.vx *= f; p.vy *= f;
}

function drawParticle(px: PixelBatch, p: Particle, alpha: number) {
  const gx = Math.round(p.gx), gy = Math.round(p.gy - p.z);
  if (p.kind === "splinter" && p.z > 1.5) px.add(`rgba(0,0,0,${(0.3 * alpha).toFixed(2)})`, Math.round(p.gx), Math.round(p.gy) + 1, p.w, 1);
  const col = alpha >= 0.99 ? p.color : withAlpha(p.color, alpha);
  const size = p.kind === "dust" ? Math.round(p.w + p.age * 4) : 0;
  if (size) px.add(col, gx - (size >> 1), gy - (size >> 1), size, size);
  else px.add(col, gx, gy, p.w, p.h);
}

function mulberry(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
