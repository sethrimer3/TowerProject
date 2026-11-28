// Draws a Catacomb hall (docs/CATACOMBS.md) on the board's canvas: crypt
// stone from the Tower's tiles, torches, the Lore tile, Ingots, the undead in
// pixels until their PNGs are made, the hero, and a popup for each strike.
// Presentation only: it reads the run and never changes it.
import type { Tile } from "../entities.ts";
import { paintContents, paintHero, paintTile, paintTorch, type BoardLook } from "./tile-painters.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import { sprite } from "../sprites/pixel-sprite.ts";
import { drawKit } from "../sprites/kit.ts";
import { HALL_SIZE, hallCell, type HallCell } from "../catacombs/hall.ts";
import { hallTargets, SLOT_XS, CORRIDOR_ROW } from "../catacombs/hall.ts";
import { DROP_IDS, undeadStats, type DropId, type IngotId, type UndeadId } from "../catacombs/catalog.ts";
import type { CatacombRun } from "../catacombs/state.ts";
import type { TurnEvent } from "../catacombs/turn.ts";
import type { TapEvent } from "../catacombs/taps.ts";

const N = HALL_SIZE, S = 24;
/** How long the hero takes to cross to a turn's tile (ms), and a strike's popup to rise and fade. */
const MOVE_MS = 140, POPUP_MS = 700;

const UNDEAD_ART: Record<UndeadId, { rows: readonly string[]; colors: Record<string, string> }> = {
  wisp: { rows: ["....aa....", "...abba...", "..abccba..", "..bccccb..", ".abcwwcba.", ".bccwwccb.", ".bcccccb..", "..bcccb...", "...bcb....", "....b....."], colors: { a: "#3f6fb0", b: "#6fb4ff", c: "#bfe6ff", w: "#ffffff" } },
  ghost: { rows: ["...wwww...", "..wwwwww..", ".wwwwwwww.", ".wwkwwkww.", ".wwkwwkww.", ".wwwwwwww.", ".wwwkkwww.", ".wwwwwwww.", ".wwwwwwww.", ".w.ww.ww.w"], colors: { w: "#e8eef6", k: "#202838" } },
  skeleton: { rows: ["...bbbb...", "..bbbbbb..", "..bkbbkb..", "..bbbbbb..", "...bkkb...", "....bb....", ".bbbbbbbb.", "...b..b...", "..bbbbbb..", "..b....b.."], colors: { b: "#e6dfc8", k: "#1b1612" } },
  ghoul: { rows: ["...gggg...", "..gggggg..", "..grggrg..", "..gggggg..", "...gddg...", "..gggggg..", ".gg.gg.gg.", ".g..gg..g.", "...g..g...", "..gg..gg.."], colors: { g: "#7fa45a", r: "#ff4a3a", d: "#2e3d22" } },
  vampire: { rows: ["...kkkk...", "..kppppk..", "..prpprp..", "..pppppp..", "...pwwp...", ".kkkrrkkk.", "kkkkrrkkkk", "kkkkkkkkkk", ".kk.kk.kk.", "..k....k.."], colors: { k: "#1c1424", p: "#e9dce4", r: "#b0182e", w: "#ffffff" } },
  lich: { rows: ["..y.y.y...", "..yyyyy...", "..bbbbb...", "..bcbcb...", "..bbbbb...", ".ppppppp..", "ppcppppcp.", ".ppppppp..", ".ppppppp..", "pp.ppp.pp."], colors: { y: "#e7c24a", b: "#e6dfc8", c: "#6effe6", p: "#5a2e86" } },
  demon: { rows: ["h........h", "hh.rrrr.hh", ".hrrrrrrh.", "..ryrryr..", "..rrrrrr..", "...rkkr...", ".rrrrrrrr.", "rr.rrrr.rr", "...r..r...", "..rr..rr.."], colors: { h: "#3a2a22", r: "#c8322a", y: "#ffd23a", k: "#2a0a0a" } },
};

