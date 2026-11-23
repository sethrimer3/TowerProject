import { FAMILIARS, type FamiliarId } from "../familiars/catalog.ts";
import { familiarFrame, paintFamiliar } from "../render/effects/familiars.ts";
import { drawKit } from "../sprites/kit.ts";
import { play } from "../sound.ts";

/** A press this soon after it opens is the confirmation's own, pressed twice. */
const DEAF_MS = 400;

/** A 24-pixel canvas, scaled up by the page. */
function pixels(className: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  canvas.className = className;
  return canvas;
}

/** The egg just bought hatches (docs/agents/familiars.md; timed in style.css):
 * it rises to the middle of a dark screen, wobbles, and cracks apart on a
 * zig-zag, uncovering the young familiar behind it, which rises on until
 * rays of light turn behind it and its name is said. A press anywhere, or a
 * key, dismisses it; Reduce motion shows its last moment at once. */
export function showHatch(id: FamiliarId, reduceMotion: boolean) {
  document.querySelector(".hatch-reveal")?.remove();
  play("eggHatch");
  const still = reduceMotion || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const said = `${FAMILIARS[id].short} hatched!`, layer = document.createElement("div");
  layer.className = `hatch-reveal${still ? " still" : ""}`;
  layer.dataset.familiar = id;
  layer.tabIndex = -1;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", said);
  layer.innerHTML = `<h2 class="hatch-name">${said}</h2><div class="hatch-stage" aria-hidden="true"><div class="hatch-rays"></div></div>`;
  const stage = layer.querySelector(".hatch-stage")!, beast = pixels("hatch-beast"), egg = document.createElement("div");
  egg.className = "hatch-egg";
  for (const part of ["whole", "left", "right"] as const) {
    const shell = pixels(`hatch-shell ${part}`);
    drawKit(shell.getContext("2d")!, `familiar-egg-${id}${part === "whole" ? "" : `-${part}`}`, 0, 0, 24);
    egg.append(shell);
  }
  stage.append(beast, egg);
  (document.querySelector("#app") ?? document.body).append(layer);
  layer.focus({ preventScroll: true });

  const opened = performance.now(), c = beast.getContext("2d")!;
  let shown = -1;
  const draw = (now: number) => {
    if (!layer.isConnected) return;
    const frame = familiarFrame(now, still);
    if (frame !== shown) {
      c.clearRect(0, 0, 24, 24);
      paintFamiliar(c, id, frame);
      shown = frame;
    }
    if (!still) requestAnimationFrame(draw);
  };
  draw(opened);
  const dismiss = () => {
    if (performance.now() - opened >= DEAF_MS) layer.remove();
  };
  layer.onclick = dismiss;
  layer.onkeydown = (e) => {
    if (!["Escape", "Enter", " "].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  };
}
