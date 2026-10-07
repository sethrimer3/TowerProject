import { ENTER_ICON, gemIcon, pointsIcon, itemSprite, NAV_TABS, RESEARCH_ICON, uiSprite, type UiSprite } from "./dom.ts";
import { AD_GEMS } from "../gems.ts";
import { GOLD_BOOST_FACTOR } from "../gold-boost.ts";

/** The currencies held, down the left rail above the ad's Gems: Gems, then Gold, then the run's Silver. */
const PURSE = `<div class="purse" aria-label="Currencies"><span class="gem-stat" title="Gems: kept between runs">${gemIcon()} <b id="gems"></b></span><span class="gold-stat" title="Gold: kept between runs">¤ <b id="gold"></b></span><span class="silver-stat" title="Silver: found in a run, spent only inside it">¤ <b id="run-silver"></b></span></div>`;
const STATS = `<section id="stats" class="stats" aria-label="Player statistics"><div class="portrait"><div class="portrait-top"><canvas id="portrait-sprite" width="24" height="24"></canvas><small>WAYFARER</small><div id="xp" class="xp-row"><b id="level">0</b><div class="xp-track"><i id="xp-fill"></i></div></div></div><div class="portrait-actions">${PURSE}<div class="ad-row"><button id="gem-ad" class="gem-ad" aria-label="Claim ${AD_GEMS} Gems" title="Claim ${AD_GEMS} Gems"><span class="gem-ad-amount">${gemIcon()}<b>${AD_GEMS}</b></span><small>Claim</small></button><button id="gold-ad" class="gem-ad gold-ad" hidden><span class="gem-ad-amount">${uiSprite("gold")}<b>×${GOLD_BOOST_FACTOR}</b></span><small id="gold-ad-time">Inactive</small></button></div></div></div><div class="vitals"><div class="hp-readout"><span class="heart">♥</span><span>HP</span><b id="hp"></b></div><div class="health-track"><i id="health"></i><i id="health-gain"></i><i id="health-loss"></i></div><div class="combat-stats"><span class="attack-stat">⚔ <b id="attack"></b></span><span class="secret-stat-slot" aria-hidden="true"></span><span class="defense-stat">⛨ <b id="defense"></b><span id="shroud-stat" class="shroud-stat" title="Shroud: damage blocked at the start of every fight" hidden> ◈<b id="shroud"></b></span></span><span class="secret-stat-slot" aria-hidden="true"></span></div><div class="keys"><span class="yellow">⚿ <b id="yellow"></b></span><span class="blue">⚿ <b id="blue"></b></span><span class="red">⚿ <b id="red"></b></span><span id="skeleton-key" class="skeleton-key" hidden><span aria-hidden="true">☠</span> <b id="skeleton"></b></span></div></div><div class="height"><small id="height-tier" class="height-tier" hidden>TOWER 1</small><small id="height-label">FLOOR</small><strong id="height">0</strong><span id="run-earned" class="run-earned" hidden title="Earned this run"><span id="run-earned-icon" class="run-earned-icon"></span><b id="run-earned-val">0</b></span><span id="best-reward" class="height-reward" hidden>+<b id="best-reward-val">0</b> <i id="best-reward-type">COURAGE</i></span><div class="height-actions"><button id="end-run" class="danger" aria-label="End current run">End Run</button><button id="section-pick" aria-label="Goals" title="Goals">Goals</button><button id="enter-run" class="enter-run" aria-label="Enter" title="Enter"><span class="mini-icon"></span><small>ENTER</small></button></div></div><div class="actions"><button id="auto-settings" class="mini-action" aria-label="Settings" title="Settings"><span class="mini-icon">⚙</span><small>SETTINGS</small></button><button id="run-research" class="mini-action" aria-label="Research" title="Research: Training and the Archives" hidden><span class="mini-icon"></span><small>RESEARCH</small></button><button id="auto" class="mini-action" aria-label="Play the hand" title="Play the hand"><span class="mini-icon"></span><small id="auto-state">PAUSED</small></button><div id="auto-speed" class="auto-speed" hidden><button id="speed-down" class="speed-arrow" aria-label="Slower" title="Slower">‹</button><small id="speed-value" title="Hero movement speed: steps a second"></small><button id="speed-up" class="speed-arrow" aria-label="Faster" title="Faster">›</button></div><button id="undo" class="mini-action" aria-label="Undo" title="Undo"><span class="mini-icon">↺</span><small id="undo-state">0/1</small></button></div></section>`;
const BOARD = `<section id="board" class="page active"><div class="tower-heading"><span class="rule"></span><span id="board-title">THE HOLLOW SPIRE</span><span class="rule"></span></div><div class="ascent"><span>↑</span><small id="board-subtitle">HIGHER DANGERS · GREATER REWARDS</small></div><div class="board-cell"><div class="board" id="board-frame"><canvas id="world" aria-label="Tower grid: tap a destination or swipe to move. Keyboard arrows and WASD also work."></canvas><span class="board-caption" id="density-label" hidden>20 × 20</span><div id="tile-highlight" class="tile-highlight" hidden></div><div id="inspect-box" class="inspect-box" hidden></div><div id="route-box" class="inspect-box route-box" hidden></div><button id="tier-prev" class="tier-arrow tier-prev" hidden aria-label="Previous tower">‹</button><button id="tier-next" class="tier-arrow tier-next" hidden aria-label="Next tower">›</button><button id="forest-sign" class="forest-sign" hidden><span class="sign-icon"></span><span class="sign-arrow"></span></button></div></div><div class="status" id="status-row"><span class="live-dot"></span><span id="message" aria-live="polite"></span></div><div class="controls"><div class="dpad" hidden><button data-move="-1,0" aria-label="Move left">←</button><div><button data-move="0,1" aria-label="Move up">↑</button><button data-move="0,-1" aria-label="Move down">↓</button></div><button data-move="1,0" aria-label="Move right">→</button></div></div><div id="inspect" class="inspection"></div></section>`;
// Gold, Silver (the run's, or what the next starts with), Gems, then Training (the Research page's), Inspiration and Courage (the Upgrades page's).
const CURRENCIES = `<div id="currencies" class="currencies" hidden><div class="currency silver-currency" hidden>¤ <b id="silver-held">0</b><small>SILVER</small></div><div class="currency gold-currency">¤ <b id="gold-held">0</b><small>GOLD</small></div><div class="currency gem-currency">${gemIcon()} <b id="gems-held">0</b><small>GEMS</small></div><div class="currency training-currency">${pointsIcon()} <b id="training">0</b><small>TRAINING</small></div><div class="currency inspiration-currency">◆ <b id="inspiration">0</b><small>INSPIRATION</small></div><div class="currency courage-currency">✦ <b id="courage">0</b><small>COURAGE</small></div></div>`;
/** The tab bar: one solid row of icons, the open page's lit; inside a run
 * the hand takes its place. */
