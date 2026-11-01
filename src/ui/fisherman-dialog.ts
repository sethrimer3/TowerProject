import { FISHERMAN_DIALOGUE } from "../lakeside.ts";
import { kitUrl } from "../sprites/kit.ts";
import type { AppContext } from "./app.ts";

/** Uses the shared modal so movement waits, with Escape and a focused close button. */
export function showFisherman({ modal }: AppContext) {
  modal.innerHTML = `<small>LAKESIDE</small><h2>Fisherman</h2><img src="${kitUrl("lake-fisherman")}" alt="" width="96" height="80" style="image-rendering:pixelated"><p>${FISHERMAN_DIALOGUE}</p><div class="dialog-actions"><button id="fisherman-close" autofocus>Farewell</button></div>`;
  modal.showModal();
  modal.querySelector<HTMLButtonElement>("#fisherman-close")!.onclick = () => modal.close();
}
