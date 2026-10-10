import { wholeChange } from "./whole.ts";
import type { Coin, Encounter, Gain, GainArt, Heal, ShownFight } from "./state.ts";
import { paintContents } from "./tile-painters.ts";
import { materialImage } from "./material-sprites.ts";
import { paintGem } from "./gem-art.ts";
import { tileCenter, toTileSpace, type FrameContext } from "./render-frame.ts";

/** How long each popup shows, and the fade that ends it (ms). */
const POPUP_MS = 1000;
const FADE_MS = 250;
/** How far a popup rises over its life, in tiles. */
const REWARD_RISE = 0.7;
const DAMAGE_RISE = 0.9;
/** Damage numbers start this far up their tile, clear of the sprite struck. */
const DAMAGE_START = 0.35;
/** Rewards without a sprite are written in the feedback text's gold. */
const REWARD_COLOR = "#f3d69a";
/** Damage the hero deals, the darker damage it takes, and HP it heals. */
const DAMAGE_COLOR = "#ff4040";
const HERO_DAMAGE_COLOR = "#b3121f";
/** A critical strike's number: a little brighter, in a glow. */
const CRIT_COLOR = "#ff7a6a";
const CRIT_GLOW = "#ffb04a";
const HEAL_COLOR = "#5fdc6a";
/** Damage the shroud blocked, and how far apart it and the damage that got
 * through rise when a strike has both, in tiles. */
const SHROUD_COLOR = "#c9d3e0";
const SHROUD_SPLIT = 0.22;
/** The amount of Silver beside its coin. */
const SILVER_COLOR = "#d6dde6";
/** The minus sign on a key a door took. */
const SPENT_COLOR = "#ff6b6b";
/** The HUD's heart, raised with a check when a Heart Door opens. */
const BASE_URL = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const HEART_URL = `${BASE_URL}assets/ui/health.png`;
/** The HUD's Gold coin, raised beside the Gold or Silver found. */
const GOLD_URL = `${BASE_URL}assets/ui/gold.png`;
/** The HUD's Inspiration icon. */
export const INSPIRATION_URL = `${BASE_URL}assets/ui/upgrades.png`;
const images = new Map<string, HTMLImageElement>();
/** The UI sprite at `url`, or null while it loads. */
export function sprite(url: string) {
  if (typeof Image === "undefined") return null;
  let image = images.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    images.set(url, image);
  }
  return image.complete && image.naturalWidth ? image : null;
}
const heart = () => sprite(HEART_URL);
let silverCoin: HTMLCanvasElement | null = null;
/** The coin for `coin`, or null while it loads. There is no Silver art yet,
 * so Silver is the Gold coin drained of colour and brightened, as the
 * purse shows it (`.silver-sprite`), baked once. */
function coinImage(coin: Coin): CanvasImageSource | null {
  const gold = sprite(GOLD_URL);
  if (!gold || coin === "gold") return gold;
  if (!silverCoin) {
    const canvas = document.createElement("canvas"), c = canvas.getContext("2d")!;
    canvas.width = gold.naturalWidth;
    canvas.height = gold.naturalHeight;
    c.drawImage(gold, 0, 0);
    c.globalCompositeOperation = "saturation";
    c.fillStyle = "#808080";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.35;
    c.drawImage(canvas, 0, 0);
    c.globalCompositeOperation = "destination-in";
    c.globalAlpha = 1;
    c.drawImage(gold, 0, 0);
    silverCoin = canvas;
  }
  return silverCoin;
}
/** The enemy's HP bar: how long it takes to drain to each strike's HP (or
 * less, when the next strike lands sooner) and to fade once the enemy falls
 * (ms), its size and height over the enemy's tile (in tiles), and its
 * colours. */
