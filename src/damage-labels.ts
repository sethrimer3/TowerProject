import { predict } from "./combat.ts";
import type { Enemy, Player } from "./entities.ts";
import { forEachViewTile, type FrameContext } from "./render-frame.ts";
import { compactAmount, wholeChange } from "./whole.ts";

// Damage Visual (Tower I's floor 50 goal): each enemy in view wears, in its
// lower-left corner, the HP its fight would cost the hero, as Damage
// Prediction's inspect line says it. Badges that scale a fight (Effective,
// Dampen) are left out, as the inspect panel leaves them: which card meets
// an enemy isn't known until it does.

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

/** A label's text and colour: red when the fight is lethal (∞ when the
 * hero can't hurt the enemy), a gray 0 for an Instakill, a white 0 when the
 * enemy strikes but costs no HP, gold otherwise. */
export function damageLabel(cost: Cost, hp: number) {
  if (!Number.isFinite(cost.damage)) return { text: "∞", color: "#ff5a5a" };
  const shown = wholeChange(cost.damage);
  const color = hp <= cost.damage ? "#ff5a5a" : cost.turns === 1 ? "#9aa3b2" : shown === 0 ? "#ffffff" : "#ffe08a";
  return { text: compactAmount(shown), color };
}

/** The fight on the board (its enemy's tile), whose HP bar tells its story. */
type Fighting = { to: { x: number; y: number } } | null;

/** Draws each enemy's label in view, over the darkness so it always reads. */
export function drawDamageLabels(f: FrameContext, predictions: DamagePredictions, player: Player, fight: Fighting) {
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
    const { text, color } = damageLabel(predictions.cost(player, t.enemy), player.hp);
    const left = (x - f.left) * s + pad, bottom = (f.n - (y - f.bottom)) * s - pad;
    c.strokeText(text, left, bottom);
    c.fillStyle = color;
    c.fillText(text, left, bottom);
  });
  c.restore();
}
