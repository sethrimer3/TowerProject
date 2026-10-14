import { compactAmount, enemyStat, keyCount, whole, wholeHp } from "../whole.ts";
import { enemyStats } from "../enemy-curves.ts";
import { tierStats } from "../tiers.ts";
import type { Game } from "../state.ts";
import type { Renderer } from "../rendering.ts";
import { levelForXp, xpForLevel } from "../config.ts";
import { outsideWeather } from "../outside.ts";
import { tierNumeral, tierRewardText } from "../tiers.ts";
import { MODES, milestones } from "../modes.ts";
import { capitalized, cardArt, CURRENCY_SPRITES, displayedProgress, el, POINTER_SVG, text, uiSprite } from "./dom.ts";
import { notesResearched } from "./run-notes-dialog.ts";
import { CARDS, IN_PLACE, cardText, deckCards, isSiphon, type CardId } from "../cards.ts";
import { BADGES, badgeDef, badgesOn, badgeValue, type RunBadge } from "../badges.ts";
import { badgeStyle } from "./badge-token.ts";
import { trainingPoints, trainingWaiting } from "../loadout.ts";
import { goalsWaiting, heroClass } from "../goals.ts";
import { shrinesOpen } from "../shrines.ts";
import type { BoardOverlay } from "./board-overlay.ts";
import { CountUp } from "./count-up.ts";
import { PlayClock, RateTally } from "./purse-rate.ts";
import { estimatedServerTime } from "../shop/clock.ts";
import { OFFERS } from "../shop/offers.ts";
import { refusal } from "../shop/transactions.ts";
import { caveLabel } from "../tournament/leagues.ts";
import { shortCountdown } from "../tournament/schedule.ts";
import { equipmentWaiting } from "../equipment/inventory.ts";
import { GOLD_BOOST_FACTOR, GOLD_BOOST_MS } from "../gold-boost.ts";
import { adsOff } from "../shop/entitlements.ts";
import { renderRunMenu } from "./run-menu.ts";
import { factorText, goldBonuses, goldBonusTotal } from "../gold-bonuses.ts";
import { MISSION_CAPACITY } from "../missions/catalog.ts";

/** The stats cluster, action buttons and status line around the board. */

export const devAmount = (game: Pick<Game, "save">, value: number) => game.save.settings.devMode ? "∞" : currencyAmount(whole(value));
const UNITS = ["M", "B", "T", "Qa", "Qi"];
/** A currency held, bounded in width: in full with thousands separators
 * below a million, then in millions, billions … with two decimals, rounded
 * down (1.23M, 456.78B), and past the last unit in scientific notation. */
export function currencyAmount(n: number) {
  if (n < 1e6) return n.toLocaleString("en-US");
  let unit = 0, size = 1e6;
  while (unit < UNITS.length - 1 && n >= size * 1000) [unit, size] = [unit + 1, size * 1000];
  if (n >= size * 1000) return n.toExponential(2);
  // Whole hundredths of the unit, so no rounding creeps in (1,150,000 is 1.15M).
  return `${(Math.floor(n / (size / 100)) / 100).toFixed(2)}${UNITS[unit]}`;
}
/** An amount short enough for the HUD's narrow purse: in full below `from`
 * (10,000), then to three figures in thousands, millions or billions
 * (12.3K, 456M). */
export function shortAmount(n: number, from = 10_000) {
  if (n < from) return String(n);
  const [size, unit] = n < 1e6 ? [1e3, "K"] : n < 1e9 ? [1e6, "M"] : [1e9, "B"];
  // Whole steps of the last figure shown, so no rounding creeps in.
  const v = n / size, digits = v < 10 ? 2 : v < 100 ? 1 : 0, step = size / 10 ** digits;
  return `${Math.floor(n / step) / 10 ** digits}${unit}`;
}
/** Shows `held` in the purse's `id`, shortened (`shown` while it counts up
 * to it), the exact amount in its tooltip (∞ in Dev mode). */
function purse(game: Game, id: string, held: number, name: string, shown = held) {
  const dev = game.save.settings.devMode, value = whole(held);
  text(id, dev ? "∞" : shortAmount(whole(shown)));
  el(id).parentElement!.title = `${name}: ${dev ? "∞" : value.toLocaleString("en-US")}`;
}
/** Gold and Silver count up to each rise. */
const goldShown = new CountUp(), silverShown = new CountUp();

/** Gold and Silver found a minute, over the last minute the run played
 * (`clock`), which a tap on either shows in their place inside a run. `run`
 * is the run they were sampled in, so a new one starts them over. */
const rates = { gold: new RateTally(), silver: new RateTally(), clock: new PlayClock(), run: "", shown: false };

/** Switches the purse's Gold and Silver between the amounts held and the
 * rates they are found at (inside a run only). */
export function togglePurseRates(game: Game) {
  if (game.run.outside) return;
  rates.shown = !rates.shown;
  renderPurse(game);
}

/** Whether the run plays, so its rates' clock runs: the hand moving the
 * hero (not paused or stuck) or a fight playing out, with nothing over the
 * board (`live`) and the tab in view. */
function runPlays(game: Game, live: boolean) {
  return live && !document.hidden && game.playing && !game.paused && ((game.auto && !game.handStuck) || !!game.encounter);
}

/** Samples the run's Gold found (`runGold`) and Silver found (held and
 * spent) every `RATE_SAMPLE_MS` of play; true when it took a sample. */
function sampleRates(game: Game, time: number, live: boolean) {
  if (game.run.outside) return false;
  const run = `${game.mode}:${game.run.seed}`;
  if (run !== rates.run) {
    rates.run = run;
    rates.gold.reset();
    rates.silver.reset();
    rates.clock.reset();
  }
  const now = rates.clock.tick(time, runPlays(game, live));
  const gold = rates.gold.sample(game.save[game.mode].runGold, now);
  return rates.silver.sample(game.silver + game.silverSpent, now) || gold;
}

