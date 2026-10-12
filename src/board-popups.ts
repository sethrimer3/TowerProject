import { wholeChange } from "./whole.ts";
import { HEAL_COLOR } from "./damage-labels.ts";
import type { Coin, Encounter, Gain, GainArt, Heal, ShownFight, Volley } from "./state.ts";
import { paintContents } from "./tile-painters.ts";
import { materialImage } from "./material-sprites.ts";
import { paintGem } from "./gem-art.ts";
import { RARITY_TIERS } from "./equipment/balance.ts";
import { iconPixels, materialPixels } from "./ui/equipment-icons.ts";
import { tileCenter, toTileSpace, type FrameContext } from "./render-frame.ts";

/** How long each popup shows, and the fade that ends it (ms). */
const POPUP_MS = 1000;
const FADE_MS = 250;
/** How far a popup rises over its life, in tiles. */
const REWARD_RISE = 0.7;
/** A kill's or a chest's drops rise together, one above another this far apart (tiles),
 * close but clear of each other. */
const DROP_ROW = 0.7;
/** A played-out fight's drops wait until its last numbers begin to fade,
 * so they rise clear of them (ms after the last strike lands). */
const DROP_HOLD_MS = POPUP_MS - FADE_MS;
const DAMAGE_RISE = 0.9;
/** Damage numbers start this far up their tile, clear of the sprite struck. */
const DAMAGE_START = 0.35;
/** Rewards without a sprite are written in the feedback text's gold. */
const REWARD_COLOR = "#f3d69a";
/** A Cell's yellow, its triangle and its amount alike. */
const CELL_COLOR = "#ffd83a";
/** Damage the hero deals and the darker damage it takes; HP it heals rises
 * in the labels' blue, `HEAL_COLOR`. */
const DAMAGE_COLOR = "#ff4040";
const HERO_DAMAGE_COLOR = "#b3121f";
/** A critical strike's number: a little brighter, in a glow. */
const CRIT_COLOR = "#ff7a6a";
const CRIT_GLOW = "#ffb04a";
/** A Charged Shot's number: a gold outline around its black one. */
const CHARGED_RING = "#ffd34d";
/** What the enemy's thorns cost it: yellow, never mistaken for a heal's blue
 * or green. */
const THORN_COLOR = "#ffd83d";
/** The check on a Heart Door's heart, and the plus on max HP raised. */
const CHECK_COLOR = "#5fdc6a";
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
/** The Gold coin, or null while it loads. */
export const goldCoin = () => sprite(GOLD_URL);
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
/** How long an arrow's HP bar stays drained before it fades (ms). */
const ARROW_BAR_HOLD_MS = 1000;
/** How far a strike leans into its target at the moment it lands, in tiles. */
const LUNGE = 0.3;
/** How far the hero gives way from a strike it parries, as a share of the
 * enemy's lunge. */
const PARRY_GIVE = 0.4;

type Popup = { x: number; y: number; start: number };
/** A rising number's colour, how far it rises (tiles) and its size (of a tile). */
type TextStyle = { color: string; rise: number; size: number; glow?: string; ring?: string };
/** A reward without a sprite, written in gold. */
const REWARD_TEXT: TextStyle = { color: REWARD_COLOR, rise: REWARD_RISE, size: 0.42 };
/** A mark's colour, size (px in tile space) and alignment. */
type MarkStyle = { color: string; size: number; align?: CanvasTextAlign };
type Offset = { dx: number; dy: number };
const STILL: Offset = { dx: 0, dy: 0 };

/** What rises off the board over its tiles: the damage number of each strike
 * in a fight as it lands, the HP each potion heals, and each reward picked
 * up. Each starts the moment it happens, over whatever is still rising, and
 * later ones draw on top, every number over every reward sprite. */
