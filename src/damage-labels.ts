import { boardFont } from "./sprites/font.ts";
import { netDamage, PLAYED_ROUNDS, predict, type CritRule } from "./combat.ts";
import { forecast } from "./crit-forecast.ts";
import type { Enemy, Player, Tile } from "./entities.ts";
import { forEachViewTile, type FrameContext } from "./render-frame.ts";
import { potionRestores, shardStat, type StepRules } from "./step-effects.ts";
import { compactAmount, whole, wholeChange } from "./whole.ts";

// Damage Visual (Tower I's floor 50 goal): each enemy in view wears, in its
// lower-left corner, the HP its fight would cost the hero, as Damage
// Prediction's inspect line says it. Badges that scale a fight (Effective,
// Dampen) are left out, as the inspect panel leaves them: which card meets
// an enemy isn't known until it does. Relative Damage Color (Tower II's
// floor 10 goal) colours each label by the share of the hero's HP it costs.
// A Wooden Door wears the HP breaking it down takes while the hero holds no
// key (with one, it costs a key, not HP): red when it would fell the hero,
// so it stays shut.
// Items wear what they give, rounded down: a potion the HP it restores in
// full (blue), a shard its ATK or DEF (white) and a treasure chest the Gold
// it holds on average (yellow), a badge's scale left out as for a fight.
// Labels are worked out on the frame they first show, so a fight longer than
// `PLAYED_ROUNDS` rounds is estimated past them rather than played out (the
// inspect panel's line, worked out on a tap, plays every round).

/** What a fight against one enemy would cost: `predict`'s damage net of
 * Lifesteal's heals, uncapped by max HP (below 0 when it heals on balance,
 * at full HP too; Infinity when the
 * hero can't hurt it) and the hero's strikes it takes (1: an
 * Instakill, the enemy never striking back, unless its thorns felled it,
 * `thornKill`, or it is Fast and struck first, `fast`). */
type Cost = { damage: number; turns: number; thornKill?: true; fast?: true };

/** Predictions by enemy stats, kept while the hero's ATK, DEF, shroud,
 * thorns, Parry % and critical strikes stay the same (HP only colours a
 * label, read as it is drawn), so a board full of enemies is predicted
 * once per kind of enemy, not every frame. */
export class DamagePredictions {
  private hero = "";
  private costs = new Map<string, Cost>();

  /** How many predictions have been worked out, for tests. */
  computed = 0;

  cost(player: Player, enemy: Enemy, crit?: CritRule): Cost {
    // Damage is never capped by the HP the hero has, and a label counts
    // Lifesteal's heals past max HP, so it shows what a fight would heal
    // even at full HP; HP is part of the key only with Lifesteal, since a
    // fight that fells the hero first heals nothing.
    const steal = player.lifesteal ? `${player.lifesteal}|${player.hp}` : "";
    const guard = `${player.thorns ?? 0}|${player.parry ?? 0}|${player.cardParry ?? 0}|${player.bossAttack ?? 0}|${player.pierce ?? 0}|${JSON.stringify(player.foeAttack ?? {})}|${JSON.stringify(player.foeDefense ?? {})}|${JSON.stringify(player.foeShroud ?? {})}|${player.doorShroud ?? 0}|${JSON.stringify(player.foeCritChance ?? {})}|${JSON.stringify(player.foeCritFactor ?? {})}|${JSON.stringify(player.foeStealOverheal ?? {})}`;
    const hero = `${player.attack}|${player.defense}|${player.shroud ?? 0}|${steal}|${crit ? `${crit.chance}|${crit.factor}` : ""}|${guard}`;
    if (hero !== this.hero) [this.hero, this.costs] = [hero, new Map()];
    // A boss's strength sets its thorns and the hero's boss ATK; a Fast enemy strikes first;
    // a bubble's guard cuts the hero's strikes; a wounded enemy's full HP sets its thorns.
    const key = `${enemy.hp}|${enemy.fullHp ?? ""}|${enemy.attack}|${enemy.defense}|${enemy.strength}|${enemy.fast ? "fast" : ""}|${enemy.flying ? "flying" : ""}|${enemy.guard ?? 0}`;
    let cost = this.costs.get(key);
    if (!cost) {
      // A fight of more than PLAYED_ROUNDS rounds is estimated past them, so
      // no label costs more than that many rounds to work out.
      const uncapped = player.lifesteal ? { ...player, maxHp: Infinity } : player;
      const r = predict(uncapped, enemy, PLAYED_ROUNDS);
      this.computed++;
      // With critical strikes counted the label shows the damage
      // to expect, and only an Instakill that is certain is gray.
      const f = crit && !r.impervious ? forecast(uncapped, enemy, crit, PLAYED_ROUNDS) : null;
      const ended = f ? f.worst : r, thorned = { ...(ended.thornKill ? { thornKill: true as const } : {}), ...(ended.fast ? { fast: true as const } : {}) };
      cost = f ? { damage: f.worst.impervious ? Infinity : f.expected, turns: f.worst.turns, ...thorned } : { damage: r.impervious ? Infinity : netDamage(uncapped, r), turns: r.turns, ...thorned };
      this.costs.set(key, cost);
    }
    return cost;
  }
}