/** Shows the rate `perMinute` in the purse's `id`, abbreviated from 1,000
 * (1.42K), a dash before it is known, with a small /min after it. */
function purseRate(game: Game, id: string, perMinute: number | null, name: string) {
  const dev = game.save.settings.devMode, rate = perMinute === null ? null : whole(perMinute);
  el(id).innerHTML = `${dev ? "∞" : rate === null ? "—" : shortAmount(rate, 1000)}<small class="per-minute">/min</small>`;
  el(id).parentElement!.title = `${name} found a minute, over the last minute of play: ${dev ? "∞" : rate === null ? "—" : rate.toLocaleString("en-US")} (tap for ${name} held)`;
}

/** The purse: Gems, Ascension Shards in the forest, then Gold and, inside a
 * run, the run's Silver, counting up to what they rose to. In the forest
 * Silver shows what the next run starts with, once that is any. */
function renderPurse(game: Game) {
  const now = performance.now(), instant = game.save.settings.reduceMotion;
  purse(game, "gems", game.save.gems, "Gems, kept between runs");
  purse(game, "shards", game.save.ascensionShards, "Ascension Shards, kept between runs");
  el("shards").parentElement!.hidden = !game.run.outside;
  // Medals show only in the forest, once held, where the purse has room.
  purse(game, "medals", game.save.medals, "Medals, kept between runs");
  el("medals").parentElement!.hidden = !game.run.outside || game.save.medals <= 0;
  el("shards").closest(".purse")!.classList.toggle("forest", !!game.run.outside);
  purse(game, "gold", game.save.gold, "Gold, kept between runs", goldShown.show(game.save.gold, now, instant));
  const showRates = rates.shown && !game.run.outside;
  el("gold").closest(".purse")!.classList.toggle("rates", showRates);
  if (showRates) {
    silverShown.show(game.silver, now, instant);
    el("run-silver").parentElement!.hidden = false;
    purseRate(game, "gold", rates.gold.perMinute, "Gold");
    purseRate(game, "run-silver", rates.silver.perMinute, "Silver");
  } else if (game.run.outside) {
    const start = game.startingSilver;
    purse(game, "run-silver", start, "Silver each run starts with");
    el("run-silver").parentElement!.hidden = start <= 0;
  } else {
    purse(game, "run-silver", game.silver, "Silver, spent only inside this run", silverShown.show(game.silver, now, instant));
    el("run-silver").parentElement!.hidden = false;
  }
}

/** The currencies bar's Silver: the run's inside one, or in the forest
 * what the next run starts with, shown once that is any. */
function renderSilverHeld(game: Game) {
  const outside = !!game.run.outside, silver = outside ? game.startingSilver : game.silver;
  const box = el("silver-held").parentElement!;
  box.hidden = outside && silver <= 0;
  box.title = outside ? "Silver each run starts with" : "Silver, spent only inside this run";
  text("silver-held", currencyAmount(whole(silver)));
}

/** Each display frame: moves on the Gold and Silver still counting up, and
 * samples their rates, showing each new one while they are shown. `live`
 * is false while a dialog covers the board, which stops the rates' clock. */
export function purseFrame(game: Game, now: number, live = true) {
  const sampled = sampleRates(game, now, live);
  if ((sampled && rates.shown) || goldShown.counting(now) || silverShown.counting(now)) renderPurse(game);
}

/** Refreshes every HUD readout from game state. */
export function renderHud(game: Game, renderer: Renderer, overlay: BoardOverlay) {
  overlay.clearIfAt(game.run.player);
  overlay.followHero();
  renderVitals(game);
  renderFocus(game);
  renderProgress(game);
  renderModeActions(game);
  text("gems-held", devAmount(game, game.save.gems));
  text("shards-held", devAmount(game, game.save.ascensionShards));
  text("medals-held", devAmount(game, game.save.medals));
  el("medals-held").parentElement!.hidden = game.save.medals <= 0 && !game.save.settings.devMode;
  text("gold-held", devAmount(game, game.save.gold));
  renderSilverHeld(game);
  text("courage", devAmount(game, game.save.delve.courage));
  text("inspiration", devAmount(game, game.save.tower.inspiration));
  text("training", currencyAmount(trainingPoints(game.save).left));
  // Courage means nothing until the Delve, which pays it, is open.
  (document.querySelector(".courage-currency") as HTMLElement).hidden = !game.save.upgrades.delve && !game.save.settings.devMode;
  renderXp(game);
  renderStatus(game, overlay);
  // The status line sits over the board's bottom row: let the hero show through.
  el("status-row").classList.toggle("see-through", game.run.player.y === renderer.target(renderer.density).bottom);
  renderAutoButton(game);
  renderHand(game);
  text("density-label", `${renderer.density} × ${renderer.density}`);
  renderUndo(game);
  (document.querySelector(".dpad") as HTMLElement).hidden = !game.save.settings.showArrows;
  renderModeTab(game);
  renderForestSign(game);
  renderRunMenu(game);
  renderTournamentButton(game);
  renderMailButton(game);
  renderMissionsButton(game);
  renderEventsButtons(game);
  el("run-shop").hidden = !!game.run.outside;
  el("run-research").classList.toggle("notify", !game.run.outside && researchWaiting(game));
  renderAdButton(game);
  renderLockedTab("deck", !!game.save.upgrades.combatStance, "Deck", "Unlock Combat Stance in the Inspiration tree");
  // A new Deck lesson waits behind the button until its tutorial is done.
  const { deck, addCard } = game.save.tutorials;
  document.querySelector(`[data-tab="deck"]`)?.classList.toggle("notify", !deck || (!!game.save.upgrades.buildout && !addCard) || deckWaiting(game));
  document.querySelector(`[data-tab="upgrades"]`)?.classList.toggle("notify", upgradesWaiting(game) || game.treeWaiting("inspiration") || game.treeWaiting("courage"));
  document.querySelector(`[data-tab="research"]`)?.classList.toggle("notify", trainingWaiting(game.save));
  renderLockedTab("gear", !!game.save.upgrades.gear || game.save.equipment.unlocked, "Gear", "Unlock Gear in the Inspiration tree");
  document.querySelector(`[data-tab="gear"]`)?.classList.toggle("notify", gearWaiting(game) || equipmentWaiting(game.save));
  renderShopDot(game);
  renderLockedTab("defend", !!game.save.upgrades.legacy, "Defend", "Not yet open");
}

