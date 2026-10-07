import { deckCards } from "./cards.ts";
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
import { FrameLoop } from "./frame-loop.ts";
import { installDebugHooks } from "./debug-hooks.ts";
import { isBoard, type AppContext, type Tab } from "./ui/app.ts";
import { el, ticketIcon } from "./ui/dom.ts";
import { buildShell } from "./ui/shell.ts";
import { BoardOverlay } from "./ui/board-overlay.ts";
import { boardHeadingStale, flashRed, renderAdButton, renderShopDot, renderTournamentButton, renderBoardHeading, renderHud, renderVitals, purseFrame, gearWaiting, upgradesWaiting, dismissResearch } from "./ui/hud.ts";
import { ResearchPage } from "./ui/research-page.ts";
import { confirmAction, RunEndDialog } from "./ui/dialogs.ts";
import { closeRunMenu, toggleRunMenu } from "./ui/run-menu.ts";
import { GoalsPage } from "./ui/goals-page.ts";
import { SkillTreePage } from "./ui/skill-tree-page.ts";
import { ResearchToasts, researchToast, trainingToast } from "./ui/research-toast.ts";
import { GearPage } from "./ui/gear-page.ts";
import { equipmentWaiting } from "./equipment/inventory.ts";
import { DeckPage } from "./ui/deck-page.ts";
import { RunTrainingBar } from "./ui/run-training-bar.ts";
import { renderBoardLesson } from "./ui/board-lesson.ts";
import { renderSettingsPage } from "./ui/settings-page.ts";
import { ShopPage } from "./ui/shop-page.ts";
import { play } from "./sound.ts";
import { applyMedievalTheme, bindMedievalFeedback } from "./ui/medieval.ts";
import { gemSparkle, goldSparkle } from "./ui/flourish.ts";
import { TournamentClient } from "./tournament/client.ts";
import { stubTournament } from "./tournament/server.ts";
import { TournamentPage } from "./ui/tournament-page.ts";
import { revealReward } from "./ui/reward-reveal.ts";

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
// The Tournament's server (a stand-in until it exists), and what waits on it.
const tournament = new TournamentClient(game, stubTournament(() => game.save.tournament, () => game.clock()));
const runEnd = new RunEndDialog(ctx, tournament);
const tournamentPage = new TournamentPage(ctx, tournament, refreshTournament);
// Tapping the forest's Blacksmith opens the Equipment screen, its Tournament Hall the Tournament page.
const overlay = new BoardOverlay(game, renderer, openBlacksmith, () => navigate("tournament"));
const skillTree = new SkillTreePage(ctx);
const research = new ResearchPage(ctx);
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
  followMode();
  if (boardHeadingStale(game)) renderBoardHeading(game, overlay);
  // Inside a run the tabs give way to an empty row, kept for the hand.
  document.querySelector("nav")!.classList.toggle("in-run", !game.run.outside);
  // The Deck tutorial keeps the player on its page until they reorder the hand.
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.disabled = deck.teaching && b.dataset.tab !== "deck"));
  renderHud(game, renderer, overlay);
  runTraining.render();
  renderBoardLesson(game, tab === "tower", update);
  const finished = [...game.research.done.splice(0).map(researchToast), ...game.training.done.splice(0).map(trainingToast)];
  if (finished.length) play("trained");
  researchToasts.add(finished);
  save();
  runEnd.check();
}
/** The board follows the game's mode: walking down the forest path
 * swaps it (`Game.swapForest`) without a tab press. */
function followMode() {
  if (!isBoard(tab) || tab === game.mode) return;
  tab = game.mode;
  overlay.hide();
  renderer.weather.silence();
}
function renderPage() {
  if (tab === "defend") defendPage.show();
  if (tab === "deck") deck.render();
  if (tab === "gear") gear.render();
  if (tab === "upgrades") skillTree.render();
  if (tab === "research") research.render();
  if (tab === "settings") renderSettingsPage(ctx, overlay);
  if (tab === "shop") shop.render();
  if (tab === "goals") goals.render();
  if (tab === "tournament") tournamentPage.render();
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
  ["deck", { skill: "combatStance", tree: "inspiration" }],
  ["gear", { skill: "gear", tree: "inspiration" }],
  ["defend", { skill: "legacy", tree: "courage" }],
]);
/** The pages topped by the currencies bar. */
const CURRENCY_PAGES: string[] = ["upgrades", "research", "deck", "gear"];
/** Opens page `requested`: `board` is the active mode's board. Leaving the
 * board inside a run pauses the hand, and coming back plays it on as it
 * was (`Game.pauseForPage`). */
