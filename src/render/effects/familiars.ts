import { pointing } from "../../exact.ts";
import { FAMILIAR_IDS, type FamiliarId } from "../../familiars/catalog.ts";
import { pathOffset } from "../../familiars/paths.ts";
import type { Burst, FamiliarValues, Room } from "../../familiars/rules.ts";
import type { FamiliarsRun } from "../../familiars/save.ts";
import type { Point } from "../../entities.ts";
import { tileRandom } from "../../random.ts";
import type { ShownClock } from "../../shown.ts";
import { drawKit, kitImage } from "../../sprites/kit.ts";
import { forEachViewTile, tileCenter, toTileSpace, type FrameContext } from "../render-frame.ts";

// Familiars on the board (docs/agents/familiars.md): presentation only, all
// worked out from the run, the turn's clock and `now`. Their areas are drawn
// in the Arcana Effects Lab's pixel style: hard stepped rims and motes.

/** What the board draws of familiars: those working, where the run has them,
 * what they last set off and the turn's clock. */
export type FamiliarView = {
  run: FamiliarsRun; values: FamiliarValues; room: Room;
  fx: { bursts: readonly Burst[]; at: number } | null; clock: ShownClock | null;
};
export type AreaKind = Exclude<FamiliarId, "dragon">;

/** Each area's rim (outer, inner) and what comes and goes inside it. */
const AREAS: Record<AreaKind, { outer: string; inner: string; sprite: string; w: number; h: number }> = {
  slime: { outer: "#315363", inner: "#88c5db", sprite: "familiar-bolt", w: 8, h: 10 },
  wolf: { outer: "#493a2c", inner: "#b28a52", sprite: "familiar-sword", w: 9, h: 10 },
  falcon: { outer: "#80603d", inner: "#e1bb78", sprite: "familiar-sparkle", w: 9, h: 9 },
  wisp: { outer: "#3e4c59", inner: "#80608e", sprite: "familiar-mote", w: 5, h: 5 },
};
const AREA_ALPHA = 0.12;
const WHITE = "#ffffff";
const PARTICLE_MS = 1100;
const PARTICLE_SALT = 0xfa31;
/** How long the Slime's circle shows, which has no Duration. */
export const SHOCK_MS = 800;
/** How long the Dragon's flames fly. */
export const FLAME_MS = 550;
const FLAMES = 30;
/** Where the flames start, in tiles from the Dragon. */
const FLAMES_FROM = 0.5;
const FRAME_MS = 180;
/** The three frames, shown 1, 2, 3, 2. */
const FRAME_ORDER = [0, 1, 2, 1] as const;
export const familiarFrame = (now: number, still = false) => (still ? 1 : FRAME_ORDER[Math.floor(Math.max(0, now) / FRAME_MS) % FRAME_ORDER.length]!);

/** A row-by-row disc, or the band between two radii, in `unit` steps, as one path. */
function steppedBand(c: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, unit: number) {
  const halfAt = (radius: number, dy: number) => (Math.abs(dy) >= radius ? 0 : Math.round(Math.sqrt(radius * radius - dy * dy) / unit) * unit);
  const rows = Math.ceil(outer / unit), cx = Math.round(x), cy = Math.round(y);
  c.beginPath();
  for (let row = -rows; row < rows; row++) {
    const dy = (row + 0.5) * unit, wide = halfAt(outer, dy), hole = halfAt(inner, dy);
    if (!wide) continue;
    if (!hole) c.rect(cx - wide, cy + row * unit, wide * 2, unit);
    else {
      const band = Math.max(unit, wide - hole);
      c.rect(cx - wide, cy + row * unit, band, unit);
      c.rect(cx + wide - band, cy + row * unit, band, unit);
    }
  }
  c.fill();
}

