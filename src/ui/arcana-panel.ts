import { pngIcon } from "../sprites/kit.ts";
import { ARCANUM_PRICES, arcanum, enhancementsOf, levelsOf, nextStep, valuesAt, type ArcanumId, type AttributeValues } from "../arcana/arcana.ts";
import { augmentOf, boon } from "../shrines.ts";
import type { HeldArcanum } from "../game/arcana-desk.ts";
import type { AppContext } from "./app.ts";
import { askForArcanite, askForGems, closesOnBackdrop, confirmAction, helpButton, showHelp } from "./dialogs.ts";
import { arcaniteIcon, el, gemIcon } from "./dom.ts";
import { ARCANUM_RESPEC_GEMS } from "../economy/gems.ts";
import { priceAmount } from "./hud.ts";
import { shortAmount } from "../whole.ts";
import { RESEARCH, RESEARCH_TARGETS, researched } from "../progression/archives.ts";
import type { Save } from "../save/shape.ts";
import { ArcanaLabScene } from "./arcana-lab-scene.ts";

/** Each arcanum's picture. */
export const ARCANUM_ICONS: Record<ArcanumId, string> = {
  aurumBloom: pngIcon("arcana-aurum-bloom", "arcanum-icon"),
  thunderbolt: pngIcon("arcana-thunderbolt", "arcanum-icon"),
  overseer: pngIcon("arcana-overseer", "arcanum-icon"),
  lifespring: pngIcon("arcana-lifespring", "arcanum-icon"),
  timeDilation: pngIcon("arcana-time-dilation", "arcanum-icon"),
  phantasm: pngIcon("arcana-phantasm", "arcanum-icon"),
  necroticFrost: pngIcon("arcana-necrotic-frost", "arcanum-icon"),
  voidwell: pngIcon("arcana-voidwell", "arcanum-icon"),
  ricochetShot: pngIcon("arcana-ricochet-shot", "arcanum-icon"),
};

/** The price of a purchase: its amount, then the Arcanite icon. */
const price = (amount: number) => `<span class="price"><b>${priceAmount(amount)}</b>${arcaniteIcon()}</span>`;

/** A table of rows in a rounded box under `heading`, if it has any. */
const boxedTable = (heading: string, rows: readonly (readonly [string, string])[]) => rows.length
  ? `<div class="arcana-box"><h3>${heading}</h3><table class="arcana-table"><tbody>${rows.map(([name, value]) => `<tr><td>${name}</td><td>${value}</td></tr>`).join("")}</tbody></table></div>`
  : "";

/** What research adds to an arcanum's summary: Overseer Gold Bonus's Gold and Phantasm Rotation Speed's turning, once researched. */
function researchedText(id: ArcanumId, values: AttributeValues, save: Save) {
  const spin = id === "phantasm" ? researched(save.archives, "phantasmSpin") : 100;
  if (spin !== 100) return ` Research turns the ring ${spin / 100}° a turn instead.`;
  const tenths = id === "overseer" ? researched(save.archives, "overseerGold") : 10;
  return tenths > 10 ? ` Enemies killed in ${values[2] === 1 ? "it" : "them"} drop ×${tenths / 10} Gold.` : "";
}

/** The Archives' projects that raise what an arcanum gives. */
const ARCANUM_RESEARCH: Partial<Record<ArcanumId, readonly (keyof typeof RESEARCH & keyof typeof RESEARCH_TARGETS)[]>> = {
  ricochetShot: ["ricochetShock", "shockChance", "shockMultiplier"],
  thunderbolt: ["thunderboltAmplify", "thunderboltExpansion"],
  phantasm: ["phantasmBlast", "phantasmSpin", "phantasmStun"],
  necroticFrost: ["frostRadius", "necroFreeze", "necroFreezeChance", "necroFreezeTurns"],
  timeDilation: ["dilationDuration", "dilationRange", "dilationGuard", "dilationGuardPercent"],
  lifespring: ["lifespringHealth", "lifespringGold", "lifespringAmplify", "lifespringCells"],
  aurumBloom: ["aurumBloomBonus", "aurumBloomChance"],
  voidwell: ["voidwellDamage", "voidwellGold", "extraVoidwell"],
};
/** An arcanum's Research box: what each of its projects has reached, untrained values included; none without projects. */
const arcanumResearch = (id: ArcanumId, save: Save) =>
  boxedTable("Research", (ARCANUM_RESEARCH[id] ?? []).map((r) => [RESEARCH[r].name, RESEARCH_TARGETS[r].shown(researched(save.archives, r))]));