/** Whether the Shop button shows its dot: a daily offer can be claimed, on
 * the server's time as estimated (the claim itself asks the server). */
export const shopWaiting = (game: Game) => {
  const now = estimatedServerTime(game.save.shop.clock, game.clock());
  return OFFERS.some((o) => o.period === 1 && !refusal(game.save, o, now));
};
/** Puts the dot on the Shop tab and the run's Shop while `shopWaiting`,
 * and on the run's hamburger while a button folded in its menu wears one. */
export const renderShopDot = (game: Game) => {
  const waiting = shopWaiting(game);
  document.querySelector(`[data-tab="shop"]`)?.classList.toggle("notify", waiting);
  el("run-shop").classList.toggle("notify", waiting);
  // The hamburger wears the dots of the buttons folded away in its menu:
  // Missions always; inside a run Research, the Tournament's and Events';
  // in the forest Mail.
  el("run-menu-toggle").classList.toggle("notify", game.missions.waiting || (game.run.outside
    ? game.mail.recent.length > 0 && game.mail.unread
    : researchWaiting(game) || tournamentWaiting(game) || game.events.waiting));
};
/** Whether the Tournament button wears its dot: a final prize waits to be
 * claimed. */
const tournamentWaiting = (game: Game) => game.tournament.unlocked && game.tournament.phase === "results" && game.tournament.claimable;
/** The Tournament button, once the Tournament is open to the player: its
 * trophy over the phase, `2d5h` until the next opens, `OPEN`, `ENDING`, or
 * `CLAIM` with a dot while a final prize waits. In the forest's actions
 * column under the hamburger; inside a run, in the run's menu once the
 * player has entered the tournament, else gone (`renderRunMenu` places it).
 * Refreshed every second too (main's tick), so the countdown runs. */
export function renderTournamentButton(game: Game) {
  const button = el("tournament-button"), desk = game.tournament, inside = !game.run.outside;
  button.hidden = !desk.unlocked || (inside && !desk.entered);
  if (button.hidden) return;
  const phase = desk.phase, claim = tournamentWaiting(game);
  text("tournament-state", phase === "open" ? "OPEN" : phase === "ending" ? "ENDING" : claim ? "CLAIM" : shortCountdown(desk.nextOpensAt - desk.now));
  button.classList.toggle("notify", claim);
  button.classList.toggle("live", phase === "open");
}
/** The Mail button: in the forest's menu, only while there is mail to show
 * (`game.mail.recent`), with a dot while any of it is unread. Never inside a run. Refreshed every second too (main's
 * tick), so mail past its time leaves on its own. */
export function renderMailButton(game: Game) {
  const button = el("mail-button"), mail = game.mail;
  button.hidden = !game.run.outside || mail.recent.length === 0;
  button.classList.toggle("notify", !button.hidden && mail.unread);
}
/** The Missions button: a check mark over the missions in the list out
 * of 8 (`3/8`), complete or not, since at 8 no more come; a dot shows
 * while a mission or weekly reward waits to be claimed. In the menu, in the
 * forest and inside a run. Refreshed every second too (main's tick), so new
 * missions show as they come. */
export function renderMissionsButton(game: Game) {
  const button = el("missions-button"), missions = game.missions;
  text("missions-count", `${missions.list.length}/${MISSION_CAPACITY}`);
  button.classList.toggle("notify", missions.waiting);
  const label = `Missions: ${missions.list.length} of ${MISSION_CAPACITY}${missions.waiting ? "; rewards to claim" : ""}`;
  button.title = label;
  button.setAttribute("aria-label", label);
}
/** The Events button, once Events are open: a pennant over the time left
 * in the running event (`9d 4h`), with a dot while a new mission or a
 * completed one waits to be seen. In the forest's actions column under the
 * Tournament's; inside a run, in the run's menu (`renderRunMenu` places
 * it). And the Relics button beside Mail in the forest's menu, once Events
 * are open or a relic is owned. Refreshed every second too (main's tick),
 * so the countdown runs. */
export function renderEventsButtons(game: Game) {
  const button = el("events-button"), events = game.events;
  button.hidden = !events.unlocked;
  el("relics-button").hidden = !game.run.outside || (!events.unlocked && game.save.relics.length === 0);
  el("shrines-button").hidden = !game.run.outside || !shrinesOpen(game.save);
  if (button.hidden) return;
  text("events-state", shortCountdown(events.info.endsAt - events.now));
  button.classList.toggle("notify", events.waiting);
  const label = `Events: ${events.info.name}${events.waiting ? "; something new" : ""}`;
  button.title = label;
  button.setAttribute("aria-label", label);
}
/** Whether the Upgrades button shows its dot: the first Inspiration has
 * been earned (so the run that paid it has ended by the time the tabs show)
 * and the page hasn't been opened since. */
