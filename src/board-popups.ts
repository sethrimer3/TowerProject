import { boardFont } from "./sprite-font.ts";
import { popupAmount } from "./whole.ts";
import { HEAL_COLOR } from "./damage-labels.ts";
import type { Coin, Encounter, Gain, GainArt, Heal, ShownFight } from "./shown.ts";
import { landsAt, type Volley } from "./volley.ts";
import { OPENING_SHRINK_MS } from "./combat.ts";
import { paintContents } from "./tile-painters.ts";
import { materialImage } from "./material-sprites.ts";
import { paintGem } from "./gem-art.ts";
import { RARITY_TIERS } from "./equipment/balance.ts";
import { iconPixels, materialPixels, pieceSpriteId } from "./ui/equipment-icons.ts";
import { drawKit } from "./sprite-kit.ts";
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
/** CHEST's Double and Triple flash: a large gold multiplier in a glow, as
 * tall as this share of a tile. */
const FLASH_SIZE = 0.9;
const FLASH_COLOR = "#ffd34d";
const FLASH_GLOW = "#ff9a2e";
/** A boss's Takedown: two sword slashes in an X, glowing red, starting this
 * many times its size and shrinking onto it; Tangle's arrow, glowing blue,
 * behind it. Both fade this fast once the first strike swings (ms). */
const SLASH_START = 2.4;
const SLASH_COLOR = "#fff4e0";
const SLASH_GLOW = "#ff3b2e";
const TANGLE_COLOR = "#5cb8ff";
const TANGLE_GLOW = "#2f7dff";
const OPENING_FADE_MS = 150;
/** A Charged Shot's number: a gold outline around its black one, as wide
 * as `width` times the black's; fainter and narrower while the charge is
 * under `FULL_CHARGE` percent. */