const BAR_DRAIN_MS = 200;
const BAR_FADE_MS = 300;
const BAR_WIDTH = 0.8;
const BAR_HEIGHT = 0.1;
const BAR_RISE = 0.6;
const BAR_FILL = "#d8323a";
const BAR_EMPTY = "#2a0d10";
/** How far a strike leans into its target at the moment it lands, in tiles. */
const LUNGE = 0.3;

type Popup = { x: number; y: number; start: number };
/** A rising number's colour, how far it rises (tiles) and its size (of a tile). */
type TextStyle = { color: string; rise: number; size: number; glow?: string };
/** A reward without a sprite, written in gold. */
const REWARD_TEXT: TextStyle = { color: REWARD_COLOR, rise: REWARD_RISE, size: 0.42 };
/** A mark's colour, size (px in tile space) and alignment. */
type MarkStyle = { color: string; size: number; align?: CanvasTextAlign };
type Offset = { dx: number; dy: number };
const STILL: Offset = { dx: 0, dy: 0 };

/** What rises off the board over its tiles: the damage number of each strike
 * in a fight as it lands, the HP each potion heals, and each reward picked
 * up. Each starts the moment it happens, over whatever is still rising, and
 * later ones draw on top. */
export class BoardPopups {
  private rewards: (Popup & { gain: Gain })[] = [];
  /** Damage and heal numbers. */
  private numbers: (Popup & { text: string; color: string; glow?: string })[] = [];
  /** The last heal raised. */
  private healed = 0;
  private fight: ShownFight | null = null;
  /** How many of the fight's strikes have landed. */
  private landed = 0;
  private seed = NaN;

  /** Takes the game's new rewards, starting now (those that came together,
   * like a chest's Gold and materials, one after another), the latest
   * fight's strikes that have landed by `now`, and a new heal. A new run
   * clears whatever was still showing. */
  update(game: { run: { seed: number }; gains: Gain[]; fight: ShownFight | null; lastHeal: Heal | null }, now: number) {
    if (game.run.seed !== this.seed) {
      this.seed = game.run.seed;
      this.rewards = [];
      this.numbers = [];
    }
    const heal = game.lastHeal;
    if (heal && heal.id !== this.healed) {
      this.healed = heal.id;
      this.numbers.push({ x: heal.x, y: heal.y + DAMAGE_START, start: now, text: `+${wholeChange(heal.to - heal.from)}`, color: HEAL_COLOR });
    }
    let start = now;
    for (const gain of game.gains.splice(0)) {
      this.rewards.push({ x: gain.x, y: gain.y, start, gain });
      start += POPUP_MS;
    }
    this.strike(game.fight, now);
    this.rewards = this.rewards.filter((p) => now < p.start + POPUP_MS);
    this.numbers = this.numbers.filter((p) => now < p.start + POPUP_MS);
  }
  private strike(fight: ShownFight | null, now: number) {
    if (fight !== this.fight) {
      this.fight = fight;
      this.landed = 0;
    }
    if (!fight) return;
    const strikes = fight.bout.strikes, won = defeated(fight);
    while (this.landed < strikes.length && fight.start + strikes[this.landed].at <= now) {
      const s = strikes[this.landed++];
      // In summary, an enemy that falls has plainly lost all its HP, so only
      // what the hero took rises, over where the hero stands at the end.
      if (s.healed) this.heal(s.healed, won && fight.summary ? fight.to : fight.from, fight.start + s.at);
      if (!hiddenInSummary(fight, s)) this.raise(s, struckAt(fight, s, won), fight.start + s.at);
    }
  }
  /** The HP Lifesteal restored, in green over the hero (nothing when it
   * rounds to none). */
  private heal(amount: number, on: { x: number; y: number }, start: number) {
    const shown = wholeChange(amount);
    if (shown > 0) this.numbers.push({ x: on.x, y: on.y + DAMAGE_START, start, text: `+${shown}`, color: HEAL_COLOR });
  }
  /** A strike's numbers over `on` from `start`: the damage that got
   * through, and what the shroud blocked in silver beside it. A round the
   * hero came out ahead of raises only its green gain. */
  private raise(s: Strike, on: { x: number; y: number }, start: number) {
    if (s.by === "enemy" && s.healed && !s.damage && !s.shrouded) return;
    const both = !!s.shrouded && s.damage > 0, y = on.y + DAMAGE_START;
    if (s.shrouded) this.numbers.push({ x: on.x - (both ? SHROUD_SPLIT : 0), y, start, text: String(wholeChange(s.shrouded)), color: SHROUD_COLOR });
    if (s.shrouded && !s.damage) return;
    this.numbers.push({ x: on.x + (both ? SHROUD_SPLIT : 0), y, start, text: String(wholeChange(s.damage)), ...(s.crit ? { color: CRIT_COLOR, glow: CRIT_GLOW } : { color: s.by === "hero" ? DAMAGE_COLOR : HERO_DAMAGE_COLOR }) });
  }
  /** Nothing is rising or waiting to, and the enemy's HP bar is still. */
  idle(now: number) {
    return !this.rewards.length && !this.numbers.length && !barMoving(this.fight, now);
  }

