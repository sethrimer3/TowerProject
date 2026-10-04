import { whole, wholeHp } from "../whole.ts";
import type { Game } from "../state.ts";
import type { Renderer } from "../rendering.ts";
import { levelForXp, xpForLevel } from "../config.ts";
import { CONSUMABLES, consumableText } from "../crafting.ts";
import { outsideWeather } from "../outside.ts";
import { tierNumeral, tierRewardText } from "../tiers.ts";
import { MODES, milestones } from "../modes.ts";
import { cardArt, CURRENCY_SPRITES, displayedProgress, el, ENTER_ICON, text, uiSprite } from "./dom.ts";
import { CARDS, IN_PLACE, cardText, type CardId } from "../cards.ts";
import { BADGES } from "../badges.ts";
import { badgeStyle } from "./badge-token.ts";
import { trainingPoints, trainingWaiting } from "../loadout.ts";
import { goalsWaiting } from "../goals.ts";
import type { BoardOverlay } from "./board-overlay.ts";
import { CountUp } from "./count-up.ts";
import { estimatedServerTime } from "../shop/clock.ts";
import { OFFERS } from "../shop/offers.ts";
import { refusal } from "../shop/transactions.ts";

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
/** An amount short enough for the HUD's narrow purse: in full below 10,000,
 * then to three figures in thousands, millions or billions (12.3K, 456M). */