type Ring = { color: string; width: number };
const CHARGED_RING: Ring = { color: "#ffd34d", width: 2.2 };
const FAINT_RING: Ring = { color: "rgba(255, 211, 77, 0.45)", width: 1.6 };
const FULL_CHARGE = 50;
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
export function coinImage(coin: Coin): CanvasImageSource | null {
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
type TextStyle = { color: string; rise: number; size: number; glow?: string; ring?: Ring };
/** A reward without a sprite, written in gold. */
const REWARD_TEXT: TextStyle = { color: REWARD_COLOR, rise: REWARD_RISE, size: 0.42 };
/** A mark's colour, size (px in tile space) and alignment. */
type MarkStyle = { color: string; size: number; align?: CanvasTextAlign; styled?: boolean };
type Offset = { dx: number; dy: number };
const STILL: Offset = { dx: 0, dy: 0 };

/** What rises off the board over its tiles: the damage number of each strike
 * in a fight as it lands, the HP each potion heals, and each reward picked
 * up. Each starts the moment it happens, over whatever is still rising, and
 * later ones draw on top, every number over every reward sprite. */
export class BoardPopups {
  private rewards: (Popup & { gain: Gain })[] = [];
  /** Damage and heal numbers. */
  private numbers: (Popup & { text: string; color: string; glow?: string; ring?: Ring })[] = [];
  /** The last heal raised. */
  private healed = 0;
  /** The fights still showing, oldest first, the game's latest last, each
   * with how many of its strikes have landed: an earlier one stays until
   * its strikes have landed and its HP bar has drained and faded, so a
   * fight that begins before the last one's bar is gone leaves it to finish. */
  private fights: { fight: ShownFight; landed: number }[] = [];
  private seed = NaN;
  /** Which of the numbers the Settings show. */
  private shown: Shown = ALL_SHOWN;
  /** The last turn's shots taken (enemies/ranged.ts), and the enemies' HP bars the
   * Archer's arrows raised: drained from `from` to `hp` out of `full` as
   * the arrow lands at `start`, held a while, then faded. */
  private volley: Volley | null = null;
  private arrowBars: { x: number; y: number; from: number; hp: number; full: number; start: number }[] = [];

  /** Takes the game's new rewards, starting now (those that came together
   * one after another, but a kill's or a chest's drops all at once,
   * stacked, and a played-out fight's once its last numbers fade), the latest
   * fight's strikes that have landed by `now`, and a new heal, each unless
   * its Settings row is off. A new run clears whatever was still showing. */
  update(game: { run: { seed: number }; gains: Gain[]; fight: ShownFight | null; lastHeal: Heal | null; volley?: Volley | null; save?: { settings: Shown } }, now: number) {
    this.shown = game.save?.settings ?? ALL_SHOWN;
    if (game.run.seed !== this.seed) {
      this.seed = game.run.seed;
      this.rewards = [];
      this.numbers = [];
      this.arrowBars = [];
    }
    const heal = game.lastHeal;
    if (heal && heal.id !== this.healed) {
      this.healed = heal.id;
      if (this.shown.hpGains) this.numbers.push({ x: heal.x, y: heal.y + DAMAGE_START, start: now, text: `+${popupAmount(heal.to - heal.from)}`, color: HEAL_COLOR });
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
      if (s.thorns && !fight.summary) this.thorns(s.thorns, fight.to, fight.start + s.at);
    }
  }
  /** A new turn's shots raise their numbers as they land: what a Ranged
   * enemy's shot cost the hero (with the shroud's share beside it), when it
   * cost any, over the hero, and its thorns over the shooter, with its HP
   * bar; an arrow's damage over the enemy, with its HP bar, and its
   * Lifesteal over the hero. Undo (no volley) clears the bars. */
  private shots(volley: Volley | null) {
    if (volley === this.volley) return;
    this.volley = volley;
    if (!volley) {
      this.arrowBars = [];
      return;
    }
    for (const s of volley.shots) {
      const start = landsAt(volley, s);
      if (s.by === "enemy") {
        if (s.damage > 0) this.raise({ by: "enemy", damage: s.damage, ...(s.shrouded ? { shrouded: s.shrouded } : {}), start: 0, at: 0, end: 0, hp: 0 }, s.to, start);
        if (s.thorns) this.thorns(s.thorns, s.from, start);
        if (s.thorns && s.full) this.arrowBars.push({ x: s.from.x, y: s.from.y, from: s.before ?? s.full, hp: s.hp ?? 0, full: s.full, start });
        continue;
      }
      this.raise({ by: "hero", damage: s.damage, ...(s.crit ? { crit: s.crit } : {}), start: 0, at: 0, end: 0, hp: s.hp ?? 0 }, s.to, start, s.charge);
      if (s.healed) this.heal(s.healed, s.from, start);
      if (s.full) this.arrowBars.push({ x: s.to.x, y: s.to.y, from: s.before ?? s.full, hp: s.hp ?? 0, full: s.full, start });
    }
  }
  /** What the enemy's thorns cost it, in yellow over the enemy (`on`), as
   * the strike's damage rises over the hero. */
  private thorns(amount: number, on: { x: number; y: number }, start: number) {
    if (!this.shown.hitNumbers) return;
    this.numbers.push({ x: on.x, y: on.y + DAMAGE_START, start, text: popupAmount(amount), color: THORN_COLOR });
  }
  /** The HP Lifesteal restored, as a blue +N over the hero (nothing when it
   * rounds to none). */
  private heal(amount: number, on: { x: number; y: number }, start: number) {
    if (Math.round(amount) > 0 && this.shown.hitNumbers) this.numbers.push({ x: on.x, y: on.y + DAMAGE_START, start, text: `+${popupAmount(amount)}`, color: HEAL_COLOR });
  }
  /** A strike's numbers over `on` from `start`: the damage that got
   * through, and what the shroud blocked in silver beside it. A round the
   * hero came out ahead of raises only its blue gain. An arrow with a
   * `charge` (percent) above 0 wears a gold outline around its black one,
   * a faint one under `FULL_CHARGE`, as does a `pronounced` strike (a
   * full one: a Surprise Attack's first, a Power Strike's). */
  private raise(s: Strike, on: { x: number; y: number }, start: number, charge = 0) {
    if (!this.shown.hitNumbers || (s.by === "enemy" && s.healed && !s.damage && !s.shrouded)) return;
    const both = !!s.shrouded && s.damage > 0, y = on.y + DAMAGE_START;
    if (s.shrouded) this.numbers.push({ x: on.x - (both ? SHROUD_SPLIT : 0), y, start, text: popupAmount(s.shrouded), color: SHROUD_COLOR });
    if (s.shrouded && !s.damage) return;
    this.numbers.push({ x: on.x + (both ? SHROUD_SPLIT : 0), y, start, text: popupAmount(s.damage), ...(s.crit ? { color: CRIT_COLOR, glow: CRIT_GLOW } : { color: s.by === "hero" ? DAMAGE_COLOR : HERO_DAMAGE_COLOR }), ...(s.pronounced ? { ring: CHARGED_RING } : charge > 0 ? { ring: charge < FULL_CHARGE ? FAINT_RING : CHARGED_RING } : {}) });
  }
  /** Nothing is rising or waiting to, and the enemy's HP bar is still. */
  idle(now: number) {
    return !this.rewards.length && !this.numbers.length && !this.arrowBars.length && !this.fights.some((shown) => barMoving(shown.fight, now));
  }

  /** Each enemy's HP bar, then every reward that has started but a kill's
   * or a chest's drops, then every number, then the drops, each oldest first
   * so newer ones draw on top. Numbers draw over the other rewards, so a
   * potion's heal is never hidden behind its sprite; drops draw over the
   * numbers, so what a kill gives is never hidden behind its damage. */
  draw(f: FrameContext) {
    if (this.shown.enemyBars) {
      for (const shown of this.fights) drawEnemyBar(f, shown.fight);
      for (const bar of this.arrowBars) drawArrowBar(f, bar);
    }
    for (const shown of this.fights) drawOpening(f, shown.fight);
    const started = <T extends Popup>(popups: T[]) => popups.filter((p) => p.start <= f.now).sort((a, b) => a.start - b.start);
    const rewards = started(this.rewards), reward = (p: (typeof rewards)[number]) =>
      p.gain.art && "multiplier" in p.gain.art ? this.drawFlash(f, p, p.gain.text) : this.drawSprite(f, p) || this.drawText(f, p, p.gain.text, REWARD_TEXT);
    for (const p of rewards) if (!p.gain.drop) reward(p);
    for (const p of started(this.numbers)) this.drawText(f, p, p.text, { color: p.color, rise: DAMAGE_RISE, size: 0.55, ...(p.glow ? { glow: p.glow } : {}), ...(p.ring ? { ring: p.ring } : {}) });
    for (const p of rewards) if (p.gain.drop) reward(p);
  }
  /** CHEST's Double and Triple: `text` (×2, ×3, ×6) flashed large over
   * the chest, in gold, pulsing in place, fading as a popup does. */
  private drawFlash(f: FrameContext, p: Popup, text: string) {
    const c = f.c, { alpha } = this.phase(f, p, 0), at = tileCenter(f, p.x, p.y), age = f.now - p.start;
    const pulse = f.look.reduceMotion ? 1 : 1 + 0.08 * Math.sin((age / POPUP_MS) * Math.PI * 6);
    c.save();
    c.globalAlpha = alpha;
    c.font = boardFont(f.look.styledSprites, Math.max(16, f.s * FLASH_SIZE * pulse));
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineWidth = Math.max(3, f.s * 0.14);
    c.strokeStyle = "#000";
    c.strokeText(text, at.x, at.y);
    c.shadowColor = FLASH_GLOW;
    c.shadowBlur = Math.max(8, f.s * 0.5);
    c.fillStyle = FLASH_COLOR;
    c.fillText(text, at.x, at.y);
    c.restore();
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
    c.font = boardFont(f.look.styledSprites, Math.max(11, f.s * size));
    c.textAlign = "center";
    c.textBaseline = "middle";
    const outline = Math.max(2, f.s * 0.1);
    if (ring) {
      // The gold outline, wider, under the black one.
      c.lineJoin = "round";
      c.lineWidth = outline * ring.width;
      c.strokeStyle = ring.color;
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

/** The Settings rows the popups' own numbers obey: a fight's (its strikes,
 * thorns and Lifesteal) and a heal's. */
type Shown = { hitNumbers: boolean; hpGains: boolean; enemyBars: boolean };
const ALL_SHOWN: Shown = { hitNumbers: true, hpGains: true, enemyBars: true };

type Strike = ShownFight["bout"]["strikes"][number];

/** What takes the enemy's HP, in order: the hero's strikes and the
 * thorns of the enemy's own, each landing at `at` and leaving it `hp`.
 * The enemy's HP only falls, so each hit leaves no more than the one
 * before: a summary round lands the hero's strikes, felling one and all,
 * before the enemy's, whose thorns left it the HP of an earlier strike. */
type Hit = { at: number; hp: number };
function enemyHits(fight: ShownFight): Hit[] {
  let left = fight.hp;
  // A Takedown takes its share before the first strike.
  const opening = fight.bout.opening ? [{ at: fight.bout.opening.at, hp: (left = Math.min(left, fight.bout.opening.hp)) }] : [];
  return [...opening, ...fight.bout.strikes.flatMap((s) => {
    const hp = s.by === "hero" ? s.hp : s.thornHp;
    if (hp === undefined) return [];
    left = Math.min(left, hp);
    return [{ at: s.at, hp: left }];
  })];
}

/** A fight's opening over the enemy (`fight.to`), until its first strike
 * swings: Tangle's blue down arrow, held, behind Takedown's X, which shrinks
 * onto the enemy, then holds. A summary shows none. */
function drawOpening(f: FrameContext, fight: ShownFight) {
  const o = fight.bout.opening, t = f.now - fight.start;
  if (!o || fight.summary || t < 0 || t > o.at + OPENING_FADE_MS) return;
  const c = f.c, at = tileCenter(f, fight.to.x, fight.to.y), held = o.takedown ? OPENING_SHRINK_MS : 0;
  c.save();
  c.globalAlpha = t > o.at ? 1 - (t - o.at) / OPENING_FADE_MS : 1;
  c.lineCap = "round";
  c.lineJoin = "round";
  if (o.tangle && t >= held) paintTangle(c, at, f.s);
  if (o.takedown) {
    const k = f.look.reduceMotion ? 1 : Math.min(1, t / OPENING_SHRINK_MS), eased = 1 - (1 - k) * (1 - k);
    paintTakedown(c, at, f.s * (SLASH_START - (SLASH_START - 1) * eased));
  }
  c.restore();
}
/** Tangle's arrow, pointing down, a tile tall, centred on `at`. */
function paintTangle(c: CanvasRenderingContext2D, at: { x: number; y: number }, s: number) {
  const w = s * 0.18, top = at.y - s * 0.42, tip = at.y + s * 0.42, head = at.y + s * 0.02;
  const path = () => {
    c.beginPath();
    c.moveTo(at.x - w, top);
    c.lineTo(at.x + w, top);
    c.lineTo(at.x + w, head);
    c.lineTo(at.x + s * 0.38, head);
    c.lineTo(at.x, tip);
    c.lineTo(at.x - s * 0.38, head);
    c.lineTo(at.x - w, head);
    c.closePath();
  };
  path();
  c.lineWidth = Math.max(2, s * 0.08);
  c.strokeStyle = "#071a33";
  c.stroke();
  c.shadowColor = TANGLE_GLOW;
  c.shadowBlur = Math.max(8, s * 0.45);
  c.fillStyle = TANGLE_COLOR;
  path();
  c.fill();
  c.shadowBlur = 0;
}
/** Takedown's X: two sword slashes crossing at `at`, `size` px across. */
function paintTakedown(c: CanvasRenderingContext2D, at: { x: number; y: number }, size: number) {
  const r = size * 0.42;
  for (const [width, color, glow] of [[0.2, "#2a0606", 0], [0.11, SLASH_COLOR, 1]] as const) {
    c.lineWidth = Math.max(2, size * width);
    c.strokeStyle = color;
    c.shadowColor = SLASH_GLOW;
    c.shadowBlur = glow ? Math.max(10, size * 0.4) : 0;
    c.beginPath();
    c.moveTo(at.x - r, at.y - r);
    c.lineTo(at.x + r, at.y + r);
    c.moveTo(at.x + r, at.y - r);
    c.lineTo(at.x - r, at.y + r);
    c.stroke();
  }
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
  // A multiplier flashes on its own (`drawFlash`).
  if ("multiplier" in art) return;
  if ("tile" in art) return paintSpentTile(c, f, p, art);
  if ("gem" in art) {
    if (!(f.look.styledSprites && drawKit(c, "gem"))) paintGem(c, f.now, true);
    return;
  }
  if ("cell" in art) {
    // The amount, then the Cell: "+3 ▲" in place of "+3 Cells".
    if (!(f.look.styledSprites && drawKit(c, "cell"))) paintCell(c);
    mark(c, p.gain.text.split(" ")[0], { x: 10, y: 12 }, { color: CELL_COLOR, size: 10, align: "right", styled: f.look.styledSprites });
    return;
  }
  if ("equipMaterial" in art) {
    if (!(f.look.styledSprites && drawKit(c, `equip-${art.equipMaterial}`))) paintPixels(c, materialPixels(art.equipMaterial));
    if (art.quantity > 1) mark(c, `×${art.quantity}`, { x: 18, y: 21 }, { color: REWARD_COLOR, size: 8, align: "left", styled: f.look.styledSprites });
    return;
  }
  if ("equipPiece" in art) {
    const tier = RARITY_TIERS[art.rarity];
    if (!(f.look.styledSprites && drawKit(c, pieceSpriteId(art.equipPiece)))) paintPixels(c, iconPixels(art.equipPiece));
    mark(c, tier.mark, { x: 19, y: 21 }, { color: tier.color, size: 8, align: "left", styled: f.look.styledSprites });
    return;
  }
  c.imageSmoothingEnabled = false;
  if ("coin" in art) {
    // The amount, then the coin: "+5 ●" in place of "+5 Gold".
    if (!(f.look.styledSprites && drawKit(c, art.coin, 11, 3, 18))) c.drawImage(image!, 11, 3, 18, 18);
    mark(c, p.gain.text.split(" ")[0], { x: 10, y: 12 }, { color: art.coin === "gold" ? REWARD_COLOR : SILVER_COLOR, size: 10, align: "right", styled: f.look.styledSprites });
  } else if ("heart" in art) {
    if (f.look.themed) f.look.themed.heart(c);
    else if (!(f.look.styledSprites && drawKit(c, "heart", 2, 2, 18))) c.drawImage(image!, 2, 2, 18, 18);
    if (art.raised) plus(c, 17, 17);
    else check(c, 13, 13);
  } else {
    if (!(f.look.styledSprites && "material" in art && drawKit(c, `metal-${art.material.replace(/Bar$/, "")}-bar`, 3, 3, 18))) c.drawImage(image!, 3, 3, 18, 18);
    if (art.quantity > 1) mark(c, `×${art.quantity}`, { x: 18, y: 21 }, { color: REWARD_COLOR, size: 8, align: "left", styled: f.look.styledSprites });
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
  else paintContents(c, art.tile, { x: p.x, y: p.y, time: f.now, spritesOff: look.spritesOff, reduceMotion: look.reduceMotion, area1: look.area1, lifted: true, styledSprites: look.styledSprites });
  if (!art.spent) return;
  c.translate(-4, 0);
  mark(c, "−", { x: 3, y: 12 }, { color: SPENT_COLOR, size: 14, styled: look.styledSprites });
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
function mark(c: CanvasRenderingContext2D, text: string, { x, y }: { x: number; y: number }, { color, size, align = "center", styled }: MarkStyle) {
  c.font = boardFont(styled, size);
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
