import { paintLitTorch } from "./torch-fire.ts";
// Draws a Catacomb hall (docs/CATACOMBS.md) on the board's canvas: crypt
// stone from the Tower's tiles, torches, the Lore tile, Ingots, the undead as
// native PNGs, the hero, and what rises off the board as a run's does (its
// `BoardPopups`): each strike's number, a potion's heal, a pickup and a kill's
// drops; a tapped crosshair's Thunderbolt; and each one's sound.
// Presentation only: it reads the run and never changes it.
import type { Tile } from "../entities.ts";
import { paintContents, paintHero, paintRingedSprite, paintTile, type BoardLook } from "./tile-painters.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import {undeadSprite, ingotSprite, buffSprite, spiritSprite} from "../sprites/catacombs.ts";
import { BoardPopups, type PopupFrame } from "./board-popups.ts";
import { paintThunderbolt, paintThunderlight } from "./effects/thunderbolt.ts";
import { THUNDERBOLT_FALL_MS, THUNDERBOLT_FLASH_MS } from "../volley.ts";
import { playAfter, type Cue } from "../sound.ts";
import { popupAmount } from "../whole.ts";
import type { Gain } from "../shown.ts";
import type { Paid } from "../catacombs/combat.ts";
import type { SpiritRarity } from "../catacombs/catalog.ts";
import { drawKit, kitUrl } from "../sprites/kit.ts";
import { drawPixelOutline } from "../sprites/pixel-outline.ts";
import { BAR_DRAIN_MS, BAR_FADE_MS, BAR_RISE, paintHpBar } from "./hp-bar.ts";
import { HALL_SIZE, hallCell, type HallCell } from "../catacombs/hall.ts";
import { hallTargets, SLOT_XS, CORRIDOR_ROW } from "../catacombs/hall.ts";
import { DROP_IDS, undeadStats, type UndeadId } from "../catacombs/catalog.ts";
import type { CatacombRun } from "../catacombs/state.ts";
import type { TurnEvent } from "../catacombs/turn.ts";
import type { TapEvent } from "../catacombs/taps.ts";

const N = HALL_SIZE, S = 24;
/** How long the hero takes to cross to a turn's tile (ms). */
const MOVE_MS = 140;
/** A round's lean: the hero into its strike, and the undead into its own
 * this long after (ms), each as far as a run's (tiles) at its height. */
const LUNGE_MS = 200, LUNGE = 0.3, STRIKE_BACK_MS = 220;
/** A kill's drops rise once its number has begun to fade, as a run's do (ms). */
const DROP_HOLD_MS = 750;
/** Each Drop mark's width over an undead (tile units), one pixel of it a gap. */
const DROP_MARK = 10;

const GOLD_COLOR = "#ffc93a";
/** The amounts beside a drop's sprite: MXP's purple, each Spirit its rarity's colour, an Ingot's steel. */
const MXP_COLOR = "#c99aff", INGOT_COLOR = "#d7e3ef";
const SPIRIT_COLORS: Record<SpiritRarity, string> = {
  common: "#9fb4c8", uncommon: "#5fd27a", rare: "#4aa3ff", epic: "#b46cff", legendary: "#ffb23a", mythic: "#ff4a6a", ancestral: "#3affe0",
};