/** The top of an arcanum's information: its name, its icon, what it does. */
const aboutHtml = (id: ArcanumId, values: AttributeValues, save: Save) =>
  `<h2>${arcanum(id).name}</h2><div class="arcana-info-icon">${ARCANUM_ICONS[id]}</div><p>${arcanum(id).summary(values)}${researchedText(id, values, save)}</p>`;

/** The Gear page's Arcana tab: the button that opens a choice of arcana, and
 * each one bought in a row of its attributes to upgrade. */
export class ArcanaPanel {
  constructor(private ctx: AppContext, private changed: () => void) {}

  private get desk() {
    return this.ctx.game.arcana;
  }

  html() {
    const desk = this.desk, cost = desk.price;
    const select = cost === null ? "" : `<button id="arcana-select" class="arcana-select${desk.affords(cost) ? "" : " short"}" aria-label="Select Arcanum, ${cost} Arcanite">Select Arcanum ${price(cost)}</button>`;
    // Until the first arcanum's price is held, how Arcanite is earned.
    const earning = this.ctx.game.save.arcanite < ARCANUM_PRICES[0]
      ? `<p class="arcana-intro">Complete weekly missions and enter the Tournament to earn arcanite ${arcaniteIcon()}. Use it here to unlock powerful magic spells called Arcana.</p>`
      : "";
    return `<div class="arcana-head"><h3>Arcana</h3>${helpButton("About Arcana", "arcana-help")}</div>${earning}${select}${this.respecHtml()}${desk.owned.map((id) => this.rowHtml(id)).join("")}`;
  }

  /** Respec, once Arcana Respec is owned and an arcanum bought: its Gem
   * price red while short; closed inside a run and once this event's
   * respec is spent. */
  private respecHtml() {
    const { ctx, desk } = this, game = ctx.game;
    if (!desk.respecUnlocked || !desk.owned.length) return "";
    const inside = !game.run.outside, used = desk.respecUsed, short = !game.free && game.save.gems < ARCANUM_RESPEC_GEMS;
    const title = inside ? "Respec in the forest" : used ? "One respec each event: this event's is spent" : "Return all the Arcanite invested in one arcanum";
    const cost = game.free ? "free" : `${gemIcon()} <b>${ARCANUM_RESPEC_GEMS}</b>`;
    return `<button id="arcana-respec" class="arcana-select${short ? " short" : ""}" ${inside || used ? "disabled" : ""} title="${title}" aria-label="${game.free ? "Respec an arcanum, free" : `Respec an arcanum for ${ARCANUM_RESPEC_GEMS} Gems`}">Respec Arcanum · ${cost}</button>`;
  }

  private rowHtml(id: ArcanumId) {
    const levels = levelsOf(this.ctx.game.save.arcana, id);
    return `<article class="arcana-row" data-arcana-row="${id}"><h3>${arcanum(id).name}</h3><div class="arcana-row-body"><div class="arcana-row-icon">${ARCANUM_ICONS[id]}</div>${arcanum(id).attributes.map((a, i) => {
      const next = nextStep(id, i, levels[i]!), value = a.steps[levels[i]!]![0];
      const state = !next ? " maxed" : this.desk.affords(next.cost) ? "" : " short";
      return `<button class="arcana-attr${state}" data-arcana-up="${id}:${i}" aria-label="${a.name}, ${a.shown(value)}, ${next ? `upgrade for ${next.cost} Arcanite` : "at its highest level"}"><span class="arcana-attr-name">${a.name}</span><b>${a.shown(value)}</b><hr><span class="arcana-attr-cost">${next ? price(next.cost) : "Max"}</span></button>`;
    }).join("")}</div></article>`;
  }

