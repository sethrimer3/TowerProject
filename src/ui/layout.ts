import type { Save } from "../save/shape.ts";

/** The landscape layout's class on the root, dressed by `landscape.css`. */
export const LANDSCAPE_CLASS = "layout-landscape";
/** The left hand's class on the root: the layout mirrored. */
export const LEFT_HANDED_CLASS = "left-handed";
/** Landscape's HUD column is narrower than a phone's portrait HUD wants:
 * the HUD takes the phone's sizes (`landscape.css`). */
export const HUD_NARROW_CLASS = "hud-narrow";

/** A window wide enough for the board and the HUD side by side: a phone on
 * its side, a tablet held wide, or a wide desktop window. */
export const WIDE_QUERY = "(min-aspect-ratio: 4/3) and (min-width: 640px) and (min-height: 300px)";
/** The HUD column under this width takes the phone's HUD sizes. */
const NARROW_HUD = 470;

let settings: Pick<Save["settings"], "autoLandscape" | "hand" | "batterySaver"> | null = null;
let wide: MediaQueryList | null = null;
let hudWatch: ResizeObserver | null = null;

/** Whether the landscape layout is worn: on with the setting, while the
 * window is wide enough. */
export const landscapeWorn = (autoLandscape: boolean, wideWindow: boolean) => autoLandscape && wideWindow;

/** Lays the shell out for the window and the save's settings: landscape
 * while `autoLandscape` is on and the window is wide (`WIDE_QUERY`), switching
 * as the window changes shape, and mirrored for the left hand. */
export function applyLayout(save: Pick<Save, "settings">) {
  settings = save.settings;
  // Outside a browser (the Node tests' stand-in page) there is no window to fit.
  if (typeof matchMedia !== "function") return;
  if (!wide) {
    wide = matchMedia(WIDE_QUERY);
    wide.addEventListener("change", relayout);
  }
  relayout();
}

function relayout() {
  if (!settings || !wide) return;
  const root = document.documentElement.classList;
  // Battery saver keeps its own centred column whatever the window's shape.
  const landscape = landscapeWorn(settings.autoLandscape, wide.matches) && !settings.batterySaver;
  const changed = root.contains(LANDSCAPE_CLASS) !== landscape || root.contains(LEFT_HANDED_CLASS) !== (settings.hand === "left");
  root.toggle(LANDSCAPE_CLASS, landscape);
  root.toggle(LEFT_HANDED_CLASS, settings.hand === "left");
  placeSideInfo(landscape);
  watchHud(landscape);
  // What measures itself on a resize (the board's canvas, the hand's arrows,
  // the combat stats' fit) measures again in its new place.
  if (changed) window.dispatchEvent(new Event("resize"));
}

/** In landscape the board's foot lines, the status line and the run's
 * inspection, leave the board for the side column's spare height between the
 * HUD and the hand, so they never cover the board. */
function placeSideInfo(landscape: boolean) {
  const shell = document.querySelector<HTMLElement>(".shell");
  const status = document.getElementById("status-row"), inspect = document.getElementById("inspect");
  if (!shell || !status || !inspect) return;
  let side = document.getElementById("side-info");
  // The portrait layout never needs it, nor changes the shell for it.
  if (!side && !landscape) return;
  if (!side) {
    side = document.createElement("div");
    side.id = "side-info";
    side.className = "side-info";
    shell.append(side);
  }
  const home = landscape ? side : document.getElementById("board-frame");
  if (home && status.parentElement !== home) home.append(status, inspect);
}

/** Watches the HUD's width in landscape, giving it the phone's sizes while
 * its column is narrow. */
function watchHud(landscape: boolean) {
  const stats = document.getElementById("stats"), root = document.documentElement.classList;
  if (!stats) return;
  hudWatch ??= new ResizeObserver(() => {
    const width = stats.getBoundingClientRect().width;
    if (width) root.toggle(HUD_NARROW_CLASS, root.contains(LANDSCAPE_CLASS) && width < NARROW_HUD);
  });
  if (landscape) hudWatch.observe(stats);
  else { hudWatch.disconnect(); root.remove(HUD_NARROW_CLASS); }
}
