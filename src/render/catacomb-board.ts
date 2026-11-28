// Draws a Catacomb hall (docs/CATACOMBS.md) on the board's canvas: crypt
// stone from the Tower's tiles, torches, the Lore tile, Ingots, the undead as
// native PNGs, the hero, and a popup for each strike.
// Presentation only: it reads the run and never changes it.
import type { Tile } from "../entities.ts";
import { paintContents, paintHero, paintTile, paintTorch, type BoardLook } from "./tile-painters.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import {undeadSprite, ingotSprite, buffSprite} from "../sprites/catacombs.ts";
import { drawKit, kitUrl } from "../sprites/kit.ts";
import { HALL_SIZE, hallCell, type HallCell } from "../catacombs/hall.ts";
import { hallTargets, SLOT_XS, CORRIDOR_ROW } from "../catacombs/hall.ts";
import { DROP_IDS, undeadStats, type UndeadId } from "../catacombs/catalog.ts";
import type { CatacombRun } from "../catacombs/state.ts";
import type { TurnEvent } from "../catacombs/turn.ts";
import type { TapEvent } from "../catacombs/taps.ts";

const N = HALL_SIZE, S = 24;
/** How long the hero takes to cross to a turn's tile (ms), and a strike's popup to rise and fade. */
const MOVE_MS = 140, POPUP_MS = 700;

const CRIT_COLOR = "#ffd23a", GOLD_COLOR = "#ffc93a";

