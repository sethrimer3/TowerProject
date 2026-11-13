import { ARCANA_EXAMPLES, ARCANA_LAB_DURATION, ARCANA_LAB_STILL, arcanaExampleIndex } from "../arcana-lab.ts";
import { ArcanaLabScene } from "./arcana-lab-scene.ts";
import { controlIcon } from "./control-icon.ts";
import { copyText } from "./run-notes-dialog.ts";

let selected = 0;
const cleanups = new WeakMap<HTMLElement, () => void>();

/** An isolated review screen; both canvases always receive the same animation time. */
export function renderArcanaLab(root: HTMLElement, reduceMotion: boolean, back: () => void) {
  cleanups.get(root)?.();
  root.innerHTML = `<button class="back" id="arcana-lab-back">${controlIcon("back")} Visual Settings</button>
    <div class="page-title"><small>DEVELOPMENT SHOWCASE</small><h2>Arcana Effects Lab</h2></div>
    <div class="arcana-lab"><div class="arcana-lab-heading" aria-live="polite" aria-atomic="true"><small id="arcana-example-id"></small><h3 id="arcana-example-name"></h3><p id="arcana-example-change"></p></div>
    <div class="arcana-comparison"><figure><figcaption><b>Before</b><span>Current effect</span></figcaption><canvas id="arcana-before" width="528" height="528" role="img"></canvas></figure>
    <figure><figcaption><b>After</b><span>Pixel-art proposal</span></figcaption><canvas id="arcana-after" width="528" height="528" role="img"></canvas></figure></div>
    <p id="arcana-loading" role="status" hidden>Loading artwork…</p>
    <div class="tileset-navigation" role="group" aria-label="Arcana effect slides"><button id="arcana-prev" aria-label="Previous Arcana effect">${controlIcon("back")}</button><span id="arcana-counter"></span><button id="arcana-next" aria-label="Next Arcana effect">${controlIcon("forward")}</button></div>
    <div class="arcana-playback"><button id="arcana-play"></button><button id="arcana-restart">Restart</button><output id="arcana-time" for="arcana-scrub"></output></div>
    <label class="arcana-scrub-label" for="arcana-scrub">Animation timeline</label><input id="arcana-scrub" type="range" min="0" max="${ARCANA_LAB_DURATION}" step="50" value="${ARCANA_LAB_STILL}">
    <button id="arcana-copy" class="wide">Copy example name</button>
    <p class="hint">Same room, targets and timing on both sides. Short impact flashes play at one-third speed. Pause or drag the timeline to inspect a frame. Use ← / → to browse.</p>
    <p class="hint">These proposals are previews only. Share the example name through Discord or text.</p></div>`;
  const find = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const panel = find("arcana-before"), before = panel as HTMLCanvasElement, after = find<HTMLCanvasElement>("arcana-after");
  const scrub = find<HTMLInputElement>("arcana-scrub"), play = find<HTMLButtonElement>("arcana-play");
  const scene = new ArcanaLabScene(), abort = new AbortController(), preference = matchMedia("(prefers-reduced-motion: reduce)");
  let time = ARCANA_LAB_STILL, playing = !reduceMotion && !preference.matches, frame = 0, last = 0, painted = -1, disposed = false;
  const controls = () => {
    play.textContent = playing ? "Pause" : "Play"; play.setAttribute("aria-label", playing ? "Pause comparison" : "Play comparison");
    scrub.value = String(Math.round(time / 50) * 50); find("arcana-time").textContent = `${(time / 1000).toFixed(2)} / 4.80 s`;
  };
  const draw = () => {
    const ex = ARCANA_EXAMPLES[selected];
    const ready = scene.draw(before, after, ex.id, time);
    find("arcana-loading").hidden = ready;
    before.dataset.time = after.dataset.time = String(time);
    controls(); return ready;
  };
  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    if (!panel.isConnected || !root.getClientRects().length) { dispose(); return; }
    if (document.hidden) { last = 0; return; }
    if (playing && last) time = (time + Math.min(100, now - last)) % ARCANA_LAB_DURATION;
    last = now;
    // Limit effect painting to 12 fps, while maintaining one shared clock.
    const bucket = Math.floor(time / (1000 / 12));
    let ready = true;
    if (bucket !== painted || !find("arcana-loading").hidden) { ready = draw(); painted = bucket; }
    if (playing || !ready) frame = requestAnimationFrame(tick);
  };
  const schedule = () => { if (!frame && !document.hidden && !disposed) frame = requestAnimationFrame(tick); };
  const observer = new MutationObserver(() => { if (!panel.isConnected || !root.getClientRects().length) dispose(); });
  const dispose = () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); abort.abort(); cleanups.delete(root); };
  cleanups.set(root, dispose); observer.observe(root, { childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
  const show = (index: number) => {
    selected = arcanaExampleIndex(index); const ex = ARCANA_EXAMPLES[selected];
    time = ARCANA_LAB_STILL; last = 0; painted = -1;
    find("arcana-example-id").textContent = `ARC-${ex.id} · EXPERIMENTAL`;
    find("arcana-example-name").textContent = ex.name; find("arcana-example-change").textContent = ex.change;
    find("arcana-counter").textContent = `${selected + 1} / ${ARCANA_EXAMPLES.length}`;
    for (const [canvas, label] of [[before, "Before: current effect"], [after, "After: pixel-art proposal"]] as const) {
      canvas.dataset.example = ex.id; canvas.setAttribute("aria-label", `${ex.name}. ${label}. Same example room.`);
    }
    const ready = draw(); if (playing || !ready) schedule();
  };
  const close = () => { dispose(); back(); };
  find("arcana-lab-back").onclick = close;
  find("arcana-prev").onclick = () => show(selected - 1); find("arcana-next").onclick = () => show(selected + 1);
  play.onclick = () => { playing = !playing; last = 0; controls(); if (playing) schedule(); else { cancelAnimationFrame(frame); frame = 0; } };
  find("arcana-restart").onclick = () => { time = 0; last = 0; painted = -1; const ready = draw(); if (playing || !ready) schedule(); };
  scrub.oninput = () => { playing = false; time = Number(scrub.value); last = 0; painted = -1; cancelAnimationFrame(frame); frame = 0; if (!draw()) schedule(); };
  find("arcana-copy").onclick = e => { const ex = ARCANA_EXAMPLES[selected]; copyText(e.currentTarget as HTMLButtonElement, `Tower Delve Arcana Effects Lab — ARC-${ex.id}: ${ex.name} (Before / After)`); };
  root.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey || (e.target === scrub && e.key !== "Escape")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); show(selected + (e.key === "ArrowLeft" ? -1 : 1)); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); show(e.key === "Home" ? 0 : ARCANA_EXAMPLES.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }, { signal: abort.signal });
  document.addEventListener("visibilitychange", () => { last = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { painted = -1; schedule(); } }, { signal: abort.signal });
  preference.addEventListener("change", () => { if (preference.matches) { playing = false; cancelAnimationFrame(frame); frame = 0; controls(); } }, { signal: abort.signal });
  show(selected); find("arcana-next").focus({ preventScroll: true });
}
