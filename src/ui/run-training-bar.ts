import { pngIcon } from "../sprites/kit.ts";
import { MODES } from "../modes.ts";
import type { Game } from "../state.ts";
import { TRAINING, TRAINING_GROUPS, type TrainingId } from "../progression/training.ts";
import { autoTrains, runTrainingBulk, runTrainingOffer, runTrainingValue } from "../progression/run-training.ts";
import { bindBuyQuantity, buyQuantityHtml, runCount } from "./buy-quantity-select.ts";
import { trainingText, runTrainingOpen } from "../progression/loadout.ts";
import { seesAll } from "../access.ts";
import { arcaniteIcon, DECK_ICON, el, itemSprite, POINTER_SVG, uiSprite } from "./dom.ts";
import { arcanum, RUN_TOGGLES, type ArcanumId } from "../arcana/arcana.ts";
import type { HeldArcanum } from "../game/arcana-desk.ts";
import { priceAmount, sparkRed } from "./hud.ts";
import { shortAmount } from "../whole.ts";
import { levelSkipsOf } from "../enemies/level-skips.ts";

type Group = keyof typeof TRAINING_GROUPS;
/** Each group's button icon. */
const GROUP_ICONS: Record<Group, string> = {
  offense: itemSprite("upgrade_attack", "ui-sprite group-sprite"),
  defense: itemSprite("upgrade_defense", "ui-sprite group-sprite"),
  utility: uiSprite("gold", "ui-sprite group-sprite"),
};
const silverIcon = () => uiSprite("gold", "ui-sprite silver-sprite");
/** The arrow on the Auto tab's cards: its hand plays by itself. */
const AUTO_ARROW = pngIcon("ui-auto-play", "auto-arrow");
/** Auto-Train's marks: a green up arrow where it buys (a group switched
 * on, a row it buys), a red one crossed out on a group switched off. */
const AUTO_ON = pngIcon("ui-auto-train-on", "auto-icon"), AUTO_OFF = pngIcon("ui-auto-train-off", "auto-icon");
/** How long the number of toggles left shows after a toggle, in ms. */
const TOGGLES_SHOWN_MS = 900;
/** What the bar shows in the hand's place: the hand (null), the Manual
 * hand, a Training group's rows, or the run's Arcana. */
type Open = Group | "manual" | "arcana" | null;

/** The run's training bar under the hand: tabs, Hand first (named Auto,
 * its cards wearing an arrow, once Auto-Climb is owned or the run holds a
 * Manual hand), then Manual while the run holds a Manual hand, which shows
 * those cards in the hand's place, to press, then a button
 * for each Training group, each only its icon while not selected, so the
 * bar fits a phone beside Buy Quantity, and its icon and name while
 * selected, then Arcana once the run holds any: their cards, each with a
 * switch, in the hand's place. Hand, selected as a run starts, shows the hand; a group shows
 * that group's rows in the hand's place, a card each, scrolled sideways, to
 * buy a rank for this run with Silver. Pressing or hovering a card's face
 * shows what it trains and its level; pressing it again hides that. The bar
 * shows once On the Job is owned; the first run after it teaches the bar
 * (`lesson`): a note over the hand and a hand pointing at a tab, the hand
 * paused, until the player opens a group and goes back to Hand. */
export class RunTrainingBar {
  /** The group shown in the hand's place, if any: none is the Hand tab. */
  private open: Open = null;
  /** The run the tabs were last drawn for, by mode and seed: a new one
   * starts on Hand. */
  private run = "";
  /** The rows the cards were last built for. */
  private shown = "";
  /** The hand tab's contents as last drawn. */
  private handTab = "";
  /** The card whose details show, if any. */
  private tipFor: HTMLElement | null = null;
  /** Whether a press (not a mouse passing over) showed the details: the
   * next press on that card hides them. */
  private tipPressed = false;
  /** Whether the player opened a group while the lesson showed: closing it
   * then finishes the lesson. */
  private triedGroup = false;
  /** Whether the lesson paused the hand when it began: finishing the lesson
   * sets it playing again. */
  private pausedForLesson = false;