export class BoardPopups {
  private rewards: (Popup & { gain: Gain })[] = [];
  /** Damage and heal numbers. */
  private numbers: (Popup & { text: string; color: string; glow?: string; ring?: string })[] = [];
  /** The last heal raised. */
  private healed = 0;
  /** The fights still showing, oldest first, the game's latest last, each
   * with how many of its strikes have landed: an earlier one stays until
   * its strikes have landed and its HP bar has drained and faded, so a
   * fight that begins before the last one's bar is gone leaves it to finish. */
  private fights: { fight: ShownFight; landed: number }[] = [];
  private seed = NaN;
  /** The last turn's shots taken (ranged.ts), and the enemies' HP bars the
   * Archer's arrows raised: drained from `from` to `hp` out of `full` as
   * the arrow lands at `start`, held a while, then faded. */
  private volley: Volley | null = null;
  private arrowBars: { x: number; y: number; from: number; hp: number; full: number; start: number }[] = [];

  /** Takes the game's new rewards, starting now (those that came together
   * one after another, but a kill's or a chest's drops all at once,
   * stacked, and a played-out fight's once its last numbers fade), the latest
   * fight's strikes that have landed by `now`, and a new heal. A new run
   * clears whatever was still showing. */
  update(game: { run: { seed: number }; gains: Gain[]; fight: ShownFight | null; lastHeal: Heal | null; volley?: Volley | null }, now: number) {
    if (game.run.seed !== this.seed) {
      this.seed = game.run.seed;
      this.rewards = [];
      this.numbers = [];
      this.arrowBars = [];
    }
    const heal = game.lastHeal;
    if (heal && heal.id !== this.healed) {
      this.healed = heal.id;
      this.numbers.push({ x: heal.x, y: heal.y + DAMAGE_START, start: now, text: `+${wholeChange(heal.to - heal.from)}`, color: HEAL_COLOR });
    }
    let start = now - POPUP_MS;
    const held = dropsHeld(game.fight, now);
    for (const gain of game.gains.splice(0)) {
      const from = gain.drop && held && gain.x === held.x && gain.y === held.y ? held.until : now;
      // A kill's or a chest's drops start together, each in its row; anything else after the last.
      if (!gain.drop?.with || start < from) start = Math.max(from, start + POPUP_MS);
      this.rewards.push({ x: gain.x, y: gain.y + (gain.drop?.row ?? 0) * DROP_ROW, start, gain });
    }
    this.strike(game.fight, now);
    this.shots(game.volley ?? null);
    this.arrowBars = this.arrowBars.filter((b) => now < b.start + arrowBarMs(b));
    this.rewards = this.rewards.filter((p) => now < p.start + POPUP_MS);
    this.numbers = this.numbers.filter((p) => now < p.start + POPUP_MS);
  }
  private strike(fight: ShownFight | null, now: number) {
    // No fight (a new run, undo) clears every bar.
    if (!fight) this.fights = [];
    else if (fight !== this.fights.at(-1)?.fight) this.fights.push({ fight, landed: 0 });
    for (const shown of this.fights) this.land(shown, now);
    this.fights = this.fights.filter((shown) => shown.fight === fight || shown.landed < shown.fight.bout.strikes.length || barMoving(shown.fight, now));
  }
  /** Raises the numbers of `shown`'s strikes that have landed by `now`. */
  private land(shown: { fight: ShownFight; landed: number }, now: number) {
    const fight = shown.fight, strikes = fight.bout.strikes, won = defeated(fight);
    while (shown.landed < strikes.length && fight.start + strikes[shown.landed].at <= now) {
      const s = strikes[shown.landed++];
      // In summary, an enemy that falls has plainly lost all its HP, so only
      // what the hero took rises, over where the hero stands at the end.
      if (s.healed) this.heal(s.healed, won && fight.summary ? fight.to : fight.from, fight.start + s.at);
      if (!hiddenInSummary(fight, s)) this.raise(s, struckAt(fight, s, won), fight.start + s.at);
      // Summary rounds raise no thorns: they would only cover the drops.
      if (s.thorns && !fight.summary) this.thorns(s.thorns, fight, fight.start + s.at);
    }
  }
  /** A new turn's shots raise their numbers as they land: what a Ranged
   * enemy's shot cost the hero (with the shroud's share beside it), when it
   * cost any, over the hero; an arrow's damage over the enemy, with its HP
   * bar, and its Lifesteal over the hero. Undo (no volley) clears the bars. */
  private shots(volley: Volley | null) {
    if (volley === this.volley) return;
    this.volley = volley;
    if (!volley) {
      this.arrowBars = [];
      return;
    }
    const start = volley.at + volley.flight;
    for (const s of volley.shots) {
      if (s.by === "enemy") {
        if (s.damage > 0) this.raise({ by: "enemy", damage: s.damage, ...(s.shrouded ? { shrouded: s.shrouded } : {}), start: 0, at: 0, end: 0, hp: 0 }, s.to, start);
        continue;
      }
      this.raise({ by: "hero", damage: s.damage, ...(s.crit ? { crit: s.crit } : {}), start: 0, at: 0, end: 0, hp: s.hp ?? 0 }, s.to, start, s.charged);
      if (s.healed) this.heal(s.healed, s.from, start);
      if (s.full) this.arrowBars.push({ x: s.to.x, y: s.to.y, from: s.before ?? s.full, hp: s.hp ?? 0, full: s.full, start });
    }
  }
  /** What the enemy's thorns cost it, in yellow over the enemy, as the
   * strike's damage rises over the hero. */
  private thorns(amount: number, fight: ShownFight, start: number) {
    this.numbers.push({ x: fight.to.x, y: fight.to.y + DAMAGE_START, start, text: String(wholeChange(amount)), color: THORN_COLOR });
  }
  /** The HP Lifesteal restored, as a blue +N over the hero (nothing when it
   * rounds to none). */
  private heal(amount: number, on: { x: number; y: number }, start: number) {
    const shown = wholeChange(amount);
    if (shown > 0) this.numbers.push({ x: on.x, y: on.y + DAMAGE_START, start, text: `+${shown}`, color: HEAL_COLOR });
  }
  /** A strike's numbers over `on` from `start`: the damage that got
   * through, and what the shroud blocked in silver beside it. A round the
   * hero came out ahead of raises only its blue gain. A `charged` arrow's
   * number wears a gold outline around its black one. */
  private raise(s: Strike, on: { x: number; y: number }, start: number, charged = false) {
    if (s.by === "enemy" && s.healed && !s.damage && !s.shrouded) return;
    const both = !!s.shrouded && s.damage > 0, y = on.y + DAMAGE_START;
    if (s.shrouded) this.numbers.push({ x: on.x - (both ? SHROUD_SPLIT : 0), y, start, text: String(wholeChange(s.shrouded)), color: SHROUD_COLOR });
    if (s.shrouded && !s.damage) return;
    this.numbers.push({ x: on.x + (both ? SHROUD_SPLIT : 0), y, start, text: String(wholeChange(s.damage)), ...(s.crit ? { color: CRIT_COLOR, glow: CRIT_GLOW } : { color: s.by === "hero" ? DAMAGE_COLOR : HERO_DAMAGE_COLOR }), ...(charged ? { ring: CHARGED_RING } : {}) });
  }
  /** Nothing is rising or waiting to, and the enemy's HP bar is still. */
  idle(now: number) {
    return !this.rewards.length && !this.numbers.length && !this.arrowBars.length && !this.fights.some((shown) => barMoving(shown.fight, now));
  }

