/** PROTOTYPE: the screen layout, chosen for now by the page's address
 * (`?layout=landscape|portrait|auto&hand=left`), dressed by `landscape.css`.
 * `auto` follows the screen's orientation. */
const LANDSCAPE = "layout-landscape", LEFT = "left-handed";

export function applyLayout() {
  const params = new URLSearchParams(location.search);
  const layout = params.get("layout") ?? "portrait", left = params.get("hand") === "left";
  const root = document.documentElement.classList;
  const wide = matchMedia("(orientation: landscape) and (max-aspect-ratio: 100/1)");
  const set = () => {
    const on = root.toggle(LANDSCAPE, layout === "landscape" || (layout === "auto" && wide.matches));
    placeStatus(on);
  };
  set();
  if (layout === "auto") wide.addEventListener("change", set);
  root.toggle(LEFT, left);
}

/** In landscape the status line leaves the board's foot for the side
 * column's spare height, between the HUD and the hand. */
function placeStatus(landscape: boolean) {
  const shell = document.querySelector<HTMLElement>(".shell"), status = document.getElementById("status-row");
  if (!shell || !status) return;
  let side = document.getElementById("side-info");
  if (!side) { side = document.createElement("div"); side.id = "side-info"; shell.append(side); }
  if (landscape) side.append(status);
  else document.getElementById("board-frame")?.append(status);
}
