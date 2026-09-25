/** What DEFEND draws fresh each battle frame over the city layer: struck and
 * damaged buildings, blast scorches, then the units, projectiles and effects.
 * Every painter takes a `Brush`: the board's context and its pixels per cell. */
import { hash01 } from "./grid.ts";
import { ARCHER_UNIT, CIVILIAN, ENEMIES, SOLDIER, watchRadius, type EnemyDef } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center } from "./pathing.ts";
import type { CarriedLight } from "./lighting.ts";
import { BUILDING_FLASH, type DefendSim, type Effect, type Enemy, type Scorch } from "./sim.ts";

export type Brush = { c: CanvasRenderingContext2D; px: number };

/** Struck buildings flash pale for a moment; hurt houses and walls darken,
 * and other hurt structures wear a health bar. */
export function drawDamage(b: Brush, sim: DefendSim) {
  drawStrikes(b, sim);
  drawHurt(b, sim);
}

function drawStrikes({ c, px }: Brush, sim: DefendSim) {
  for (const bd of sim.map.buildings) {
    const f = sim.flash[bd.id];
    if (f <= 0 || !sim.intact(bd)) continue;
    const r = bd.rect;
    c.fillStyle = `rgba(255,244,220,${(f / BUILDING_FLASH) * 0.55})`;
    c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
  }
}

function drawHurt(b: Brush, sim: DefendSim) {
  for (const bd of sim.map.buildings) {
    const hp = sim.hp[bd.id],
      max = sim.maxHp[bd.id];
    if (!sim.intact(bd) || hp >= max) continue;
    if (bd.kind === "house" || bd.kind === "wall") shadeHurt(b, bd, hp / max);
    else healthBar(b, bd, hp / max);
  }
}

function shadeHurt({ c, px }: Brush, bd: Building, frac: number) {
  const r = bd.rect;
  c.fillStyle = `rgba(20,10,5,${(1 - frac) * 0.5})`;
  c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
}

function healthBar({ c, px }: Brush, bd: Building, frac: number) {
  const r = bd.rect;
  const bw = r.w * px,
    bh = Math.max(2, px * 0.22);
  c.fillStyle = "rgba(0,0,0,0.7)";
  c.fillRect(r.x * px, r.y * px - bh - 1, bw, bh);
  c.fillStyle = frac > 0.5 ? "#8fcf6a" : frac > 0.25 ? "#e3b14c" : "#d9635a";
  c.fillRect(r.x * px, r.y * px - bh - 1, bw * frac, bh);
}

/** Units, projectiles and effects. With `torches`, units carry a flame. */
export function drawUnits(b: Brush, sim: DefendSim, torches: boolean) {
  drawWatchRadii(b, sim);
  drawCivilians(b, sim, torches);
  drawSoldiers(b, sim, torches);
  for (const e of sim.enemies) drawEnemy(b, e);
  drawArrows(b, sim);
  drawShells(b, sim);
  for (const fx of sim.effects) drawEffect(b, fx);
}

/** Watch-tower radii, very faint. */
function drawWatchRadii({ c, px }: Brush, sim: DefendSim) {
  c.strokeStyle = "rgba(242,210,122,0.16)";
  c.lineWidth = Math.max(1, px * 0.08);
  for (const bd of sim.map.buildings) {
    if (bd.kind !== "watchTower" || !sim.intact(bd)) continue;
    const p = center(bd.rect);
    c.beginPath();
    c.arc(p.x * px, p.y * px, watchRadius(sim.levels.watchRadius) * px, 0, Math.PI * 2);
    c.stroke();
  }
}

/** Civilians, with a flicker of gold over those at work. */
function drawCivilians(b: Brush, sim: DefendSim, torches: boolean) {
  const { c, px } = b;
  for (const u of sim.civilians) {
    const s = Math.max(2, CIVILIAN.size * px);
    c.fillStyle = u.flash > 0 ? "#fff" : CIVILIAN.color;
    c.fillRect(u.x * px - s / 2, u.y * px - s / 2, s, s);
    if (torches) drawHandTorch(b, { x: u.x + CIVILIAN.size * 0.6, y: u.y - CIVILIAN.size * 0.4, id: u.id }, sim.time);
    if (u.state === "working" && Math.floor(sim.time * 6) % 2) {
      c.fillStyle = "#f2d27a";
      c.fillRect(u.x * px + s / 2, u.y * px - s, Math.max(1, s / 2), Math.max(1, s / 2));
    }
  }
}

