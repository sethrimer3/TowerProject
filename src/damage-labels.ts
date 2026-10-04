import { predict } from "./combat.ts";
import type { Enemy, Player } from "./entities.ts";
import { forEachViewTile, type FrameContext } from "./render-frame.ts";
import { compactAmount, wholeChange } from "./whole.ts";

// Damage Visual (Tower I's floor 50 goal): each enemy in view wears, in its
// lower-left corner, the HP its fight would cost the hero, as Damage
// Prediction's inspect line says it. Badges that scale a fight (Effective,
// Dampen) are left out, as the inspect panel leaves them: which card meets
// an enemy isn't known until it does. Relative Damage Color (Tower II's
// floor 10 goal) colours each label by the share of the hero's HP it costs.

/** What a fight against one enemy would cost: `predict`'s damage (Infinity
 * when the hero can't hurt it) and the hero's strikes it takes (1: an
 * Instakill, the enemy never striking back). */
type Cost = { damage: number; turns: number };

/** Predictions by enemy stats, kept while the hero's ATK, DEF and shroud
 * stay the same (HP only colours a label, read as it is drawn), so a board
 * full of enemies is predicted once per kind of enemy, not every frame. */
export class DamagePredictions {
  private hero = "";
  private costs = new Map<string, Cost>();

  /** How many predictions have been worked out, for tests. */
  computed = 0;

  cost(player: Player, enemy: Enemy): Cost {
    const hero = `${player.attack}|${player.defense}|${player.shroud ?? 0}`;
    if (hero !== this.hero) [this.hero, this.costs] = [hero, new Map()];
    const key = `${enemy.hp}|${enemy.attack}|${enemy.defense}`;
    let cost = this.costs.get(key);
    if (!cost) {
      const r = predict(player, enemy);
      this.computed++;
      cost = { damage: r.impervious ? Infinity : r.damage, turns: r.turns };
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

/** A label's text and colour: red when the fight is lethal (∞ when the
 * hero can't hurt the enemy), a gray 0 for an Instakill; otherwise, with
 * Relative Damage Color, its share of `hp` on the spectrum, else a white 0
 * when the enemy strikes but costs no HP and gold for any more. */
export function damageLabel(cost: Cost, hp: number, relative = false) {
  if (!Number.isFinite(cost.damage)) return { text: "∞", color: "#ff5a5a" };
  const shown = wholeChange(cost.damage);
  const color = hp <= cost.damage ? "#ff5a5a" : cost.turns === 1 ? "#9aa3b2"
    : relative ? relativeColor(cost.damage / hp) : shown === 0 ? "#ffffff" : "#ffe08a";
  return { text: compactAmount(shown), color };
}

/** The fight on the board (its enemy's tile), whose HP bar tells its story. */
type Fighting = { to: { x: number; y: number } } | null;

/** Draws each enemy's label in view, over the darkness so it always reads. */
export function drawDamageLabels(f: FrameContext, predictions: DamagePredictions, player: Player, fight: Fighting, relative = false) {
  const c = f.c, s = f.s, pad = s * 0.06;
  c.save();
  c.font = `bold ${Math.max(8, Math.round(s * 0.3))}px Cinzel, serif`;
  c.textAlign = "left";
  c.textBaseline = "bottom";
  c.lineJoin = "round";
  c.lineWidth = Math.max(2, s * 0.09);
  c.strokeStyle = "#000d";
  forEachViewTile(f, (x, y) => {
    const t = f.world.tile(x, y);
    if (t.kind !== "enemy" || !t.enemy || (fight && fight.to.x === x && fight.to.y === y)) return;
    const { text, color } = damageLabel(predictions.cost(player, t.enemy), player.hp, relative);
    const left = (x - f.left) * s + pad, bottom = (f.n - (y - f.bottom)) * s - pad;
    c.strokeText(text, left, bottom);
    c.fillStyle = color;
    c.fillText(text, left, bottom);
  });
  c.restore();
}