export function shortAmount(n: number) {
  if (n < 10_000) return String(n);
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

/** The purse: Gems, then Gold and, inside a run, the run's Silver (the
 * forest has no use for it), counting up to what they rose to. */
function renderPurse(game: Game) {
  const now = performance.now(), instant = game.save.settings.reduceMotion;
  purse(game, "gems", game.save.gems, "Gems, kept between runs");
  purse(game, "gold", game.save.gold, "Gold, kept between runs", goldShown.show(game.save.gold, now, instant));
  purse(game, "run-silver", game.silver, "Silver, spent only inside this run", silverShown.show(game.silver, now, instant));
  el("run-silver").parentElement!.hidden = !!game.run.outside;
}

/** Each display frame: moves on the Gold and Silver still counting up. */
export function purseFrame(game: Game, now: number) {
  if (goldShown.counting(now) || silverShown.counting(now)) renderPurse(game);
}

/** Refreshes every HUD readout from game state. */
export function renderHud(game: Game, renderer: Renderer, overlay: BoardOverlay) {
  overlay.clearIfAt(game.run.player);
  renderVitals(game);
  renderFocus(game);
  renderConsumables(game);
  renderProgress(game);
  renderModeActions(game);
  text("gems-held", devAmount(game, game.save.gems));
  text("gold-held", devAmount(game, game.save.gold));
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
  renderLockedTab("delve", !!game.save.upgrades.delve, "Delve", "Unlock Into the depths in the Inspiration tree");
  renderAdButton(game);
  renderLockedTab("deck", !!game.save.upgrades.combatStance, "Deck", "Unlock Combat Stance in the Inspiration tree");
  // A new Deck lesson waits behind the button until its tutorial is done.
  const { deck, addCard } = game.save.tutorials;
  document.querySelector(`[data-tab="deck"]`)?.classList.toggle("notify", !deck || (!!game.save.upgrades.buildout && !addCard));
  document.querySelector(`[data-tab="upgrades"]`)?.classList.toggle("notify", upgradesWaiting(game) || game.treeWaiting("inspiration") || game.treeWaiting("courage") || trainingWaiting(game.save));
  renderLockedTab("gear", !!game.save.upgrades.gear, "Gear", "Unlock Gear in the Inspiration tree");
  document.querySelector(`[data-tab="gear"]`)?.classList.toggle("notify", gearWaiting(game));
  renderShopDot(game);
  renderLockedTab("defend", !!game.save.upgrades.legacy, "Defend", "Unlock An enduring legacy in the Courage tree");
}

/** Whether the Shop button shows its dot: a daily offer can be claimed, on
 * the server's time as estimated (the claim itself asks the server). */
export const shopWaiting = (game: Game) => {
  const now = estimatedServerTime(game.save.shop.clock, game.clock());
  return OFFERS.some((o) => o.daily && !refusal(game.save, o, now));
};
/** Puts the dot on the Shop buttons (the HUD's, and the one atop the
 * Upgrades, Deck and Gear pages) while `shopWaiting`. */
export const renderShopDot = (game: Game) => {
  const waiting = shopWaiting(game);
  for (const id of ["shop-open", "page-shop"]) el(id).classList.toggle("notify", waiting);
};
/** Whether the Upgrades button shows its dot: the first Inspiration has
 * been earned (so the run that paid it has ended by the time the tabs show)
 * and the page hasn't been opened since. */
export const upgradesWaiting = (game: Game) => !game.save.tutorials.upgrades && game.save.tower.inspiration > 0;
/** Whether the Gear button shows its dot: the Gear skill is owned and the
 * page hasn't been opened since. */
export const gearWaiting = (game: Game) => !game.save.tutorials.gear && !!game.save.upgrades.gear;

/** The level at the front of the XP bar, which fills with this level's
 * progress; hovering shows the XP still needed. */
function renderXp(game: Game) {
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
    el("inspect").textContent = "Follow the forest path and step onto the entrance at the top to begin again.";
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
  return `${!!game.run.outside}:${slice.tier}:${slice.tiersOpen}`;
};

/** The button's icon inside a run, by what pressing it does: text glyphs
 * (the variation selector keeps ▶ from turning into an emoji). */
const HAND_ICON = { play: "▶︎", pause: "❚❚" };

/** Inside a run the button plays and pauses the hand, showing the play or
 * pause icon; in the forest it is Enter, going straight in to start the run. */
function renderAutoButton(game: Game) {
  const button = el("auto"), inside = !game.run.outside;
  const label = inside ? (game.auto ? "Pause the hand" : "Play the hand") : "Enter";
  const icon = inside ? (game.auto ? HAND_ICON.pause : HAND_ICON.play) : "enter",
    slot = button.querySelector<HTMLElement>(".mini-icon")!;
  if (slot.dataset.icon !== icon) {
    slot.dataset.icon = icon;
    if (inside) slot.textContent = icon;
    else slot.innerHTML = ENTER_ICON;
  }
  text("auto-state", inside ? (game.auto ? "PLAYING" : "PAUSED") : "ENTER");
  button.classList.toggle("enabled", inside && game.auto);
  button.setAttribute("aria-label", label);
  button.title = label;
}

/** The hand (and its badges) the cards were last drawn for. */
let shownHand = "";
/** A hand card's tooltip: its name and text, inside a run the badge it
 * holds, and KEY SIPHON's uses so far this run. */
function handCardTitle(game: Game, id: CardId) {
  let title = `${CARDS[id].name}: ${cardText(id, game.save.upgrades)}`;
  if (game.run.outside) return title;
  const badge = game.run.badges?.[id];
  if (badge) title += `
Badge: ${BADGES[badge.id].name}, level ${badge.level}`;
  if (id === "keySiphon") {
    const uses = game.run.siphoned ?? 0;
    title += `
Used ${uses} time${uses === 1 ? "" : "s"} this run; the next use takes ${game.siphonCost} level${game.siphonCost === 1 ? "" : "s"}.`;
  }
  return title;
}
/** The level of the badge a hand card holds inside a run, on its top right corner. */
function handBadgeHtml(game: Game, id: CardId) {
  const badge = game.run.outside ? undefined : game.run.badges?.[id];
  return badge ? `<span class="hand-badge-level" style="${badgeStyle(badge.id)}" aria-hidden="true">${badge.level}</span>` : "";
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
    // without the Max HP training levels its next use takes).
    card.classList.toggle("unable", !game.run.outside && IN_PLACE.has(hand[i]) && !game.canAct(hand[i]));
  });
  el("end-run").classList.toggle("deadlocked", game.handStuck && !game.run.outside);
}

/** True when the heading still shows the other side of the forest entrance. */
export const boardHeadingStale = (game: Game) => el("board").dataset.heading !== headingKey(game);

/** HP, ATK, DEF (and the shroud, once owned), the run's Gold and keys. During a fight being played out, HP counts down
 * strike by strike. */