  bind() {
    const { ctx, desk } = this, gear = el("gear");
    el("arcana-help").onclick = () => showHelp(ctx, "GEAR", "Arcana", `<p>Arcana are mighty spells bought with Arcanite and kept for good. Each has three attributes to upgrade.</p><p>Each new arcanum is chosen from up to three drawn at random from those you don't own, each as likely as any other. The choice stays until you buy one or reroll it, and the next arcanum costs more the more you own.</p><p>Every arcanum you hold works at once in every run. Inside a run the Arcana tab switches each on and off, up to 40 times a run.</p><p class="hint">Arcanite comes from weekly missions, tournaments, Goals, Event stores and the Shop.</p>`);
    const select = document.getElementById("arcana-select");
    if (select) select.onclick = () => (desk.affords(desk.price!) ? this.showChoice() : askForArcanite(ctx));
    const respec = document.getElementById("arcana-respec");
    if (respec) respec.onclick = () => (ctx.game.free || ctx.game.save.gems >= ARCANUM_RESPEC_GEMS ? this.showRespec() : askForGems(ctx, ARCANUM_RESPEC_GEMS));
    gear.querySelectorAll<HTMLButtonElement>("[data-arcana-up]").forEach((b) => (b.onclick = () => {
      const [id, attribute] = b.dataset.arcanaUp!.split(":") as [ArcanumId, string], answer = desk.upgrade(id, Number(attribute));
      if (answer === "short") askForArcanite(ctx);
      if (answer === "done") this.changed();
    }));
    gear.querySelectorAll<HTMLElement>("[data-arcana-row]").forEach((row) => (row.onclick = (e) => {
      if (!(e.target as HTMLElement).closest("button")) showArcanum(ctx, row.dataset.arcanaRow as ArcanumId);
    }));
  }

  /** The choice waiting, to buy one from, or to reroll. A press outside it, or
   * leaving, keeps the choice as it is. */
  private showChoice() {
    const { ctx, desk } = this, modal = ctx.modal, reroll = desk.rerollPrice;
    modal.innerHTML = `<small>ARCANA</small><h2>Select an Arcanum</h2><div class="arcana-options">${desk.offer().map((id) =>
      `<button class="arcana-option" data-arcana-buy="${id}">${ARCANUM_ICONS[id]}<span><b>${arcanum(id).name}</b><small>${arcanum(id).summary(valuesAt(id, [0, 0, 0]))}</small></span></button>`).join("")}</div>${desk.canReroll
      ? `<div class="dialog-actions"><button id="arcana-reroll" class="${desk.affords(reroll) ? "" : "short"}" aria-label="Reroll, ${reroll} Arcanite">Reroll ${price(reroll)}</button></div>` : ""}`;
    if (!modal.open) modal.showModal();
    closesOnBackdrop(modal);
    modal.querySelectorAll<HTMLButtonElement>("[data-arcana-buy]").forEach((b) => (b.onclick = () => this.askBuy(b.dataset.arcanaBuy as ArcanumId)));
    const button = document.getElementById("arcana-reroll");
    if (button) button.onclick = () => (desk.affords(reroll) ? this.askReroll() : askForArcanite(ctx));
  }

  /** Buy `id`, on confirmation: its effect playing on a loop, what it does,
   * and each attribute's first value and next; Back returns to the choice. */
  private askBuy(id: ArcanumId) {
    const { ctx, desk } = this, modal = ctx.modal, cost = desk.price ?? 0, free = ctx.game.free, def = arcanum(id);
    const label = free ? "Buy · free" : `Buy · ${arcaniteIcon()} <b>${priceAmount(cost)}</b>`;
    modal.innerHTML = `<small>ARCANA</small><div class="arcana-info"><h2>${def.name}</h2><canvas id="arcana-preview" class="arcana-preview" width="528" height="528" role="img" aria-label="${def.name} in play"></canvas><p>${def.summary(valuesAt(id, [0, 0, 0]))}</p>${attributeTable(id, [0, 0, 0], "First")}</div><div class="dialog-actions"><button id="arcana-buy-back">Back</button><button id="arcana-buy-confirm" class="${free || desk.affords(cost) ? "" : "short"}" aria-label="${free ? "Buy, free" : `Buy for ${cost} Arcanite`}">${label}</button></div>`;
    if (!modal.open) modal.showModal();
    closesOnBackdrop(modal);
    playPreview(modal.querySelector<HTMLCanvasElement>("#arcana-preview")!, id, ctx.game.save.settings.reduceMotion);
    el("arcana-buy-back").onclick = () => this.showChoice();
    el("arcana-buy-confirm").onclick = () => {
      const answer = desk.buy(id);
      if (answer === "short") return askForArcanite(ctx);
      modal.close();
      if (answer === "done") this.changed();
    };
  }