export const upgradesWaiting = (game: Game) => !game.save.tutorials.upgrades && game.save.tower.inspiration > 0;
/** Whether the Gear button shows its dot: the Gear skill is owned and the
 * page hasn't been opened since. */
export const gearWaiting = (game: Game) => !game.save.tutorials.gear && !!game.save.upgrades.gear;

/** Whether the run's Research button wears its dot: training points can
 * be spent and the hero has levelled up since the Research page was last
 * opened, or an archivist stands idle and research has completed (or an
 * archivist been hired) since. Opening the page dismisses it
 * (`dismissResearch`) until the next such event. */
export const researchWaiting = (game: Game) => {
  const seen = game.save.seen;
  return (trainingWaiting(game.save) && levelForXp(game.save.xp) > seen.level) ||
    (game.research.idle && game.research.events > seen.archives);
};
/** Dismisses the run's Research dot until the next level-up or idle archivist. */
export function dismissResearch(game: Game) {
  game.save.seen.level = levelForXp(game.save.xp);
  game.save.seen.archives = game.research.events;
}
/** Whether the Deck tab wears its dot: the deck holds a card (from a skill,
 * a Goal or anywhere else) the Deck page hasn't shown since it was earned. */
export const deckWaiting = (game: Game) =>
  !!game.save.upgrades.combatStance && deckCards(game.save.upgrades).some((id) => !game.save.seen.cards.includes(id));

/** The level at the front of the XP bar, which fills with this level's
 * progress; hovering shows the XP still needed. The hero's class names it
 * above (`heroClass`). */
function renderXp(game: Game) {
  text("hero-class", heroClass(game.save).toUpperCase());
  const level = levelForXp(game.save.xp), from = xpForLevel(level),
    into = game.save.xp - from, need = xpForLevel(level + 1) - from;
  text("level", String(level));
  el("xp-fill").style.width = `${(100 * into) / need}%`;
  const tip = `${into}/${need} XP to level ${level + 1}`;
  const row = el("xp");
  row.title = tip;
  row.setAttribute("aria-label", `Level ${level} · ${tip}`);
}

/** The board's heading: the forest's title outside, the mode's inside. */
export function boardTitle(game: Pick<Game, "mode" | "run">) {
  const words = MODES[game.mode].words;
  return game.run.outside ? words.outsideTitle : words.title;
}

/** The board's title, subtitle and caption: the forest clearing outside, or
 * the Tower/Delve name inside. */
export function renderBoardHeading(game: Game, overlay: BoardOverlay) {
  el("board").dataset.outside = String(!!game.run.outside);
  el("board").dataset.heading = headingKey(game);
  el("board").classList.toggle("mode-tower", game.mode === "tower");
  const words = MODES[game.mode].words, tiers = tierLine(game);
  text("board-title", boardTitle(game));
  if (game.run.outside) {
    const labels = { cloudy: "CLOUDY", sunny: "SUNNY", rain: "RAINING", storm: "THUNDERSTORM" };
    text("board-subtitle", tiers ?? `FOREST CLEARING · ${labels[outsideWeather(game.run.seed)]}`);
    // The sign down the path stands where this hint would.
    el("inspect").textContent = game.canSwapForest ? "" : "Follow the forest path and step onto the entrance at the top to begin again.";
  } else {
    text("board-subtitle", tiers ?? words.subtitle);
    el("inspect").textContent = "";
  }
  renderTierArrows(game);
  overlay.hide();
}

/** Once a second tier is open: the tier climbed and its Gold and XP bonuses. */
function tierLine(game: Game) {
  const slice = game.save[game.mode];
  if (slice.tiersOpen < 2) return null;
  return `${MODES[game.mode].words.tierName.toUpperCase()} ${tierNumeral(slice.tier)} · ${tierRewardText(slice.tier).toUpperCase()}`;
}

/** In the forest, once a second tier is open, the arrows beside the board
 * choose the tier the next run climbs. */
function renderTierArrows(game: Game) {
  const slice = game.save[game.mode], shown = !!game.run.outside && slice.tiersOpen > 1;
  const name = MODES[game.mode].words.tierName;
  for (const [id, to] of [["tier-prev", slice.tier - 1], ["tier-next", slice.tier + 1]] as const) {
    const button = el(id) as HTMLButtonElement;
    button.hidden = !shown;
    button.disabled = to < 1 || to > slice.tiersOpen;
    button.title = button.disabled ? "" : `${name} ${tierNumeral(to)} · ${tierRewardText(to)}`;
  }
}

/** What the board's heading shows: redrawn when it changes. */
const headingKey = (game: Game) => {
  const slice = game.save[game.mode];
  return `${game.mode}:${!!game.run.outside}:${slice.tier}:${slice.tiersOpen}`;
};

/** The button's icon inside a run, by what pressing it does: text glyphs
 * (the variation selector keeps ▶ from turning into an emoji). */
const HAND_ICON = { play: "▶︎", pause: "❚❚" };

/** Inside a run the button plays and pauses the hand, showing the play or
 * pause icon, with the hero's movement speed under it (*3x*: steps a
 * second) between the arrows that change it. In the forest it gives way to
 * Enter, under Goals, which goes straight in to start the run. */