/** A crosshair over an undead, pulsing: red-white, or gold. */
function paintCrosshair(c: CanvasRenderingContext2D, gold: boolean, now: number, reduceMotion: boolean) {
  const r = 8 + (reduceMotion ? 0 : Math.round(Math.sin(now / 160)));
  // Turning slowly, a full turn every CROSSHAIR_TURN_MS.
  c.save();
  if (!reduceMotion) { c.translate(12, 12); c.rotate(((now % CROSSHAIR_TURN_MS) / CROSSHAIR_TURN_MS) * Math.PI * 2); c.translate(-12, -12); }
  c.strokeStyle = "#000000aa";
  c.lineWidth = 3;
  c.beginPath(); c.arc(12, 12, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = gold ? GOLD_COLOR : "#ff5a5a";
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(12, 12, r, 0, Math.PI * 2); c.stroke();
  c.fillStyle = gold ? GOLD_COLOR : "#ffffff";
  c.fillRect(11, 12 - r - 3, 2, 5); c.fillRect(11, 12 + r - 2, 2, 5);
  c.fillRect(12 - r - 3, 11, 5, 2); c.fillRect(12 + r - 2, 11, 5, 2);
  c.restore();
}
/** How long a crosshair takes to turn once. */
const CROSSHAIR_TURN_MS = 6000;

/** Native portrait URL for callers outside the shared icon renderer. */
export const undeadIconUrl = (id: UndeadId) => kitUrl(undeadSprite(id));

/** A hall tile in the popups' terms: their world y grows upward, the hall's rows count down. */
const up = (p: { x: number; y: number }) => ({ x: p.x, y: N - 1 - p.y });
const slotTile = (slot: number) => up({ x: SLOT_XS[slot]!, y: CORRIDOR_ROW });
/** A beaten undead's drops over its tile: its MXP, its Spirit above. */
function drops(slot: number, paid: Paid): Gain[] {
  const { x, y } = slotTile(slot);
  return [
    { x, y, text: `+${popupAmount(paid.mxp)} MXP`, art: { kit: buffSprite("mxp"), color: MXP_COLOR }, drop: { row: 0, with: false } },
    { x, y, text: `+${popupAmount(paid.spirit)} Spirit`, art: { kit: spiritSprite(paid.rarity), color: SPIRIT_COLORS[paid.rarity] }, drop: { row: 1, with: true } },
  ];
}
/** How far a strike leans `t` ms after it swings: out and back over `LUNGE_MS`, in tiles. */
const lunge = (t: number) => (t >= 0 && t < LUNGE_MS ? LUNGE * Math.sin((Math.PI * t) / LUNGE_MS) : 0);
/** An undead's HP bar as shown: draining from `from` to `to` since `at`,
 * of its `full` MHP; `gone` once it is banished, fading after the drain. */
type Bar = { from: number; to: number; at: number; full: number; gone?: boolean };
/** The MHP a bar shows at `now`, partway through its drain. */
const shownHp = (b: Bar, now: number) => b.from + (b.to - b.from) * Math.max(0, Math.min(1, (now - b.at) / BAR_DRAIN_MS));

export class CatacombBoard {
  private from: { x: number; y: number } | null = null;
  private to: { x: number; y: number } | null = null;
  private movedAt = -Infinity;
  /** The numbers and rewards rising: a run's own. */
  private popups = new BoardPopups();
  private hitAt = -Infinity;
  private hitSlot = -1;
  /** When the hero last struck, and when the undead strikes back. */
  private struckAt = -Infinity;
  private struckBackAt = -Infinity;
  /** Each slot's HP bar, as a run's fights show theirs. */
  private bars: (Bar | null)[] = [];
  /** Thunderbolts falling on tapped crosshairs: the slot, when it began, and a salt for its kinks. */
  private bolts: { slot: number; at: number; salt: number }[] = [];
  /** When each slot's last Thunderbolt lands: its bar drains from then. */
  private lands: number[] = [];

  /** `cue` plays a sound, `delay` ms from now: the game's own unless a test listens instead. */
  constructor(private canvas: HTMLCanvasElement, private cue: (cue: Cue, delay?: number) => void = playAfter) {}

  /** Which numbers and bars the Settings show: a run's rows. */
  settings(shown: { hitNumbers: boolean; hpGains: boolean; enemyBars: boolean }) {
    this.popups.settings(shown);
  }

  /** A tap just made: a crosshair calls a Thunderbolt down on its undead, its
   * number rising as it lands (a crit's in the crit's glow, a gold
   * crosshair's ringed in gold) with its drops if it fell; a potion rises
   * from its tile and its heal over the hero. */
  tapped(event: TapEvent, now: number, hero: { x: number; y: number }) {
    if (event.kind === "crosshair") {
      const lands = now + THUNDERBOLT_FALL_MS;
      this.bolts.push({ slot: event.slot, at: now, salt: Math.floor(now) % 97 });
      this.lands[event.slot] = lands;
      this.popups.hit(slotTile(event.slot), event.hit, "hero", lands, { crit: event.crit, pronounced: event.gold });
      if (event.paid) this.paid(event.slot, event.paid, lands, hero);
      this.hitAt = lands;
      this.hitSlot = event.slot;
      this.cue("lightningZap");
      if (event.killed) this.cue("bodyFall", THUNDERBOLT_FALL_MS);
    } else {
      // A potion raises no sprite, only its heal over the hero, as a run's does.
      this.popups.potionHeal(up(hero), event.mhp, now);
      this.cue("potion");
    }
  }

  /** A beaten undead's drops, rising once its number fades, and its MHP Drop's heal over the hero. */
  private paid(slot: number, paid: Paid, at: number, hero: { x: number; y: number }) {
    for (const gain of drops(slot, paid)) this.popups.reward(gain, at + DROP_HOLD_MS);
    if (paid.mhp) this.popups.potionHeal(up(hero), paid.mhp, at);
  }

  /** A turn just taken: the hero's move to tween and the strike's popups. */
  turn(run: CatacombRun, event: TurnEvent | null, now: number, reduceMotion: boolean) {
    const at = { x: run.hero.x, y: run.hero.y };
    if (!this.to || this.to.x !== at.x || this.to.y !== at.y) {
      const descended = event?.kind === "descend" || event?.kind === "restart";
      // A new hall's undead start with no bars.
      if (descended) this.bars = [];
      this.from = descended || reduceMotion ? at : this.to ?? at;
      this.to = at;
      this.movedAt = now;
    }
    // A round: the hero leans in and strikes, Barrage strikes the rest, and the undead, standing, strikes back.
    if (event?.kind === "round") {
      this.popups.hit(slotTile(event.slot), event.heroHit, "hero", now, { crit: event.crit });
      for (const b of event.barrage ?? []) {
        this.popups.hit(slotTile(b.slot), b.hit, "hero", now);
        if (b.paid) this.paid(b.slot, b.paid, now, run.hero);
      }
      if (event.paid) this.paid(event.slot, event.paid, now, run.hero);
      if (event.enemyHit) this.popups.hit(up(run.hero), event.enemyHit, "enemy", now + STRIKE_BACK_MS);
      this.struckAt = now;
      this.struckBackAt = event.killed ? -Infinity : now + STRIKE_BACK_MS;
      this.hitAt = now;
      this.hitSlot = event.slot;
      this.cue("punch");
      if (event.killed || event.barrage?.some((b) => b.killed)) this.cue("bodyFall");
      if (!event.killed) this.cue("punch", STRIKE_BACK_MS);
    }
    // A pickup rises from its tile as a run's does: Lore's tablet or the Ingot's bar, after its amount.
    if (event?.kind === "pickup") {
      const t = event.target, on = up(t);
      this.popups.reward(t.kind === "lore"
        ? { ...on, text: `+${popupAmount(t.amount)} Lore`, art: { cell: true } }
        : { ...on, text: `+${popupAmount(t.amount)} ${t.ingot}`, art: { kit: ingotSprite(t.ingot), color: INGOT_COLOR } }, now);
      this.cue("key");
    }
    if (event?.kind === "descend") this.cue("stoneSteps");
    if (event?.kind === "fall" || (event?.kind === "restart" && !event.stalemate)) this.cue("bodyFall");
  }

  /** Draws the hall; `bars` is the Enemy HP bars setting. */
  draw(run: CatacombRun, number: number, now: number, reduceMotion: boolean, styledSprites: boolean, bars = true) {
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
    const world = { tile: (x: number, y: number): Tile => ({ kind: cell(x, y) === "wall" ? "wall" : "floor" }) };
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
      if (k === "stairs") at(row, x, () => drawKit(c, "catacomb-stairs-down"));
      else if (k === "torch") at(row, x, () => paintLitTorch(c, x, row, now, reduceMotion, "blue"));
      else if (k === "lore" && left.has(`${x},${row}`)) at(row, x, () => drawKit(c, "cell", 3, 3, 18, 18));
      else if ((k === "brass" || k === "iron" || k === "steel" || k === "nickel") && left.has(`${x},${row}`)) at(row, x, () => drawKit(c, ingotSprite(k)));
    }
    // Potions on the side tiles, the red potion of a Tower or Delve run.
    for (const [x, row] of run.potions) at(row, x, () => paintContents(c, { kind: "potion", color: "red" }, { x, y: row, time: now, reduceMotion, styledSprites }));
    // The undead, with their rank chevrons, their native Drop marks, what MHP they have left and their crosshairs.
    run.slots.forEach((slot, i) => {
      if (!slot) return;
      const x = SLOT_XS[i]!;
      const shake = !reduceMotion && i === this.hitSlot && now >= this.hitAt && now - this.hitAt < 160 ? Math.round(Math.sin((now - this.hitAt) / 18) * 2) : 0;
      // The undead leans into the hero as it strikes back.
      const lean = !reduceMotion && i === this.hitSlot ? -lunge(now - this.struckBackAt) : 0;
      at(CORRIDOR_ROW, x + lean, () => {
        const bob = reduceMotion || slot.id !== "wisp" && slot.id !== "ghost" ? 0 : Math.round(Math.sin(now / 300 + i) * 1.5);
        // The red glow and black outline a run's enemy wears, brighter and gold-rimmed by rank.
        paintRingedSprite(c, undeadSprite(slot.id), slot.strength, shake, bob);
        if (slot.strength !== "normal") rankChevrons(c, slot.strength, "#ffd85a", "#000000", 1, 1);
        if (slot.mark) paintCrosshair(c, slot.mark === "gold", now, reduceMotion);
      });
    });
    // The hero, crossing to its tile.
    const t = this.to ? Math.min(1, (now - this.movedAt) / MOVE_MS) : 1, from = this.from ?? run.hero, to = this.to ?? run.hero;
    // Leaning into its strike, as a run's hero does.
    const hx = from.x + (to.x - from.x) * t + (reduceMotion ? 0 : lunge(now - this.struckAt)), hy = from.y + (to.y - from.y) * t;
    c.save(); c.translate(Math.round(hx * S), Math.round(hy * S)); paintHero(c, { dx: 1, dy: 0 }); c.restore();
    // Torchlight and crypt dark: the walls fall away into black.
    const glow = c.createRadialGradient(hx * S + 12, hy * S + 12, S, hx * S + 12, hy * S + 12, S * 9);
    glow.addColorStop(0, "rgba(5,7,10,0)");
    glow.addColorStop(1, "rgba(5,7,10,0.55)");
    c.fillStyle = glow;
    c.fillRect(0, 0, N * S, N * S);
    // Each struck undead's HP bar over it, draining to each strike as a run's does, fading once it is banished.
    this.drawBars(run, hall, number, now, bars, scale);
    // The Lore tablet and the Ingots are treasure: each wears the gold rim a run's pickups do, bright over the dark.
    for (let row = 0; row < N; row++) for (let x = 0; x < N; x++) {
      const k = hallCell(hall, x, row);
      if (!left.has(`${x},${row}`)) continue;
      if (k === "lore") at(row, x, () => drawPixelOutline(c, "cell", "gold", { x: 3, y: 3, w: 18, h: 18 }));
      else if (k === "brass" || k === "iron" || k === "steel" || k === "nickel") at(row, x, () => drawPixelOutline(c, ingotSprite(k), "gold"));
    }
    // Each undead's Drops in a row centred over it, above its HP bar and clear of the dark, so none stands between two undead.
    run.slots.forEach((slot, i) => {
      const held = DROP_IDS.filter((d) => slot?.drops?.[d]), left = 12 - (held.length * DROP_MARK - 1) / 2;
      // Each wears a light green rim, so it stands out against the crypt's stone.
      if (held.length) at(CORRIDOR_ROW, SLOT_XS[i]!, () => held.forEach((d, k) => {
        const spot = { x: left + k * DROP_MARK, y: -15, w: DROP_MARK - 1, h: DROP_MARK - 1 };
        drawPixelOutline(c, buffSprite(d), "green", spot);
        drawKit(c, buffSprite(d), spot.x, spot.y, spot.w, spot.h);
      }));
    });
    // Thunderbolts on tapped crosshairs: straight down to the undead, then its jagged light, as a run's.
    this.bolts = this.bolts.filter((b) => now - b.at < THUNDERBOLT_FALL_MS + THUNDERBOLT_FLASH_MS);
    for (const b of this.bolts) {
      const age = now - b.at, x = SLOT_XS[b.slot]!;
      c.save();
      paintThunderbolt(c, x * S + S / 2, CORRIDOR_ROW * S + S / 2, reduceMotion ? 1 : age / THUNDERBOLT_FALL_MS, x, CORRIDOR_ROW, b.salt, S);
      c.restore();
      if (age >= THUNDERBOLT_FALL_MS || reduceMotion) at(CORRIDOR_ROW, x, () => paintThunderlight(c, reduceMotion ? 0 : age));
    }
    // What rises off the board: a run's numbers and rewards, over the hall as a 17-tile view.
    this.popups.expire(now);
    const frame: PopupFrame = { c, now, s: S, n: N, left: 0, bottom: 0, look };
    this.popups.draw(frame);
  }

  /** Moves each slot's bar on to its MHP now and draws those struck. */
  private drawBars(run: CatacombRun, hall: number, number: number, now: number, shown: boolean, scale: number) {
    run.slots.forEach((slot, i) => {
      let b = this.bars[i] ?? null;
      if (slot) {
        const full = undeadStats(slot.id, slot.strength, hall, number).mhp;
        if (!b || b.gone || b.full !== full) b = { from: slot.mhp, to: slot.mhp, at: -Infinity, full };
        else if (b.to !== slot.mhp) b = { from: shownHp(b, now), to: slot.mhp, at: Math.max(now, this.lands[i] ?? now), full };
      } else if (b && !b.gone) b = { from: shownHp(b, now), to: 0, at: now, full: b.full, gone: true };
      if (b?.gone && now - b.at >= BAR_DRAIN_MS + BAR_FADE_MS) b = null;
      this.bars[i] = b;
      // Hidden until first struck, as in a run.
      if (!b || !shown || (!b.gone && b.to >= b.full && now - b.at >= BAR_DRAIN_MS)) return;
      const fading = b.gone ? now - b.at - BAR_DRAIN_MS : 0, alpha = fading > 0 ? 1 - fading / BAR_FADE_MS : 1;
      paintHpBar(this.canvas.getContext("2d")!, { x: SLOT_XS[i]! * S + S / 2, y: CORRIDOR_ROW * S + S / 2 - BAR_RISE * S }, S, shownHp(b, now) / b.full, alpha, 3 / scale);
    });
  }

  /** Forgets the tween, popups, bolts and bars, so the next hall shown starts still. */
  reset() {
    this.from = this.to = null;
    this.popups.clear();
    this.bolts = [];
    this.bars = [];
    this.lands = [];
  }
}
