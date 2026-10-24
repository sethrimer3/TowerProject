import "./style.css";
import "./ui-sprites.css";
import { finishInterfaceLoading, preloadSprites } from "./sprites/preload.ts";

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
  } catch (error) {
    app.hidden = true;
    console.error("Game loading failed", error);
    message.textContent = "Unable to load the game. Check your connection and retry.";
    progress.hidden = true;
    retry.hidden = false;
    loading.setAttribute("role", "alert");
  }
}
void boot();
