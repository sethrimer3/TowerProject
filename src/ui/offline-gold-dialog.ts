import { hoursMinutes } from "../progression/archives.ts";
import type { OfflineGrant } from "../offline-gold.ts";
import { shortAmount } from "../whole.ts";
import { goldIcon } from "./dom.ts";

const short = (n: number) => shortAmount(Math.floor(n), 1000);

/** The Offline Gold dialog: the time away (of the most that pays), and
 * the Recent Gold per Hour times the time paid for and the Offline Gold
 * Multiplier, making the Gold granted. Claim, or closing it any other way,
 * calls `claim` once. */
export function showOfflineGold(modal: HTMLDialogElement, grant: OfflineGrant, claim: () => void) {
  const paidMinutes = Math.min(grant.awayMs, grant.capMs) / 60_000;
  modal.innerHTML = `<div class="offline-gold"><small>WELCOME BACK</small><h2>Offline Gold</h2>
    <p class="offline-time">${hoursMinutes(grant.awayMs / 60_000)} offline (of ${hoursMinutes(grant.capMs / 60_000)} max)</p>
    <p class="offline-sum">Recent <b>${short(grant.rgph)}</b> ${goldIcon()} × ${hoursMinutes(paidMinutes)} × <b>${(grant.multiplier / 10).toFixed(1)}%</b> = <b>${short(grant.gold)}</b> ${goldIcon()}</p>
    <div class="dialog-actions"><button id="offline-claim" aria-label="Claim ${grant.gold.toLocaleString("en-US")} Gold">Claim</button></div></div>`;
  let claimed = false;
  const done = () => {
    if (claimed) return;
    claimed = true;
    modal.removeEventListener("close", done);
    claim();
  };
  modal.addEventListener("close", done);
  (modal.querySelector("#offline-claim") as HTMLButtonElement).onclick = () => modal.close();
  modal.showModal();
}