/** An area's tint and rim round (x, y). */
function paintRim(c: CanvasRenderingContext2D, kind: AreaKind, x: number, y: number, radius: number, unit: number, battery: boolean) {
  const look = AREAS[kind];
  c.save();
  if (!battery) {
    c.globalAlpha = AREA_ALPHA;
    c.fillStyle = look.inner;
    steppedBand(c, x, y, radius, 0, unit);
    c.globalAlpha = 1;
  }
  c.fillStyle = battery ? WHITE : look.outer;
  steppedBand(c, x, y, radius, radius - unit, unit);
  if (!battery) {
    c.fillStyle = look.inner;
    steppedBand(c, x, y, radius - unit, radius - 2 * unit, unit);
  }
  c.restore();
}

/** The rims baked, by kind, size and look: hundreds of rows each, so a frame
 * copies one picture. A resize or an upgrade bakes again. */
const rims = new Map<string, HTMLCanvasElement>();
const RIMS_KEPT = 24;
function bakedRim(kind: AreaKind, radius: number, unit: number, battery: boolean) {
  if (typeof document === "undefined") return null;
  const r = Math.round(radius), key = `${kind}:${r}:${unit}:${battery}`, baked = rims.get(key);
  if (baked) return baked;
  if (rims.size >= RIMS_KEPT) rims.clear();
  const canvas = document.createElement("canvas"), half = r + 2 * unit;
  canvas.width = canvas.height = 2 * half;
  paintRim(canvas.getContext("2d")!, kind, half, half, r, unit, battery);
  rims.set(key, canvas);
  return canvas;
}

/** A familiar's area round (x, y): a stepped tint and double rim, and its
 * particles appearing and vanishing inside, from the clock alone. */
export function paintFamiliarArea(c: CanvasRenderingContext2D, kind: AreaKind, x: number, y: number, radius: number, tile: number, now: number, { still = false, battery = false, alpha = 1 } = {}) {
  const look = AREAS[kind], unit = Math.max(1, Math.round(tile / 24));
  c.save();
  c.globalAlpha = alpha;
  const rim = bakedRim(kind, radius, unit, battery);
  if (rim) c.drawImage(rim, Math.round(x) - rim.width / 2, Math.round(y) - rim.height / 2);
  else paintRim(c, kind, x, y, radius, unit, battery);
  if (!still && !battery) {
    const count = Math.max(5, Math.round((radius / tile) * 3));
    for (let i = 0; i < count; i++) {
      // In steps of a tenth of a second, as the pixel previews move.
      const clock = Math.floor(now / 100) * (100 / PARTICLE_MS) + tileRandom(i, 0, PARTICLE_SALT), cycle = Math.floor(clock), life = clock - cycle;
      if (life > 0.75) continue;
      const turn = tileRandom(i, cycle, PARTICLE_SALT + 1) * Math.PI * 2, out = Math.sqrt(tileRandom(cycle, i, PARTICLE_SALT + 2)) * radius * 0.85;
      const w = look.w * unit, h = look.h * unit;
      c.globalAlpha = alpha * (life < 0.15 || life > 0.6 ? 0.45 : 1);
      drawKit(c, look.sprite, Math.round(x + Math.cos(turn) * out - w / 2), Math.round(y + Math.sin(turn) * out - h / 2), w, h);
    }
  }
  c.restore();
}

/** A strip's `frame`, `size` square, into a `width` square at (x, y). */
function paintFrame(c: CanvasRenderingContext2D, id: string, frame: number, size: number, x: number, y: number, width: number, white = false) {
  const image = white ? silhouette(id) : kitImage(id);
  if (!image) return;
  c.imageSmoothingEnabled = false;
  c.drawImage(image, frame * size, 0, size, size, x, y, width, width);
}

/** A familiar's frame in a 24-unit square: what the board and the hatch reveal share. */
export function paintFamiliar(c: CanvasRenderingContext2D, id: FamiliarId, frame: number, white = false) {
  c.save();
  paintFrame(c, `familiar-${id}`, frame, 24, 0, 0, 24, white);
  c.restore();
}

