import "./style.css";
import "./ui-sprites.css";
import "./loading.css";
import "./sprites/ui-atlas.css";
import { finishInterfaceLoading, preloadSprites } from "./sprites/preload.ts";
import { uiAtlasEnabled } from "./sprites/ui-atlas.ts";
import { LoadingScreen } from "./ui/loading-screen.ts";

// Only Reduce motion is read before the save module loads.
try {
  const settings = JSON.parse(localStorage.getItem("towerdelve.v1") ?? "null")?.settings;
  document.documentElement.classList.toggle("reduce-motion", settings?.reduceMotion === true);
} catch { /* Loading the game handles unavailable storage and malformed saves. */ }

/** How many times a failed load reloads the page by itself, and how long
 * it waits first, before it offers Retry: a dropped request or a busy
 * device often loads on the next try. */
const AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
/** Where the reloads so far are counted, for this tab only; cleared once the game loads. */
const RETRIES_KEY = "towerdelve.bootRetries";

/** The reloads a failed load has made so far, or null when the tab can't
 * count them (storage blocked), so it never reloads without end. */
function retriesSoFar(): number | null {
  try { return Number(sessionStorage.getItem(RETRIES_KEY)) || 0; } catch { return null; }
}
function setRetries(count: number | null) {
  try {
    if (count === null) sessionStorage.removeItem(RETRIES_KEY);
    else sessionStorage.setItem(RETRIES_KEY, String(count));
  } catch { /* Uncounted: Retry is offered at once. */ }
}

async function boot() {
  const root = document.querySelector<HTMLElement>("#boot-loading")!;
  const message = document.querySelector<HTMLElement>("#boot-message")!;
  const retry = document.querySelector<HTMLButtonElement>("#boot-retry")!;
  const app = document.querySelector<HTMLElement>("#app")!;
  const loading = new LoadingScreen(root,
    () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches);
  retry.onclick = () => location.reload();
  const disableAtlas = document.querySelector<HTMLButtonElement>("#boot-disable-atlas")!;
  disableAtlas.onclick = async () => {
    try {
      let save;
      try { save = JSON.parse(localStorage.getItem("towerdelve.v1") ?? "null"); } catch { /* Recover an unreadable profile through defaults. */ }
      if (!save || typeof save !== "object" || Array.isArray(save)) save = (await import("./save/save.ts")).defaults();
      if (!save.settings || typeof save.settings !== "object") save.settings = {};
      save.settings.experimentalAtlas = false;
      localStorage.setItem("towerdelve.v1", JSON.stringify(save));
      location.reload();
    } catch { message.textContent = "Unable to change settings. Allow storage and retry."; }
  };
  try {
    // Keep the first paint of the loading text on the same face as its final one.
    const faces = await document.fonts.load('15px "Tower Pixel"');
    if (!faces.length) throw new Error("Loading-screen font unavailable");
    root.classList.add("font-ready");
    await preloadSprites((loaded, total) => loading.progress(0.85 * loaded / total));
    const { startGame } = await import("./main.ts");
    loading.progress(0.92);
    await finishInterfaceLoading(app);
    await loading.complete();
    app.hidden = false;
    app.removeAttribute("aria-busy");
    startGame();
    root.remove();
    setRetries(null);
  } catch (error) {
    app.hidden = true;
    loading.stop();
    console.error("Game loading failed", error);
    const tries = retriesSoFar();
    if (tries !== null && tries < AUTO_RETRIES) {
      setRetries(tries + 1);
      if (retriesSoFar() === tries + 1) {
        message.textContent = `Loading failed. Retrying… (${tries + 1} of ${AUTO_RETRIES})`;
        setTimeout(() => location.reload(), RETRY_DELAY_MS);
        return;
      }
    }
    setRetries(null);
    // A failed font download must still leave an actionable recovery screen.
    root.classList.add("font-ready");
    message.textContent = "Unable to load the game. Check your connection and retry.";
    root.querySelector<HTMLElement>(".loading-room")!.hidden = true;
    retry.hidden = false;
    disableAtlas.hidden = !uiAtlasEnabled();
    root.setAttribute("role", "alert");
    root.setAttribute("aria-label", "Unable to load the game. Retry.");
  }
}
void boot();
