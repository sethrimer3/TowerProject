import "./style.css";
import "./ui-sprites.css";
import { finishInterfaceLoading, preloadSprites } from "./sprites/preload.ts";

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
  const loading = document.querySelector<HTMLElement>("#boot-loading")!;
  const progress = document.querySelector<HTMLProgressElement>("#boot-progress")!;
  const message = document.querySelector<HTMLElement>("#boot-message")!;
  const retry = document.querySelector<HTMLButtonElement>("#boot-retry")!;
  const app = document.querySelector<HTMLElement>("#app")!;
  retry.onclick = () => location.reload();
  try {
    await preloadSprites((loaded, total) => {
      progress.max = total;
      progress.value = loaded;
      message.textContent = `Loading artwork… ${Math.floor(loaded / total * 100)}%`;
    });
    message.textContent = "Preparing your adventure…";
    const { startGame } = await import("./main.ts");
    await finishInterfaceLoading(app);
    app.hidden = false;
    app.removeAttribute("aria-busy");
    startGame();
    loading.remove();
    setRetries(null);
  } catch (error) {
    app.hidden = true;
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
    message.textContent = "Unable to load the game. Check your connection and retry.";
    progress.hidden = true;
    retry.hidden = false;
    loading.setAttribute("role", "alert");
  }
}
void boot();