/** Swordsmen and archers (who carry a little bow on the off side). */
function drawSoldiers(b: Brush, sim: DefendSim, torches: boolean) {
  const { c, px } = b;
  for (const u of sim.soldiers) {
    const archer = u.kind === "archer";
    const s = Math.max(2, (archer ? ARCHER_UNIT.size : SOLDIER.size) * px);
    c.fillStyle = archer ? "#1b3324" : "#1c2a40";
    c.fillRect(u.x * px - s / 2 - 1, u.y * px - s / 2 - 1, s + 2, s + 2);
    c.fillStyle = u.flash > 0 ? "#fff" : archer ? ARCHER_UNIT.color : SOLDIER.color;
    c.fillRect(u.x * px - s / 2, u.y * px - s / 2, s, s);
    if (archer) {
      c.fillStyle = "#b58a4f";
      c.fillRect(u.x * px - s / 2 - Math.max(1, s * 0.3), u.y * px - s / 2, Math.max(1, s * 0.2), s);
    }
    if (torches) drawHandTorch(b, { x: u.x + SOLDIER.size * 0.65, y: u.y - SOLDIER.size * 0.45, id: u.id }, sim.time);
  }
}

/** The flame of a unit's hand torch, held at `at`: a flickering pixel or two. */
function drawHandTorch({ c, px }: Brush, at: { x: number; y: number; id: number }, t: number) {
  const s = Math.max(1, px * 0.14);
  const f = Math.sin(t * 17 + at.id * 1.7) * 0.5 + 0.5;
  c.fillStyle = "#5a3b1e";
  c.fillRect(at.x * px - s / 2, at.y * px, s, s * 1.6);
  c.fillStyle = f > 0.5 ? "#ffe6a8" : "#ffb35c";
  c.fillRect(at.x * px - s / 2, at.y * px - s * (1 + f * 0.5), s, s * (1 + f * 0.5));
}

/** Enemies: tiny squares, gold-outlined when marked, with a shadow under
 * fliers; bosses get a dark rim, a crown and a health bar. */
function drawEnemy(b: Brush, e: Enemy) {
  const { c, px } = b;
  const def = ENEMIES[e.kind];
  const s = Math.max(2, Math.round(def.size * px));
  const x = Math.round(e.x * px - s / 2),
    y = Math.round(e.y * px - s / 2);
  if (e.marked) {
    c.fillStyle = "#f2c94c";
    c.fillRect(x - 1, y - 1, s + 2, s + 2);
  } else if (def.flying) {
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(x + px * 0.2, y + px * 0.35, s, s);
  }
  if (def.boss) {
    c.fillStyle = "#1a0606";
    c.fillRect(x - 1, y - 1, s + 2, s + 2);
  }
  c.fillStyle = e.flash > 0 ? "#fff" : def.color;
  c.fillRect(x, y, s, s);
  if (def.boss) drawBossMarks(b, e, { x, y, s });
}

/** A crown of spikes and a health bar, so the boss reads at a glance.
 * `sq` is its body square in canvas pixels. */
function drawBossMarks({ c, px }: Brush, e: Enemy, sq: { x: number; y: number; s: number }) {
  const { x, y, s } = sq;
  c.fillStyle = "#f2c94c";
  const k = Math.max(1, s / 5);
  for (let n = 0; n < 3; n++) c.fillRect(x + (n * (s - k)) / 2, y - k, k, k);
  const bw = s * 1.6,
    bh = Math.max(2, px * 0.18);
  c.fillStyle = "rgba(0,0,0,0.75)";
  c.fillRect(e.x * px - bw / 2, y - k - bh - 2, bw, bh);
  c.fillStyle = "#d9635a";
  c.fillRect(e.x * px - bw / 2, y - k - bh - 2, bw * Math.max(0, e.hp / e.maxHp), bh);
}