/** Relative Damage Color's spectrum: the share of the hero's HP a fight
 * costs, and the colour at it, bright green below 1% through yellow at 10%
 * and orange at 25% to red from 50%, blended between. */
const SPECTRUM: readonly [number, [number, number, number]][] = [
  [0.01, [0x4d, 0xff, 0x6a]],
  [0.1, [0xff, 0xe1, 0x4d]],
  [0.25, [0xff, 0x9a, 0x3d]],
  [0.5, [0xff, 0x5a, 0x5a]],
];

/** The colour of a fight costing `share` of the hero's HP. */
export function relativeColor(share: number) {
  const i = SPECTRUM.findIndex(([at]) => share < at);
  if (i === 0) return hex(SPECTRUM[0]![1]);
  if (i < 0) return hex(SPECTRUM[SPECTRUM.length - 1]![1]);
  const [a, from] = SPECTRUM[i - 1]!, [b, to] = SPECTRUM[i]!, t = (share - a) / (b - a);
  return hex(from.map((v, k) => v + (to[k]! - v) * t));
}
const hex = (rgb: readonly number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** The blue of HP the hero gains, kept for healing alone: the damage
 * colours never use it. */
export const HEAL_COLOR = "#4da6ff";

/** A label's text and colour: red when the fight is lethal (∞ when the
 * hero can't hurt the enemy), a blue +N when Lifesteal heals the hero more
 * than the fight hurts, a gray 0 for an Instakill and a white 0 when the
 * enemy strikes but costs no HP; otherwise, with Relative Damage Color, its
 * share of `hp` on the spectrum, else gold. */
export function damageLabel(cost: Cost, hp: number, relative = false) {
  if (!Number.isFinite(cost.damage)) return { text: "∞", color: "#ff5a5a" };
  const shown = wholeChange(cost.damage);
  if (shown < 0) return { text: `+${compactAmount(-shown)}`, color: HEAL_COLOR };
  const color = hp <= cost.damage ? "#ff5a5a" : cost.turns === 1 && !cost.thornKill && !cost.fast ? "#9aa3b2"
    : shown === 0 ? "#ffffff" : relative ? relativeColor(cost.damage / hp) : "#ffe08a";
  return { text: compactAmount(shown), color };
}

/** The fight being played out on the board (its enemy's tile), whose HP
 * bar tells its story. */
type Fighting = { to: { x: number; y: number } } | null;

/** What breaking a Wooden Door costs, as a fight's cost: never an Instakill. */
const breakCost = (durability: number): Cost => ({ damage: durability, turns: 2 });
const holdsKey = (player: Player) => player.keys.yellow > 0 || player.keys.blue > 0 || player.keys.red > 0;

/** What items give, for their labels: the step's rules, and the Gold the
 * chest at (x, y) holds. */
export type ItemValues = { rules: StepRules; chestGold: (x: number, y: number) => number };

/** The colour of a chest's Gold label. */
export const GOLD_COLOR = "#ffd23f";

/** An item's label, the whole amount it gives (rounded down), or null for
 * a tile that isn't one. */
export function itemLabel(t: Tile, x: number, y: number, player: Player, items: ItemValues) {
  const label = (n: number, color: string) => ({ text: compactAmount(whole(n)), color });
  if (t.kind === "potion") return label(potionRestores(t, player.maxHp, items.rules), HEAL_COLOR);
  if (t.kind === "attack" || t.kind === "defense") return label(shardStat(t, items.rules), "#ffffff");
  if (t.kind === "treasure") return label(items.chestGold(x, y), GOLD_COLOR);
  return null;
}

/** Draws, unless `enemies` is false, each enemy's label in view and each
 * Wooden Door's while the hero holds no key, and with `items` each item's,
 * over the darkness so it always reads. */
export function drawDamageLabels(f: FrameContext, predictions: DamagePredictions, player: Player, fight: Fighting, relative = false, crit?: CritRule, items?: ItemValues, enemies = true) {
  const c = f.c, s = f.s, pad = s * 0.06;
  c.save();
  c.font = boardFont(f.look.styledSprites, Math.max(8, Math.round(s * 0.3)), "bold", "Cinzel, serif");
  c.textAlign = "left";
  c.textBaseline = "bottom";
  c.lineJoin = "round";
  c.lineWidth = Math.max(2, s * 0.09);
  c.strokeStyle = "#000d";
  forEachViewTile(f, (x, y) => {
    const t = f.world.tile(x, y);
    const item = items && itemLabel(t, x, y, player, items);
    const wood = enemies && t.kind === "door" && t.door?.type === "wood" && !holdsKey(player) ? t.door.durability : null;
    if (!item && wood === null && (!enemies || t.kind !== "enemy" || !t.enemy || (fight && fight.to.x === x && fight.to.y === y))) return;
    const { text, color } = item ?? damageLabel(wood !== null ? breakCost(wood) : predictions.cost(player, t.enemy!, crit), player.hp, relative);
    const left = (x - f.left) * s + pad, bottom = (f.n - (y - f.bottom)) * s - pad;
    c.strokeText(text, left, bottom);
    c.fillStyle = color;
    c.fillText(text, left, bottom);
  });
  c.restore();
}