export function renderVitals(game: Game) {
  const p = game.run.player, hp = game.shownHp(performance.now());
  text("hp", `${wholeHp(hp)} / ${whole(p.maxHp)}`);
  renderHealthGain(game);
  el("health").style.width = `${(100 * hp) / p.maxHp}%`;
  renderHealthLoss(game.encounter ? p.hp - hp : 0, p.maxHp);
  text("attack", whole(p.attack));
  text("defense", whole(p.defense));
  text("shroud", whole(p.shroud ?? 0));
  el("shroud-stat").hidden = !game.save.upgrades.shroud;
  renderPurse(game);
  for (const k of ["yellow", "blue", "red"] as const) text(k, p.keys[k]);
  const skeletonKeys = p.skeletonKeys ?? 0;
  text("skeleton", skeletonKeys);
  el("skeleton-key").hidden = skeletonKeys < 1;
}

/** The last heal the HP bar has filled up to. */
let shownHeal = 0;
/** A potion just picked up or drunk: the red fill starts at the HP before it with the
 * HP it healed in light red beyond, and grows over the light red in a
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

/** The HP the fight being played out has cost so far, shown in purple just
 * past the HP left; once the fight settles it shrinks away over a second. */
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

/** Focus uses left, once the Focus skill is owned. */
function renderFocus(game: Game) {
  const stat = el("focus-stat");
  stat.hidden = !game.save.upgrades.focus;
  text("focus-left", game.focusLeft);
  stat.setAttribute("aria-label", `Focus: ${game.focusLeft} left`);
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

function renderConsumables(game: Game) {
  for (const c of CONSUMABLES) {
    const count = game.save.consumables[c.id] ?? 0;
    const countEl = document.querySelector<HTMLElement>(`[data-consumable-count="${c.id}"]`)!;
    const button = countEl.closest("button") as HTMLButtonElement;
    countEl.textContent = String(count);
    button.disabled = count < 1 || game.run.outside || game.fallen;
    // Potion HP research changes what it restores.
    button.title = `${c.name}: ${consumableText(c, game.stepRules)}`;
  }
}

/** Current height/depth (in the forest, the tier the entrance leads to:
 * "Tower 2"), and the reward the run's new best would pay. */
function renderProgress(game: Game) {
  const outside = !!game.run.outside,
    rules = MODES[game.mode];
  text("height-label", (outside ? rules.words.tierName : rules.words.progress).toUpperCase());
  const rawRunBest = game.run.maxHeight ?? game.run.height;
  const rawAllBest = game.save[game.mode].best;
  text("height", outside ? game.save[game.mode].tier : displayedProgress(game.run.height));
  renderRunEarned(game);
  const rewardEl = el("best-reward");
  rewardEl.hidden = rawRunBest <= rawAllBest;
  if (rewardEl.hidden) return;
  text("best-reward-val", milestones(rules, rawAllBest, rawRunBest));
  text("best-reward-type", rules.words.currency.toUpperCase());
  rewardEl.title = rules.words.newBest;
}

/** The run's Inspiration (Courage in the Delve) last shown beside the
 * height, and the mode it was shown for. */
let earnedShown = { mode: "", amount: 0 };
/** Beside the height inside a run, once it has earned any: the mode's
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

/** The ad button stands under the purse in the forest and inside a run, in both
 * modes: showing its Gems when they can be claimed, an empty space while
 * it waits. Goals takes End Run's place in the forest. */
export function renderAdButton(game: Game) {
  const inside = !game.run.outside, button = el("gem-ad") as HTMLButtonElement;
  el("section-pick").hidden = inside;
  // Only a run inside can be ended.
  el("end-run").hidden = !inside;
  button.classList.toggle("waiting", !game.gemFinder.adReady);
  button.disabled = !game.gemFinder.adReady;
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
  el("status-row").hidden = game.save.settings.infoDisplay === "popup";
  text("message", game.paused ? "Paused · take a breath." : overlay.statusLine() ?? game.message);
}

/** The undo button and how many undos are left. */
function renderUndo(game: Game) {
  const slice = game.save[game.mode],
    undo = el("undo") as HTMLButtonElement,
    count = `${slice.history.length}/${game.undoCapacity}`;
  text("undo-state", count);
  undo.setAttribute("aria-label", `Undo (${count})`);
  undo.disabled = !slice.history.length;
  // Undo needs Rehearsed steps.
  undo.hidden = !game.save.upgrades.inspirationUndos;
}

function renderLockedTab(id: string, unlocked: boolean, name: string, hint: string) {
  const tab = document.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`);
  if (!tab) return;
  tab.hidden = !unlocked;
  tab.title = unlocked ? name : hint;
  tab.setAttribute("aria-label", unlocked ? name : `${name} (locked)`);
}