function navigate(requested: string) {
  if (deck.teaching && requested !== "deck") return;
  const id = unlockTarget(requested === "board" ? game.mode : requested) as Tab;
  // Only the board plays a fight out: leaving it settles one still playing.
  game.finishEncounter();
  if (id !== "defend") defendPage.pause();
  const from = tab;
  tab = id;
  clearDots(id);
  deck.shown(id === "deck");
  // The Shop's Back returns to the page that opened it.
  if (id === "shop" && from !== "shop") shop.open(from);
  // So does the Tournament page's.
  if (id === "tournament" && from !== "tournament") tournamentPage.open(from);
  // A newly opened Equipment screen greets the first visit to the Gear page.
  if (id === "gear" && from !== "gear" && equipmentWaiting(game.save)) gear.openEquipment();
  renderer.weather.silence();
  if (isBoard(id)) {
    game.switchMode(id);
    game.resumeFromPage();
    renderBoardHeading(game, overlay);
  } else {
    if (isBoard(from)) game.pauseForPage();
    game.cancelRoute();
  }
  showPage(id);
  // The Goals screen opens afresh, on the tower the forest leads to.
  if (id === "goals" && from !== "goals") goals.open();
  else renderPage();
  update();
}
/** Opening the Upgrades page clears the dot the first Inspiration put on
 * it, the Gear page the dot the Gear skill put on it, the Research page
 * the run's Research dot, and the Deck page the dot new cards put on it. */
function clearDots(id: Tab) {
  if (id === "upgrades" && upgradesWaiting(game)) game.save.tutorials.upgrades = true;
  if (id === "gear" && gearWaiting(game)) game.save.tutorials.gear = true;
  if (id === "research") dismissResearch(game);
  if (id === "deck") game.save.seen.cards = deckCards(game.save.upgrades);
}
/** Opens the Gear page on its Equipment screen. */
function openBlacksmith() {
  gear.openEquipment();
  navigate("gear");
}
/** Shows page `id` and marks its tab; the stats sit over the board, and
 * the currencies bar tops the pages that spend them, every currency on each. */
function showPage(id: Tab) {
  el("stats").toggleAttribute("hidden", !isBoard(id));
  el("currencies").toggleAttribute("hidden", !CURRENCY_PAGES.includes(id));
  const page = isBoard(id) ? "board" : id;
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === page));
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    const open = b.dataset.tab === id || (b.dataset.tab === "board" && isBoard(id));
    b.classList.toggle("selected", open);
    b.setAttribute("aria-current", open ? "page" : "false");
  });
}

// Focus: pressing a hand card inside a run puts it ahead of the others.
el("hand").onclick = (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>(".hand-card");
  if (!card || !game.save.upgrades.focus) return;
  const result = game.focus(Number(card.dataset.handSlot));
  if (result === "spent") flashRed(el("focus-stat"));
  if (result === "noPath") flashRed(card);
  update();
};
// Ignore and Target: readied by their button, used by the next board tap.
for (const c of ["ignore", "target"] as const)
  el(`${c}-stat`).onclick = () => {
    overlay.hide();
    if (game.arm(c) === "spent") flashRed(el(`${c}-stat`));
    update();
  };