  /** The enemy's HP bar, then every popup that has started, oldest first,
   * so newer ones draw on top. */
  draw(f: FrameContext) {
    if (this.fight) drawEnemyBar(f, this.fight);
    const shown = [
      ...this.numbers.map((p) => ({ start: p.start, draw: () => this.drawText(f, p, p.text, { color: p.color, rise: DAMAGE_RISE, size: 0.55, ...(p.glow ? { glow: p.glow } : {}) }) })),
      ...this.rewards.map((p) => ({
        start: p.start,
        draw: () => { if (!this.drawSprite(f, p)) this.drawText(f, p, p.gain.text, REWARD_TEXT); },
      })),
    ].filter((p) => p.start <= f.now).sort((a, b) => a.start - b.start);
    for (const p of shown) p.draw();
  }
  /** The popup's opacity and how far it has risen (in tiles) at `now`. */
  private phase(f: FrameContext, p: Popup, rise: number) {
    const age = f.now - p.start;
    return {
      alpha: Math.max(0, Math.min(1, (POPUP_MS - age) / FADE_MS)),
      rise: f.look.reduceMotion ? 0 : (rise * age) / POPUP_MS,
    };
  }
  private drawText(f: FrameContext, p: Popup, text: string, { color, rise, size, glow }: TextStyle) {
    const c = f.c, { alpha, rise: up } = this.phase(f, p, rise), at = tileCenter(f, p.x, p.y + up);
    c.save();
    c.globalAlpha = alpha;
    c.font = `700 ${Math.max(11, f.s * size)}px Cinzel`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = Math.max(2, f.s * 0.1);
    c.strokeStyle = "#000";
    c.strokeText(text, at.x, at.y);
    if (glow) {
      c.shadowColor = glow;
      c.shadowBlur = Math.max(6, f.s * 0.35);
    }
    c.fillStyle = color;
    c.fillText(text, at.x, at.y);
    c.restore();
  }
  /** The reward's own sprite, rising; false when it has none (yet). */
  private drawSprite(f: FrameContext, p: Popup & { gain: Gain }) {
    const art = p.gain.art;
    if (!art) return false;
    const image = artImage(art);
    if (!image && !paintsItself(art)) return false;
    const c = f.c, { alpha, rise } = this.phase(f, p, REWARD_RISE);
    c.save();
    c.globalAlpha = alpha;
    toTileSpace(c, f, p.x, p.y + rise);
    paintArt(c, f, p, image);
    c.restore();
    return true;
  }
}

type Strike = ShownFight["bout"]["strikes"][number];

/** How many of `hits`, in order, have landed by `t`. */
function landedBy(hits: Strike[], t: number) {
  let n = 0;
  while (n < hits.length && hits[n].at <= t) n++;
  return n;
}

