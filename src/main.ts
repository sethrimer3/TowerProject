import type { UpgradeId } from "./config.ts";
import type { TreeId } from "./skill-trees.ts";
import "./style.css";
import "./medieval.css";
import "./neon.css";
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
import { boardHeadingStale, flashRed, renderAdButton, renderShopDot, renderBoardHeading, renderHud, renderVitals, purseFrame, gearWaiting, upgradesWaiting } from "./ui/hud.ts";
import { confirmAction, RunEndDialog } from "./ui/dialogs.ts";
import { GoalsPage } from "./ui/goals-page.ts";
import { SkillTreePage } from "./ui/skill-tree-page.ts";
import { ResearchToasts, researchToast, trainingToast } from "./ui/research-toast.ts";
import { GearPage } from "./ui/gear-page.ts";
import { EQUIPMENT_FLOOR } from "./equipment/balance.ts";
import { equipmentWaiting } from "./equipment/inventory.ts";
import { DeckPage } from "./ui/deck-page.ts";
import { RunTrainingBar } from "./ui/run-training-bar.ts";
import { renderSettingsPage } from "./ui/settings-page.ts";
import { ShopPage } from "./ui/shop-page.ts";
import { play } from "./sound.ts";
import { applyMedievalTheme, bindMedievalFeedback } from "./ui/medieval.ts";
import { gemSparkle } from "./ui/flourish.ts";

// Wires the pages together: builds the shell, creates the game and renderer,
// and routes navigation, HUD refreshes and input between the ui/ modules.

buildShell(document.querySelector<HTMLDivElement>("#app")!);
const game = new Game(load());
applyMedievalTheme(game.save.settings);
bindMedievalFeedback(() => game.save.settings.medievalTheme, () => game.save.settings.reduceMotion);
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
// Tapping the forest's Blacksmith opens the Equipment screen.
const overlay = new BoardOverlay(game, renderer, openBlacksmith);
const skillTree = new SkillTreePage(ctx);
const gear = new GearPage(ctx);
const deck = new DeckPage(ctx);
const shop = new ShopPage(ctx);
const goals = new GoalsPage(ctx);
// A run training purchase changes the hero, so the highlighted enemy's forecast too.
const runTraining = new RunTrainingBar(game, () => {
  overlay.refresh(true);
  update();
});
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
  (el("page-shop") as HTMLButtonElement).disabled = deck.teaching;
  renderHud(game, renderer, overlay);
  runTraining.render();
  const finished = [...game.research.done.splice(0).map(researchToast), ...game.training.done.splice(0).map(trainingToast)];
  if (finished.length) play("trained");
  researchToasts.add(finished);
  save();
  runEnd.check();
  announceEquipment();
}
function renderPage() {
  if (tab === "defend") defendPage.show();
  if (tab === "deck") deck.render();
  if (tab === "gear") gear.render();
  if (tab === "upgrades") skillTree.render();
  if (tab === "settings") renderSettingsPage(ctx, overlay);
  if (tab === "shop") shop.render();
  if (tab === "goals") goals.render();
}
/** Locked tabs point at the upgrade that unlocks them instead. */
function unlockTarget(id: string): string {
  const lock = LOCKED_TABS.get(id);
  if (!lock || game.save.upgrades[lock.skill]) return id;
  // Equipment opens the Gear page too, Gear skill or not.
  if (id === "gear" && game.save.equipment.unlocked) return id;
  skillTree.focus(lock.tree, lock.skill);
  return "upgrades";
}
/** Tabs opened by a skill not yet owned: pressed, they open the Upgrades
 * page on that skill instead. */