function renderAutoButton(game: Game) {
  const button = el("auto"), inside = !game.run.outside;
  button.hidden = !inside;
  el("enter-run").hidden = inside;
  el("stats").classList.toggle("outside", !inside);
  const label = game.auto ? "Pause the hand" : "Play the hand";
  const icon = game.auto ? HAND_ICON.pause : HAND_ICON.play,
    slot = button.querySelector<HTMLElement>(".mini-icon")!;
  if (inside && slot.textContent !== icon) slot.textContent = icon;
  text("auto-state", game.auto ? "PLAYING" : "PAUSED");
  renderSpeed(game, inside);
  // The speed lesson waits on the › arrow, not on play; the first run's
  // note, on its tap.
  (button as HTMLButtonElement).disabled = inside && (game.teachesSpeed || game.boardLesson === "climb");
  button.classList.toggle("enabled", inside && game.auto);
  button.setAttribute("aria-label", label);
  button.title = label;
}

/** The speed under play/pause, between its arrows: ‹ closed at 0, › at the
 * most research allows. While the speed lesson waits, a hand points up at
 * ›, and ‹ stays closed; while the first run's note waits, both do. */
function renderSpeed(game: Game, inside: boolean) {
  const row = el("auto-speed"), steps = game.stepsPerSecond, lesson = inside && game.teachesSpeed;
  row.hidden = !inside;
  // Equipment's movement speed shows in the steps actually taken.
  text("speed-value", `${Math.round(game.moveRate * 100) / 100}x`);
  const held = game.boardLesson === "climb";
  (el("speed-down") as HTMLButtonElement).disabled = steps <= 0 || lesson || held;
  (el("speed-up") as HTMLButtonElement).disabled = steps >= game.maxSpeed || held;
  let pointer = row.querySelector<HTMLElement>(".speed-pointer");
  if (lesson && !pointer) {
    row.insertAdjacentHTML("beforeend", `<span class="speed-pointer${game.save.settings.reduceMotion ? " still" : ""}">${POINTER_SVG}</span>`);
  } else if (!lesson) pointer?.remove();
}

/** The hand (and its badges) the cards were last drawn for. */
let shownHand = "";
/** A badge's tooltip line with its value in effect, not its level: a gate
 * reads "HP < 100%", the rest "Skip 7%" (a unit already in the name is not
 * repeated). */
function badgeTitle(badge: RunBadge) {
  const def = badgeDef(badge.id), v = badgeValue(badge.id, badge.level, badge.pick);
  const percent = def.unit.startsWith("%");
  if (def.kind === "gate") return `${def.name} ${v}${percent ? "%" : ""}`;
  const unit = percent ? "%" : def.unit === def.name ? "" : ` ${def.unit}`;
  return `${def.name}: ${def.lead ? `${def.lead} ` : ""}${v}${unit}`;
}
/** A hand card's tooltip: its name and text, inside a run a line for each
 * badge it holds, top slot first, and a siphon's uses so far this run. */
function handCardTitle(game: Game, id: CardId) {
  let title = `${CARDS[id].name}: ${cardText(id, game.save.upgrades)}`;
  if (game.run.outside) return title;
  for (const badge of badgesOn(game.run.badges, id)) title += `
Badge: ${badgeTitle(badge)}`;
  if (isSiphon(id)) {
    const uses = game.cardUses(id), next = game.siphonCost(id);
    title += `
Used ${uses} time${uses === 1 ? "" : "s"} this run; the next use takes ${next} level${next === 1 ? "" : "s"}.`;
  }
  return title;
}
/** The icons of the badges a hand card holds inside a run, down its top
 * right corner, top slot first (their levels are in the card's tooltip). */
function handBadgeHtml(game: Game, id: CardId) {
  const badges = game.run.outside ? [] : badgesOn(game.run.badges, id);
  if (!badges.length) return "";
  return `<span class="hand-badges" aria-hidden="true">${badges.map((b) => `<span class="hand-badge-level" style="${badgeStyle(b.id)}">${BADGES[b.id].glyph}</span>`).join("")}</span>`;
}
/** The active hand in the row under the board, the card that made the
 * latest step glowing (paused too); End Run lights up while no card can act. */
function renderHand(game: Game) {
  const row = el("hand"), hand = game.hand;
  const key = `${hand.join()}|${game.run.outside ? "" : JSON.stringify(game.run.badges ?? {})}`;
  if (key !== shownHand) {
    shownHand = key;
    // Room for five cards, and narrower cards for a bigger hand.
    row.style.setProperty("--slots", String(Math.max(5, hand.length)));
    row.innerHTML = hand.map((id, i) => `<div class="hand-card" role="listitem" data-card="${id}" data-hand-slot="${i}">${cardArt(id, CARDS[id].name)}${handBadgeHtml(game, id)}</div>`).join("");
  }
  // Paused, the card that made the latest step still glows.
  const glowing = game.handStuck ? null : game.activeCard;
  const focused = game.run.focused ? hand.indexOf(game.run.focused) : -1;
  row.classList.toggle("can-focus", !!game.save.upgrades.focus);
  row.querySelectorAll<HTMLElement>(".hand-card").forEach((card, i) => {
    card.classList.toggle("active", i === glowing);
    card.classList.toggle("focused", i === focused);
    const title = handCardTitle(game, hand[i]);
    if (card.title !== title) card.title = title;
    // A card that acts in place greys out while it can't (KEY SIPHON
    // without the Max HP training levels its next use takes), and one
    // resting for the floor (Deprioritize with every mark made).
    card.classList.toggle("unable", !game.run.outside && ((IN_PLACE.has(hand[i]) && !game.canAct(hand[i])) || game.cardResting(hand[i])));
  });
}

/** True when the heading still shows the other side of the forest entrance. */
export const boardHeadingStale = (game: Game) => el("board").dataset.heading !== headingKey(game);

/** The key colours the run of this seed has held, for the HUD's key row. */
let keysSeen: { run: number | null; colors: Set<string> } = { run: null, colors: new Set() };

/** Shows a combat stat in `id`, shortened from 10,000, its name and exact
 * amount (and `about`) in the stat's tooltip. */
