import { sprite } from "../sprites/pixel-sprite.ts";
import type { BossMinion, BossPart, CombatRound } from "./boss-variants.ts";

const MAGIC_TOWER_BOSS = [
  "...........ww...........",
  "..........wccw..........",
  ".........wccccw.........",
  "........gccccccg........",
  ".......gbccccccbg.......",
  ".......gbwcwwcwbg.......",
  "......ggbccccccbgg......",
  ".....ghgbccccccbghg.....",
  ".....ghgbbccccbbghg.....",
  "......gggbbbbbbggg......",
  "......dddbbbbbbdd.......",
  ".....dddbccccccbddd.....",
  ".....dddbccccccbddd.....",
  "....ddddbwccccwbdddd....",
  "....ddddbccccccbdddd....",
  "...gggggbccccccbggggg...",
  "..ghhhhhbbbbbbbbhhhhhg..",
  "..ggggggggddddgggggggg..",
  "...ddddddddddddddddd....",
  "...dddbbbddddddbbbddd...",
  "..ddddbbbddddddbbbdddd..",
  "..dddddddddddddddddddd..",
  ".gggggggggggggggggggggg.",
  "........................",
] as const;

const OBELISK_BOSS = [
  "...........rr...........",
  "..........rwwr..........",
  ".........rwwwwr.........",
  "........drrrrrrd........",
  "........ddrrrrdd........",
  ".......dddrwwrddd.......",
  ".......dddrwwrddd.......",
  "......ddddrrrrdddd......",
  "......ddddrwwrdddd......",
  ".....dddddrwwrddddd.....",
  ".....dddddrrrrddddd.....",
  ".....ddddrwwwwrdddd.....",
  "....dddddrwwwwrddddd....",
  "....ddddddrrrrdddddd....",
  "....ddddddrwwrdddddd....",
  "...dddddddrwwrddddddd...",
  "...dddddddrrrrddddddd...",
  "..ggggggggddddgggggggg..",
  "..ghhhhhhddddddhhhhhhg..",
  "..ggggggggddddgggggggg..",
  ".dddddddddddddddddddddd.",
  ".ddddrrrrrrrrrrrrrrdddd.",
  ".gggggggggggggggggggggg.",
  "........................",
] as const;

const PART_SPRITE = [
  "........................",
  "........................",
  ".........gggggg.........",
  ".......gghhhhhhgg.......",
  "......ghhccccccchhg.....",
  ".....ghccwwwwwwcchhg....",
  ".....ghcwwccccwwchhg....",
  "....ghccwccccccwcchhg...",
  "....ghccwccccccwcchhg...",
  "....ghccwwccccwwcchhg...",
  ".....ghccwwwwwwcchhg....",
  ".....gghhccccccchhgg....",
  "......ggbbbbbbbbgg......",
  ".......gddddddddg.......",
  "......ggddddddddgg......",
  ".....ghhddddddddhhg.....",
  ".....gggggggggggggg.....",
  "........................",
] as const;

const MINION_SPRITE = [
  "........................",
  "........................",
  "........gggggggg........",
  "......gghhhhhhhhgg......",
  ".....ghhccccccccchhg....",
  "....ghccwwccccwwcchhg...",
  "....ghccwwccccwwcchhg...",
  "....ghcccccccccccchhg...",
  ".....ghhccccccccchhg....",
  "......gghhbbbbhhgg......",
  ".......ggddddddgg.......",
  "......ggddddddddgg......",
  "......gdd..dd..ddg......",
  "........................",
] as const;

const TOWER_PALETTE = { d: "#1c2434", b: "#32496d", g: "#8a6d3b", h: "#e2c074", c: "#54d2ff", w: "#e8fbff" };
const OBELISK_PALETTE = { d: "#1a1423", g: "#6a4c7d", h: "#c49ce0", r: "#e84868", w: "#ffd4e2" };

export function drawMagicTowerBoss(c: CanvasRenderingContext2D, now = 0, reduceMotion = true) {
  c.save();
  if (!reduceMotion) c.translate(0, Math.round(Math.sin(now / 520)));
  sprite(c, MAGIC_TOWER_BOSS, TOWER_PALETTE, 1, 12, 12);
  c.restore();
}

export function drawObeliskBoss(c: CanvasRenderingContext2D, now = 0, reduceMotion = true) {
  c.save();
  if (!reduceMotion) c.translate(0, Math.round(Math.sin(now / 680)));
  sprite(c, OBELISK_BOSS, OBELISK_PALETTE, 1, 12, 12);
  c.restore();
}

