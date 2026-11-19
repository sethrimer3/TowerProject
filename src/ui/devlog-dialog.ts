import { controlIcon } from "./control-icon.ts";
import type { AppContext } from "./app.ts";
import { el } from "./dom.ts";
import { DEVLOG, type DevlogEntry } from "../devlog.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A `YYYY-MM-DD` day as *Nov 19* over its year, read the same in every time
 * zone. */
export function devlogDay(date: string) {
  const [year, month, day] = date.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}<small>${year}</small>`;
}

/** The entries grouped by day, newest first, in the order given. */
export function devlogDays(entries: readonly DevlogEntry[]) {
  const days: { date: string; texts: string[] }[] = [];
  for (const { date, text } of entries) {
    const last = days.at(-1);
    if (last?.date === date) last.texts.push(text);
    else days.push({ date, texts: [text] });
  }
  return days;
}

/** The Settings page's DEVLOG dialog: every change, newest first, a line each
 * beside its day, in a table that scrolls under the heading, closed by the X
 * at its top right. */
export function showDevlog(ctx: AppContext) {
  const modal = ctx.modal;
  const rows = devlogDays(DEVLOG).map(({ date, texts }) => texts.map((text, i) =>
    `<tr>${i === 0 ? `<th scope="rowgroup" rowspan="${texts.length}">${devlogDay(date)}</th>` : ""}<td>${text}</td></tr>`).join("")).join("");
  modal.innerHTML = `<div class="devlog-dialog"><button id="devlog-close" class="dialog-x" aria-label="Close" title="Close">${controlIcon("close")}</button><small>WHAT'S CHANGED</small><h2>DEVLOG</h2>
    <div class="devlog-scroll"><table class="stats-table devlog-table"><tbody>${rows}</tbody></table></div></div>`;
  el("devlog-close").onclick = () => modal.close();
  modal.showModal();
}