function combatStat(id: string, name: string, n: number, about = "") {
  text(id, Number.isFinite(n) ? shortAmount(n) : n);
  el(id).parentElement!.title = `${name}: ${Number.isFinite(n) ? n.toLocaleString("en-US") : n}${about}`;
}

/** What the combat stats' row was last fitted to: its text and the window's width. */
let combatFitted = "";
/** Shrinks the combat stats' row's text, when it changes, just enough that
 * ATK, DEF and the shroud fit on one line (a narrow phone with large
 * stats), down to 7px; otherwise it keeps its size. */
function fitCombatStats() {
  const row = document.querySelector<HTMLElement>(".combat-stats");
  if (!row) return;
  const key = `${row.textContent}|${el("shroud-stat").hidden}|${window.innerWidth}`;
  if (key === combatFitted) return;
  row.style.fontSize = "";
  // Hidden (another page showing): fitted once it shows again.
  if (!row.clientWidth) return;
  combatFitted = key;
  // The gaps between the stats (3px each at their narrowest) don't scale with the text.
  const gaps = 6, over = (row.scrollWidth - gaps) / (row.clientWidth - gaps);
  if (over > 1) row.style.fontSize = `${Math.max(7, Math.floor((parseFloat(getComputedStyle(row).fontSize) / over) * 10) / 10)}px`;
}

/** HP, ATK, DEF (and the shroud, once owned), the run's Gold and keys. During a fight being played out, HP counts down
 * strike by strike, the bar's red already at the HP the fight leaves and
 * the HP still to go in purple past it. */
export function renderVitals(game: Game) {
  const p = game.run.player, hp = game.shownHp(performance.now());
  // Shortened from 10,000 like the purse, so the line stays one line on a
  // phone; the exact HP is in the tooltip.
  text("hp", `${shortAmount(wholeHp(hp))} / ${shortAmount(whole(p.maxHp))}`);
  el("hp").parentElement!.title = `HP: ${wholeHp(hp).toLocaleString("en-US")} / ${whole(p.maxHp).toLocaleString("en-US")}`;
  renderHealthGain(game);
  const left = game.encounter ? Math.min(hp, game.fightEndHp()) : hp;
  el("health").style.width = `${(100 * left) / p.maxHp}%`;
  renderHealthLoss(hp - left, p.maxHp);
  // ATK, DEF and the shroud shortened the same way, so the three fit on one
  // line on a phone; the exact amounts are in their tooltips.
  combatStat("attack", "ATK", whole(p.attack));
  combatStat("defense", "DEF", whole(p.defense));
  combatStat("shroud", "Shroud", whole(p.shroud ?? 0), ", damage blocked at the start of every fight");
  el("shroud-stat").hidden = !game.save.upgrades.shroud;
  fitCombatStats();
  renderPurse(game);
  // Inside a run, blue and red keys show once the hero holds one, and stay
  // for the rest of the run; the forest shows only the keys a run starts with.
  const run = game.run;
  if (keysSeen.run !== run.seed) keysSeen = { run: run.seed, colors: new Set() };
  for (const k of ["yellow", "blue", "red"] as const) {
    text(k, keyCount(p.keys[k]));
    if (p.keys[k] > 0) keysSeen.colors.add(k);
    el(k).parentElement!.hidden = run.outside ? p.keys[k] <= 0 : k !== "yellow" && !keysSeen.colors.has(k);
  }
  const skeletonKeys = p.skeletonKeys ?? 0;
  text("skeleton", skeletonKeys);
  el("skeleton-key").hidden = skeletonKeys < 1;
}

/** The last heal the HP bar has filled up to. */
let shownHeal = 0;
/** A potion just picked up or drunk: the red fill starts at the HP before it with the
 * HP it healed in blue beyond, and grows over the blue in a
 * second. A fight starting, or the next potion, stops it where it is. */
function renderHealthGain(game: Game) {
  const heal = game.lastHeal, fill = el("health"), gain = el("health-gain");
  const settle = () => {
    fill.classList.remove("healing");
    gain.classList.remove("healing");
    gain.style.width = "0%";
  };
  if (game.encounter) settle();
  if (!heal || heal.id === shownHeal) return;
  shownHeal = heal.id;
  // Only the heal the HUD is looking at now fills up; one from before a
  // reload, a new run or an undo is simply there.
  if (heal.to !== game.run.player.hp || game.encounter) return;
  const max = game.run.player.maxHp;
  settle();
  fill.style.width = `${(100 * heal.from) / max}%`;
  gain.style.width = `${(100 * (heal.to - heal.from)) / max}%`;
  void fill.offsetWidth; // Lay out the starting widths before the transition.
  fill.classList.add("healing");
  gain.classList.add("healing");
  gain.style.width = "0%";
  fill.addEventListener("transitionend", settle, { once: true });
}

/** The HP the fight being played out is still to cost, shown in purple just
 * past the HP it leaves, shrinking strike by strike; any left once the
 * fight settles shrinks away over a second. */
function renderHealthLoss(lost: number, maxHp: number) {
  const bar = el("health-loss");
  if (lost > 0) {
    bar.classList.remove("settling");
    bar.style.width = `${(100 * lost) / maxHp}%`;
  } else if (bar.style.width && bar.style.width !== "0%") {
    bar.classList.add("settling");
    bar.style.width = "0%";
  }
}

/** Once Shrines are researched, inside a Tower run: the Shrine button,
 * its count the boons waiting (lit while any wait), and under the floor
 * the floors left to the next boon. */
