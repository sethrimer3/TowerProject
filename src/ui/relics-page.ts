import { controlIcon } from "./control-icon.ts";
import { PREVIEW_RELICS, RELICS, type RelicDef } from "../relics.ts";
import type { AppContext } from "./app.ts";
import { el, relicIcon } from "./dom.ts";

const RARITY_NAMES = { rare: "Rare", epic: "Epic" } as const;

/** The Relics screen (docs/EVENTS.md): every relic the player has won over
 * their career, small, in a grid. Pressing one, or a mouse resting on it,
 * raises it to the middle of the screen at full size with golden rays and
 * sparkles, its rarity and its bonus written under it; a press anywhere,
 * or the mouse moving off, puts it back. Opened by the Relics button in
 * the forest's menu; its X returns to whichever page opened it. In Dev
 * mode placeholder relics join the grid, so it and the pop-up can be seen
 * before any relic exists. */
export class RelicsPage {
  /** The page the screen was opened from, which its X returns to. */
  private from = "";

  constructor(private ctx: AppContext) {}

  /** Opens the screen, from page `from`. */
  open(from: string) {
    this.from = from;
    this.render();
  }

  /** The relics shown: those owned, then in Dev mode the placeholders. */
  private relics(): [string, RelicDef][] {
    const save = this.ctx.game.save;
    const owned = save.relics.filter((id) => RELICS[id]).map((id): [string, RelicDef] => [id, RELICS[id]!]);
    return save.settings.devMode ? [...owned, ...Object.entries(PREVIEW_RELICS)] : owned;
  }

  render() {
    const relics = this.relics();
    el("relics").innerHTML =
      `<button class="missions-close" id="relics-close" aria-label="Close" title="Close">${controlIcon("close")}</button>` +
      `<div class="page-title"><small>KEEPSAKES OF EVENTS</small><h2>Relics</h2></div>` +
      (relics.length
        ? `<div class="relic-grid">${relics.map(([id, r]) => `<button class="relic-cell ${r.rarity}" data-relic="${id}" aria-label="${r.name}: ${r.effect}">${relicIcon(r.rarity)}<small>${r.name}</small></button>`).join("")}</div>`
        : `<p class="hint">No relics yet. Earn Medals in Events to win them: each relic gives a permanent bonus.</p>`);
    el("relics-close").onclick = () => this.ctx.navigate(this.from || "board");
    const byId = new Map(relics);
    el("relics").querySelectorAll<HTMLButtonElement>("[data-relic]").forEach((b) => {
      const relic = byId.get(b.dataset.relic!)!;
      b.onclick = () => this.pop(relic, false);
      // A mouse resting on a relic shows it until it moves off; touch presses it.
      b.onpointerenter = (e) => e.pointerType === "mouse" && this.pop(relic, true);
      b.onpointerleave = (e) => e.pointerType === "mouse" && document.querySelector(".relic-pop.hover")?.remove();
    });
  }

  /** Raises `relic` to the middle of the screen at full size. One shown by
   * a resting mouse lets presses through and goes as the mouse moves off;
   * one pressed stays until the next press. */
  private pop(relic: RelicDef, hover: boolean) {
    document.querySelector(".relic-pop")?.remove();
    const layer = document.createElement("div");
    layer.className = `relic-pop ${relic.rarity}${hover ? " hover" : ""}${this.ctx.game.save.settings.reduceMotion ? " still" : ""}`;
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-label", `${relic.name}: ${relic.effect}`);
    const sparkles = Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
    layer.innerHTML = `<div class="relic-pop-stage"><div class="relic-pop-rays" aria-hidden="true"></div><div class="relic-pop-sparkles" aria-hidden="true">${sparkles}</div>${relicIcon(relic.rarity, "relic-icon relic-pop-icon")}</div>` +
      `<div class="card-reveal-text"><small>${RARITY_NAMES[relic.rarity].toUpperCase()} RELIC</small><b>${relic.name}</b><p>${relic.effect}</p>${hover ? "" : "<span>Press to close</span>"}</div>`;
    (document.querySelector("#app") ?? document.body).append(layer);
    if (!hover) layer.onclick = () => layer.remove();
  }
}
