/** How long a hand card's tip stays, in milliseconds. */
const CARD_TIP_MS = 3000;

let tip: HTMLElement | null = null, timer = 0;

const hide = () => {
  clearTimeout(timer);
  if (tip) tip.hidden = true;
};

/** A note over hand card `card` (*No open path exists.*), for
 * `CARD_TIP_MS`, or until the next press anywhere. */
export function showCardTip(card: HTMLElement, text: string) {
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "card-tip";
    tip.className = "floor-tip card-tip";
    tip.setAttribute("role", "status");
    document.body.append(tip);
    // A press anywhere puts it away (a press on a card shows it again if that card can't go either).
    document.addEventListener("pointerdown", hide, { capture: true });
  }
  tip.textContent = text;
  tip.hidden = false;
  const box = card.getBoundingClientRect(), width = tip.offsetWidth;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left + box.width / 2 - width / 2))}px`;
  tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 8)}px`;
  clearTimeout(timer);
  timer = window.setTimeout(hide, CARD_TIP_MS);
}