/** The hero's felling strike in summary rounds, which raises no number. */
const hiddenInSummary = (fight: ShownFight, s: Strike) => fight.summary && s.by === "hero" && !s.hp;

/** Where a strike's number rises: over the enemy for the hero's strikes,
 * over the hero for the enemy's, except that in summary rounds the hero's
 * last loss to an enemy it felled rises where the hero ends, on the enemy's
 * tile. */
function struckAt(fight: ShownFight, s: Strike, won: boolean) {
  if (s.by === "hero") return fight.to;
  return fight.summary && won && s.at === fight.bout.duration ? fight.to : fight.from;
}

/** Art drawn without an image: a tile's contents, or the Gem. */
const paintsItself = (art: GainArt) => "tile" in art || "gem" in art;

/** The image a gain's art draws from, or null where it has none or it is
 * still loading. */
function artImage(art: GainArt): CanvasImageSource | null {
  if ("material" in art) return materialImage(art.material);
  if ("heart" in art) return heart();
  return "coin" in art ? coinImage(art.coin) : null;
}

/** A gain's art in tile space: a tile's contents (a key a door took with
 * its minus sign), the Gem, a coin after its amount, the Heart Door's heart
 * with a check, or a material with its count. */
function paintArt(c: CanvasRenderingContext2D, f: FrameContext, p: Popup & { gain: Gain }, image: CanvasImageSource | null) {
  const art = p.gain.art!;
  if ("tile" in art) return paintSpentTile(c, f, p, art);
  if ("gem" in art) return paintGem(c, f.now, true);
  c.imageSmoothingEnabled = false;
  if ("coin" in art) {
    // The amount, then the coin: "+5 ●" in place of "+5 Gold".
    c.drawImage(image!, 11, 3, 18, 18);
    mark(c, p.gain.text.split(" ")[0], { x: 10, y: 12 }, { color: art.coin === "gold" ? REWARD_COLOR : SILVER_COLOR, size: 10, align: "right" });
  } else if ("heart" in art) {
    c.drawImage(image!, 2, 2, 18, 18);
    check(c, 13, 13);
  } else {
    c.drawImage(image!, 3, 3, 18, 18);
    if (art.quantity > 1) mark(c, `×${art.quantity}`, { x: 18, y: 21 }, { color: REWARD_COLOR, size: 8, align: "left" });
  }
}

/** A tile's contents rising; a key a door took shifts right to make room
 * for its minus sign. */
function paintSpentTile(c: CanvasRenderingContext2D, f: FrameContext, p: Popup, art: Extract<GainArt, { tile: unknown }>) {
  const look = f.look;
  if (art.spent) c.translate(4, 0);
  paintContents(c, art.tile, { x: p.x, y: p.y, time: f.now, spritesOff: look.spritesOff, reduceMotion: look.reduceMotion, area1: look.area1, lifted: true });
  if (!art.spent) return;
  c.translate(-4, 0);
  mark(c, "−", { x: 3, y: 12 }, { color: SPENT_COLOR, size: 14 });
}

/** Whether the fight ends with the enemy felled. */
const defeated = (fight: ShownFight) => fight.bout.strikes.some((s) => s.by === "hero" && !s.hp);

/** The enemy's HP the bar shows at `now` and how visible it is: hidden
 * until the hero's first strike lands, draining steadily to each strike's
 * HP as it lands, then, once the enemy has fallen, fading away. A fight the
 * hero lost leaves it standing, showing what HP the enemy has left. */