function drawArrows({ c, px }: Brush, sim: DefendSim) {
  c.strokeStyle = "#eadcb2";
  c.lineWidth = Math.max(1, px * 0.1);
  c.beginPath();
  for (const a of sim.arrows) {
    const dx = a.tx - a.x,
      dy = a.ty - a.y;
    const d = Math.hypot(dx, dy) || 1;
    c.moveTo(a.x * px, a.y * px);
    c.lineTo((a.x - (dx / d) * 0.6) * px, (a.y - (dy / d) * 0.6) * px);
  }
  c.stroke();
}

/** Cannon shells: an iron ball arcing over, its shadow on the ground. */
function drawShells({ c, px }: Brush, sim: DefendSim) {
  for (const sh of sim.shells) {
    const k = sh.t / sh.dur;
    const gx = sh.x0 + (sh.x1 - sh.x0) * k,
      gy = sh.y0 + (sh.y1 - sh.y0) * k;
    const lift = Math.sin(Math.PI * k) * (0.8 + Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) * 0.12);
    const s = Math.max(2, px * 0.3);
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(gx * px - s / 2, gy * px - s / 2, s, s * 0.7);
    c.fillStyle = "#1d1d20";
    c.fillRect(gx * px - s / 2, (gy - lift) * px - s / 2, s, s);
    c.fillStyle = "#6a6a70";
    c.fillRect(gx * px - s / 2, (gy - lift) * px - s / 2, Math.max(1, s / 3), Math.max(1, s / 3));
  }
}

/** A blast, a puff of dust from a collapse, or sparks from a hit. */
function drawEffect(b: Brush, fx: Effect) {
  const { c, px } = b;
  const k = fx.t / 0.6;
  if (fx.kind === "boom") return drawExplosion(b, fx, k);
  if (fx.kind === "dust") {
    c.fillStyle = `rgba(150,140,125,${0.45 * (1 - k)})`;
    c.beginPath();
    c.arc(fx.x * px, fx.y * px, fx.r * px * (0.6 + k * 0.6), 0, Math.PI * 2);
    c.fill();
    return;
  }
  c.fillStyle = `rgba(255,230,180,${1 - k})`;
  const s = Math.max(1, px * 0.15);
  for (let n = 0; n < 4; n++) {
    const a = n * 1.57 + fx.x;
    c.fillRect((fx.x + Math.cos(a) * k * 0.6) * px, (fx.y + Math.sin(a) * k * 0.6) * px, s, s);
  }
}

/** A ragged fireball `k` of the way through: noisy blob outlines (never a
 * clean circle) for the smoke, flame and white-hot core, plus flung sparks
 * and debris. */
function drawExplosion({ c, px }: Brush, fx: Effect, k: number) {
  const { x, y, r } = fx;
  const seed = fx.seed ?? 0;
  const blob = (radius: number, salt: number, wobble: number) => {
    const n = 16;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(seed, salt) * 0.8;
      const rr = radius * (1 - wobble + wobble * 2 * hash01(seed, salt, i % n));
      const px2 = (x + Math.cos(a) * rr) * px,
        py2 = (y + Math.sin(a) * rr * 0.9) * px;
      if (i === 0) c.moveTo(px2, py2);
      else c.lineTo(px2, py2);
    }
    c.closePath();
    c.fill();
  };
  const grow = 0.35 + 0.65 * Math.sqrt(k);
  c.save();
  // Smoke billows out and lingers darkest at the end.
  c.fillStyle = `rgba(40,32,28,${0.45 * (1 - k) * Math.min(1, k * 4)})`;
  blob(r * grow * 1.05, 1, 0.3);
  c.globalCompositeOperation = "lighter";
  c.fillStyle = `rgba(255,120,30,${0.75 * (1 - k)})`;
  blob(r * grow * 0.85, 2, 0.28);
  c.fillStyle = `rgba(255,200,90,${0.8 * (1 - k) ** 1.5})`;
  blob(r * grow * 0.55, 3, 0.25);
  c.fillStyle = `rgba(255,250,220,${0.9 * (1 - k) ** 3})`;
  blob(r * grow * 0.28, 4, 0.2);
  const s = Math.max(1, px * 0.12);
  for (let i = 0; i < 12; i++) {
    const a = hash01(seed, 20, i) * Math.PI * 2;
    const d = r * (0.3 + hash01(seed, 21, i) * 1.1) * Math.sqrt(k);
    c.fillStyle = i % 3 ? `rgba(255,190,90,${1 - k})` : `rgba(90,70,55,${1 - k})`;
    c.fillRect((x + Math.cos(a) * d) * px, (y + Math.sin(a) * d) * px, s, s);
  }
  c.restore();
}

