/** The game's own dropdowns in place of the browser's: a native select
 * opens a large picker over the screen on phones, in the system's look.
 * Each `<select>` stays in the page, hidden, as the value pages read and
 * set (its `change` handlers run as before); beside it stand a button the
 * themes draw, showing the option chosen, and the list of options it opens
 * below itself, or above it in the screen's lower half. */

/** Draws every select under `root` not drawn yet. */
export function drawSelects(root: ParentNode) {
  root.querySelectorAll<HTMLSelectElement>("select:not([data-drawn])").forEach(draw);
}

/** Draws each select as it is added under `root`, from now on. */
export function drawSelectsUnder(root: Node) {
  new MutationObserver(() => drawSelects(root as ParentNode)).observe(root, { childList: true, subtree: true });
  drawSelects(root as ParentNode);
}

function draw(select: HTMLSelectElement) {
  select.dataset.drawn = "";
  select.classList.add("game-select-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  const widget = document.createElement("span"), button = document.createElement("button"), menu = document.createElement("span");
  widget.className = "game-select";
  button.type = "button";
  button.className = "game-select-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const name = select.getAttribute("aria-label");
  if (name) button.setAttribute("aria-label", name);
  menu.className = "game-select-menu";
  menu.setAttribute("role", "listbox");
  if (name) menu.setAttribute("aria-label", name);
  menu.hidden = true;
  select.replaceWith(widget);
  widget.append(button, menu, select);
  const show = () => {
    const chosen = select.selectedOptions[0];
    button.innerHTML = `<span class="game-select-value"></span><span class="game-select-caret" aria-hidden="true">▾</span>`;
    button.firstElementChild!.textContent = chosen?.textContent ?? "";
    menu.replaceChildren(...[...select.options].map((o) => {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(o.selected));
      item.dataset.value = o.value;
      item.disabled = o.disabled;
      item.textContent = o.textContent;
      return item;
    }));
  };
  show();
  // A page or test setting the select's value shows it here too.
  select.addEventListener("change", show);
  widget.onclick = (e) => {
    e.preventDefault();
    const target = e.target as HTMLElement, item = target.closest<HTMLButtonElement>("[data-value]");
    if (item) {
      setOpen(widget, false);
      button.focus();
      if (item.dataset.value === select.value) return;
      select.value = item.dataset.value!;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (target.closest(".game-select-button")) setOpen(widget, menu.hidden);
  };
  widget.onkeydown = (e) => {
    if (menu.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(widget, false);
      button.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };
}

const menuOf = (widget: HTMLElement) => widget.querySelector<HTMLElement>(".game-select-menu")!;

function setOpen(widget: HTMLElement, open: boolean) {
  const button = widget.querySelector<HTMLElement>(".game-select-button")!, menu = menuOf(widget);
  if (open) {
    const box = button.getBoundingClientRect();
    menu.classList.toggle("up", box.top + box.height / 2 > innerHeight / 2);
  }
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) menu.querySelector<HTMLElement>("[aria-selected=\"true\"]")?.scrollIntoView({ block: "nearest" });
}

// A press anywhere outside an open list closes it.
if (typeof document !== "undefined") document.addEventListener("pointerdown", (e) => {
  document.querySelectorAll<HTMLElement>(".game-select").forEach((w) => {
    if (!w.contains(e.target as Node) && !menuOf(w).hidden) setOpen(w, false);
  });
}, { capture: true });