function renderShrine(game: Game) {
  const shrine = game.shrine, open = shrine.open, waiting = shrine.unspent, next = shrine.floorsToNext;
  const button = el("shrine-stat");
  button.hidden = !open;
  button.classList.toggle("notify", waiting > 0);
  text("shrine-left", waiting);
  button.setAttribute("aria-label", waiting ? `Shrine: ${waiting} boon${waiting === 1 ? "" : "s"} to pick` : "Shrine: boons taken");
  el("shrine-next").hidden = !open || next === null;
  text("shrine-next-val", next ?? 0);
}

/** Focus uses left, once the Focus skill is owned. */
function renderFocus(game: Game) {
  renderShrine(game);
  const stat = el("focus-stat");
  stat.hidden = !game.save.upgrades.focus;
  text("focus-left", game.focusLeft);
  stat.setAttribute("aria-label", `Focus: ${game.focusLeft} left`);
  for (const c of ["ignore", "target"] as const) {
    const button = el(`${c}-stat`), left = game.chargesLeft(c), name = c === "ignore" ? "Ignore" : "Target";
    button.hidden = !game.save.upgrades[c];
    button.classList.toggle("armed", game.armed === c);
    text(`${c}-left`, left);
    button.setAttribute("aria-label", `${name}: ${left} left`);
    button.setAttribute("aria-pressed", String(game.armed === c));
  }
}

/** Replays a brief red flash on `target`, as a refusal. */
export function flashRed(target: Element) {
  target.classList.remove("flash-red");
  void (target as HTMLElement).offsetWidth;
  target.classList.add("flash-red");
  target.addEventListener("animationend", () => target.classList.remove("flash-red"), { once: true });
}

/** A refused purchase: the red flash, with red sparks bursting off `target`
 * (only the flash when motion is reduced). */
export function sparkRed(target: HTMLElement, reduceMotion: boolean) {
  flashRed(target);
  if (reduceMotion) return;
  target.querySelectorAll(".red-spark").forEach((s) => s.remove());
  const SPARKS = 8;
  for (let i = 0; i < SPARKS; i++) {
    const spark = document.createElement("i"), turn = (i + 0.5) / SPARKS;
    spark.className = "red-spark";
    spark.style.setProperty("--turn", `${turn}turn`);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
    target.append(spark);
  }
}

/** Current floor/depth under the tier climbed ("Tower 2", or a tournament
 * run's "Delve 3+"; in the forest, just the tier the entrance leads to), and the reward the run's new best
 * would pay. */
function renderProgress(game: Game) {
  const outside = !!game.run.outside,
    rules = MODES[game.mode];
  const tier = el("height-tier");
  tier.hidden = outside;
  // A tournament run's cave wears its +, for the stronger enemies.
  const t = game.mode === "delve" ? game.delveRun.tournament : undefined;
  text("height-tier", (t ? caveLabel(t.league) : `${rules.words.tierName} ${game.save[game.mode].tier}`).toUpperCase());
  text("height-label", (outside ? rules.words.tierName : rules.words.progress).toUpperCase());
  const rawRunBest = game.run.maxHeight ?? game.run.height;
  const rawAllBest = game.save[game.mode].best;
  text("height", outside ? game.save[game.mode].tier : displayedProgress(game.run.height));
  // Once Note Taking is researched, the floor number opens the run's notes.
  const notes = !outside && notesResearched(game.save), height = document.querySelector<HTMLElement>(".height")!;
  if (height.classList.contains("takes-notes") !== notes) {
    height.classList.toggle("takes-notes", notes);
    el("height").title = notes ? `${capitalized(rules.words.run)} Notes` : "";
  }
  renderRunEarned(game);
  renderGoldBonus(game);
  renderBaseEnemy(game);
  const rewardEl = el("best-reward");
  rewardEl.hidden = rawRunBest <= rawAllBest;
  if (rewardEl.hidden) return;
  text("best-reward-val", milestones(rules, rawAllBest, rawRunBest));
  text("best-reward-type", rules.words.currency.toUpperCase());
  rewardEl.title = rules.words.newBest;
}

/** Inside a run, between lines under the floor: every Gold bonus applied,
 * multiplied together; pressed, it lists them (`toggleGoldBonusBox`). */
function renderGoldBonus(game: Game) {
  const button = el("gold-bonus"), inside = !game.run.outside;
  button.hidden = el("gold-bonus-divider").hidden = !inside;
  if (!inside) return;
  text("gold-bonus-val", factorText(goldBonusTotal(goldBonuses(game.save, game.tier, game.clock(), game.shrineGold))));
}

/** A stat in a few characters: two decimals below 1,000 when not whole,
 * then 1.2K, 12M … */
const shortStat = (n: number) => (n < 1000 ? enemyStat(n) : compactAmount(Math.floor(n)));
/** Under the floor inside a run, below a dividing line: the ATK, DEF and HP
 * of a normal, balanced enemy there, as the tier's factor makes them. */
function renderBaseEnemy(game: Game) {
  const box = el("base-enemy"), divider = el("base-enemy-divider"), inside = !game.run.outside;
  box.hidden = divider.hidden = !inside;
  if (!inside) return;
  const s = enemyStats(game.mode, game.tier, game.run.height, "normal", "balanced"), f = tierStats(game.tier);
  text("base-enemy-atk", shortStat(s.attack * f));
  text("base-enemy-def", shortStat(s.defense * f));
  text("base-enemy-hp", shortStat(s.hp * f));
}

/** The run's Inspiration (Courage in the Delve) last shown under the
 * floor, and the mode it was shown for. */
let earnedShown = { mode: "", amount: 0 };
/** On a line under the floor inside a run, once it has earned any: the mode's
 * currency icon and what the run has earned, flashing each time it rises. */
