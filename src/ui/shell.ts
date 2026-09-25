import { CONSUMABLES } from "../crafting.ts";
import { itemSprite, TAB_ICONS, uiSprite, type UiSprite } from "./dom.ts";

const STATS = `<section id="stats" class="stats" aria-label="Player statistics"><div class="portrait"><div class="portrait-top"><canvas id="portrait-sprite" width="24" height="24"></canvas><small>WAYFARER</small><small id="level">LV 0</small></div><div class="portrait-actions"><button id="end-run" class="danger" aria-label="End current run">End Run</button><button id="log" aria-label="Adventure log">Log</button><button id="section-pick" aria-label="Choose starting floor" title="Choose starting floor">Floors</button></div></div><div class="vitals"><div class="hp-readout"><span class="heart">♥</span><span>HP</span><b id="hp"></b></div><div class="health-track"><i id="health"></i></div><div class="combat-stats"><span class="attack-stat">⚔ <b id="attack"></b></span><span class="secret-stat-slot" aria-hidden="true"></span><span class="defense-stat">⛨ <b id="defense"></b></span><span class="secret-stat-slot" aria-hidden="true"></span></div><div class="keys"><span class="yellow">⚿ <b id="yellow"></b></span><span class="blue">⚿ <b id="blue"></b></span><span class="red">⚿ <b id="red"></b></span><span id="skeleton-key" class="skeleton-key" hidden><span aria-hidden="true">☠</span> <b id="skeleton"></b></span></div></div><div class="height"><small id="height-label">HEIGHT</small><strong id="height">0</strong><div class="height-bests"><span>RUN <b id="best-run">0</b></span><span>ALL <b id="best-all">0</b></span><span id="best-reward" class="height-reward" hidden>+<b id="best-reward-val">0</b> <i id="best-reward-type">COURAGE</i></span></div></div><div class="actions"><button id="auto-settings" class="mini-action" aria-label="Automove settings" title="Automove settings"><span class="mini-icon">⚙</span><small>SETTINGS</small></button><button id="auto" class="mini-action" aria-label="Automove" title="Automove"><span class="mini-icon">✦</span><small id="auto-state">LOCKED</small></button><button id="undo" class="mini-action" aria-label="Undo" title="Undo"><span class="mini-icon">↺</span><small id="undo-state">0/1</small></button></div></section>`;
const BOARD = `<section id="board" class="page active"><div class="tower-heading"><span class="rule"></span><span id="board-title">THE HOLLOW SPIRE</span><span class="rule"></span></div><div class="ascent"><span>↑</span><small id="board-subtitle">HIGHER DANGERS · GREATER REWARDS</small></div><div class="board-cell"><div class="board" id="board-frame"><canvas id="world" aria-label="Tower grid: tap a destination or swipe to move. Keyboard arrows and WASD also work."></canvas><span class="board-caption" id="density-label" hidden>20 × 20</span><div id="tile-highlight" class="tile-highlight" hidden></div><div id="inspect-box" class="inspect-box" hidden></div><div id="route-box" class="inspect-box route-box" hidden></div></div></div><div class="status" id="status-row"><span class="live-dot"></span><span id="message" aria-live="polite"></span></div><div class="controls"><div class="dpad" hidden><button data-move="-1,0" aria-label="Move left">←</button><div><button data-move="0,1" aria-label="Move up">↑</button><button data-move="0,-1" aria-label="Move down">↓</button></div><button data-move="1,0" aria-label="Move right">→</button></div></div><div id="inspect" class="inspection"></div></section>`;
const CURRENCIES = `<div id="currencies" class="currencies" hidden><div class="essence">✦ <b id="essence">0</b><small>COURAGE</small></div><div class="essence">◆ <b id="shards">0</b><small>INSPIRATION</small></div></div>`;
const NAV = `<nav aria-label="Main navigation">${Object.entries(TAB_ICONS)
  .map(([id, icon]) => `<button data-tab="${id}" class="${id === "tower" ? "selected" : ""}"><span>${icon}</span>${id[0].toUpperCase() + id.slice(1)}</button>`)
  .join("")}</nav>`;
const MOVEMENT_SPRITES: Record<string, UiSprite> = {
  "-1,0": "arrow-left", "1,0": "arrow-right", "0,1": "arrow-up", "0,-1": "arrow-down",
};

/** Builds the page skeleton into `app`: currencies, stats, board, empty
 * pages, navigation and the shared dialog, with sprite icons in place of
 * the text glyphs. */
export function buildShell(app: HTMLElement) {
  app.innerHTML = `<main class="shell">${CURRENCIES}${STATS}${BOARD}<section id="defend" class="page"></section><section id="gear" class="page"></section><section id="upgrades" class="page"></section><section id="settings" class="page"></section>${NAV}</main><dialog id="modal"></dialog>`;
  arrangeHud();
  replaceGlyphs();
}

// The left rail is exclusively for the three mode actions. The identity card
// belongs to the stat cluster, alongside HP/combat and above both item rows.
function arrangeHud() {
  const oldPortrait = document.querySelector<HTMLElement>(".portrait")!;
  const identity = oldPortrait.querySelector<HTMLElement>(".portrait-top")!;
  const hudActions = oldPortrait.querySelector<HTMLElement>(".portrait-actions")!;
  const vitals = document.querySelector<HTMLElement>(".vitals")!;
  const heightPanel = document.querySelector<HTMLElement>(".height")!;
  const playerStats = document.createElement("div");
  playerStats.className = "player-stats";
  hudActions.classList.add("hud-controls");
  oldPortrait.replaceWith(hudActions, playerStats);
  playerStats.append(identity, vitals);
  heightPanel.insertAdjacentHTML("beforeend", `<div id="height-zone" class="height-zone">THE ASCENT TRIALS</div>`);
  vitals.insertAdjacentHTML(
    "beforeend",
    `<div class="inventory-divider" aria-hidden="true"></div><div class="run-consumables" aria-label="Run consumables">${CONSUMABLES.map(c => `<button type="button" data-hud-consumable="${c.id}" aria-label="Use ${c.name}" title="${c.name}: ${c.description}">${itemSprite("potion_flat", "consumable-sprite")}<b data-consumable-count="${c.id}">0</b></button>`).join("")}</div>`,
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
  replaceGlyph(".currencies .essence:first-child", uiSprite("automove"));
  replaceGlyph(".currencies .essence:last-child", uiSprite("upgrades"));
  replaceGlyph(".heart", uiSprite("health"));
  replaceGlyph(".combat-stats .attack-stat", itemSprite("upgrade_attack"));
  replaceGlyph(".combat-stats .defense-stat", itemSprite("upgrade_defense"));
  replaceGlyph(".keys .yellow", itemSprite("key_yellow"));
  replaceGlyph(".keys .blue", itemSprite("key_blue"));
  replaceGlyph(".keys .red", itemSprite("key_red"));
  (document.querySelector("#auto-settings .mini-icon") as HTMLElement).innerHTML = uiSprite("settings");
  (document.querySelector("#auto .mini-icon") as HTMLElement).innerHTML = uiSprite("automove");
  (document.querySelector("#undo .mini-icon") as HTMLElement).innerHTML = uiSprite("undo");
  (document.querySelector("#log") as HTMLElement).insertAdjacentHTML("afterbegin", uiSprite("log"));
  (document.querySelector(".ascent > span") as HTMLElement).innerHTML = uiSprite("arrow-up");
  document.querySelectorAll<HTMLElement>("[data-move]").forEach((button) => {
    button.innerHTML = uiSprite(MOVEMENT_SPRITES[button.dataset.move!]!);
  });
}