// ── Scorches ──────────────────────────────────────────────────────────────

/** Branching cracks, glowing like cooling embers where a blast landed. */
export function drawScorches(b: Brush, sim: DefendSim) {
  for (const sc of sim.scorches) drawScorch(b, sc);
}

function drawScorch(b: Brush, sc: Scorch) {
  const { c, px } = b;
  const k = sc.t / sc.life;
  const heat = (1 - k) ** 1.6;
  // Scorched ground under the cracks.
  c.fillStyle = `rgba(20,14,10,${0.35 * (1 - k)})`;
  c.beginPath();
  c.ellipse(sc.x * px, sc.y * px, sc.r * 0.55 * px, sc.r * 0.5 * px, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.globalCompositeOperation = "lighter";
  c.lineCap = "round";
  const arms = 5 + (hash01(sc.seed, 30) * 3) | 0;
  // A wide dim glow under a narrow bright one.
  for (const [width, color] of [
    [0.22, `rgba(255,90,20,${0.35 * heat})`],
    [0.09, `rgba(255,190,90,${0.9 * heat})`],
  ] as const) {
    c.strokeStyle = color;
    c.lineWidth = Math.max(1, px * width);
    c.beginPath();
    for (let i = 0; i < arms; i++) traceCrack(b, sc, i, arms);
    c.stroke();
  }
  c.restore();
}

/** Crack `i` of `arms`: a wandering line out from the blast, with the odd
 * little fork. */
function traceCrack({ c, px }: Brush, sc: Scorch, i: number, arms: number) {
  let a = (i / arms) * Math.PI * 2 + hash01(sc.seed, 31, i) * 0.9;
  let cx = sc.x,
    cy = sc.y;
  c.moveTo(cx * px, cy * px);
  const len = sc.r * (0.45 + hash01(sc.seed, 32, i) * 0.45);
  const steps = 4;
  for (let j = 1; j <= steps; j++) {
    a += (hash01(sc.seed, 33, i * 7 + j) - 0.5) * 0.9;
    cx += (Math.cos(a) * len) / steps;
    cy += (Math.sin(a) * len) / steps;
    c.lineTo(cx * px, cy * px);
    if (j === 2 && hash01(sc.seed, 34, i) < 0.6) {
      const f = a + (hash01(sc.seed, 35, i) < 0.5 ? 0.9 : -0.9);
      c.lineTo((cx + Math.cos(f) * len * 0.3) * px, (cy + Math.sin(f) * len * 0.3) * px);
      c.moveTo(cx * px, cy * px);
    }
  }
}

/** Walking units' footprints for the lighting's shadow pass. */
export function shadowCasters(sim: DefendSim) {
  const def = (e: Enemy): EnemyDef => ENEMIES[e.kind];
  return [
    ...sim.soldiers.map((u) => ({ x: u.x, y: u.y, size: u.kind === "archer" ? ARCHER_UNIT.size : SOLDIER.size })),
    ...sim.civilians.map((u) => ({ x: u.x, y: u.y, size: CIVILIAN.size })),
    ...sim.enemies.filter((e) => !def(e).flying).map((e) => ({ x: e.x, y: e.y, size: def(e).size })),
  ];
}

/** Light that moves with the battle: every unit's hand torch, and each
 * blast's brief flash (wider and brighter, fading as it burns out). */
export function carriedLights(sim: DefendSim): CarriedLight[] {
  const torches: CarriedLight[] = [...sim.soldiers, ...sim.civilians].map((u) => ({ x: u.x, y: u.y, id: u.id }));
  for (const fx of sim.effects)
    if (fx.kind === "boom") torches.push({ x: fx.x, y: fx.y, id: fx.seed ?? 0, r: fx.r * 2.4, k: 1.6 * (1 - fx.t / 0.6) });
  return torches;
}