function renderRunEarned(game: Game) {
  const amount = game.run.outside ? 0 : game.save[game.mode].runCurrency, box = el("run-earned");
  box.hidden = amount < 1;
  const icon = el("run-earned-icon");
  if (icon.dataset.mode !== game.mode) {
    icon.dataset.mode = game.mode;
    icon.innerHTML = uiSprite(CURRENCY_SPRITES[game.mode]);
  }
  box.title = `${MODES[game.mode].words.currency} earned this run`;
  text("run-earned-val", String(amount));
  const rose = earnedShown.mode === game.mode && amount > earnedShown.amount;
  earnedShown = { mode: game.mode, amount };
  if (!rose || box.hidden) return;
  box.classList.remove("flash");
  void box.offsetWidth;
  box.classList.add("flash");
}

/** The ad buttons stand under the purse: the Gems' in the forest and
 * inside a run, in both modes, showing its Gems when they can be claimed,
 * an empty space while it waits; and inside a run beside it the Gold
 * ad's, with the boost time stored. Goals shows only in the forest. */
export function renderAdButton(game: Game) {
  const inside = !game.run.outside, button = el("gem-ad") as HTMLButtonElement;
  el("section-pick").hidden = inside;
  button.classList.toggle("waiting", !game.gemFinder.adReady);
  button.disabled = !game.gemFinder.adReady;
  renderGoldAd(game, inside);
}

/** Boost time left, short enough for the narrow button: 18m, 1h40m. */
export function boostTime(ms: number) {
  const minutes = Math.ceil(ms / 60_000), h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h${m ? `${String(m).padStart(2, "0")}m` : ""}` : `${m}m`;
}

/** The Gold ad, inside a run: ×1.5 Gold for 20 minutes a claim, stored up
 * to two hours, glowing with the time left while the boost lasts and
 * reading Inactive with none stored; closed once the store is within ten
 * minutes of full (`canClaimGoldBoost`). Gone
 * once Ad-Disable is owned (its ×1.5 Gold is for good), the Gems' button
 * stretching into its place. */
function renderGoldAd(game: Game, inside: boolean) {
  const button = el("gold-ad") as HTMLButtonElement, left = game.gemFinder.goldBoostLeft;
  button.hidden = !inside || adsOff(game.save);
  button.classList.toggle("active", left > 0);
  button.disabled = !game.gemFinder.goldAdReady;
  text("gold-ad-time", left > 0 ? boostTime(left) : "Inactive");
  const label = left > 0
    ? `Gold ×${GOLD_BOOST_FACTOR}: ${boostTime(left)} left${button.disabled ? " (nearly full)" : `; claim ${GOLD_BOOST_MS / 60_000} more minutes`}`
    : `Claim Gold ×${GOLD_BOOST_FACTOR} for ${GOLD_BOOST_MS / 60_000} minutes`;
  button.title = label;
  button.setAttribute("aria-label", label);
}

/** Goals acts on the Tower; in the Delve it is a placeholder. */
function renderModeActions(game: Game) {
  const tower = game.mode === "tower";
  const floorsButton = el("section-pick") as HTMLButtonElement;
  floorsButton.textContent = tower ? "Goals" : "Button 2";
  floorsButton.setAttribute("aria-label", tower ? "Goals" : "Future Delve action 2");
  floorsButton.title = tower ? "Goals" : "Future Delve action 2";
  floorsButton.classList.toggle("placeholder-action", !tower);
  // A dot while a Goals reward waits to be claimed.
  floorsButton.classList.toggle("notify", tower && goalsWaiting(game.save));
}

function renderStatus(game: Game, overlay: BoardOverlay) {
  const infoDisplay = game.save.settings.infoDisplay;
  el("status-row").hidden = infoDisplay === "popup" || infoDisplay === "none";
  text("message", game.paused ? "Paused · take a breath." : overlay.statusLine() ?? game.message);
}

/** The undo item in the run's limited-use list and how many undos the run
 * has left (spent ones never come back). */
function renderUndo(game: Game) {
  const undo = el("undo") as HTMLButtonElement,
    left = game.undosLeft;
  text("undo-state", left);
  undo.setAttribute("aria-label", `Undo (${left}/${game.undoCapacity})`);
  undo.disabled = !game.canUndo;
  // Undo needs Rehearsed steps, or Echoes of time and Undo Count research.
  undo.hidden = !game.undoCapacity;
}

/** The tab bar's mode button wears the active mode's art and name. */
function renderModeTab(game: Game) {
  const icon = el("mode-icon");
  if (icon.dataset.mode === game.mode) return;
  icon.dataset.mode = game.mode;
  icon.innerHTML = uiSprite(game.mode);
  const button = icon.parentElement!, name = capitalized(game.mode);
  button.title = name;
  button.setAttribute("aria-label", name);
}

/** The forest's sign at the foot of the path, once the Delve is open: the
 * other mode's art over a down arrow. */
function renderForestSign(game: Game) {
  const sign = el("forest-sign"), other = game.mode === "tower" ? "delve" : "tower";
  sign.hidden = !game.canSwapForest;
  if (sign.hidden || sign.dataset.to === other) return;
  sign.dataset.to = other;
  sign.querySelector(".sign-icon")!.innerHTML = uiSprite(other);
  sign.querySelector(".sign-arrow")!.innerHTML = uiSprite("arrow-down");
  const label = other === "delve" ? "Down the path to the Delve" : "Down the path to the Tower";
  sign.title = label;
  sign.setAttribute("aria-label", label);
}

function renderLockedTab(id: string, unlocked: boolean, name: string, hint: string) {
  const tab = document.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`);
  if (!tab) return;
  tab.hidden = !unlocked;
  tab.title = unlocked ? name : hint;
  tab.setAttribute("aria-label", unlocked ? name : `${name} (locked)`);
}
