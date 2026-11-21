import type { AppContext } from "./app.ts";
import { codexCategories, type CodexCategory, type CodexCategoryId, type CodexEntry, type CodexIcon, type CodexLink, type CodexSection, type CodexTarget } from "../codex/codex.ts";
import { noteDiscoveries } from "../codex/discovery.ts";
import { controlIcon } from "./control-icon.ts";
import { arcaniteIcon, cellIcon, clockIcon, redoIcon, el, equipTicketIcon, escapeHtml, gemIcon, goldenGemIcon, goldIcon, itemSprite, medalIcon, pointsIcon, rubyIcon, skillSprite, stellarGemIcon, ticketIcon, uiSprite, vipIcon, type UiSprite } from "./dom.ts";
import { kitIcon, pngIcon } from "../sprites/kit.ts";
import { tokenHtml } from "./badge-token.ts";
import { ARCANUM_ICONS } from "./arcana-panel.ts";
import { categoryIcon, itemIcon, materialIcon } from "./equipment-icons.ts";
import { strengthMarks, traitMarks } from "./enemy-odds-box.ts";
import { boonIcon } from "./boon-icon.ts";
import { cardPowersHtml } from "./card-power-view.ts";
import type { ItemSpriteId } from "../sprites/items.ts";
import type { CardId } from "../cards/cards.ts";
import type { BadgeId } from "../cards/badges.ts";
import type { UpgradeId } from "../progression/upgrades.ts";
import type { ArcanumId } from "../arcana/arcana.ts";
import type { CategoryId, EquipMaterialId } from "../equipment/catalog.ts";
import type { EnemyStrength } from "../entities.ts";
import type { Trait } from "../enemies/odds.ts";
import type { BoonId } from "../shrines.ts";

/** Each currency's icon, by the Codex's currency id. */
const CURRENCY_ICONS: Record<string, () => string> = {
  gold: goldIcon, gems: () => gemIcon(), silver: () => uiSprite("gold", "ui-sprite silver-sprite"), training: () => pointsIcon("ui-sprite"),
  inspiration: () => uiSprite("inspiration"), breakthrough: () => uiSprite("breakthrough"), rubies: () => rubyIcon(), arcanite: () => arcaniteIcon(),
  medals: () => medalIcon(), cells: () => cellIcon(), tickets: () => ticketIcon(), "equip-tickets": () => equipTicketIcon(), vip: () => vipIcon(),
};
/** Each trial boss's stand-in picture. */
const TRIAL_ART: Record<string, string> = { "light-elemental": "crystal", keymaster: "key-yellow", "magic-tower": "tower", obelisk: "golem" };
const ENVIRONMENT_ICONS: Record<string, () => string> = {
  treasure: () => itemSprite("chest_treasure"), golden: () => goldenGemIcon("ui-sprite"), stellar: () => stellarGemIcon("ui-sprite"),
};

/** An entry's icon, as the page draws it. */
function iconHtml(icon: CodexIcon): string {
  if (!icon) return "";
  const id = icon.id;
  switch (icon.kind) {
    case "kit": return kitIcon(id, "", "codex-kit");
    case "ui": return uiSprite(id as UiSprite);
    case "item": return itemSprite(id as ItemSpriteId);
    case "mark": return id === "repeat" ? redoIcon("codex-mark") : id === "clock" ? clockIcon("codex-mark") : controlIcon("close");
    case "currency": return CURRENCY_ICONS[id]?.() ?? "";
    case "card": return pngIcon(`card-${id as CardId}`, "codex-card");
    case "badge": return tokenHtml(id as BadgeId, 0);
    case "skill": return skillSprite(id as UpgradeId);
    case "arcanum": return ARCANUM_ICONS[id as ArcanumId];
    case "equip": return itemIcon(id);
    case "equipCategory": return categoryIcon(id as CategoryId);
    case "material": return materialIcon(id as EquipMaterialId);
    case "strength": return strengthMarks(id as EnemyStrength);
    case "trait": return traitMarks(id as Trait);
    case "training": return id === "utility" ? uiSprite("gold") : itemSprite(id === "offense" ? "upgrade_attack" : "upgrade_defense");
    case "boon": return boonIcon(id as BoonId);
    case "research": return uiSprite("log");
    case "trial": return kitIcon(TRIAL_ART[id] ?? "trophy", "", "codex-kit");
    case "environment": return ENVIRONMENT_ICONS[id]?.() ?? "";
  }
}

