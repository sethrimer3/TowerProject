import { kitIcon } from "../sprite-kit.ts";
import { bombIcon, CART_ICON, ENTER_ICON, eventIcon, relicIcon, shrineIcon, gemIcon, goldIcon, shardIcon, itemSprite, mailIcon, medalIcon, missionIcon, NAV_TABS, RESEARCH_ICON, trophyIcon, uiSprite } from "./dom.ts";
import { AD_GEMS } from "../gems.ts";
import { GOLD_BOOST_FACTOR } from "../gold-boost.ts";

/** The currencies held, down the left rail above the ad's Gems: Gems, then
 * (in the forest) Ascension Shards and Medals, then Gold, then the run's Silver. */
const PURSE = `<div class="purse" aria-label="Currencies"><span class="gem-stat" title="Gems: kept between runs">${gemIcon()} <b id="gems"></b></span><span class="shard-stat" title="Ascension Shards: kept between runs">${shardIcon()} <b id="shards"></b></span><span class="medal-stat" title="Medals: kept between runs" hidden>${medalIcon()} <b id="medals"></b></span><span class="gold-stat" title="Gold: kept between runs">${goldIcon()} <b id="gold"></b></span><span class="silver-stat" title="Silver: found in a run, spent only inside it">${kitIcon("silver", "¤", "silver-icon")} <b id="run-silver"></b></span></div>`;
/** The actions column's hamburger and the menu it opens (run-menu.ts),
 * its buttons in cell order: Settings, Research, the Tournament's, Missions,
 * Events', Relics, Shrine Boons, Mail and End Run, those that don't apply hidden (the
 * Tournament's and Events' stand in the column in the forest); and inside
 * a run the Shop under the hamburger. */
const ACTIONS_MENU = `<div id="run-menu" class="run-menu"><div class="run-menu-frame" aria-hidden="true"></div><div id="run-menu-items" class="run-menu-items" inert>` +
  `<button id="auto-settings" class="mini-action" aria-label="Settings" title="Settings"><span class="mini-icon">${uiSprite("settings")}</span><small>SETTINGS</small></button>` +
  `<button id="run-research" class="mini-action" aria-label="Upgrades" title="Upgrades: Training and the Archives"><span class="mini-icon"></span><small>UPGRADES</small></button>` +
  `<button id="tournament-button" class="mini-action tournament-button" aria-label="Tournament" title="Tournament" hidden><span class="mini-icon">${trophyIcon()}</span><small id="tournament-state"></small></button>` +
  `<button id="missions-button" class="mini-action missions-button" aria-label="Missions" title="Missions"><span class="mini-icon">${missionIcon()}</span><small id="missions-count">0/8</small></button>` +
  `<button id="events-button" class="mini-action events-button" aria-label="Events" title="Events" hidden><span class="mini-icon">${eventIcon()}</span><small id="events-state"></small></button>` +
  `<button id="relics-button" class="mini-action relics-button" aria-label="Relics" title="Relics" hidden><span class="mini-icon">${relicIcon("epic")}</span><small>RELICS</small></button>` +
  `<button id="shrines-button" class="mini-action shrines-button" aria-label="Shrine Boons" title="Shrine Boons" hidden><span class="mini-icon">${shrineIcon()}</span><small>BOONS</small></button>` +
  `<button id="mail-button" class="mini-action mail-button" aria-label="Mail" title="Mail" hidden><span class="mini-icon">${mailIcon()}</span><small>MAIL</small></button>` +
  `<button id="end-run" class="mini-action danger run-menu-end" aria-label="End current run" title="End Run"><small>END RUN</small></button></div>` +
  `<button id="run-menu-toggle" class="mini-action" aria-label="Menu" aria-expanded="false" aria-controls="run-menu-items" title="Menu"><span class="mini-icon">${kitIcon("ui-menu", `<svg class="menu-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="2" rx="1"/><rect x="2" y="7" width="12" height="2" rx="1"/><rect x="2" y="11" width="12" height="2" rx="1"/></svg>`, "menu-icon")}${kitIcon("ui-menu-close", "", "menu-icon menu-close-icon")}</span><small>MENU</small></button>` +
  `<button id="run-shop" class="mini-action" aria-label="Shop" title="Shop" hidden><span class="mini-icon">${CART_ICON}</span><small>SHOP</small></button></div>`;
