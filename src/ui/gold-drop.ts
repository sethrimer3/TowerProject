import { stream } from "../random.ts";
import { shortAmount } from "../whole.ts";
import { goldIcon } from "./dom.ts";

const fx = stream("effects");
/** How long the drop lasts before its layer is removed (ms). */
const DROP_MS = 1900;

/** Rains Gold coins down the screen, scattered and staggered, over the Gold
 * granted ("+12.3K"), then clears itself. Nothing with Reduce motion on. */
export function dropGold(gold: number, reduceMotion: boolean) {
  if (gold <= 0 || reduceMotion) return;
  const coins = Math.min(24, 8 + Math.floor(Math.log10(gold + 1) * 2));
  const layer = document.createElement("div");
  layer.className = "gold-drop";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML =
    Array.from({ length: coins }, () => {
      const x = Math.round(10 + fx() * 80), delay = Math.round(fx() * 450), fall = Math.round(40 + fx() * 25), spin = Math.round(fx() * 720 - 360);
      return `<span class="gold-drop-coin" style="--x:${x}vw;--delay:${delay}ms;--fall:${fall}vh;--spin:${spin}deg">${goldIcon()}</span>`;
    }).join("") + `<b class="gold-drop-amount">+${shortAmount(Math.floor(gold), 1000)} ${goldIcon()}</b>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  window.setTimeout(() => layer.remove(), DROP_MS);
}