/** The red, green and blue together under which a pixel is the outline's ink. */
const INK = 120;
const silhouettes = new Map<string, HTMLCanvasElement>();
/** A sprite in white on black, for Battery saver: all white but its outline and
 * eyes, so each still reads as itself. */
function silhouette(id: string) {
  const made = silhouettes.get(id);
  if (made) return made;
  const image = kitImage(id);
  if (!image || typeof document === "undefined") return image;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const c = canvas.getContext("2d")!;
  c.drawImage(image, 0, 0);
  const art = c.getImageData(0, 0, canvas.width, canvas.height), px = art.data;
  for (let i = 0; i < px.length; i += 4) {
    const tone = px[i]! + px[i + 1]! + px[i + 2]! < INK ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = tone;
  }
  c.putImageData(art, 0, 0);
  silhouettes.set(id, canvas);
  return canvas;
}

/** How far into the turn being shown `now` is, 0 to 1. */
const through = (clock: ShownClock | null, now: number, still: boolean) => (clock && !still ? Math.min(1, Math.max(0, (now - clock.at) / Math.max(1, clock.ms))) : 1);
/** `x` at the copy of it round the wrap nearest `near`. */
function nearest(x: number, near: number, wrap: number) {
  if (!wrap) return x;
  const d = (x - near) % wrap;
  return near + (Math.abs(d) > wrap / 2 ? d - Math.sign(d) * wrap : d);
}
/** `x` at the copy in or nearest the view. */
const inView = (f: FrameContext, x: number, wrap: number) => nearest(x, f.left + (f.n - 1) / 2, wrap);

/** Where the Wolf trots from the hero while it follows, and how quickly it
 * closes on that or on the point it dashes to, a second. */
const HEEL = { x: -0.8, y: -0.5 };
const TROT = 3;
const DASH = 14;

/** The familiars' drawing, with the one thing that isn't in the run: where
 * the Wolf has got to, lagging after the hero. */
export class FamiliarLayer {
  private wolf: Point | null = null;
  private wolfMoving = false;

  private placeOf(f: FrameContext, view: FamiliarView, id: Exclude<FamiliarId, "wolf">): Point {
    const turns = view.run[id]?.turns ?? 0, still = f.look.reduceMotion;
    const shown = turns ? turns - 1 + through(view.clock, f.now, still) : 0, offset = pathOffset(id, shown);
    // In the Delve the room goes along with the hero as drawn.
    const middle = view.room.wrap ? { x: f.playerX, y: f.playerY } : view.room.middle;
    return { x: middle.x + offset.x, y: middle.y + offset.y };
  }

  private wolfPlace(f: FrameContext, view: FamiliarView): Point {
    const state = view.run.wolf, planted = !!state?.left && !!state.at;
    const to = planted ? state!.at! : { x: f.playerX + HEEL.x, y: f.playerY + HEEL.y }, { wrap } = view.room;
    const was = this.wolf, dx = was ? nearest(to.x, was.x, wrap) - was.x : 0, dy = was ? to.y - was.y : 0;
    // A new run or a reload snaps it there rather than chasing across the board.
    if (!was || f.look.reduceMotion || Math.abs(dx) + Math.abs(dy) > 20) {
      this.wolfMoving = false;
      return (this.wolf = { x: to.x, y: to.y });
    }
    this.wolfMoving = Math.abs(dx) + Math.abs(dy) > 0.02;
    const k = this.wolfMoving ? Math.min(1, f.dt * (planted ? DASH : TROT)) : 1;
    return (this.wolf = { x: was.x + dx * k, y: was.y + dy * k });
  }