export function drawBossPart(c: CanvasRenderingContext2D, part: BossPart, now = 0, reduceMotion = true) {
  const palette =
    part.kind === "turret"
      ? { d: "#241b1e", b: "#5c2832", g: "#8c6239", h: "#e6b86a", c: "#ff6852", w: "#ffe3d8" }
      : part.kind === "regen"
        ? { d: "#16261e", b: "#26593e", g: "#5c8c46", h: "#b5e67e", c: "#4be38a", w: "#e2ffed" }
        : { d: "#162030", b: "#2b4c7e", g: "#577ca8", h: "#a8d2ff", c: "#5cb8ff", w: "#eef8ff" };
  c.save();
  if (!reduceMotion) c.translate(0, Math.round(Math.sin(now / 450 + part.x)));
  sprite(c, PART_SPRITE, palette, 1, 12, 11);
  c.fillStyle = "#2b1e1a";
  c.fillRect(2, 22, 20, 2);
  c.fillStyle = part.kind === "turret" ? "#ff7b66" : part.kind === "regen" ? "#5ce892" : "#6bc4ff";
  c.fillRect(2, 22, Math.max(1, Math.round((20 * part.hp) / part.maxHp)), 2);
  c.restore();
}

export function drawBossMinion(c: CanvasRenderingContext2D, minion: BossMinion, now = 0, reduceMotion = true) {
  const palette = { d: "#1d2230", b: "#3c4b68", g: "#7c6240", h: "#d9b46e", c: "#b57cff", w: "#f5e8ff" };
  c.save();
  if (!reduceMotion) c.translate(0, Math.round(Math.sin(now / 380 + minion.id)));
  sprite(c, MINION_SPRITE, palette, 1, 12, 10);
  c.fillStyle = "#2b1e1a";
  c.fillRect(3, 22, 18, 2);
  c.fillStyle = "#e59866";
  c.fillRect(3, 22, Math.max(1, Math.round((18 * minion.hp) / minion.maxHp)), 2);
  c.restore();
}

export function drawCombatRoundOverlay(
  c: CanvasRenderingContext2D,
  round: CombatRound,
  progress: number,
  px: (x: number) => number,
  py: (y: number) => number,
) {
  const t = Math.max(0, Math.min(1, progress));
  c.save();

  // 1. Coin pop-out arcs (Magic Tower).
  for (const coin of round.coins) {
    const x0 = px(coin.from.x) + 12;
    const y0 = py(coin.from.y) + 12;
    const x1 = px(coin.to.x) + 12;
    const y1 = py(coin.to.y) + 12;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 18;
    c.fillStyle = coin.kind === "gold" ? "#ffd34d" : "#d9e6f5";
    c.beginPath();
    c.arc(cx, cy, 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#1b1408";
    c.lineWidth = 1;
    c.stroke();
  }

  // 2. Ranged shots & special pulse waves (Obelisk / Turret).
  for (const shot of round.shots) {
    const x0 = px(shot.from.x) + 12;
    const y0 = py(shot.from.y) + 12;
    const x1 = px(shot.to.x) + 12;
    const y1 = py(shot.to.y) + 12;
    if (shot.special) {
      c.strokeStyle = `rgba(232, 72, 104, ${1 - t * 0.7})`;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x0, y0, 8 + t * 90, 0, Math.PI * 2);
      c.stroke();
    }
    const bx = x0 + (x1 - x0) * t;
    const by = y0 + (y1 - y0) * t;
    c.strokeStyle = shot.special ? "#ff688b" : "#9c7cff";
    c.lineWidth = shot.special ? 3 : 2;
    c.beginPath();
    c.moveTo(x0 + (x1 - x0) * Math.max(0, t - 0.25), y0 + (y1 - y0) * Math.max(0, t - 0.25));
    c.lineTo(bx, by);
    c.stroke();
  }

  // 3. Melee slash & floating damage numbers.
  if (round.heroDamage > 0) {
    const tx = px(round.to.x) + 12;
    const ty = py(round.to.y) + 6 - t * 10;
    c.font = "bold 9px sans-serif";
    c.textAlign = "center";
    c.fillStyle = "#000";
    c.fillText(`-${round.heroDamage}`, tx + 1, ty + 1);
    c.fillStyle = "#ffe066";
    c.fillText(`-${round.heroDamage}`, tx, ty);
  }
  if (round.enemyDamage > 0) {
    const hx = px(round.from.x) + 12;
    const hy = py(round.from.y) + 6 - t * 10;
    c.font = "bold 9px sans-serif";
    c.textAlign = "center";
    c.fillStyle = "#000";
    c.fillText(`-${round.enemyDamage}`, hx + 1, hy + 1);
    c.fillStyle = "#ff6b6b";
    c.fillText(`-${round.enemyDamage}`, hx, hy);
  }

  c.restore();
}
