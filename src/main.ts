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
import { el } from "./ui/dom.ts";
import { buildShell } from "./ui/shell.ts";
import { BoardOverlay } from "./ui/board-overlay.ts";
import { boardHeadingStale, flashRed, renderAdButton, renderBoardHeading, renderHud, renderVitals, gearWaiting, upgradesWaiting } from "./ui/hud.ts";
import { confirmAction, RunEndDialog, showLog, showSectionPicker } from "./ui/dialogs.ts";
import { SkillTreePage } from "./ui/skill-tree-page.ts";
import { ResearchToasts } from "./ui/research-toast.ts";
import { GearPage } from "./ui/gear-page.ts";
import { DeckPage } from "./ui/deck-page.ts";
import { RunTrainingBar } from "./ui/run-training-bar.ts";
import { renderSettingsPage } from "./ui/settings-page.ts";

// Wires the pages together: builds the shell, creates the game and renderer,
// and routes navigation, HUD refreshes and input between the ui/ modules.

buildShell(document.querySelector<HTMLDivElement>("#app")!);
const game = new Game(load());
// The frame loop settles fights as they finish playing out.
game.playsFights = true;
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
  modal,
  save,
  update,
  renderPage,
  navigate,
  confirm: (prompt, action) => confirmAction(ctx, prompt, action),
};
const runEnd = new RunEndDialog(ctx);
const overlay = new BoardOverlay(game, renderer);
const skillTree = new SkillTreePage(ctx);
const gear = new GearPage(ctx);
const deck = new DeckPage(ctx);
const runTraining = new RunTrainingBar(game, () => update());
const researchToasts = new ResearchToasts(() => game.save.settings.reduceMotion);
const defendPage = new DefendPage(el("defend"), {
  save: () => game.save.defend,
  wallet: () => ({ gold: game.save.gold, ironBar: game.save.materials.ironBar, steelBar: game.save.materials.steelBar, free: game.free }),
  setWallet: (w) => {
    game.save.gold = w.gold;
    game.save.materials.ironBar = w.ironBar;
    game.save.materials.steelBar = w.steelBar;
  },
  persist: save,
  reduceMotion: () => game.save.settings.reduceMotion,
  devMode: () => game.save.settings.devMode,
});

function save() {
  if (!persist(game.save))
    game.message = "Storage unavailable — progress is only kept for this session.";
}
/** Refreshes the HUD from game state, saves, and asks a fallen hero's player what next. */
function update() {
  if (boardHeadingStale(game)) renderBoardHeading(game, overlay);
  // Inside a run the tabs give way to an empty row, kept for the hand.
  document.querySelector("nav")!.classList.toggle("in-run", !game.run.outside);
  // The Deck tutorial keeps the player on its page until they reorder the hand.
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.disabled = deck.teaching && b.dataset.tab !== "deck"));
  renderHud(game, renderer, overlay);
  runTraining.render();
  researchToasts.add(game.researchDone.splice(0));
  save();
  runEnd.check();
}
function renderPage() {
  if (tab === "defend") defendPage.show();
  if (tab === "deck") deck.render();
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
  if (id === "deck" && !game.save.upgrades.handOrdering) {
    skillTree.focus("inspiration", "handOrdering");
    return "upgrades";
  }
  if (id === "gear" && !game.save.upgrades.gear) {
    skillTree.focus("inspiration", "gear");
    return "upgrades";
  }
  if (id === "defend" && !game.save.upgrades.legacy) {
    skillTree.focus("courage", "legacy");
    return "upgrades";
  }
  return id;
}
function navigate(requested: string) {
  if (deck.teaching && requested !== "deck") return;
  const id = unlockTarget(requested) as Tab;
  // Only the board plays a fight out: leaving it settles one still playing.
  game.finishEncounter();
  if (id !== "defend") defendPage.pause();
  tab = id;
  // Opening the Upgrades page clears the dot the first Inspiration put on it.
  if (id === "upgrades" && upgradesWaiting(game)) game.save.tutorials.upgrades = true;
  // And opening the Gear page the dot the Gear skill put on it.
  if (id === "gear" && gearWaiting(game)) game.save.tutorials.gear = true;
  deck.shown(id === "deck");
  renderer.weather.silence();
  if (isBoard(id)) {
    game.switchMode(id);
    renderBoardHeading(game, overlay);
  } else game.cancelRoute();
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
// Focus: pressing a hand card inside a run puts it ahead of the others.
el("hand").onclick = (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>(".hand-card");
  if (!card || !game.save.upgrades.focus) return;
  const result = game.focus(Number(card.dataset.handSlot));
  if (result === "spent") flashRed(el("focus-stat"));
  if (result === "noPath") flashRed(card);
  update();
};
el("log").onclick = () => showLog(ctx);
el("section-pick").onclick = () => showSectionPicker(ctx);
for (const [id, step] of [["tier-prev", -1], ["tier-next", 1]] as const)
  el(id).onclick = () => {
    if (!game.selectTier(game.save[game.mode].tier + step)) return;
    save();
    update();
  };
el("gem-ad").onclick = () => {
  if (!game.claimAdGems()) return;
  save();
  update();
};
el("end-run").onclick = () => runEnd.ask();
modal.addEventListener("cancel", (e) => {
  // The defeat dialog waits for an answer.
  if (game.fallen) e.preventDefault();
});
el("auto-settings").onclick = () => navigate("settings");
el("auto").onclick = () => {
  // Inside a run the button plays and pauses the hand; in the forest it
  // enters, starting the run.
  if (game.run.outside) {
    overlay.hide();
    game.enterRun();
  } else game.toggleAuto();
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

/** Research completes on the wall clock, whatever page shows. */
function archivesTick() {
  const done = game.settleResearch().length > 0 || game.settleTraining() > 0;
  if (done) update();
  // The ad button comes back on the wall clock too.
  else renderAdButton(game);
  if (tab === "upgrades") skillTree.archivesTick(done);
}
const loop = new FrameLoop({
  game,
  renderer,
  modal,
  tab: () => tab,
  upgradesFrame: (time) => skillTree.drawParticles(time),
  archivesTick,
  defendFrame: (time) => defendPage.frame(time),
  update,
  vitals: () => renderVitals(game),
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
