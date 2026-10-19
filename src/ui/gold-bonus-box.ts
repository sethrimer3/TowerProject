import { controlIcon } from "./control-icon.ts";
import type { Game } from "../state.ts";
import { factorText, goldMultipliers, goldMultiplierTotal } from "../gold-multipliers.ts";
import { goldIcon } from "./dom.ts";

/** The box over the middle of the screen listing every Gold bonus and what
 * they multiply to. It is no dialog: the game plays on behind it. A press
 * anywhere (the X is only a mark) puts it away; a second call does too. */
export function toggleGoldBonusBox(game: Game) {
  const open = document.querySelector(".gold-bonus-layer");
  if (open) return open.remove();
  const bonuses = goldMultipliers(game.goldContext);
  const rows = bonuses.map((b) =>
    `<li class="${b.factor === null ? "inactive" : ""}"><span>${b.name}</span><b>${b.factor === null ? "Inactive" : factorText(b.factor)}</b></li>`).join("");
  const layer = document.createElement("div");
  layer.className = "gold-bonus-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "All Gold Bonuses");
  layer.innerHTML = `<div class="gold-bonus-box"><span class="gold-bonus-x" aria-hidden="true">${controlIcon("close")}</span><div class="gold-bonus-head">${goldIcon()}<h2>All Gold Bonuses</h2></div><ul>${rows}</ul><div class="gold-bonus-total"><span>Total</span><b>${factorText(goldMultiplierTotal(bonuses))}</b></div></div>`;
  layer.onclick = () => layer.remove();
  (document.querySelector("#app") ?? document.body).append(layer);
}