/** A crosshair over an undead, pulsing: red-white, or gold. */
function paintCrosshair(c: CanvasRenderingContext2D, gold: boolean, now: number, reduceMotion: boolean) {
  const r = 8 + (reduceMotion ? 0 : Math.round(Math.sin(now / 160)));
  c.strokeStyle = "#000000aa";
  c.lineWidth = 3;
  c.beginPath(); c.arc(12, 12, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = gold ? GOLD_COLOR : "#ff5a5a";
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(12, 12, r, 0, Math.PI * 2); c.stroke();
  c.fillStyle = gold ? GOLD_COLOR : "#ffffff";
  c.fillRect(11, 12 - r - 3, 2, 5); c.fillRect(11, 12 + r - 2, 2, 5);
  c.fillRect(12 - r - 3, 11, 5, 2); c.fillRect(12 + r - 2, 11, 5, 2);
}

/** A small red potion: a cork, a glass neck, a round flask. */
function paintPotion(c: CanvasRenderingContext2D, now: number, reduceMotion: boolean) {
  const bob = reduceMotion ? 0 : Math.round(Math.sin(now / 250));
  c.save(); c.translate(0, bob);
  c.fillStyle = "#00000066"; c.fillRect(7, 19, 10, 2);
  c.fillStyle = "#8a5a2a"; c.fillRect(10, 5, 4, 2);
  c.fillStyle = "#cfe3f0"; c.fillRect(10, 7, 4, 3);
  c.fillStyle = "#cfe3f0"; c.fillRect(7, 10, 10, 9);
  c.fillStyle = "#e23a4a"; c.fillRect(8, 12, 8, 6);
  c.fillStyle = "#ff9aa4"; c.fillRect(9, 12, 2, 2);
  c.restore();
}

/** Native portrait URL for callers outside the shared icon renderer. */
export const undeadIconUrl = (id: UndeadId) => kitUrl(undeadSprite(id));

/** A strike's number rising off a tile. */
type Popup = { x: number; y: number; text: string; color: string; at: number };

export class CatacombBoard {
  private from: { x: number; y: number } | null = null;
  private to: { x: number; y: number } | null = null;
  private movedAt = -Infinity;
  private popups: Popup[] = [];
  private hitAt = -Infinity;
  private hitSlot = -1;

  constructor(private canvas: HTMLCanvasElement) {}

  /** A tap just made: a crosshair's hit, or a potion's MHP. */
  tapped(event: TapEvent, now: number) {
    if (event.kind === "crosshair") {
      this.popups.push({ x: SLOT_XS[event.slot]!, y: CORRIDOR_ROW, text: `-${short(event.hit)}`, color: event.gold ? GOLD_COLOR : event.crit ? CRIT_COLOR : "#ffffff", at: now });
      this.hitAt = now;
      this.hitSlot = event.slot;
    } else this.popups.push({ x: event.x, y: event.y, text: `+${short(event.mhp)}`, color: "#ff8a94", at: now });
  }

  /** A turn just taken: the hero's move to tween and the strike's popups. */
  turn(run: CatacombRun, event: TurnEvent | null, now: number, reduceMotion: boolean) {
    const at = { x: run.hero.x, y: run.hero.y };
    if (!this.to || this.to.x !== at.x || this.to.y !== at.y) {
      const descended = event?.kind === "descend" || event?.kind === "restart";
      this.from = descended || reduceMotion ? at : this.to ?? at;
      this.to = at;
      this.movedAt = now;
    }
    if (event?.kind === "round") {
      const x = SLOT_XS[event.slot]!;
      this.popups.push({ x, y: CORRIDOR_ROW, text: event.heroHit ? `-${short(event.heroHit)}` : "0", color: !event.heroHit ? "#8a8a8a" : event.crit ? CRIT_COLOR : "#ffffff", at: now });
      for (const b of event.barrage ?? []) this.popups.push({ x: SLOT_XS[b.slot]!, y: CORRIDOR_ROW, text: `-${short(b.hit)}`, color: "#9ad8ff", at: now });
      if (event.enemyHit) this.popups.push({ x: run.hero.x, y: run.hero.y, text: `-${short(event.enemyHit)}`, color: "#ff6060", at: now });
      this.hitAt = now;
      this.hitSlot = event.slot;
    }
    if (event?.kind === "pickup") this.popups.push({ x: event.target.x, y: event.target.y, text: `+${short(event.target.amount)}`, color: event.target.kind === "lore" ? "#e8c27a" : "#d7e3ef", at: now });
    if (this.popups.length > 12) this.popups.splice(0, this.popups.length - 12);
  }

  draw(run: CatacombRun, number: number, now: number, reduceMotion: boolean, styledSprites: boolean) {
    const box = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const width = N * S * Math.max(1, Math.ceil(box.width * dpr / (N * S)));
    if (this.canvas.width !== width) this.canvas.width = this.canvas.height = width;
    const c = this.canvas.getContext("2d")!, scale = width / (N * S);
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#05070a";
    c.fillRect(0, 0, N * S, N * S);
    const hall = run.hall;
    // `paintTile` reads north as y + 1, so the board is addressed bottom up: board y is the row from the bottom.
    const cell = (x: number, y: number): HallCell => hallCell(hall, x, N - 1 - y);
    const world = { tile: (x: number, y: number): Tile => ({ kind: cell(x, y) === "wall" || cell(x, y) === "torch" ? "wall" : "floor" }) };
    const look: BoardLook = { mode: "tower", tier: 3, height: hall, seed: hall, outside: false, entranceX: 0, reduceMotion, themed: null, styledSprites, spriteAnimations: false };
    const at = (row: number, x: number, draw: () => void) => { c.save(); c.translate(x * S, row * S); draw(); c.restore(); };
    for (let row = 0; row < N; row++) for (let x = 0; x < N; x++) {
      const y = N - 1 - row;
      at(row, x, () => paintTile(c, world, world.tile(x, y), x, y, now, 0, look));
    }
    // What lies in the hall: the stairs, the Lore and Ingots not yet taken, the torches.
    const targets = hallTargets(hall, number, run.slots), left = new Set(targets.slice(run.target).map((t) => `${t.x},${t.y}`));
    for (let row = 0; row < N; row++) for (let x = 0; x < N; x++) {
      const k = hallCell(hall, x, row);
      if (k === "stairs") at(row, x, () => paintContents(c, { kind: "stairs" }, { x, y: row, time: now, reduceMotion, styledSprites }));
      else if (k === "torch") at(row, x, () => paintTorch(c, { x, y: row, lightRadius: 0, baseIntensity: 0, active: true }, now, reduceMotion));
      else if (k === "lore" && left.has(`${x},${row}`)) at(row, x, () => drawKit(c, "cell", 3, 3, 18, 18));
      else if ((k === "brass" || k === "iron" || k === "steel" || k === "nickel") && left.has(`${x},${row}`)) at(row, x, () => drawKit(c, ingotSprite(k)));
    }
    // Potions on the side tiles.
    for (const [x, row] of run.potions) at(row, x, () => paintPotion(c, now, reduceMotion));
    // The undead, with their rank chevrons, their native Drop marks, what MHP they have left and their crosshairs.
    run.slots.forEach((slot, i) => {
      if (!slot) return;
      const x = SLOT_XS[i]!, full = undeadStats(slot.id, slot.strength, hall, number).mhp;
      const shake = !reduceMotion && i === this.hitSlot && now - this.hitAt < 160 ? Math.round(Math.sin((now - this.hitAt) / 18) * 2) : 0;
      at(CORRIDOR_ROW, x, () => {
        const bob = reduceMotion || slot.id !== "wisp" && slot.id !== "ghost" ? 0 : Math.round(Math.sin(now / 300 + i) * 1.5);
        drawKit(c, undeadSprite(slot.id), shake, bob, 24, 24);
        if (slot.strength !== "normal") rankChevrons(c, slot.strength, "#ffd85a", "#000000", 1, 1);
        c.fillStyle = "#000000aa"; c.fillRect(3, 21, 18, 3);
        c.fillStyle = "#c84aff"; c.fillRect(4, 22, Math.max(1, Math.round(16 * Math.min(1, slot.mhp / full))), 1);
        if (slot.mark) paintCrosshair(c, slot.mark === "gold", now, reduceMotion);
        // Slots are two tiles apart: two columns keep all four marks readable.
        DROP_IDS.filter((d) => slot.drops?.[d]).forEach((d, k) => {
          drawKit(c, buffSprite(d), 22 + (k % 2) * 12, Math.floor(k / 2) * 12, 12, 12);
        });
      });
    });
    // The hero, crossing to its tile.
    const t = this.to ? Math.min(1, (now - this.movedAt) / MOVE_MS) : 1, from = this.from ?? run.hero, to = this.to ?? run.hero;
    const hx = from.x + (to.x - from.x) * t, hy = from.y + (to.y - from.y) * t;
    c.save(); c.translate(Math.round(hx * S), Math.round(hy * S)); paintHero(c, { dx: 1, dy: 0 }); c.restore();
    // Torchlight and crypt dark: the walls fall away into black.
    const glow = c.createRadialGradient(hx * S + 12, hy * S + 12, S, hx * S + 12, hy * S + 12, S * 9);
    glow.addColorStop(0, "rgba(5,7,10,0)");
    glow.addColorStop(1, "rgba(5,7,10,0.55)");
    c.fillStyle = glow;
    c.fillRect(0, 0, N * S, N * S);
    // The strikes' numbers, rising and fading.
    c.font = "bold 9px monospace";
    c.textAlign = "center";
    this.popups = this.popups.filter((p) => now - p.at < POPUP_MS);
    for (const p of this.popups) {
      const k = (now - p.at) / POPUP_MS;
      c.globalAlpha = 1 - k;
      c.fillStyle = "#000000";
      c.fillText(p.text, p.x * S + 13, p.y * S + 3 - k * 10);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x * S + 12, p.y * S + 2 - k * 10);
    }
    c.globalAlpha = 1;
  }

  /** Forgets the tween and popups, so the next hall shown starts still. */
  reset() {
    this.from = this.to = null;
    this.popups = [];
  }
}

const short = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : `${Math.round(n * 10) / 10}`);