export function enemyBar(fight: ShownFight, now: number): { hp: number; alpha: number } | null {
  const t = now - fight.start, hits = fight.bout.strikes.filter((s) => s.by === "hero");
  const i = landedBy(hits, t) - 1;
  if (i < 0) return null;
  const s = hits[i], from = i ? hits[i - 1].hp : fight.hp, drain = drainMs(hits, i),
    k = drain > 0 ? Math.min(1, (t - s.at) / drain) : 1;
  const hp = from + (s.hp - from) * k;
  if (s.hp || k < 1) return { hp, alpha: 1 };
  const fade = 1 - (t - s.at - drain) / BAR_FADE_MS;
  return fade > 0 ? { hp, alpha: fade } : null;
}
/** How long the bar drains after hit `i`: no longer than until the next. */
function drainMs(hits: Strike[], i: number) {
  const next = hits[i + 1];
  return next ? Math.min(BAR_DRAIN_MS, next.at - hits[i].at) : BAR_DRAIN_MS;
}
/** The bar is draining or fading, or waits for the hero's first strike. */
function barMoving(fight: ShownFight | null, now: number) {
  if (!fight) return false;
  const hits = fight.bout.strikes.filter((s) => s.by === "hero"), last = hits.at(-1);
  return !!last && now - fight.start < last.at + BAR_DRAIN_MS + (last.hp ? 0 : BAR_FADE_MS);
}
function drawEnemyBar(f: FrameContext, fight: ShownFight) {
  const bar = enemyBar(fight, f.now);
  if (!bar || !fight.hp) return;
  const c = f.c, at = tileCenter(f, fight.to.x, fight.to.y + BAR_RISE),
    w = f.s * BAR_WIDTH, h = Math.max(3, f.s * BAR_HEIGHT), x = at.x - w / 2, y = at.y - h / 2;
  c.save();
  c.globalAlpha = bar.alpha;
  c.fillStyle = "#000";
  c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = BAR_EMPTY;
  c.fillRect(x, y, w, h);
  c.fillStyle = BAR_FILL;
  c.fillRect(x, y, w * Math.max(0, Math.min(1, bar.hp / fight.hp)), h);
  c.restore();
}

/** How far the hero and the enemy lean into their strikes at `now`: whoever
 * is striking reaches toward the other, furthest as the strike lands. */
export function lunges(fight: Encounter | null, now: number, reduceMotion: boolean): { hero: Offset; enemy: Offset } {
  const t = fight ? now - fight.start : 0;
  const s = fight && !reduceMotion ? fight.bout.strikes.find((s) => s.start <= t && t < s.end) : undefined;
  if (!fight || !s) return { hero: STILL, enemy: STILL };
  const reach = LUNGE * Math.sin((Math.PI * (t - s.start)) / (s.end - s.start));
  const { dx, dy } = facing(fight);
  return s.by === "hero"
    ? { hero: { dx: dx * reach, dy: dy * reach }, enemy: STILL }
    : { hero: STILL, enemy: { dx: -dx * reach, dy: -dy * reach } };
}

/** The step from the hero to the enemy: one tile apart, though the
 * Delve's wrap can put them a board apart. */
function facing(fight: Encounter) {
  const across = fight.to.x - fight.from.x;
  return { dx: Math.sign(across) * (Math.abs(across) > 1 ? -1 : 1), dy: Math.sign(fight.to.y - fight.from.y) };
}

/** Outlined text in tile space: a count, or the minus on a spent key. */
function mark(c: CanvasRenderingContext2D, text: string, { x, y }: { x: number; y: number }, { color, size, align = "center" }: MarkStyle) {
  c.font = `700 ${size}px Cinzel`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.lineWidth = 2;
  c.strokeStyle = "#000";
  c.strokeText(text, x, y);
  c.fillStyle = color;
  c.fillText(text, x, y);
}

/** A green checkmark with its lower-left corner near (x, y), in tile space. */
function check(c: CanvasRenderingContext2D, x: number, y: number) {
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(x, y + 4);
  c.lineTo(x + 3, y + 7);
  c.lineTo(x + 9, y);
  c.strokeStyle = "#000";
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = HEAL_COLOR;
  c.lineWidth = 2;
  c.stroke();
}