const NAV = `<nav aria-label="Main navigation">${NAV_TABS
  .map(({ id, name, icon }) => `<button data-tab="${id}" class="${id === "board" ? "selected" : ""}" aria-label="${name}" title="${name}"><span${id === "board" ? ` id="mode-icon" data-mode="tower"` : ""}>${icon}</span></button>`)
  .join("")}<div id="hand" class="hand" role="list" aria-label="Card hand"></div><div id="run-drills" class="run-drills" role="list" aria-label="Training for this run"></div></nav>`;
/** Inside a run, under the hand: a button for each Training group, to train for the run with Silver (`RunTrainingBar`). */
const TRAINING_BAR = `<div id="training-bar" class="training-bar" role="group" aria-label="Training for this run" hidden></div><div id="drill-tip" class="drill-tip" role="tooltip" hidden></div>`;
/** Focus uses left, before the potions: a lightning bolt and the count. */
const FOCUS_STAT = `<span id="focus-stat" class="focus-stat" hidden title="Focus: press a card in your hand to put it first"><svg viewBox="0 0 10 14" aria-hidden="true"><path d="M6.2 0.5L1 8h3.6L3.4 13.5 9 5.8H5.4L6.2 0.5z" fill="#ffe27a" stroke="#6b4a10" stroke-width="0.7" stroke-linejoin="round"/></svg><b id="focus-left">0</b></span>`;
/** Ignore and Target uses left, after Focus: each a button that readies it
 * for the next board tap. */
const CHARGE_BUTTONS = `<button type="button" id="ignore-stat" class="focus-stat charge-stat" hidden title="Ignore: press, then tap a tile the hero won't step on this floor"><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.3" fill="none" stroke="#ff6a5a" stroke-width="1.6"/><path d="M3.3 10.7L10.7 3.3" stroke="#ff6a5a" stroke-width="1.6"/></svg><b id="ignore-left">0</b></button>` +
  `<button type="button" id="target-stat" class="focus-stat charge-stat" hidden title="Target: press, then tap a tile to send the hero there"><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="#7ad8ff" stroke-width="1.4"/><circle cx="7" cy="7" r="1.3" fill="#7ad8ff"/><path d="M7 0.5V3.5M7 10.5V13.5M0.5 7H3.5M10.5 7H13.5" stroke="#7ad8ff" stroke-width="1.4"/></svg><b id="target-left">0</b></button>`;