  /** The arcana owned, to choose the one to respec: each with the Arcanite
   * it returns, closed with none invested. */
  private showRespec() {
    const { ctx, desk } = this, modal = ctx.modal;
    modal.innerHTML = `<small>ARCANA</small><h2>Respec an Arcanum</h2><p>Its attributes go back to their first levels and all the Arcanite invested in it returns. One respec each event.</p><div class="arcana-options">${desk.owned.map((id) => {
      const back = desk.invested(id);
      return `<button class="arcana-option" data-arcana-respec="${id}" ${back ? "" : "disabled"}>${ARCANUM_ICONS[id]}<span><b>${arcanum(id).name}</b><small>${back ? `Returns ${price(back)}` : "Nothing invested"}</small></span></button>`;
    }).join("")}</div>`;
    if (!modal.open) modal.showModal();
    closesOnBackdrop(modal);
    modal.querySelectorAll<HTMLButtonElement>("[data-arcana-respec]").forEach((b) => (b.onclick = () => this.askRespec(b.dataset.arcanaRespec as ArcanumId)));
  }

  /** Respec `id`, on confirmation. */
  private askRespec(id: ArcanumId) {
    const { ctx, desk } = this, free = ctx.game.free, back = desk.invested(id);
    confirmAction(ctx, {
      title: `Respec ${arcanum(id).name}?`,
      body: `Its attributes go back to their first levels, and ${arcaniteIcon()} <b>${priceAmount(back)}</b> Arcanite returns. This is the event's one respec.`,
      label: `Respec · ${free ? "free" : `${gemIcon()} <b>${ARCANUM_RESPEC_GEMS}</b>`}`,
      cancel: "Cancel",
      aria: free ? "Respec, free" : `Respec for ${ARCANUM_RESPEC_GEMS} Gems`,
    }, () => {
      const refusal = desk.respec(id);
      if (refusal === "short") return askForGems(ctx, ARCANUM_RESPEC_GEMS);
      if (!refusal) this.changed();
    });
  }

  /** Reroll, on confirmation: a new choice in place of this one. */
  private askReroll() {
    const { ctx, desk } = this, cost = desk.rerollPrice;
    confirmAction(ctx, { title: "Reroll the choice?", body: "A new set of Arcana takes the place of this one.", label: `Reroll · ${arcaniteIcon()} <b>${priceAmount(cost)}</b>`, cancel: "Cancel" }, () => {
      if (desk.reroll() !== "done") return;
      this.changed();
      this.showChoice();
    });
    el("confirm").setAttribute("aria-label", `Reroll for ${cost} Arcanite`);
  }
}

/** A purchase preview's one scene, its room cached across dialogs. */
let previewScene: ArcanaLabScene | undefined;

/** Plays `id`'s effect on `canvas` until the canvas leaves the page, at 12
 * frames a second like the lab; with reduced motion (the setting or the
 * system's) it shows one still frame. */