/** The Codex (codex/codex.ts): the player's reference to the game, a tab a
 * category, opened by the ⓘ in the HUD's menu inside a climb and in the
 * forest. Categories not yet open show ??? and can't be chosen; its X
 * returns to the page that opened it. Links lead to the pages they name
 * (`go`), those only the forest opens unavailable inside a climb. */
export class CodexPage {
  private from = "";
  private category: CodexCategoryId = "general";
  /** The entries and sections the player has expanded, kept while the page is open. */
  private expanded = new Set<string>();

  constructor(private ctx: AppContext, private held: () => readonly ArcanumId[], private go: (to: CodexTarget) => void) {}

  /** Opens the Codex from page `from`, on the category last shown. */
  open(from: string) {
    this.from = from;
    this.render();
  }

  private categories(): CodexCategory[] {
    const game = this.ctx.game, held = this.held();
    if (noteDiscoveries(game.save.codex, game.save, held)) this.ctx.save();
    return codexCategories({ save: game.save, inside: !game.run.outside, tournament: game.tournament.unlocked, events: game.events.unlocked, held });
  }

  render() {
    const categories = this.categories();
    let current = categories.find((c) => c.id === this.category && c.open);
    if (!current) {
      current = categories[0]!;
      this.category = current.id;
    }
    const tab = (c: CodexCategory) => c.open
      ? `<button type="button" class="codex-tab" data-codex-tab="${c.id}" aria-pressed="${c.id === current.id}"><span class="codex-tab-icon">${iconHtml(c.icon)}</span><span>${c.name}</span></button>`
      : `<button type="button" class="codex-tab locked" disabled aria-label="Not yet discovered"><span class="codex-tab-icon">${controlIcon("lock")}</span><span>???</span></button>`;
    el("codex").innerHTML =
      `<button class="missions-close" id="codex-close" aria-label="Close" title="Close">${controlIcon("close")}</button>` +
      `<div class="page-title"><small>A COMPENDIUM OF THE ASCENT</small><h2>Codex</h2></div>` +
      `<div class="codex-tabs" role="group" aria-label="Codex categories">${categories.map(tab).join("")}</div>` +
      `<article class="codex-body" aria-labelledby="codex-heading"><h3 id="codex-heading">${current.name}</h3><p class="codex-summary">${current.summary}</p>` +
      (current.links.length ? `<div class="codex-links">${current.links.map((l, i) => this.linkHtml(l, `c${i}`)).join("")}</div>` : "") +
      current.sections.map((s) => this.sectionHtml(current, s)).join("") + `</article>`;
    this.bind(current);
  }

  private sectionHtml(category: CodexCategory, s: CodexSection) {
    const key = `${category.id}/${s.id}`, open = this.expanded.has(key) ? !!s.collapsed : !s.collapsed;
    const body = !s.entries.length
      ? `<p class="hint">${s.hint ?? "None yet."}</p>`
      : s.table
        ? `<table class="enemy-odds-table codex-table"><tbody>${s.entries.map((e) => `<tr${e.hidden ? ` class="codex-hidden"` : ""}><th scope="row">${iconHtml(e.icon)}${escapeHtml(e.name)}</th><td>${e.brief}</td></tr>`).join("")}</tbody></table>${s.hint ? `<p class="hint">${s.hint}</p>` : ""}`
        : `${s.hint && category.id === "equipment" ? `<p class="hint">${s.hint}</p>` : ""}<ul class="codex-entries">${s.entries.map((e) => this.entryHtml(category, e)).join("")}</ul>`;
    const count = s.entries.filter((e) => !e.hidden).length;
    return `<details class="codex-section" data-codex-section="${key}"${open ? " open" : ""}><summary><span>${s.title}</span><small>${count}/${s.entries.length}</small></summary>${body}</details>`;
  }

