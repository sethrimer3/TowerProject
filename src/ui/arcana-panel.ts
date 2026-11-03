import { pngIcon } from "../sprites/kit.ts";
import { arcanum, enhancementsOf, levelsOf, nextStep, valuesAt, type ArcanumId, type AttributeValues } from "../arcana/arcana.ts";
import { augmentOf, boon } from "../shrines.ts";
import type { HeldArcanum } from "../game/arcana-desk.ts";
import type { AppContext } from "./app.ts";
import { askForArcanite, closesOnBackdrop, confirmAction, helpButton, showHelp } from "./dialogs.ts";
import { arcaniteIcon, el } from "./dom.ts";
import { priceAmount } from "./hud.ts";
import { shortAmount } from "../whole.ts";

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

/** The top of an arcanum's information: its name, its icon, what it does. */
const aboutHtml = (id: ArcanumId, values: AttributeValues) =>
  `<h2>${arcanum(id).name}</h2><div class="arcana-info-icon">${ARCANUM_ICONS[id]}</div><p>${arcanum(id).summary(values)}</p>`;

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
    return `<div class="arcana-head"><h3>Arcana</h3>${helpButton("About Arcana", "arcana-help")}</div>${select}${desk.owned.map((id) => this.rowHtml(id)).join("")}`;
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
    el("arcana-help").onclick = () => showHelp(ctx, "GEAR", "Arcana", `<p>Arcana are mighty spells bought with Arcanite and kept for good. Each has three attributes to upgrade.</p><p>Each new arcanum is chosen from up to three drawn at random from those you don't own, each as likely as any other. The choice stays until you buy one or reroll it, and the next arcanum costs more the more you own.</p><p>Every arcanum you hold works at once in every run. Inside a run the Arcana tab switches each on and off, up to 40 times a run.</p><p class="hint">Arcanite comes from tournaments and the Shop.</p>`);
    const select = document.getElementById("arcana-select");
    if (select) select.onclick = () => (desk.affords(desk.price!) ? this.showChoice() : askForArcanite(ctx));
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
    modal.querySelectorAll<HTMLButtonElement>("[data-arcana-buy]").forEach((b) => (b.onclick = () => {
      const answer = desk.buy(b.dataset.arcanaBuy as ArcanumId);
      if (answer === "short") return askForArcanite(ctx);
      modal.close();
      if (answer === "done") this.changed();
    }));
    const button = document.getElementById("arcana-reroll");
    if (button) button.onclick = () => (desk.affords(reroll) ? this.askReroll() : askForArcanite(ctx));
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

/** A bought arcanum's information, from its row: what it does, each attribute
 * now and at its next level, and what research has added to it. */
function showArcanum(ctx: AppContext, id: ArcanumId) {
  const levels = levelsOf(ctx.game.save.arcana, id), modal = ctx.modal;
  modal.innerHTML = `<div class="arcana-info">${aboutHtml(id, valuesAt(id, levels))}<table class="arcana-table"><thead><tr><th>Attribute</th><th>Now</th><th>Next</th></tr></thead><tbody>${arcanum(id).attributes.map((a, i) => {
    const next = nextStep(id, i, levels[i]!);
    return `<tr><td>${a.name}</td><td>${a.shown(a.steps[levels[i]!]![0])}</td><td>${next ? a.shown(next.value) : "Max"}</td></tr>`;
  }).join("")}</tbody></table>${boxedTable("Enhancements", enhancementsOf(id, ctx.game.save))}</div>`;
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
    ["Cell Bonus", factor(cells)],
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
  modal.innerHTML = `<div class="arcana-info">${aboutHtml(id, values)}${lent ? `<p class="hint">A Shrine boon lends it for this climb.</p>` : ""}<table class="arcana-table"><tbody>${def.attributes.map((a, i) => `<tr><td>${a.name}</td><td>${a.shown(values[i]!)}</td></tr>`).join("")}</tbody></table>${id === "lifespring" ? lifespringTables(game.arcana) : ""}${boxedTable("Modifiers", [...modifiers, ...augmented, ...enhancementsOf(id, game.save)])}</div>`;
  modal.showModal();
  closesOnBackdrop(modal);
}