const INGOT_COLORS: Record<IngotId, [string, string, string]> = {
  brass: ["#7a5a1c", "#d4a23a", "#ffe08a"],
  iron: ["#3e4248", "#7d838c", "#c3c9d1"],
  steel: ["#4a5866", "#9fb2c4", "#e6f0fa"],
  nickel: ["#5c5a4e", "#b6b2a0", "#f1eedf"],
};

/** An Ingot bar, its edge dark and its top lit. */
function paintIngot(c: CanvasRenderingContext2D, ingot: IngotId) {
  const [dark, mid, light] = INGOT_COLORS[ingot];
  c.fillStyle = "#00000066"; c.fillRect(4, 17, 17, 3);
  c.fillStyle = dark; c.fillRect(4, 10, 16, 8);
  c.fillStyle = mid; c.fillRect(6, 8, 13, 8);
  c.fillStyle = light; c.fillRect(7, 8, 11, 2); c.fillRect(7, 11, 2, 1);
}

/** Each drop's pip on an undead: MXP purple, Loot Spirit green, Speed yellow, MHP red. */
const DROP_COLORS: Record<DropId, string> = { mxp: "#c84aff", loot: "#5fd27a", speed: "#ffe14a", mhp: "#ff4a4a" };
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

/** An undead's picture as an image, for the Codex: its pixel art on a 24 × 24 canvas. */
const undeadIcons = new Map<UndeadId, string>();
export function undeadIconUrl(id: UndeadId) {
  let url = undeadIcons.get(id);
  if (!url) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const art = UNDEAD_ART[id];
    sprite(canvas.getContext("2d")!, art.rows, art.colors, 2, 12, 12);
    url = canvas.toDataURL();
    undeadIcons.set(id, url);
  }
  return url;
}

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
    const width = Math.max(N * S, Math.round(box.width * dpr));
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
      else if ((k === "brass" || k === "iron" || k === "steel" || k === "nickel") && left.has(`${x},${row}`)) at(row, x, () => paintIngot(c, k));
    }
    // Potions on the side tiles, the red potion of a Tower or Delve run.
    for (const [x, row] of run.potions) at(row, x, () => paintContents(c, { kind: "potion", color: "red" }, { x, y: row, time: now, reduceMotion, styledSprites }));
    // The undead, with their rank chevrons, their drops' pips, what MHP they have left and their crosshairs.
    run.slots.forEach((slot, i) => {
      if (!slot) return;
      const x = SLOT_XS[i]!, full = undeadStats(slot.id, slot.strength, hall, number).mhp;
      const shake = !reduceMotion && i === this.hitSlot && now - this.hitAt < 160 ? Math.round(Math.sin((now - this.hitAt) / 18) * 2) : 0;
      at(CORRIDOR_ROW, x, () => {
        const bob = reduceMotion || slot.id !== "wisp" && slot.id !== "ghost" ? 0 : Math.round(Math.sin(now / 300 + i) * 1.5);
        const art = UNDEAD_ART[slot.id];
        sprite(c, art.rows, art.colors, 2, 12 + shake, 11 + bob);
        if (slot.strength !== "normal") rankChevrons(c, slot.strength, "#ffd85a", "#000000", 1, 1);
        c.fillStyle = "#000000aa"; c.fillRect(3, 21, 18, 3);
        c.fillStyle = "#c84aff"; c.fillRect(4, 22, Math.max(1, Math.round(16 * Math.min(1, slot.mhp / full))), 1);
        DROP_IDS.filter((d) => slot.drops?.[d]).forEach((d, k) => {
          c.fillStyle = "#000000"; c.fillRect(19, 1 + k * 5, 5, 5);
          c.fillStyle = DROP_COLORS[d]; c.fillRect(20, 2 + k * 5, 3, 3);
        });
        if (slot.mark) paintCrosshair(c, slot.mark === "gold", now, reduceMotion);
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