const MOVEMENT_SPRITES: Record<string, UiSprite> = {
  "-1,0": "arrow-left", "1,0": "arrow-right", "0,1": "arrow-up", "0,-1": "arrow-down",
};

/** Builds the page skeleton into `app`: currencies, stats, board, empty
 * pages, navigation and the shared dialog, with sprite icons in place of
 * the text glyphs. */
export function buildShell(app: HTMLElement) {
  app.innerHTML = `<main class="shell">${CURRENCIES}${STATS}${BOARD}<section id="deck" class="page"></section><section id="defend" class="page"></section><section id="gear" class="page"></section><section id="upgrades" class="page"></section><section id="research" class="page"></section><section id="settings" class="page"></section><section id="shop" class="page"></section><section id="goals" class="page"></section>${NAV}${TRAINING_BAR}</main><dialog id="modal"></dialog>`;
  arrangeHud();
  replaceGlyphs();
}

// The left rail holds the currencies and the ad's Gems. The identity card
// belongs to the stat cluster, alongside HP/combat and above both item rows.
function arrangeHud() {
  const oldPortrait = document.querySelector<HTMLElement>(".portrait")!;
  const identity = oldPortrait.querySelector<HTMLElement>(".portrait-top")!;
  const hudActions = oldPortrait.querySelector<HTMLElement>(".portrait-actions")!;
  const vitals = document.querySelector<HTMLElement>(".vitals")!;
  const playerStats = document.createElement("div");
  playerStats.className = "player-stats";
  hudActions.classList.add("hud-controls");
  oldPortrait.replaceWith(hudActions, playerStats);
  playerStats.append(identity, vitals);
  vitals.insertAdjacentHTML(
    "beforeend",
    `<div class="inventory-divider" aria-hidden="true"></div><div class="run-consumables" aria-label="Run consumables">${FOCUS_STAT}${CHARGE_BUTTONS}</div>`,
  );
  const boardFrame = document.querySelector<HTMLElement>("#board-frame")!;
  boardFrame.append(
    document.querySelector<HTMLElement>("#status-row")!,
    document.querySelector<HTMLElement>(".controls")!,
    document.querySelector<HTMLElement>("#inspect")!,
  );
}

function replaceGlyphs() {
  const replaceGlyph = (selector: string, sprite: string) => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    if (target.firstChild?.nodeType === Node.TEXT_NODE) target.firstChild.textContent = "";
    target.insertAdjacentHTML("afterbegin", sprite);
  };
  replaceGlyph(".currencies .gold-currency", uiSprite("gold"));
  replaceGlyph(".currencies .silver-currency", uiSprite("gold", "ui-sprite silver-sprite"));
  replaceGlyph(".currencies .inspiration-currency", uiSprite("upgrades"));
  replaceGlyph(".currencies .courage-currency", uiSprite("automove"));
  replaceGlyph(".heart", uiSprite("health"));
  replaceGlyph(".combat-stats .attack-stat", itemSprite("upgrade_attack"));
  replaceGlyph(".combat-stats .defense-stat", itemSprite("upgrade_defense"));
  replaceGlyph(".purse .gold-stat", uiSprite("gold"));
  // No silver art yet: the Gold coin, drained of colour.
  replaceGlyph(".purse .silver-stat", uiSprite("gold", "ui-sprite silver-sprite"));
  replaceGlyph(".keys .yellow", itemSprite("key_yellow"));
  replaceGlyph(".keys .blue", itemSprite("key_blue"));
  replaceGlyph(".keys .red", itemSprite("key_red"));
  (document.querySelector("#auto-settings .mini-icon") as HTMLElement).innerHTML = uiSprite("settings");
  (document.querySelector("#enter-run .mini-icon") as HTMLElement).innerHTML = ENTER_ICON;
  (document.querySelector("#run-research .mini-icon") as HTMLElement).innerHTML = RESEARCH_ICON;
  (document.querySelector("#undo .mini-icon") as HTMLElement).innerHTML = uiSprite("undo");
  (document.querySelector(".ascent > span") as HTMLElement).innerHTML = uiSprite("arrow-up");
  (document.querySelector("#tier-prev") as HTMLElement).innerHTML = uiSprite("arrow-left");
  (document.querySelector("#tier-next") as HTMLElement).innerHTML = uiSprite("arrow-right");
  document.querySelectorAll<HTMLElement>("[data-move]").forEach((button) => {
    button.innerHTML = uiSprite(MOVEMENT_SPRITES[button.dataset.move!]!);
  });
}