const STATS = `<section id="stats" class="stats" aria-label="Player statistics"><div class="portrait"><div class="portrait-top"><canvas id="portrait-sprite" width="24" height="24"></canvas><small id="hero-class">WAYFARER</small><div id="xp" class="xp-row"><b id="level">0</b><div class="xp-track"><i id="xp-fill"></i></div></div><button type="button" id="shrine-bar" class="shrine-bar" hidden title="Shrine boons: pick a boon, or see those taken"><span class="shrine-track xp-track"><i id="shrine-fill"></i></span><span id="shrine-diamond" class="shrine-diamond"><b id="shrine-left"></b></span><small id="shrine-next" class="shrine-next"></small></button></div><div class="portrait-actions">${PURSE}<div class="ad-row"><button id="gem-ad" class="gem-ad" aria-label="Claim ${AD_GEMS} Gems" title="Claim ${AD_GEMS} Gems"><span class="gem-ad-amount">${gemIcon()}<b>${AD_GEMS}</b></span><small>Claim</small></button><button id="gold-ad" class="gem-ad gold-ad" hidden><span class="gem-ad-amount">${uiSprite("gold")}<b>×${GOLD_BOOST_FACTOR}</b></span><small id="gold-ad-time">Inactive</small></button></div></div></div><div class="vitals"><div class="hp-readout">${kitIcon("heart", `<span class="heart" aria-label="HP">♥</span>`, "heart")}<b id="hp"></b></div><div class="health-track"><i id="health"></i><i id="health-gain"></i><i id="health-loss"></i><span id="overheal" class="overheal-track" hidden><span id="overheal-fill"></span><span id="overheal-gain"></span><span id="overheal-loss"></span></span></div><div class="combat-stats"><span class="attack-stat">${kitIcon("sword", "⚔", "stat-icon")} <b id="attack"></b></span><span class="defense-stat">${kitIcon("shield", "⛨", "stat-icon")} <b id="defense"></b></span><span id="shroud-stat" class="shroud-stat" hidden>${kitIcon("ui-ward", "◈", "stat-icon")} <b id="shroud"></b></span></div><div class="keys"><span class="yellow">${kitIcon("key-yellow", "⚿", "key-icon")} <b id="yellow"></b></span><span class="blue">${kitIcon("key-blue", "⚿", "key-icon")} <b id="blue"></b></span><span class="red">${kitIcon("key-red", "⚿", "key-icon")} <b id="red"></b></span><span id="skeleton-key" class="skeleton-key" hidden>${kitIcon("ui-skeleton-key", "☠", "key-icon")} <b id="skeleton"></b></span></div></div><div class="height"><small id="height-tier" class="height-tier" hidden>TOWER 1</small><small id="height-label">FLOOR</small><strong id="height">0</strong><span id="run-earned" class="run-earned" hidden title="Earned this run"><span id="run-earned-icon" class="run-earned-icon"></span><b id="run-earned-val">0</b></span><span id="best-reward" class="height-reward" hidden>+<b id="best-reward-val">0</b> <i id="best-reward-type">COURAGE</i></span><div id="base-enemy-divider" class="inventory-divider base-enemy-divider" aria-hidden="true" hidden></div><button type="button" id="base-enemy" class="base-enemy" hidden title="A normal enemy here: ATK, DEF and HP. Press for every enemy this floor can roll"><span title="ATK">${kitIcon("sword", "⚔", "stat-icon")}<b id="base-enemy-atk"></b></span><span title="DEF">${kitIcon("shield", "⛨", "stat-icon")}<b id="base-enemy-def"></b></span><span title="HP">${kitIcon("heart", "♥", "base-enemy-hp stat-icon")}<b id="base-enemy-hp"></b></span></button><div id="gold-bonus-divider" class="inventory-divider gold-bonus-divider" aria-hidden="true" hidden></div><button id="gold-bonus" class="gold-bonus" hidden aria-label="All Gold Bonuses" title="All Gold Bonuses">${goldIcon()}<b id="gold-bonus-val"></b></button><div class="height-actions"><button id="stuck-end-run" class="danger" aria-label="End current run" hidden>End Run</button><button id="section-pick" aria-label="Goals" title="Goals">Goals</button><button id="enter-run" class="enter-run" aria-label="Enter" title="Enter"><span class="mini-icon"></span><small>ENTER</small></button></div></div><div class="actions">${ACTIONS_MENU}<button id="auto" class="mini-action" aria-label="Play the hand" title="Play the hand"><span class="mini-icon"></span><small id="auto-state">PAUSED</small></button><div id="auto-speed" class="auto-speed" hidden><button id="speed-down" class="speed-arrow" aria-label="Slower" title="Slower">‹</button><small id="speed-value" title="Hero movement speed: steps a second"></small><button id="speed-up" class="speed-arrow" aria-label="Faster" title="Faster">›</button></div></div></section>`;
const BOARD = `<section id="board" class="page active"><div class="tower-heading"><span class="rule"></span><span id="board-title">THE HOLLOW SPIRE</span><span class="rule"></span></div><div class="ascent"><span>↑</span><small id="board-subtitle">HIGHER DANGERS · GREATER REWARDS</small></div><div class="board-cell"><div class="board" id="board-frame"><canvas id="world" aria-label="Tower grid: tap a destination or swipe to move. Keyboard arrows and WASD also work."></canvas><span class="board-caption" id="density-label" hidden>20 × 20</span><div id="tile-highlight" class="tile-highlight" hidden></div><div id="inspect-box" class="inspect-box" hidden></div><div id="route-box" class="inspect-box route-box" hidden></div><div id="free-training-box" class="free-training-box" role="status" hidden></div><button id="tier-prev" class="tier-arrow tier-prev" hidden aria-label="Previous tower">‹</button><button id="tier-next" class="tier-arrow tier-next" hidden aria-label="Next tower">›</button><button id="forest-sign" class="forest-sign" hidden><span class="sign-icon"></span><span class="sign-arrow"></span></button></div></div><div class="status" id="status-row"><span class="live-dot"></span><span id="message" aria-live="polite"></span></div><div id="inspect" class="inspection"></div></section>`;
/** The pages' currencies bar, one row: Gold, Gems and Ascension Shards, each
 * its icon and amount, then a chevron that opens every currency held
 * (`showCurrencies` in `currencies-dialog.ts`). */