  /** Each enemy's HP bar, then every reward that has started, then every
   * number, each oldest first so newer ones draw on top. Numbers draw over
   * the rewards, so a potion's heal or a strike's damage is never hidden
   * behind a sprite rising from the same tile. */
  draw(f: FrameContext) {
    for (const shown of this.fights) drawEnemyBar(f, shown.fight);
    for (const bar of this.arrowBars) drawArrowBar(f, bar);
    const started = <T extends Popup>(popups: T[]) => popups.filter((p) => p.start <= f.now).sort((a, b) => a.start - b.start);
    for (const p of started(this.rewards)) if (!this.drawSprite(f, p)) this.drawText(f, p, p.gain.text, REWARD_TEXT);
    for (const p of started(this.numbers)) this.drawText(f, p, p.text, { color: p.color, rise: DAMAGE_RISE, size: 0.55, ...(p.glow ? { glow: p.glow } : {}), ...(p.ring ? { ring: p.ring } : {}) });
  }
  /** The popup's opacity and how far it has risen (in tiles) at `now`. */
  private phase(f: FrameContext, p: Popup, rise: number) {
    const age = f.now - p.start;
    return {
      alpha: Math.max(0, Math.min(1, (POPUP_MS - age) / FADE_MS)),
      rise: f.look.reduceMotion ? 0 : (rise * age) / POPUP_MS,
    };
  }
  private drawText(f: FrameContext, p: Popup, text: string, { color, rise, size, glow, ring }: TextStyle) {
    const c = f.c, { alpha, rise: up } = this.phase(f, p, rise), at = tileCenter(f, p.x, p.y + up);
    c.save();
    c.globalAlpha = alpha;
    c.font = `700 ${Math.max(11, f.s * size)}px Cinzel`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const outline = Math.max(2, f.s * 0.1);
    if (ring) {
      // The gold outline, wider, under the black one.
      c.lineJoin = "round";
      c.lineWidth = outline * 2.2;
      c.strokeStyle = ring;
      c.strokeText(text, at.x, at.y);
    }
    c.lineWidth = outline;
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
    if (!image && !paintsItself(art, !!f.look.themed)) return false;
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

/** What takes the enemy's HP, in order: the hero's strikes and the
 * thorns of the enemy's own, each landing at `at` and leaving it `hp`.
 * The enemy's HP only falls, so each hit leaves no more than the one
 * before: a summary round lands the hero's strikes, felling one and all,
 * before the enemy's, whose thorns left it the HP of an earlier strike. */
type Hit = { at: number; hp: number };
function enemyHits(fight: ShownFight): Hit[] {
  let left = fight.hp;
  return fight.bout.strikes.flatMap((s) => {
    const hp = s.by === "hero" ? s.hp : s.thornHp;
    if (hp === undefined) return [];
    left = Math.min(left, hp);
    return [{ at: s.at, hp: left }];
  });
}

/** How many of `hits`, in order, have landed by `t`. */
function landedBy(hits: Hit[], t: number) {
  let n = 0;
  while (n < hits.length && hits[n].at <= t) n++;
  return n;
}

/** Where a played-out fight's drops rise, the enemy's tile, and when they
 * may (`DROP_HOLD_MS` after its last strike lands), while that is still to
 * come; null for summary rounds, which hold nothing back. */
function dropsHeld(fight: ShownFight | null, now: number) {
  if (!fight || fight.summary) return null;
  const until = fight.start + (fight.bout.strikes.at(-1)?.at ?? 0) + DROP_HOLD_MS;
  return now < until ? { ...fight.to, until } : null;
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

/** Art drawn without an image: a tile's contents, the Gem, Equipment's
 * pixel icons, or on a themed board the Heart Door's heart. */
const paintsItself = (art: GainArt, themed: boolean) =>
  "tile" in art || "gem" in art || "cell" in art || "equipMaterial" in art || "equipPiece" in art || (themed && "heart" in art);

/** The image a gain's art draws from, or null where it has none or it is
 * still loading. */
function artImage(art: GainArt): CanvasImageSource | null {
  if ("equipMaterial" in art || "equipPiece" in art) return null;
  if ("material" in art) return materialImage(art.material);
  if ("heart" in art) return heart();
  return "coin" in art ? coinImage(art.coin) : null;
}

/** A gain's art in tile space: a tile's contents (a key a door took with
 * its minus sign), the Gem, a coin after its amount, the Heart Door's heart
 * with a check (with a plus for max HP raised), a material with its count,
 * or an Equipment piece with its rarity's mark. */
function paintArt(c: CanvasRenderingContext2D, f: FrameContext, p: Popup & { gain: Gain }, image: CanvasImageSource | null) {
  const art = p.gain.art!;
  if ("tile" in art) return paintSpentTile(c, f, p, art);
  if ("gem" in art) return paintGem(c, f.now, true);
  if ("cell" in art) {
    // The amount, then the Cell: "+3 ▲" in place of "+3 Cells".
    paintCell(c);
    mark(c, p.gain.text.split(" ")[0], { x: 10, y: 12 }, { color: CELL_COLOR, size: 10, align: "right" });
    return;
  }
  if ("equipMaterial" in art) {
    paintPixels(c, materialPixels(art.equipMaterial));
    if (art.quantity > 1) mark(c, `×${art.quantity}`, { x: 18, y: 21 }, { color: REWARD_COLOR, size: 8, align: "left" });
    return;
  }
  if ("equipPiece" in art) {
    const tier = RARITY_TIERS[art.rarity];
    paintPixels(c, iconPixels(art.equipPiece));
    mark(c, tier.mark, { x: 19, y: 21 }, { color: tier.color, size: 8, align: "left" });
    return;
  }
  c.imageSmoothingEnabled = false;
  if ("coin" in art) {
    // The amount, then the coin: "+5 ●" in place of "+5 Gold".
    c.drawImage(image!, 11, 3, 18, 18);
    mark(c, p.gain.text.split(" ")[0], { x: 10, y: 12 }, { color: art.coin === "gold" ? REWARD_COLOR : SILVER_COLOR, size: 10, align: "right" });
  } else if ("heart" in art) {
    if (f.look.themed) f.look.themed.heart(c);
    else c.drawImage(image!, 2, 2, 18, 18);
    if (art.raised) plus(c, 17, 17);
    else check(c, 13, 13);
  } else {
    c.drawImage(image!, 3, 3, 18, 18);
    if (art.quantity > 1) mark(c, `×${art.quantity}`, { x: 18, y: 21 }, { color: REWARD_COLOR, size: 8, align: "left" });
  }
}

/** A Cell's yellow triangle, filling the same 18 px square as a coin. */
function paintCell(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(20, 4);
  c.lineTo(28.5, 19);
  c.lineTo(11.5, 19);
  c.closePath();
  c.fillStyle = CELL_COLOR;
  c.fill();
  c.lineWidth = 1.2;
  c.strokeStyle = "#5a4200";
  c.stroke();
}

/** A 12×12 pixel icon (Equipment's) filling the same 18 px square as a
 * material's sprite. */
function paintPixels(c: CanvasRenderingContext2D, pixels: { x: number; y: number; color: string }[]) {
  for (const px of pixels) {
    c.fillStyle = px.color;
    c.fillRect(3 + px.x * 1.5, 3 + px.y * 1.5, 1.5, 1.5);
  }
}

/** A tile's contents rising, in the board's own art (its Game theme's on a
 * themed board);
 * a key a door took shifts right to make room for its minus sign. */
function paintSpentTile(c: CanvasRenderingContext2D, f: FrameContext, p: Popup, art: Extract<GainArt, { tile: unknown }>) {
  const look = f.look;
  if (art.spent) c.translate(4, 0);
  if (look.themed) look.themed.contents(c, art.tile);
  else paintContents(c, art.tile, { x: p.x, y: p.y, time: f.now, spritesOff: look.spritesOff, reduceMotion: look.reduceMotion, area1: look.area1, lifted: true });
  if (!art.spent) return;
  c.translate(-4, 0);
  mark(c, "−", { x: 3, y: 12 }, { color: SPENT_COLOR, size: 14 });
}

/** Whether the fight ends with the enemy felled, by a strike or its thorns. */
const defeated = (fight: ShownFight) => fight.bout.strikes.some((s) => (s.by === "hero" && !s.hp) || s.thornHp === 0);

/** The enemy's HP the bar shows at `now` and how visible it is: hidden
 * until the hero's first strike lands, draining steadily to each strike's
 * HP (or its thorns') as it lands, then, once the enemy has fallen, fading
 * away. A fight the hero lost leaves it standing, showing what HP the enemy
 * has left. */
export function enemyBar(fight: ShownFight, now: number): { hp: number; alpha: number } | null {
  const t = now - fight.start, hits = enemyHits(fight);
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
function drainMs(hits: Hit[], i: number) {
  const next = hits[i + 1];
  return next ? Math.min(BAR_DRAIN_MS, next.at - hits[i].at) : BAR_DRAIN_MS;
}
/** The bar is draining or fading, or waits for the hero's first strike. */
function barMoving(fight: ShownFight, now: number) {
  const last = enemyHits(fight).at(-1);
  return !!last && now - fight.start < last.at + BAR_DRAIN_MS + (last.hp ? 0 : BAR_FADE_MS);
}
function drawEnemyBar(f: FrameContext, fight: ShownFight) {
  const bar = enemyBar(fight, f.now);
  if (!bar || !fight.hp) return;
  paintBar(f, fight.to, bar.hp / fight.hp, bar.alpha);
}
/** How long an arrow's bar shows: drained, held, then faded (a felled
 * enemy's at once). */
const arrowBarMs = (b: { hp: number }) => BAR_DRAIN_MS + (b.hp ? ARROW_BAR_HOLD_MS : 0) + BAR_FADE_MS;
/** An arrow's HP bar over the enemy it struck: hidden until it lands, then
 * draining from what the enemy had to what it has left of its full HP. */
function drawArrowBar(f: FrameContext, b: { x: number; y: number; from: number; hp: number; full: number; start: number }) {
  const t = f.now - b.start;
  if (t < 0) return;
  const k = Math.min(1, t / BAR_DRAIN_MS), hp = b.from + (b.hp - b.from) * k;
  const fading = t - BAR_DRAIN_MS - (b.hp ? ARROW_BAR_HOLD_MS : 0);
  paintBar(f, b, hp / b.full, fading > 0 ? Math.max(0, 1 - fading / BAR_FADE_MS) : 1);
}
/** An HP bar over the tile at `on`, filled to `share`. */
function paintBar(f: FrameContext, on: { x: number; y: number }, share: number, alpha: number) {
  const c = f.c, at = tileCenter(f, on.x, on.y + BAR_RISE),
    w = f.s * BAR_WIDTH, h = Math.max(3, f.s * BAR_HEIGHT), x = at.x - w / 2, y = at.y - h / 2;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = "#000";
  c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = BAR_EMPTY;
  c.fillRect(x, y, w, h);
  c.fillStyle = BAR_FILL;
  c.fillRect(x, y, w * Math.max(0, Math.min(1, share)), h);
  c.restore();
}

/** How far the hero and the enemy lean into their strikes at `now`: whoever
 * is striking reaches toward the other, furthest as the strike lands, and
 * the hero gives way a little from a strike it parries. */
export function lunges(fight: Encounter | null, now: number, reduceMotion: boolean): { hero: Offset; enemy: Offset } {
  const t = fight ? now - fight.start : 0;
  const s = fight && !reduceMotion ? fight.bout.strikes.find((s) => s.start <= t && t < s.end) : undefined;
  if (!fight || !s) return { hero: STILL, enemy: STILL };
  const reach = LUNGE * Math.sin((Math.PI * (t - s.start)) / (s.end - s.start));
  const { dx, dy } = facing(fight);
  return s.by === "hero"
    ? { hero: { dx: dx * reach, dy: dy * reach }, enemy: STILL }
    : { hero: s.parried ? { dx: -dx * reach * PARRY_GIVE, dy: -dy * reach * PARRY_GIVE } : STILL, enemy: { dx: -dx * reach, dy: -dy * reach } };
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

/** A green plus centred on (x, y), in tile space. */
function plus(c: CanvasRenderingContext2D, x: number, y: number) {
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x - 4, y);
  c.lineTo(x + 4, y);
  c.moveTo(x, y - 4);
  c.lineTo(x, y + 4);
  c.strokeStyle = "#000";
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = CHECK_COLOR;
  c.lineWidth = 2;
  c.stroke();
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
  c.strokeStyle = CHECK_COLOR;
  c.lineWidth = 2;
  c.stroke();
}