  private entryHtml(category: CodexCategory, e: CodexEntry) {
    if (e.hidden) return `<li class="codex-entry codex-hidden"><span class="codex-icon">${e.icon ? iconHtml(e.icon) : controlIcon("lock")}</span><span class="codex-name">???</span></li>`;
    const head = `<span class="codex-icon">${iconHtml(e.icon)}</span><span class="codex-text"><b class="codex-name">${escapeHtml(e.name)}</b><span class="codex-brief">${e.brief}</span></span>`;
    const details = (e.facts?.length ? `<dl class="codex-facts">${e.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : "")
      + (e.lines ?? []).map((l) => `<p class="codex-line">${l}</p>`).join("")
      + (e.card ? cardPowersHtml(e.card.id, e.card.level) : "");
    const link = e.link ? this.linkHtml(e.link, `${category.id}/${e.id}`) : "";
    const ready = e.ready ? " ready" : "";
    if (!details) return `<li class="codex-entry${ready}"><div class="codex-row">${head}</div>${link}</li>`;
    const key = `${category.id}/${e.id}`;
    return `<li class="codex-entry${ready}"><details data-codex-entry="${key}"${this.expanded.has(key) ? " open" : ""}><summary class="codex-row">${head}</summary><div class="codex-details">${details}</div></details>${link}</li>`;
  }

  /** A link's button: its words (an Ascend link with its Rubies), and while
   * it can't be followed now, why. */
  private linkHtml(l: CodexLink, key: string) {
    const label = l.rubies === undefined ? escapeHtml(l.label) : `${escapeHtml(l.label)} · ${rubyIcon()} <b>${l.rubies.toLocaleString("en-US")}</b>`;
    const aria = l.rubies === undefined ? l.label : `${l.label} for ${l.rubies.toLocaleString("en-US")} Rubies`;
    return `<span class="codex-link"><button type="button" class="${l.rubies === undefined ? "codex-go" : "codex-go deck-ascend"}" data-codex-link="${key}"${l.open ? "" : " disabled"} aria-label="${aria}">${label}</button>${l.note ? `<small class="hint">${l.note}</small>` : ""}</span>`;
  }

  private bind(current: CodexCategory) {
    el("codex-close").onclick = () => this.ctx.navigate(this.from || "board");
    el("codex").querySelectorAll<HTMLButtonElement>("[data-codex-tab]").forEach((b) => (b.onclick = () => {
      this.category = b.dataset.codexTab as CodexCategoryId;
      this.render();
      el("codex").scrollTop = 0;
    }));
    // Expanded sections and entries stay so across redraws.
    el("codex").querySelectorAll<HTMLDetailsElement>("details[data-codex-section], details[data-codex-entry]").forEach((d) =>
      d.addEventListener("toggle", () => {
        const key = d.dataset.codexSection ?? d.dataset.codexEntry!, section = !!d.dataset.codexSection;
        const s = section ? current.sections.find((x) => `${current.id}/${x.id}` === key) : undefined;
        // A section's key marks it changed from its default; an entry's, open.
        const differs = section ? d.open !== !s?.collapsed : d.open;
        if (differs) this.expanded.add(key);
        else this.expanded.delete(key);
      }));
    const links = new Map<string, CodexLink>();
    current.links.forEach((l, i) => links.set(`c${i}`, l));
    for (const s of current.sections) for (const e of s.entries) if (e.link) links.set(`${current.id}/${e.id}`, e.link);
    el("codex").querySelectorAll<HTMLButtonElement>("[data-codex-link]").forEach((b) => (b.onclick = () => {
      const l = links.get(b.dataset.codexLink!);
      if (l?.open) this.go(l.to);
    }));
  }
}