const CURRENCIES = `<div id="currencies" class="currencies" hidden><div class="currency gold-currency" title="Gold">¤ <b id="gold-held">0</b></div><div class="currency gem-currency" title="Gems">${gemIcon()} <b id="gems-held">0</b></div><div class="currency shard-currency" title="Ascension Shards">${shardIcon()} <b id="shards-held">0</b></div><button type="button" id="currencies-open" class="currencies-open" aria-label="All currencies" title="All currencies"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
/** The tab bar: one solid row of icons, the open page's lit; inside a run
 * the hand takes its place, with an arrow at each side it scrolls further to. */
const HAND_MORE = (side: "left" | "right") => `<span id="hand-more-${side}" class="hand-more ${side}" aria-hidden="true" hidden><svg viewBox="0 0 8 14"><path d="${side === "left" ? "M6 2L2 7l4 5" : "M2 2l4 5-4 5"}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const NAV = `<nav aria-label="Main navigation">${NAV_TABS
  .map(({ id, name, icon }) => `<button data-tab="${id}" class="${id === "board" ? "selected" : ""}" aria-label="${name}" title="${name}"><span${id === "board" ? ` id="mode-icon" data-mode="tower"` : ""}>${icon}</span></button>`)
  .join("")}<div id="hand" class="hand" role="list" aria-label="Card hand"></div>${HAND_MORE("left")}${HAND_MORE("right")}<div id="run-drills" class="run-drills" role="list" aria-label="Training for this run"></div></nav>`;
/** Inside a run, under the hand: a button for each Training group, to train for the run with Silver (`RunTrainingBar`). */
const TRAINING_BAR = `<div id="training-bar" class="training-bar" role="group" aria-label="Training for this run" hidden></div><div id="drill-tip" class="drill-tip" role="tooltip" hidden></div>`;
/** Focus uses left, before the potions: a lightning bolt and the count. */
const FOCUS_STAT = `<span id="focus-stat" class="focus-stat" hidden title="Focus: press a card in your hand to put it first">${kitIcon("focus", `<svg viewBox="0 0 10 14" aria-hidden="true"><path d="M6.2 0.5L1 8h3.6L3.4 13.5 9 5.8H5.4L6.2 0.5z" fill="#ffe27a" stroke="#6b4a10" stroke-width="0.7" stroke-linejoin="round"/></svg>`, "charge-icon")}<b id="focus-left">0</b></span>`;
/** Ignore and Target uses left, after Focus, and the Bombs left: each a
 * button that readies it for the next board tap; then Undo, a button that
 * takes the last turn back, with the undos the run has left. */
const CHARGE_BUTTONS = `<button type="button" id="ignore-stat" class="focus-stat charge-stat" hidden title="Ignore: press, then tap a tile the hero won't step on this floor">${kitIcon("ignore", `<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.3" fill="none" stroke="#ff6a5a" stroke-width="1.6"/><path d="M3.3 10.7L10.7 3.3" stroke="#ff6a5a" stroke-width="1.6"/></svg>`, "charge-icon")}<b id="ignore-left">0</b></button>` +
  `<button type="button" id="target-stat" class="focus-stat charge-stat" hidden title="Target: press, then tap a tile to send the hero there">${kitIcon("target", `<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="#7ad8ff" stroke-width="1.4"/><circle cx="7" cy="7" r="1.3" fill="#7ad8ff"/><path d="M7 0.5V3.5M7 10.5V13.5M0.5 7H3.5M10.5 7H13.5" stroke="#7ad8ff" stroke-width="1.4"/></svg>`, "charge-icon")}<b id="target-left">0</b></button>` +
  `<button type="button" id="bomb-stat" class="focus-stat charge-stat" hidden title="Bomb: press, then tap an enemy to deal it your ATK">${bombIcon("charge-icon")}<b id="bomb-left">0</b></button>` +
  `<button type="button" id="undo" class="focus-stat charge-stat" hidden title="Undo: take back the last turn">${kitIcon("undo", `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.5 3L1.8 5.7 4.5 8.4" fill="none" stroke="#b9e08a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.3 5.7h6a3.3 3.3 0 0 1 0 6.6H5" fill="none" stroke="#b9e08a" stroke-width="1.6" stroke-linecap="round"/></svg>`, "charge-icon")}<b id="undo-state">0</b></button>`;
/** Cinematic mode's own buttons (`cinematic.ts`), all else hidden: the gear
 * a tap shows, which leaves it for Settings, and with its option on the
 * ad's Gems while they can be claimed. */
const CINEMATIC = `<button id="cinematic-gear" class="cinematic-gear" aria-label="Leave cinematic mode for Settings" title="Settings" hidden>${uiSprite("settings")}</button>` +
  `<button id="cinematic-gems" class="gem-ad cinematic-gems" aria-label="Claim ${AD_GEMS} Gems" title="Claim ${AD_GEMS} Gems" hidden><span class="gem-ad-amount">${gemIcon()}<b>${AD_GEMS}</b></span><small>Claim</small></button>`;

/** Builds the page skeleton into `app`: currencies, stats, board, empty
 * pages, navigation and the shared dialog, with sprite icons in place of
 * the text glyphs. */
export function buildShell(app: HTMLElement) {
  app.innerHTML = `<main class="shell">${CURRENCIES}${STATS}${BOARD}<section id="deck" class="page"></section><section id="defend" class="page"></section><section id="gear" class="page"></section><section id="upgrades" class="page"></section><section id="research" class="page"></section><section id="settings" class="page"></section><section id="shop" class="page"></section><section id="goals" class="page"></section><section id="tournament" class="page"></section><section id="missions" class="page"></section><section id="events" class="page"></section><section id="relics" class="page"></section><section id="shrines" class="page"></section>${NAV}${TRAINING_BAR}${CINEMATIC}</main><dialog id="modal"></dialog>`;
  arrangeHud();
  replaceGlyphs();
}

// The left rail holds the currencies and the ad's Gems. The identity card
// sits beside the limited-use inventory, below the full-width vitals.
function arrangeHud() {
  const oldPortrait = document.querySelector<HTMLElement>(".portrait")!;
  const identity = oldPortrait.querySelector<HTMLElement>(".portrait-top")!;
  const hudActions = oldPortrait.querySelector<HTMLElement>(".portrait-actions")!;
  const vitals = document.querySelector<HTMLElement>(".vitals")!;
  const playerStats = document.createElement("div");
  playerStats.className = "player-stats";
  hudActions.classList.add("hud-controls");
  oldPortrait.replaceWith(hudActions, playerStats);
  const inventory = document.createElement("div");
  inventory.className = "run-inventory";
  inventory.innerHTML = `<div class="run-consumables" aria-label="Run consumables">${FOCUS_STAT}${CHARGE_BUTTONS}</div>`;
  playerStats.append(vitals, identity, inventory);
  const boardFrame = document.querySelector<HTMLElement>("#board-frame")!;
  boardFrame.append(
    document.querySelector<HTMLElement>("#status-row")!,
    document.querySelector<HTMLElement>("#inspect")!,
  );
}

function replaceGlyphs() {
  const replaceGlyph = (selector: string, sprite: string) => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    // Some shell slots already contain a paired icon; replace that pair
    // instead of inserting a second currency or combat symbol beside it.
    const existing = target.querySelector<HTMLElement>(":scope > .sprite-icon");
    if (existing) { existing.outerHTML = sprite; return; }
    if (target.firstChild?.nodeType === Node.TEXT_NODE) target.firstChild.textContent = "";
    target.insertAdjacentHTML("afterbegin", sprite);
  };
  replaceGlyph(".currencies .gold-currency", uiSprite("gold"));
  replaceGlyph(".heart", uiSprite("health"));
  replaceGlyph(".combat-stats .attack-stat", itemSprite("upgrade_attack"));
  replaceGlyph(".combat-stats .defense-stat", itemSprite("upgrade_defense"));
  replaceGlyph(".purse .gold-stat", uiSprite("gold"));
  // Silver keeps its legacy recolored fallback outside the shared kit.
  replaceGlyph(".purse .silver-stat", uiSprite("gold", "ui-sprite silver-sprite"));
  replaceGlyph(".keys .yellow", itemSprite("key_yellow"));
  replaceGlyph(".keys .blue", itemSprite("key_blue"));
  replaceGlyph(".keys .red", itemSprite("key_red"));
  (document.querySelector("#auto-settings .mini-icon") as HTMLElement).innerHTML = uiSprite("settings");
  (document.querySelector("#enter-run .mini-icon") as HTMLElement).innerHTML = ENTER_ICON;
  (document.querySelector("#run-research .mini-icon") as HTMLElement).innerHTML = RESEARCH_ICON;
  (document.querySelector(".ascent > span") as HTMLElement).innerHTML = uiSprite("arrow-up");
  (document.querySelector("#tier-prev") as HTMLElement).innerHTML = uiSprite("arrow-left");
  (document.querySelector("#tier-next") as HTMLElement).innerHTML = uiSprite("arrow-right");
}
