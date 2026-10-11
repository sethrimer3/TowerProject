import { autoPickOpen, boon, boonLabel, pickedLines, type BoonId } from "../shrines.ts";
import type { AppContext } from "./app.ts";
import { el, shrineIcon } from "./dom.ts";

/** The run's Shrine button, pressed: with boons waiting, the offer to pick
 * one from (again while more wait); with none, the boons the run has picked
 * in a scrolling table, standard boons' copies added up. Either way, once
 * Auto Pick Boons is researched, its toggle, kept between runs. */
export function showShrine(ctx: AppContext) {
  const shrine = ctx.game.shrine, offer = shrine.offer();
  const modal = ctx.modal;
  modal.innerHTML = (offer.length ? offerHtml(ctx, offer) : pickedHtml(ctx)) + autoPickHtml(ctx) +
    `<div class="dialog-actions"><button id="shrine-close">${offer.length ? "Later" : "Close"}</button></div>`;
  if (!modal.open) modal.showModal();
  el("shrine-close").onclick = () => modal.close();
  modal.querySelectorAll<HTMLButtonElement>("[data-boon]").forEach((b) => (b.onclick = () => {
    shrine.pick(b.dataset.boon as BoonId);
    ctx.update();
    if (shrine.unspent) showShrine(ctx);
    else modal.close();
  }));
  const auto = modal.querySelector<HTMLInputElement>("#boon-autopick");
  if (auto) auto.onchange = () => {
    shrine.setAutoPick(auto.checked);
    ctx.update();
    showShrine(ctx);
  };
}

function offerHtml(ctx: AppContext, offer: BoonId[]) {
  const save = ctx.game.save, waiting = ctx.game.shrine.unspent;
  return `<small>SHRINE</small><h2>${shrineIcon("shrine-title-icon")} Choose a Boon</h2>` +
    `<p class="hint">${waiting > 1 ? `${waiting} boons waiting. ` : ""}It lasts the rest of this run.</p>` +
    `<div class="boon-offer">${offer.map((id) => {
      const kind = boon(id).kind;
      return `<button class="boon-choice ${kind}" data-boon="${id}"><small>${kind === "tradeoff" ? "TRADE-OFF" : "STANDARD"}</small><b>${boonLabel(id, save)}</b></button>`;
    }).join("")}</div>`;
}

function pickedHtml(ctx: AppContext) {
  const shrine = ctx.game.shrine, lines = pickedLines(shrine.picked, ctx.game.save), next = shrine.floorsToNext;
  const nextText = next === null ? "Every boon is taken." : `Next boon in ${next} floor${next === 1 ? "" : "s"}, on floor ${shrine.floor + next}.`;
  return `<small>SHRINE</small><h2>${shrineIcon("shrine-title-icon")} Boons</h2><p class="hint">${nextText}</p>` +
    (lines.length
      ? `<div class="boon-table-scroll"><table class="boon-table"><thead><tr><th>Boon</th><th>Taken</th></tr></thead><tbody>${lines.map((l) =>
        `<tr class="${boon(l.id).kind}"><td>${l.text}</td><td>${l.count}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="research-empty">No boons taken yet this run.</p>`);
}

function autoPickHtml(ctx: AppContext) {
  const save = ctx.game.save;
  if (!autoPickOpen(save)) return "";
  return `<label class="boon-autopick"><input type="checkbox" id="boon-autopick"${save.shrines.autoPick ? " checked" : ""}> Auto Pick Boons</label>`;
}