/** A board tap: where a readied Ignore or Target goes, else the overlay's. */
function boardTap(x: number, y: number) {
  if (!game.armed) return overlay.tap(x, y);
  const c = game.armed, result = game.useArmed(x, y);
  if (result === "invalid" || result === "noPath") flashRed(el(`${c}-stat`));
  save();
  update();
}
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
el("gold-ad").onclick = () => {
  if (!game.gemFinder.claimGoldAd()) return;
  if (!game.save.settings.reduceMotion) goldSparkle(el("gold-ad"));
  save();
  update();
};
el("end-run").onclick = () => {
  closeRunMenu();
  runEnd.ask();
};
// Shown at the foot of the height column while no card can act.
el("stuck-end-run").onclick = () => runEnd.ask();
// Inside a run, the hamburger opens and closes the menu over the stats.
el("run-menu-toggle").onclick = () => toggleRunMenu(game.save.settings.reduceMotion);
modal.addEventListener("cancel", (e) => {
  // The defeat dialog waits for an answer.
  if (game.fallen) e.preventDefault();
});
el("auto-settings").onclick = () => {
  closeRunMenu();
  navigate("settings");
};
// Inside a run, the menu's Shop opens the Shop, whose Back returns to the run.
el("run-shop").onclick = () => {
  closeRunMenu();
  navigate("shop");
};
// The Tournament button: at the top of the forest's actions column, and in
// the run's menu once the player has entered.
el("tournament-button").onclick = () => {
  closeRunMenu();
  navigate("tournament");
};
// Inside a run, Research opens Training and the Archives with the run paused.
el("run-research").onclick = () => {
  closeRunMenu();
  navigate("research");
};
// The forest's sign: down the path to the other mode's forest.
el("forest-sign").onclick = () => {
  overlay.hide();
  if (game.swapForest()) save();
  update();
};
// Inside a run the button plays and pauses the hand.
el("auto").onclick = () => {
  if (!game.run.outside) game.toggleAuto();
  update();
};
// In the forest, Enter (under Goals) goes straight in, starting the run.
el("enter-run").onclick = () => {
  if (!game.run.outside) return;
  overlay.hide();
  game.enterRun();
  update();
};
// The speed arrows beside play/pause, inside a run.
el("speed-down").onclick = () => {
  game.changeSpeed(-1);
  update();
};
el("speed-up").onclick = () => {
  game.changeSpeed(1);
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
  boardTap,
  () => {
    overlay.refresh();
    update();
  },
  () => isBoard(tab),
);

/** Research completes on the wall clock, whatever page shows. */
function archivesTick() {
  const researched = game.research.settle().length > 0, trained = game.training.settle() > 0;
  const done = researched || trained;
  // Saved before anything is drawn, so what completed is kept even if the
  // page fails to show it.
  if (done) save();
  if (done) update();
  // The ad button comes back on the wall clock too, and the Shop's daily Gems.
  else {
    renderAdButton(game);
    renderShopDot(game);
    renderTournamentButton(game);
  }
  tournament.tick();
  // A tournament opening (or ending, or the Tournament unlocked) asks the
  // server again, for the free Ticket and the results.
  const stage = `${game.tournament.unlocked}|${game.tournament.phase}`;
  if (stage !== tournamentStage) {
    tournamentStage = stage;
    void refreshTournament();
  }
  // Past the grace, it is asked again each minute until the results are final.
  else if (game.tournament.awaitingResults && game.clock() - tournamentAskedAt >= 60_000) void refreshTournament();
  if (tab === "tournament") tournamentPage.rerender();
  if (tab === "research") research.archivesTick(done);
  if (tab === "shop") shop.tick();
}
/** The Tournament's stage the tick last saw (unlocked, and its phase). */
let tournamentStage = `${game.tournament.unlocked}|${game.tournament.phase}`;
/** When the Tournament's server was last asked (the game's clock). */
let tournamentAskedAt = -Infinity;
/** Asks the Tournament's server for the live tournament, and celebrates the
 * free Ticket a newly opened one grants. */
async function refreshTournament() {
  tournamentAskedAt = game.clock();
  const granted = await tournament.refresh();
  if (granted)
    revealReward(
      { icon: ticketIcon("ticket-icon reward-ticket"), amount: "+1", kicker: "A NEW TOURNAMENT HAS BEGUN!", name: "Ticket", text: "Enter it at the forest's Tournament Hall, or with the trophy button.", permanent: true },
      game.save.settings.reduceMotion,
    );
  update();
}
const loop = new FrameLoop({
  game,
  renderer,
  modal,
  tab: () => tab,
  upgradesFrame: (time) => skillTree.drawParticles(time),
  researchFrame: (time) => research.drawParticles(time),
  archivesTick,
  defendFrame: (time) => defendPage.frame(time),
  update,
  vitals: () => renderVitals(game),
  purse: (time) => purseFrame(game, time),
  highlight: () => {
    overlay.track();
    overlay.placeSign();
  },
  save,
});
document.addEventListener("visibilitychange", () => {
  loop.resetAutoTimer();
  save();
});
window.addEventListener("pagehide", save);
installDebugHooks(game, defendPage, async () => {
  const refused = await tournament.begin();
  update();
  return refused;
});
// Start on the Tower board: stats showing, currencies (for the Upgrades, Deck and Gear pages) hidden.
el("stats").toggleAttribute("hidden", false);
el("currencies").toggleAttribute("hidden", true);
renderBoardHeading(game, overlay);
update();
loop.start();
// The live tournament: its free Ticket, and any score still to send.
void refreshTournament();