  private gameSource: () => Game;
  private get game() { return this.gameSource(); }
  constructor(game: Game | (() => Game), private changed: () => void, private available: (id: TrainingId) => boolean = () => true, private showArcanum: (held: HeldArcanum) => void = () => {}) {
    this.gameSource=typeof game==="function"?game:()=>game;
    const bar = el("training-bar");
    bar.innerHTML = `<button type="button" data-run-tab="hand" aria-pressed="true"></button><button type="button" data-run-tab="manual" aria-pressed="false" aria-label="Manual" title="Your Manual hand: its cards act only when you tap them" hidden>${DECK_ICON}<span class="group-name">Manual</span></button>` + (Object.entries(TRAINING_GROUPS) as [Group, string][])
      .map(([group, name]) => `<button type="button" data-run-group="${group}" aria-pressed="false" aria-label="${name}">${GROUP_ICONS[group]}<span class="group-name">${name}</span></button>`)
      .join("") + `<button type="button" data-run-tab="arcana" aria-pressed="false" aria-label="Arcana" title="Your Arcana: their cards switch them on and off for this run" hidden>${arcaniteIcon("arcanite-icon group-sprite")}<span class="group-name">Arcana</span></button><span class="run-buy-quantity"></span>`;
    bar.onclick = (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-run-group], [data-run-tab]");
      if (button && !button.disabled) this.select((button.dataset.runGroup as Group | undefined) ?? (button.dataset.runTab === "manual" || button.dataset.runTab === "arcana" ? button.dataset.runTab : null));
    };
    this.bindCards(el("run-drills"));
    // The details' Auto-Train switch.
    el("drill-tip").onclick = (e) => {
      const toggle = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-auto-train]");
      if (!toggle) return;
      this.game.training.toggleRunAuto(toggle.dataset.autoTrain as TrainingId);
      this.changed();
      this.refreshTip();
    };
    // A press anywhere but the cards and their details closes the details a press opened.
    document.addEventListener("pointerdown", (e) => {
      if (!this.tipPressed || !this.tipFor) return;
      const target = e.target as Node;
      if (!el("drill-tip").contains(target) && !el("run-drills").contains(target)) this.hideTip();
    });
  }

  /** Whether Auto-Train is owned, so its switches and marks show. */
  private get autoTrainOwned() {
    return !!this.game.save.upgrades.autoTrain;
  }

  /** Shows `group` (or the Manual hand) in the hand's place, or the hand
   * for none; in the lesson, going back to the hand from a group opened
   * finishes it. */
  private select(group: Open) {
    // With Auto-Train, pressing the open group's button again switches its
    // auto-training on or off.
    if (group === this.open && this.group && this.autoTrainOwned) {
      this.game.training.toggleRunAutoGroup(this.group);
      return this.changed();
    }
    if (group === this.open) return;
    this.open = group;
    if (this.lesson && this.group) this.triedGroup = true;
    else if (this.lesson && this.triedGroup) this.finishLesson();
    this.hideTip();
    this.changed();
  }

  /** A card's price buys a rank (red sparks when it can't); its face, or a
   * mouse over it, shows its details, and a second press on it hides them. */
  private bindCards(cards: HTMLElement) {
    cards.onclick = (e) => {
      const target = e.target as HTMLElement, buy = target.closest<HTMLButtonElement>("[data-run-train]");
      if (buy) return this.buy(buy);
      const toggle = target.closest<HTMLButtonElement>("[data-arcana-toggle]");
      if (toggle) return this.toggleArcanum(toggle);
      const arcanumCard = target.closest<HTMLElement>(".arcana-card");
      if (arcanumCard) {
        const held = this.game.arcana.held.find((h) => h.id === arcanumCard.dataset.arcanum);
        return void (held && this.showArcanum(held));
      }
      const card = target.closest<HTMLElement>(".drill-card");
      if (!card) return;
      if (card === this.tipFor && this.tipPressed) return this.hideTip();
      this.showTip(card, true);
    };
    cards.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse" || this.tipPressed) return;
      const card = (e.target as HTMLElement).closest<HTMLElement>(".drill-card:not(.arcana-card)");
      if (card && card !== this.tipFor) this.showTip(card);
    });
    // A mouse leaving the card hides its details, even into the strip's
    // empty space past the last card.
    // Details a press opened stay, so their switch can be reached.
    cards.addEventListener("pointerout", (e) => {
      if (e.pointerType !== "mouse" || !this.tipFor || this.tipPressed) return;
      if (!this.tipFor.contains(e.relatedTarget as Node | null)) this.hideTip();
    });
    cards.addEventListener("pointerleave", () => {
      if (!this.tipPressed) this.hideTip();
    });
    cards.addEventListener("scroll", () => this.hideTip());
    // With no scrollbar shown, a mouse wheel scrolls the cards sideways.
    cards.addEventListener("wheel", (e) => {
      if (!e.deltaY || cards.scrollWidth <= cards.clientWidth) return;
      cards.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  private buy(button: HTMLButtonElement) {
    if (!this.game.trainInRun(button.dataset.runTrain as TrainingId, this.game.training.buyQuantityFor("run"))) sparkRed(button, this.game.save.settings.reduceMotion);
    this.changed();
    this.refreshTip();
  }

  /** The Training group open, if one is. */
  private get group() {
    return this.open === "manual" || this.open === "arcana" ? null : this.open;
  }

  /** Whether the Manual hand shows in the hand's place: its tab selected,
   * inside a run that holds one. */
  get manualOpen() {
    return this.open === "manual";
  }

  /** Whether the run holds a Manual hand, to show and press. */
  private get holdsManual() {
    return !this.game.run.outside && this.game.manualHand.length > 0;
  }

  /** Shows the bar inside a run, and the open group's cards in the hand's place. */
  render() {
    const game = this.game, training = !game.run.outside && game.trainsOnTheJob, arcana = game.arcana.held, inside = training || this.holdsManual || arcana.length > 0;
    el("training-bar").hidden = !inside;
    // Hand is selected outside a run and as one starts, and once the open
    // group has no rows to train (or the run no Manual hand).
    const run = `${game.mode}:${game.run.seed}`;
    const gone = this.open === "manual" ? !this.holdsManual : this.open === "arcana" ? !arcana.length : this.open && !this.rows(this.open).length;
    if (!inside || run !== this.run || gone) this.open = null;
    this.run = run;
    this.renderTabs(training);
    this.renderQuantity();
    const group = this.group, rows = group ? this.rows(group) : [];
    document.querySelector("nav")!.classList.toggle("drilling", !!group || this.open === "arcana");
    if (this.open === "arcana") this.renderArcana(arcana);
    else this.renderCards(rows);
    this.renderLesson(inside);
  }

  /** The hand's tab, named Auto with an arrow on its cards once Auto-Climb
   * is owned or the run holds a Manual hand, and Hand before; Manual's tab,
   * only while the run holds a Manual hand; each lit while selected. Each
   * group's button (none in a run that shows the bar only for its Manual
   * hand, before On the Job, `training`): closed with no rows to train
   * (Utility hidden), lit while open. */
  private renderTabs(training: boolean) {
    const bar = el("training-bar"), hand = bar.querySelector<HTMLButtonElement>(`[data-run-tab="hand"]`)!;
    const manual = bar.querySelector<HTMLButtonElement>(`[data-run-tab="manual"]`)!, auto = this.game.autoClimbs || this.holdsManual;
    const html = auto
      ? `<span class="tab-icon">${DECK_ICON}${AUTO_ARROW}</span><span class="group-name">Auto</span>`
      : `${DECK_ICON}<span class="group-name">Hand</span>`;
    if (this.handTab !== html) {
      this.handTab = html;
      hand.innerHTML = html;
      hand.setAttribute("aria-label", auto ? "Auto" : "Hand");
      hand.title = auto ? "Your Auto hand: its cards play by themselves" : "Your card hand";
    }
    hand.classList.toggle("selected", !this.open);
    hand.setAttribute("aria-pressed", String(!this.open));
    manual.hidden = !this.holdsManual;
    manual.classList.toggle("selected", this.open === "manual");
    manual.setAttribute("aria-pressed", String(this.open === "manual"));
    const arcana = bar.querySelector<HTMLButtonElement>(`[data-run-tab="arcana"]`)!;
    arcana.hidden = !this.game.arcana.held.length;
    arcana.classList.toggle("selected", this.open === "arcana");
    arcana.setAttribute("aria-pressed", String(this.open === "arcana"));
    document.querySelectorAll<HTMLButtonElement>("[data-run-group]").forEach((b) => {
      const group = b.dataset.runGroup as Group, open = this.rows(group).length > 0;
      // Utility stays hidden until one of its rows can be trained.
      b.hidden = !training || (group === "utility" && !open);
      b.disabled = !open;
      b.title = open ? `${TRAINING_GROUPS[group]} training for this ${MODES[this.game.mode].words.run}, with Silver` : `No ${TRAINING_GROUPS[group]} training unlocked yet`;
      b.classList.toggle("selected", group === this.open);
      b.setAttribute("aria-pressed", String(group === this.open));
      this.renderBadge(b, group);
    });
  }

  /** A group button's Auto-Train mark in its top-left corner, once the
   * skill is owned: a green up arrow while it buys from that group, a red
   * one crossed out while it doesn't. */
  private renderBadge(b: HTMLButtonElement, group: Group) {
    const owned = this.autoTrainOwned, on = owned && this.game.training.runAutoGroupOn(group);
    let badge = b.querySelector<HTMLElement>(".auto-badge");
    if (!owned) {
      if (badge) b.setAttribute("aria-label", TRAINING_GROUPS[group]);
      return void badge?.remove();
    }
    if (!badge) {
      b.insertAdjacentHTML("beforeend", `<span class="auto-badge"></span>`);
      badge = b.querySelector<HTMLElement>(".auto-badge")!;
    }
    if (badge.dataset.on !== String(on)) {
      badge.dataset.on = String(on);
      badge.innerHTML = on ? AUTO_ON : AUTO_OFF;
    }
    b.setAttribute("aria-label", `${TRAINING_GROUPS[group]}, Auto-Train ${on ? "on" : "off"}`);
    if (owned && group === this.open) b.title = `Auto-Train ${on ? "buys" : "skips"} ${TRAINING_GROUPS[group]} each floor: tap again to turn it ${on ? "off" : "on"}`;
  }

  /** The Buy Quantity dropdown, built again only when its choices change. */
  private renderQuantity() {
    const slot = el("training-bar").querySelector<HTMLElement>(".run-buy-quantity")!;
    const html = buyQuantityHtml(this.game.training.buyQuantities, this.game.training.buyQuantityFor("run"));
    if (slot.dataset.html !== html) {
      slot.dataset.html = html;
      slot.innerHTML = html;
      // Buy Quantity, at the right of the group buttons once the skill is owned.
      bindBuyQuantity(slot, (q) => {
        this.game.training.setBuyQuantity(q, "run");
        this.changed();
      });
    }
    slot.hidden = !html;
  }

  /** The open group's cards, built again only when its rows change. */
  private renderCards(rows: TrainingId[]) {
    // Built again too as Auto-Train is bought, for its marks.
    const key = rows.join() + (this.autoTrainOwned ? ":auto" : "");
    if (key !== this.shown) {
      this.shown = key;
      this.hideTip();
      el("run-drills").innerHTML = rows.map((id) => {
        const row = TRAINING.find((t) => t.id === id)!;
        return `<div class="drill-card" role="listitem" data-drill="${id}">${this.autoTrainOwned ? `<span class="auto-mark" hidden>${AUTO_ON}</span>` : ""}<b class="drill-name">${"short" in row ? row.short : row.name}</b><span class="drill-value"></span><button type="button" class="drill-buy" data-run-train="${id}"></button></div>`;
      }).join("");
    }
    for (const id of rows) this.fill(id);
  }

  /** The run's Arcana cards in the hand's place: built again only when the
   * arcana held change; their values and switches kept up on every redraw. */
  private renderArcana(held: HeldArcanum[]) {
    const key = `arcana:${held.map((h) => h.id).join()}`;
    if (key !== this.shown) {
      this.shown = key;
      this.hideTip();
      el("run-drills").innerHTML = held.map(({ id }) => `<div class="drill-card arcana-card" role="listitem" data-arcanum="${id}"><b class="drill-name">${arcanum(id).name}</b><span class="drill-value"></span>${arcanum(id).trigger.on === "cooldown" ? `<div class="arcana-cooldown" role="progressbar" aria-label="Cooldown" aria-valuemin="0"><i></i><span></span></div>` : ""}<button type="button" class="arcana-switch" role="switch" data-arcana-toggle="${id}" aria-label="${arcanum(id).name}"><i></i></button></div>`).join("");
    }
    for (const h of held) {
      const card = document.querySelector<HTMLElement>(`.arcana-card[data-arcanum="${h.id}"]`)!, on = this.game.arcana.isOn(h.id), value = this.game.arcana.cardValue(h);
      card.classList.toggle("off", !on);
      card.querySelector(".drill-value")!.textContent = value.damage === undefined ? value.text ?? "" : `${shortAmount(value.damage)} DMG`;
      card.querySelector(".arcana-switch")!.setAttribute("aria-checked", String(on));
      const cooldown = this.game.arcana.cooldown(h), bar = card.querySelector<HTMLElement>(".arcana-cooldown");
      if (cooldown && bar) {
        // Fills as the cooldown runs down, the turns left at its right end.
        const done = cooldown.turns - cooldown.left;
        bar.setAttribute("aria-valuemax", String(cooldown.turns));
        bar.setAttribute("aria-valuenow", String(done));
        bar.title = `${cooldown.left} ${cooldown.left === 1 ? "turn" : "turns"} until it strikes`;
        bar.querySelector("i")!.style.width = `${(100 * done) / cooldown.turns}%`;
        bar.querySelector("span")!.textContent = String(cooldown.left);
      }
    }
  }

  /** A press on an arcanum's switch: on or off, the toggles left rising off it, or red sparks with none left. */
  private toggleArcanum(button: HTMLButtonElement) {
    const game = this.game;
    if (!game.arcana.toggle(button.dataset.arcanaToggle as ArcanumId)) return sparkRed(button, game.save.settings.reduceMotion);
    this.changed();
    const left = game.arcana.togglesLeft;
    button.closest(".arcana-card")!.querySelector(".arcana-toggles-left")?.remove();
    button.insertAdjacentHTML("afterend", `<span class="arcana-toggles-left" title="Toggles left this run, of ${RUN_TOGGLES}">${left}</span>`);
    const shown = button.nextElementSibling!;
    setTimeout(() => shown.remove(), TOGGLES_SHOWN_MS);
  }

  /** Ends the lesson, and plays the hand on if the lesson paused it. */
  private finishLesson() {
    this.game.save.tutorials.onTheJob = true;
    if (this.pausedForLesson && !this.game.auto) this.game.toggleAuto();
    this.pausedForLesson = false;
  }

  /** Whether the bar's lesson waits: the first run inside after On the Job. */
  private get lesson() {
    return !!this.game.save.upgrades.onTheJob && !this.game.save.tutorials.onTheJob;
  }

  /** The lesson's note, over the hand, and its hand pointing down at the
   * open group's button, or the first that opens; it waits while the
   * Auto-Climb lesson's note shows, until that is dismissed. */
  private renderLesson(inside: boolean) {
    const bar = el("training-bar");
    if (!inside || !this.lesson || this.game.boardLesson === "autoClimb") {
      bar.querySelector(".job-tip")?.remove();
      bar.querySelector(".job-pointer")?.remove();
      return;
    }
    const { note, pointer } = this.lessonParts(bar), text = this.lessonText();
    if (note.dataset.text !== text) {
      note.dataset.text = text;
      note.innerHTML = text;
    }
    // The hand above lifts the note clear of its cards.
    note.style.bottom = `${document.querySelector("nav")!.offsetHeight + 8}px`;
    // Open, a group points back to Hand; on Hand, at the first group that opens.
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-run-group]"));
    const at = this.group ? bar.querySelector<HTMLButtonElement>(`[data-run-tab="hand"]`)! : buttons.find((b) => !b.disabled) ?? buttons[0];
    // The selected button is wider than the rest: point at its middle.
    pointer.style.left = `${at.offsetLeft + at.offsetWidth / 2}px`;
  }

  /** The lesson's note and pointing hand, laid over the bar when it
   * begins; beginning pauses the hand, so the player can take it in. */
  private lessonParts(bar: HTMLElement) {
    const note = bar.querySelector<HTMLElement>(".job-tip"), pointer = bar.querySelector<HTMLElement>(".job-pointer");
    if (note && pointer) return { note, pointer };
    bar.insertAdjacentHTML("beforeend", `<div class="job-tip" role="status"></div><span class="job-pointer${this.game.save.settings.reduceMotion ? " still" : ""}">${POINTER_SVG}</span>`);
    if (this.game.auto) {
      this.game.toggleAuto();
      this.pausedForLesson = true;
      // The HUD drew before the bar: redraw it with the hand paused.
      queueMicrotask(this.changed);
    }
    return { note: bar.querySelector<HTMLElement>(".job-tip")!, pointer: bar.querySelector<HTMLElement>(".job-pointer")! };
  }

  private lessonText() {
    return this.group
      ? `<b>Training for this ${MODES[this.game.mode].words.run}</b><p>Tap a card's price to buy a rank with ${silverIcon()} Silver. Tap HAND to bring your cards back.</p>`
      : `<b>Train on the Job</b><p>Spend the ${silverIcon()} Silver you find on upgrades that raise your stats for the rest of this ${MODES[this.game.mode].words.run}. Tap a menu beside HAND to open it.</p>`;
  }

  /** The rows of `group` the hero can train in this run (the shot rows
   * only while the hand holds ARCHER); with Access to Everything, all of
   * them, those it can't train shown locked. */
  private rows(group: Group): TrainingId[] {
    const all = seesAll(this.game.save);
    return TRAINING.filter((t) => t.group === group && this.available(t.id) && (all || runTrainingOpen(t, this.game.save, this.game.held))).map((t) => t.id);
  }

  /** One card's value and price (for the ranks the Buy Quantity buys, past
   * x1 their count in the button's corner), its button faded while the Silver isn't
   * there, and the whole card greyed at its highest. */
  private fill(id: TrainingId) {
    const game = this.game, card = document.querySelector<HTMLElement>(`[data-drill="${id}"]`)!;
    const offer = runTrainingOffer(game.save, game.run, id), { value, unit } = runTrainingValue(game.save, game.run, id, game.mode);
    const q = game.training.buyQuantityFor("run"), bulk = runTrainingBulk(game.save, game.run, id, q, game.free ? Infinity : game.silver);
    const short = offer.open && !offer.maxed && !bulk.affordable;
    card.classList.toggle("short", short);
    card.classList.toggle("maxed", offer.maxed);
    card.classList.toggle("locked", !offer.open);
    // Auto-Train's arrow on a row it buys each floor (its switch and its group's on).
    const mark = card.querySelector<HTMLElement>(".auto-mark");
    if (mark) mark.hidden = !autoTrains(game.save, id);
    // Range, Speed, ATK / m and Targets without their units, which their tooltips give, so the value fits the card.
    card.querySelector(".drill-value")!.textContent = trainingText(value, unit, true);
    const buy = card.querySelector<HTMLButtonElement>(".drill-buy")!;
    const label = !offer.open ? "Locked" : offer.maxed ? "Max" : `${runCount(q, bulk.count)}${silverIcon()}<b>${priceAmount(bulk.cost, 10_000)}</b>`;
    if (buy.dataset.label !== label) {
      buy.dataset.label = label;
      buy.innerHTML = label;
    }
    // Short of Silver it still answers a press, with red sparks.
    buy.disabled = offer.maxed || !offer.open;
    buy.setAttribute("aria-label", !offer.open ? `${offer.row.name} is locked` : offer.maxed ? `${offer.row.name} is at its highest level` : `Train ${offer.row.name} for this ${MODES[this.game.mode].words.run}, ${bulk.count === 1 ? "one rank" : `${bulk.count} ranks`}, for ${bulk.cost} Silver`);
  }

  /** Shows `card`'s details; `pressed`, they stay until pressed away. */
  private showTip(card: HTMLElement, pressed = false) {
    this.tipFor = card;
    this.tipPressed = pressed;
    this.refreshTip();
  }
  /** The card's name, what it trains, its level of the most it reaches and,
   * for a Level Skip, the floors it has skipped this run, over the card. */
  private refreshTip() {
    const card = this.tipFor, tip = el("drill-tip");
    if (!card?.isConnected) return this.hideTip();
    const offer = runTrainingOffer(this.game.save, this.game.run, card.dataset.drill as TrainingId);
    const skips = levelSkipsOf(this.game.run, offer.row.id);
    // Max HP also shows how far Lifespring's Health Bonus has multiplied it.
    const spring = offer.row.id === "hp" ? this.game.arcana.lifespringStats : undefined;
    tip.innerHTML = `<b>${offer.row.name}</b><p>${offer.row.description}</p><small>Level ${offer.level} of ${offer.max.toLocaleString("en-US")}${offer.bought ? ` · ${offer.bought} bought this run` : ""}${skips === null ? "" : ` · ${skips.toLocaleString("en-US")} ${skips === 1 ? "floor" : "floors"} skipped this run`}${spring ? ` · Lifespring ×${Number(spring.health.toFixed(2))} of ×${spring.effects.healthLimit}` : ""}</small>${this.autoSwitch(offer.row.id)}`;
    // Details a press opened take presses, for their switch.
    tip.classList.toggle("pinned", this.tipPressed);
    tip.hidden = false;
    const box = card.getBoundingClientRect(), width = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left + box.width / 2 - width / 2))}px`;
    tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 8)}px`;
  }
  /** The details' Auto-Train switch for row `id`, once the skill is owned:
   * on, the row is bought each floor while its group's switch is on too. */
  private autoSwitch(id: TrainingId) {
    if (!this.autoTrainOwned) return "";
    const on = this.game.training.runAutoOn(id), group = TRAINING.find((t) => t.id === id)!.group;
    const note = on && !this.game.training.runAutoGroupOn(group) ? `<small class="auto-note">${TRAINING_GROUPS[group]} is off: tap its button again to turn it on.</small>` : "";
    return `<div class="auto-train-row"><button type="button" class="arcana-switch" role="switch" data-auto-train="${id}" aria-checked="${on}" aria-label="Auto-train each floor"><i></i></button><span>Auto-train each floor</span></div>${note}`;
  }
  private hideTip() {
    this.tipFor = null;
    this.tipPressed = false;
    el("drill-tip").hidden = true;
  }
}