function playPreview(canvas: HTMLCanvasElement, id: ArcanumId, reduceMotion: boolean) {
  const scene = (previewScene ??= new ArcanaLabScene());
  const still = reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
  let start = 0, painted = -1;
  const tick = (now: number) => {
    if (!canvas.isConnected) return;
    start ||= now;
    const time = still ? 450 : now - start, bucket = Math.floor(time / (1000 / 12));
    let ready = true;
    if (bucket !== painted) { ready = scene.preview(canvas, id, time); if (ready) painted = bucket; }
    if (!still || !ready) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Each attribute's value at `levels` (headed `now`) and at its next level. */
const attributeTable = (id: ArcanumId, levels: readonly number[], now: string) =>
  `<table class="arcana-table"><thead><tr><th>Attribute</th><th>${now}</th><th>Next</th></tr></thead><tbody>${arcanum(id).attributes.map((a, i) => {
    const next = nextStep(id, i, levels[i]!);
    return `<tr><td>${a.name}</td><td>${a.shown(a.steps[levels[i]!]![0])}</td><td>${next ? a.shown(next.value) : "Max"}</td></tr>`;
  }).join("")}</tbody></table>`;

/** A bought arcanum's information, from its row: what it does, each attribute
 * now and at its next level, and what research has added to it. */
function showArcanum(ctx: AppContext, id: ArcanumId) {
  const levels = levelsOf(ctx.game.save.arcana, id), modal = ctx.modal;
  modal.innerHTML = `<div class="arcana-info">${aboutHtml(id, valuesAt(id, levels), ctx.game.save)}${attributeTable(id, levels, "Now")}${arcanumResearch(id, ctx.game.save)}${boxedTable("Enhancements", enhancementsOf(id, ctx.game.save))}</div>`;
  modal.showModal();
  closesOnBackdrop(modal);
}

/** Lifespring's own tables on its card's information: the HP Pool now, and what its Effect Waves give. */
function lifespringTables(desk: AppContext["game"]["arcana"]) {
  const stats = desk.lifespringStats;
  if (!stats) return "";
  const { healthPerKill, healthLimit, amplify, gold, cells, defense } = stats.effects, factor = (n: number) => `${Number(n.toFixed(2))}×`;
  return boxedTable("Field", [["HP Pool", shortAmount(stats.pool)]]) + boxedTable("Effect Waves", [
    ["Health Bonus", `+${healthPerKill}% max HP a kill, ${factor(stats.health)} of ${factor(healthLimit)}`],
    ["Damage Amplification", `${factor(amplify)} a wave`],
    ["Gold Bonus", factor(gold)],
    ["Cell Bonus", factor(1 + cells)],
    ["DEF Reduction", `${Number(defense.toFixed(2))}%`],
  ]);
}

/** An arcanum's information, from its card in a run: what it does, its stats,
 * and what modifies them, among them what its damage comes to. */
export function showHeldArcanum(ctx: AppContext, { id, levels, lent }: HeldArcanum, game: Pick<AppContext["game"], "crit" | "arcana" | "run" | "save"> = ctx.game) {
  const modal = ctx.modal, def = arcanum(id), crit = game.crit, value = game.arcana.cardValue({ id, levels, lent });
  const percent = (n: number) => `${Number(n.toFixed(2))}%`, factor = (n: number) => `×${Number(n.toFixed(2))}`;
  const values = game.arcana.valuesOf({ id, levels }), augment = boon(augmentOf(id));
  const augmented: [string, string][] = game.arcana.augmented(id) && augment.kind === "augment" ? [["Shrine Boon", augment.effect]] : [];
  const modifiers: [string, string][] = def.damage ? [
    ["Hero ATK", shortAmount(game.run.player.attack)],
    ...(crit ? [["Critical Chance", percent(crit.chance)], ["Critical Factor", factor(crit.factor)]] as [string, string][] : []),
    ...(crit?.superCrit ? [["Super Crit Chance", percent(crit.superCrit.chance)], ["Super Crit Mult", factor(crit.superCrit.factor)]] as [string, string][] : []),
    ["Arcanum Damage", shortAmount(value.damage ?? 0)],
  ] : [];
  modal.innerHTML = `<div class="arcana-info">${aboutHtml(id, values, game.save)}${lent ? `<p class="hint">A Shrine boon lends it for this climb.</p>` : ""}<table class="arcana-table"><tbody>${def.attributes.map((a, i) => `<tr><td>${a.name}</td><td>${a.shown(values[i]!)}</td></tr>`).join("")}</tbody></table>${id === "lifespring" ? lifespringTables(game.arcana) : ""}${arcanumResearch(id, game.save)}${boxedTable("Modifiers", [...modifiers, ...augmented, ...enhancementsOf(id, game.save)])}</div>`;
  modal.showModal();
  closesOnBackdrop(modal);
}