  /** What lies on the floor, under items and enemies: the lasting areas and the Slime's circle. */
  drawAreas(f: FrameContext, view: FamiliarView | undefined) {
    if (!view) return;
    const { values, run, fx, room } = view, how = { still: f.look.reduceMotion, battery: !!f.look.battery };
    const paint = (kind: AreaKind, at: Point, reach: number, alpha = 1) => {
      const { x, y } = tileCenter(f, inView(f, at.x, room.wrap), at.y);
      paintFamiliarArea(f.c, kind, x, y, (f.s * reach) / 100, f.s, f.now, { ...how, alpha });
    };
    for (const id of ["wisp", "falcon"] as const) if (values[id] && run[id]?.left) paint(id, this.placeOf(f, view, id), values[id]!.range);
    if (values.wolf && run.wolf?.left && run.wolf.at) paint("wolf", run.wolf.at, values.wolf.range);
    const age = fx ? f.now - fx.at : Infinity;
    if (age >= 0 && age < SHOCK_MS)
      for (const { id, area } of fx!.bursts) if (id === "slime") paint("slime", area, area.reach, how.still ? 1 : Math.min(1, (2 * (SHOCK_MS - age)) / SHOCK_MS));
  }

  /** What flies over the board, above the hero and the dark: the Dragon's flames and the familiars themselves. */
  drawAbove(f: FrameContext, view: FamiliarView | undefined, battery = false) {
    if (!view) {
      this.wolf = null;
      this.wolfMoving = false;
      return;
    }
    const { c, now, s } = f, still = f.look.reduceMotion, { wrap } = view.room;
    const age = view.fx ? now - view.fx.at : Infinity;
    c.save();
    if (!still && age >= 0 && age < FLAME_MS)
      for (const { id, area } of view.fx!.bursts) {
        if (id !== "dragon") continue;
        const k = age / FLAME_MS, out = FLAMES_FROM + (area.reach / 100 - FLAMES_FROM) * (1 - (1 - k) * (1 - k)), x = inView(f, area.x, wrap), size = s / 2;
        c.globalAlpha = Math.min(1, (1 - k) * 2.5);
        for (let i = 0; i < FLAMES; i++) {
          const way = pointing(i * (360 / FLAMES)), at = tileCenter(f, x + way.x * out, area.y + way.y * out);
          paintFrame(c, "familiar-flame", (Math.floor(now / 70) + i) % 3, 12, at.x - size / 2, at.y - size / 2, size, battery);
        }
      }
    c.restore();
    FAMILIAR_IDS.forEach((id, i) => {
      if (!view.values[id]) return;
      const at = id === "wolf" ? this.wolfPlace(f, view) : this.placeOf(f, view, id);
      c.save();
      toTileSpace(c, f, inView(f, at.x, wrap), at.y);
      paintFamiliar(c, id, familiarFrame(now + i * 67, still), battery);
      c.restore();
    });
  }

  /** Whether nothing of theirs is still playing out (their resting loop aside). */
  over(now: number, view: FamiliarView | undefined, still: boolean) {
    if (!view || still) return !view?.fx || now - view.fx.at >= SHOCK_MS;
    return !this.wolfMoving && (!view.clock || now - view.clock.at >= view.clock.ms) && (!view.fx || now - view.fx.at >= SHOCK_MS);
  }
}

/** The icons enemies wear, in every look: the burn at the top center, the
 * stun at the bottom center (Battery saver's board draws its own). */
export function drawEnemyStates(f: FrameContext, battery = false) {
  const { c } = f, flicker = !!f.look.spriteAnimations && !f.look.reduceMotion;
  forEachViewTile(f, (x, y) => {
    const t = f.world.tile(x, y), enemy = t?.enemy ?? t?.flyer;
    if (!enemy) return;
    const stunned = !battery && !!(enemy.stun || enemy.stunned);
    if (!enemy.burned && !stunned) return;
    c.save();
    toTileSpace(c, f, x, y);
    if (enemy.burned) {
      const image = battery ? silhouette("familiar-burn") : kitImage("familiar-burn"), lift = flicker ? Math.floor(f.now / 160 + x + y) % 2 : 0;
      c.imageSmoothingEnabled = false;
      if (image) c.drawImage(image, 0, 0, 8, 8, 8, -lift, 8, 8);
    }
    if (stunned) drawKit(c, "familiar-stun", 6, 16, 11, 8);
    c.restore();
  });
}