const LOCKED_TABS = new Map<string, { skill: UpgradeId; tree: TreeId }>([
  ["delve", { skill: "delve", tree: "inspiration" }],
  ["deck", { skill: "combatStance", tree: "inspiration" }],
  ["gear", { skill: "gear", tree: "inspiration" }],
  ["defend", { skill: "legacy", tree: "courage" }],
]);
/** The pages topped by the currencies bar and its Shop button. */
const CURRENCY_PAGES: string[] = ["upgrades", "deck", "gear"];
function navigate(requested: string) {
  if (deck.teaching && requested !== "deck") return;
  const id = unlockTarget(requested) as Tab;
  // Only the board plays a fight out: leaving it settles one still playing.
  game.finishEncounter();
  if (id !== "defend") defendPage.pause();
  const from = tab;
  tab = id;
  clearDots(id);
  deck.shown(id === "deck");
  // The Shop's Back returns to the page that opened it.
  if (id === "shop" && from !== "shop") shop.open(from);
  // A newly opened Equipment screen greets the first visit to the Gear page.
  if (id === "gear" && from !== "gear" && equipmentWaiting(game.save)) gear.openEquipment();
  renderer.weather.silence();
  if (isBoard(id)) {
    game.switchMode(id);
    renderBoardHeading(game, overlay);
  } else game.cancelRoute();
  showPage(id);
  // The Goals screen opens afresh, on the tower the forest leads to.
  if (id === "goals" && from !== "goals") goals.open();
  else renderPage();
  update();
}
/** Opening the Upgrades page clears the dot the first Inspiration put on
 * it, and opening the Gear page the dot the Gear skill put on it. */
function clearDots(id: Tab) {
  if (id === "upgrades" && upgradesWaiting(game)) game.save.tutorials.upgrades = true;
  if (id === "gear" && gearWaiting(game)) game.save.tutorials.gear = true;
}
/** Opens the Gear page on its Equipment screen. */
function openBlacksmith() {
  gear.openEquipment();
  navigate("gear");
}
/** Once Equipment opens, back in the forest (never mid-run), a dialog says
 * so and offers the Blacksmith. */
function announceEquipment() {
  const e = game.save.equipment;
  if (!e.announce || !game.run.outside || game.fallen || modal.open) return;
  e.announce = false;
  confirmAction(ctx, {
    title: "Equipment unlocked",
    body: `You reached floor ${EQUIPMENT_FLOOR}. A Blacksmith has opened in the forest: tap it, or the Gear tab, to wear weapons, armour and trinkets, level them up and merge them. Bosses now drop equipment, and every enemy drops upgrade materials.`,
    label: "Visit the Blacksmith",
    cancel: "Later",
  }, openBlacksmith);
}
/** Shows page `id` and marks its tab; the stats sit over the board, and
 * the currencies bar, with the Shop at its end, tops the pages that spend
 * them, every currency on each. */
function showPage(id: Tab) {
  el("stats").toggleAttribute("hidden", !isBoard(id));
  el("currencies").toggleAttribute("hidden", !CURRENCY_PAGES.includes(id));
  const page = isBoard(id) ? "board" : id;
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === page));
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === id);
    b.setAttribute("aria-current", b.dataset.tab === id ? "page" : "false");
  });
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
// Goals: the Tower's checkpoints (the Delve's button is a placeholder).
el("section-pick").onclick = () => {
  if (game.mode === "tower") navigate("goals");
};
for (const [id, step] of [["tier-prev", -1], ["tier-next", 1]] as const)
  el(id).onclick = () => {
    if (!game.selectTier(game.save[game.mode].tier + step)) return;
    save();
    update();
  };
el("gem-ad").onclick = () => {
  if (!game.gemFinder.claimAd()) return;
  if (!game.save.settings.reduceMotion) gemSparkle(el("gem-ad"));
  save();
  update();
};
el("end-run").onclick = () => runEnd.ask();
modal.addEventListener("cancel", (e) => {
  // The defeat dialog waits for an answer.
  if (game.fallen) e.preventDefault();
});
el("shop-open").onclick = () => navigate("shop");
el("page-shop").onclick = () => navigate("shop");
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
  const done = game.research.settle().length > 0 || game.training.settle() > 0;
  if (done) update();
  // The ad button comes back on the wall clock too, and the Shop's daily Gems.
  else {
    renderAdButton(game);
    renderShopDot(game);
  }
  if (tab === "upgrades") skillTree.archivesTick(done);
  if (tab === "shop") shop.tick();
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
  purse: (time) => purseFrame(game, time),
  highlight: () => overlay.track(),
  save,
});
document.addEventListener("visibilitychange", () => {
  loop.resetAutoTimer();
  save();
});
window.addEventListener("pagehide", save);
installDebugHooks(game, defendPage);
// Start on the Tower board: stats showing, currencies (for the Upgrades, Deck and Gear pages) hidden.
el("stats").toggleAttribute("hidden", false);
el("currencies").toggleAttribute("hidden", true);
renderBoardHeading(game, overlay);
update();
loop.start();
