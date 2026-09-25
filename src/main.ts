import "./style.css";
import { load, persist } from "./save.ts";
import { Game } from "./state.ts";
import { Renderer } from "./rendering.ts";
import { bindInput } from "./input.ts";
import { DefendPage } from "./defend/ui.ts";
import { drawGameSprite } from "./game-sprites.ts";
import type { ConsumableId } from "./crafting.ts";
import { FrameLoop } from "./frame-loop.ts";
import { installDebugHooks } from "./debug-hooks.ts";
import { isBoard, type AppContext, type Tab } from "./ui/app.ts";
import { displayedProgress, el } from "./ui/dom.ts";
import { buildShell } from "./ui/shell.ts";
import { BoardOverlay } from "./ui/board-overlay.ts";
import { boardHeadingStale, renderBoardHeading, renderHud } from "./ui/hud.ts";
import { confirmAction, RunEnd, showAutoSettings, showLog, showSectionPicker } from "./ui/dialogs.ts";
import { SkillTreePage } from "./ui/skill-tree-page.ts";
import { GearPage } from "./ui/gear-page.ts";
import { renderSettingsPage } from "./ui/settings-page.ts";

// Wires the pages together: builds the shell, creates the game and renderer,
// and routes navigation, HUD refreshes and input between the ui/ modules.

buildShell(document.querySelector<HTMLDivElement>("#app")!);
const game = new Game(load());
const renderer = new Renderer(document.querySelector("#world")!, game);
{
  const portraitCtx = (document.querySelector("#portrait-sprite") as HTMLCanvasElement).getContext("2d")!;
  if (game.save.settings.spritesOff || !drawGameSprite(portraitCtx, "player")) {
    Renderer.drawHero(portraitCtx);
  }
}
let tab: Tab = "tower";
const modal = el("modal") as HTMLDialogElement;
const ctx: AppContext = {
  game,
  renderer,
  modal,
  save,
  update,
  renderPage,
  navigate,
  confirm: (title, body, label, action) => confirmAction(ctx, { title, body, label }, action),
};
const runEnd = new RunEnd(ctx);
const overlay = new BoardOverlay(game, renderer);
const skillTree = new SkillTreePage(ctx);
const gear = new GearPage(ctx);
const defendPage = new DefendPage(el("defend"), {
  save: () => game.save.defend,
  wallet: () => ({ gold: game.save.gold, ironBar: game.save.materials.ironBar, steelBar: game.save.materials.steelBar }),
  setWallet: (w) => {
    game.save.gold = w.gold;
    game.save.materials.ironBar = w.ironBar;
    game.save.materials.steelBar = w.steelBar;
  },
  persist: save,
  reduceMotion: () => game.save.settings.reduceMotion,
  devMode: () => game.save.settings.devMode === true,
});

function save() {
  if (!persist(game.save))
    game.message = "Storage unavailable — progress is only kept for this session.";
}
/** Refreshes the HUD from game state, saves, and shows any finished run. */
function update() {
  if (boardHeadingStale(game)) renderBoardHeading(game, overlay);
  renderHud(game, renderer, overlay);
  save();
  runEnd.check();
}
function renderPage() {
  if (tab === "defend") defendPage.show();
  if (tab === "gear") gear.render();
  if (tab === "upgrades") skillTree.render();
  if (tab === "settings") renderSettingsPage(ctx, overlay);
}
/** Locked tabs point at the upgrade that unlocks them instead. */
function unlockTarget(id: string): string {
  if (id === "delve" && !game.save.upgrades.delve) {
    skillTree.focus("inspiration", "delve");
    return "upgrades";
  }
  if (id === "defend" && !game.save.upgrades.legacy) {
    skillTree.focus("courage", "legacy");
    return "upgrades";
  }
  return id;
}
function navigate(requested: string) {
  const id = unlockTarget(requested) as Tab;
  if (id !== "defend") defendPage.pause();
  tab = id;
  renderer.weather.silence();
  if (isBoard(id)) {
    game.switchMode(id);
    renderBoardHeading(game, overlay);
  } else game.route = [];
  el("stats").toggleAttribute("hidden", !isBoard(id));
  el("currencies").toggleAttribute("hidden", id !== "upgrades");
  const page = isBoard(id) ? "board" : id;
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === page));
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === id);
    b.setAttribute("aria-current", b.dataset.tab === id ? "page" : "false");
  });
  renderPage();
  update();
}

document.querySelectorAll<HTMLButtonElement>("[data-hud-consumable]").forEach(button => {
  button.onclick = () => {
    if (!game.useConsumable(button.dataset.hudConsumable as ConsumableId)) return;
    save();
    update();
  };
});
el("log").onclick = () => showLog(ctx);
el("section-pick").onclick = () => showSectionPicker(ctx);
el("end-run").onclick = () =>
  ctx.confirm(
    "End this run?",
    `End the current ${game.mode === "tower" ? "Tower run" : "Delve run"} at ${game.mode === "tower" ? "height" : "depth"} ${displayedProgress(game.run.height, !!game.run.outside)}. Milestone rewards are already yours, and uncollected clear chests will be claimed.`,
    "End run",
    () => {
      game.finish(game.mode === "tower" ? "Tower run ended" : "Delve run ended");
      update();
    },
  );
modal.addEventListener("cancel", (e) => {
  if (game.summary) e.preventDefault();
});
el("auto-settings").onclick = () => showAutoSettings(ctx);
el("auto").onclick = () => {
  if (!game.save.upgrades.auto) {
    if (game.save.upgrades.delve) skillTree.focus("courage", "auto");
    else skillTree.focus("inspiration", "delve");
    navigate("upgrades");
    return;
  }
  game.route = [];
  game.auto = !game.auto;
  game.message = game.auto ? "Wayfinder is searching for a route." : "Manual climbing";
  update();
};
el("undo").onclick = () => {
  overlay.hide();
  game.undo();
  update();
};
document
  .querySelectorAll<HTMLButtonElement>("[data-tab]")
  .forEach((b) => (b.onclick = () => navigate(b.dataset.tab!)));
bindInput(
  game,
  renderer,
  (x, y) => overlay.tap(x, y),
  () => {
    overlay.refresh();
    update();
  },
  () => isBoard(tab),
);

const loop = new FrameLoop({
  game,
  renderer,
  modal,
  tab: () => tab,
  upgradesFrame: (time) => skillTree.drawParticles(time),
  defendFrame: (time) => defendPage.frame(time),
  update,
  save,
});
document.addEventListener("visibilitychange", () => {
  loop.resetAutoTimer();
  save();
});
window.addEventListener("pagehide", save);
installDebugHooks(game, defendPage);
// Start on the Tower board: stats showing, currencies (an Upgrades-only bar) hidden.
el("stats").toggleAttribute("hidden", false);
el("currencies").toggleAttribute("hidden", true);
renderBoardHeading(game, overlay);
update();
loop.start();
