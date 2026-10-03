import { stream } from "../random.ts";

/** The page's small celebrations, drawn in the DOM over everything: sparks
 * struck from a pressed board, gold dust over a win, and the pop that marks
 * a number rising. Each mark removes itself when its animation ends, so a
 * page re-rendering underneath never cuts one short. None plays with Reduce
 * motion on, set by the shell through `flourishesEnabledBy`. */

const rand = stream("effects");
let enabled: () => boolean = () => true;
const prefersReduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function flourishesEnabledBy(isOn: () => boolean) {
  enabled = isOn;
}
const on = () => enabled() && !prefersReduced();

export type SparkKind =
  /** A few embers and wood dust off a pressed button. */
  | "embers"
  /** A shower of gold motes and ✦ glints for a win. */
  | "gold"
  /** Violet ✦ glints, the colour of Valor, for a level. */
  | "arcane";

const KINDS: Record<SparkKind, { count: number; spread: number; rise: number; life: number; glyphs: number }> = {
  embers: { count: 7, spread: 26, rise: 18, life: 520, glyphs: 0 },
  gold: { count: 26, spread: 110, rise: 70, life: 1200, glyphs: 0.3 },
  arcane: { count: 20, spread: 80, rise: 60, life: 1300, glyphs: 0.5 },
};

/** A burst of sparks centred on page point (x, y). */
export function sparks(x: number, y: number, kind: SparkKind) {
  if (!on()) return;
  const k = KINDS[kind], layer = document.createElement("div");
  layer.className = `sparks ${kind}`;
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  layer.setAttribute("aria-hidden", "true");
  let html = "";
  for (let i = 0; i < k.count; i++) {
    const a = rand() * Math.PI * 2, r = k.spread * (0.35 + rand() * 0.65);
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r * 0.6 - k.rise * (0.4 + rand() * 0.6);
    const life = k.life * (0.6 + rand() * 0.5), size = 2 + rand() * (kind === "embers" ? 2 : 3);
    const glyph = rand() < k.glyphs;
    html += `<i class="${glyph ? "glint" : ""}" style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--life:${life.toFixed(0)}ms;--size:${size.toFixed(1)}px;--delay:${(rand() * 90).toFixed(0)}ms">${glyph ? "✦" : ""}</i>`;
  }
  layer.innerHTML = html;
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), k.life * 1.2 + 120);
}

/** Sparks from the middle of an element. */
export function sparksOver(el: Element | null, kind: SparkKind) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  sparks(r.left + r.width / 2, r.top + r.height / 2, kind);
}

/** Plays a CSS animation class on `el` from its start, even if it's still
 * running from last time. */
export function replay(el: Element | null, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

/** A ring of Gem-blue glints bursting out round `el` and a ring of light
 * widening behind them: the ad's Gems claimed. Drawn whatever the theme;
 * the caller leaves it out with Reduce motion on. */
export function gemSparkle(el: Element) {
  const r = el.getBoundingClientRect(), layer = document.createElement("div");
  layer.className = "gem-sparkle";
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  layer.style.setProperty("--w", `${r.width.toFixed(1)}px`);
  layer.style.setProperty("--h", `${r.height.toFixed(1)}px`);
  layer.setAttribute("aria-hidden", "true");
  const count = 12;
  let html = `<b class="gem-sparkle-ring"></b>`;
  for (let i = 0; i < count; i++) {
    // Evenly round an ellipse a little wider than the button, every other
    // glint flung further, smaller and a moment later.
    const a = (i / count) * Math.PI * 2, far = i % 2 ? 1.25 : 0.95;
    const dx = Math.cos(a) * (r.width / 2 + 14) * far, dy = Math.sin(a) * (r.height / 2 + 14) * far;
    html += `<i style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--size:${i % 2 ? 9 : 13}px;--delay:${i % 2 ? 90 : 0}ms">✦</i>`;
  }
  layer.innerHTML = html;
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1100);
}
