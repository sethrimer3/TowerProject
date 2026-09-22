import "./style.css";
import { load, persist, defaults } from "./save.ts";
import { Game } from "./state.ts";
import { Renderer } from "./rendering.ts";
import { bindInput } from "./input.ts";
import { chooseStep } from "./automation.ts";
import { predict } from "./combat.ts";
import {
  UPGRADES,
  cost,
  levelForXp,
  GOLD_SHOP,
  type UpgradeId,
  type GoldItemId,
} from "./config.ts";
const icons = { tower: "♜", delve: "▼", gear: "♞", upgrades: "✦", settings: "⚙" };
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main class="shell"><header class="brand"><div><span class="eyebrow">AN ENDLESS ASCENT</span><h1>Tower<span>Incramental</span></h1></div><div class="currencies"><div class="essence">✦ <b id="essence">0</b><small>COURAGE</small></div><div class="essence">◆ <b id="shards">0</b><small>INSIGHT</small></div></div></header><section class="stats" aria-label="Player statistics"><div class="portrait"><span>♞</span><small>WAYFARER</small><small id="level">LV 0</small></div><div class="vitals"><div><span class="heart">♥</span> HP <b id="hp"></b></div><div class="health-track"><i id="health"></i></div><div class="combat-stats"><span>⚔ <b id="attack"></b></span><span>⛨ <b id="defense"></b></span></div></div><div class="keys"><span class="yellow">⚿ <b id="yellow"></b></span><span class="blue">⚿ <b id="blue"></b></span><span class="red">⚿ <b id="red"></b></span></div><div class="height"><small id="height-label">HEIGHT</small><strong id="height">0</strong><span>BEST <b id="best">0</b></span></div><div class="actions"><button id="auto" class="mini-action" aria-label="Auto-climb" title="Auto-climb"><span class="mini-icon">✦</span><small id="auto-state">LOCKED</small></button><button id="undo" class="mini-action" aria-label="Undo" title="Undo"><span class="mini-icon">↺</span><small id="undo-state">0/1</small></button></div></section><section id="board" class="page active"><div class="tower-heading"><span class="rule"></span><span id="board-title">THE HOLLOW SPIRE</span><span class="rule"></span></div><div class="ascent"><span>↑</span><small id="board-subtitle">HIGHER DANGERS · GREATER REWARDS</small></div><div class="board"><canvas id="world" aria-label="Tower grid: tap a destination or swipe to move. Keyboard arrows and WASD also work."></canvas><span class="board-caption" id="density-label">20 × 20</span></div><div class="status"><span class="live-dot"></span><span id="message" aria-live="polite"></span></div><div class="controls"><button id="pause" aria-label="Pause game">Ⅱ</button><div class="dpad" hidden><button data-move="-1,0" aria-label="Move left">←</button><div><button data-move="0,1" aria-label="Move up">↑</button><button data-move="0,-1" aria-label="Move down">↓</button></div><button data-move="1,0" aria-label="Move right">→</button></div></div><div id="shop" class="shop" hidden></div><div id="inspect" class="inspection">Tap a destination to walk and fight. Swipe to step. Undo reverses one step.</div></section><section id="gear" class="page"></section><section id="upgrades" class="page"></section><section id="settings" class="page"></section><nav aria-label="Main navigation">${Object.entries(
  icons,
)
  .map(
    ([id, icon]) =>
      `<button data-tab="${id}" class="${id === "tower" ? "selected" : ""}"><span>${icon}</span>${id[0].toUpperCase() + id.slice(1)}</button>`,
  )
  .join(
    "",
  )}</nav><footer>EVERY ASCENT LEAVES AN ECHO</footer></main><dialog id="modal"></dialog>`;
const game = new Game(load());
const renderer = new Renderer(document.querySelector("#world")!, game);
let tab = "tower",
  lastAuto = 0,
  lastRoute = 0,
  lastSave = 0;
let selected: { x: number; y: number } | null = null;
const el = (id: string) => document.getElementById(id)!;
const text = (id: string, value: unknown) =>
  (el(id).textContent = String(value));
const isBoard = (id: string) => id === "tower" || id === "delve";
function save() {
  if (!persist(game.save))
    game.message =
      "Storage unavailable — progress is only kept for this session.";
}
function inspect(x: number, y: number) {
  selected = { x, y };
  const t = game.world.tile(x, y),
    p = game.run.player;
  if (t.kind === "enemy") {
    const e = t.enemy!,
      r = predict(p, e);
    el("inspect").innerHTML =
      `<b>${e.name}</b><span>HP ${e.hp} · ATK ${e.attack} · DEF ${e.defense}</span><strong class="${r.survivable ? "safe" : "danger"}">${r.damage} damage · ${r.survivable ? "Survivable" : "LETHAL"}</strong>`;
  } else {
    el("inspect").textContent =
      t.kind === "wall"
        ? "Ancient stone. Find a passage around it."
        : t.kind === "door"
          ? `${t.color} door · requires one matching key`
          : `${t.kind[0].toUpperCase() + t.kind.slice(1)} · ${game.mode === "tower" ? "row" : "height"} ${y}`;
  }
}
function renderShop() {
  const shop = el("shop");
  if (game.mode !== "delve" || game.summary) {
    shop.setAttribute("hidden", "");
    shop.innerHTML = "";
    return;
  }
  if (!shop.childElementCount)
    shop.innerHTML = GOLD_SHOP.map(
      (item) =>
        `<button data-gold="${item.id}" title="${item.description}">${item.name} <span>◇ ${item.cost}</span></button>`,
    ).join("");
  shop.removeAttribute("hidden");
  document.querySelectorAll<HTMLButtonElement>("[data-gold]").forEach((b) => {
    const item = GOLD_SHOP.find((i) => i.id === b.dataset.gold)!;
    b.disabled = game.save.gold < item.cost;
    b.onclick = () => {
      game.buyGold(item.id as GoldItemId);
      update();
    };
  });
}
function update() {
  const p = game.run.player,
    slice = game.save[game.mode];
  text("hp", `${p.hp} / ${p.maxHp}`);
  text("attack", p.attack);
  text("defense", p.defense);
  for (const k of ["yellow", "blue", "red"] as const) text(k, p.keys[k]);
  text("height-label", game.mode === "tower" ? "HEIGHT" : "DEPTH");
  text("height", game.run.height);
  text("best", slice.best);
  text("essence", game.save.delve.essence);
  text("shards", game.save.tower.shards);
  text("level", `LV ${levelForXp(game.save.xp)}`);
  text("message", game.paused ? "Paused · take a breath." : game.message);
  el("health").style.width = `${(100 * p.hp) / p.maxHp}%`;
  text(
    "auto-state",
    game.save.upgrades.auto ? (game.auto ? "ON" : "OFF") : "LOCKED",
  );
  el("auto").classList.toggle("enabled", game.auto);
  text("pause", game.paused ? "▶" : "Ⅱ");
  el("pause").setAttribute(
    "aria-label",
    game.paused ? "Resume game" : "Pause game",
  );
  text(
    "density-label",
    `${game.save.settings.density} × ${game.save.settings.density}`,
  );
  const undo = el("undo") as HTMLButtonElement;
  text(
    "undo-state",
    slice.revival ? "REVIVE" : `${slice.history.length}/${game.undoCapacity}`,
  );
  undo.classList.toggle("enabled", !!slice.revival);
  undo.setAttribute(
    "aria-label",
    slice.revival ? "Revive" : `Undo (${slice.history.length}/${game.undoCapacity})`,
  );
  undo.disabled = !slice.revival && !slice.history.length;
  (document.querySelector(".dpad") as HTMLElement).hidden =
    !game.save.settings.showArrows;
  renderShop();
  save();
  if (game.summary) showSummary();
}
function renderBoard() {
  el("board").classList.toggle("mode-tower", game.mode === "tower");
  text("board-title", game.mode === "tower" ? "THE ASCENT TRIALS" : "THE HOLLOW SPIRE");
  text(
    "board-subtitle",
    game.mode === "tower"
      ? "ONE CHAMBER AT A TIME"
      : "HIGHER DANGERS · GREATER REWARDS",
  );
  el("inspect").textContent =
    game.mode === "tower"
      ? "Clear the chamber and find the stairs. Tap to walk, swipe to step."
      : "Tap a destination to walk and fight. Swipe to step. Undo reverses one step.";
}
function navigate(id: string) {
  tab = id;
  if (isBoard(id)) {
    game.switchMode(id as "tower" | "delve");
    renderBoard();
  } else game.route = [];
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.toggle("active", p.id === (isBoard(id) ? "board" : id)));
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === id);
    b.setAttribute("aria-current", b.dataset.tab === id ? "page" : "false");
  });
  renderPage();
  update();
}
function renderPage() {
  if (tab === "gear") {
    el("gear").innerHTML =
      `<div class="page-title"><small>YOUR COMPANIONS IN THE DARK</small><h2>Traveler’s gear</h2><p>Treasure improves both equipped pieces for this ascent.</p></div>${game.run.player.gear.map((g) => `<article class="card"><div class="item-icon">${g.slot === "weapon" ? "⚔" : "⛨"}</div><div><small>${g.slot.toUpperCase()} · QUALITY ${g.quality}</small><h3>${g.name}</h3><p>+${g.attack || g.defense} ${g.attack ? "attack" : "defense"}</p></div></article>`).join("")}<p class="hint">Heirloom steel upgrades improve your starting equipment on every new run.</p>`;
  }
  if (tab === "upgrades") {
    const section = (currency: "essence" | "shards") =>
      UPGRADES.filter((u) => u.currency === currency)
        .map((u) => {
          const n = game.save.upgrades[u.id],
            c = cost(u.id, n),
            balance =
              currency === "essence"
                ? game.save.delve.essence
                : game.save.tower.shards;
          return `<article class="upgrade"><div><h3>${u.name} <small>${n} / ${u.max}</small></h3><p>${u.description}</p></div><button data-buy="${u.id}" ${n >= u.max || c > balance ? "disabled" : ""}>${n >= u.max ? "MAX" : `${currency === "essence" ? "✦" : "◆"} ${c}`}</button></article>`;
        })
        .join("");
    el("upgrades").innerHTML =
      `<div class="page-title"><small>WHAT REMAINS WHEN YOU FALL</small><h2>A lasting legacy</h2><p>Spend Courage and Insight to strengthen future ascents. Wayfinder, Revive, and extra undos unlock immediately.</p></div><h3 class="section-title">✦ Courage upgrades · Delve</h3>${section("essence")}<h3 class="section-title">◆ Insight upgrades · Tower</h3>${section("shards")}<p class="hint">Retire a Delve to earn Courage, and a Tower ascent to earn Insight — only when you beat your prior best. Every kill grants XP toward permanent level bonuses, in either mode.</p>`;
    document.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach(
      (b) =>
        (b.onclick = () => {
          game.buy(b.dataset.buy as UpgradeId);
          update();
          renderPage();
        }),
    );
  }
  if (tab === "settings") {
    el("settings").innerHTML =
      `<div class="page-title"><small>MAKE THE ASCENT YOUR OWN</small><h2>Settings</h2></div><label class="setting">Viewport density<select id="density">${[16, 20, 24, 30].map((n) => `<option ${game.save.settings.density === n ? "selected" : ""} value="${n}">${n} × ${n}</option>`).join("")}</select></label><label class="setting">Auto-climb speed<select id="speed">${[1, 3, 6, 10].map((n) => `<option ${game.save.settings.speed === n ? "selected" : ""} value="${n}">${n} steps / sec</option>`).join("")}</select></label><label class="setting">Movement transition<select id="transition">${(["smooth", "fast", "instant"] as const).map((mode) => `<option value="${mode}" ${game.save.settings.transition === mode ? "selected" : ""}>${mode === "instant" ? "Off (instant)" : mode === "fast" ? "Fast" : "Smooth"}</option>`).join("")}</select></label><label class="setting">Show directional buttons<input type="checkbox" id="arrows" ${game.save.settings.showArrows ? "checked" : ""}></label><label class="setting">Reduce motion<input type="checkbox" id="motion" ${game.save.settings.reduceMotion ? "checked" : ""}></label><p class="hint">Automation pauses outside the board tabs and while the browser is hidden. Progress saves after each action.</p><button class="wide" id="retire">Retire this ${game.mode === "tower" ? "ascent" : "delve"}</button><p class="hint">Claim your ${game.mode === "tower" ? "Insight" : "Courage"} and enter a freshly generated ${game.mode === "tower" ? "tower" : "descent"}.</p><button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
    (el("density") as HTMLSelectElement).onchange = (e) => {
      game.save.settings.density = Number(
        (e.target as HTMLSelectElement).value,
      );
      update();
    };
    (el("speed") as HTMLSelectElement).onchange = (e) => {
      game.save.settings.speed = Number((e.target as HTMLSelectElement).value);
      save();
    };
    (el("arrows") as HTMLInputElement).onchange = (e) => {
      game.save.settings.showArrows = (e.target as HTMLInputElement).checked;
      update();
    };
    (el("transition") as HTMLSelectElement).onchange = (e) => {
      game.save.settings.transition = (e.target as HTMLSelectElement)
        .value as typeof game.save.settings.transition;
      save();
    };
    (el("motion") as HTMLInputElement).onchange = (e) => {
      game.save.settings.reduceMotion = (e.target as HTMLInputElement).checked;
      save();
    };
    el("retire").onclick = () =>
      confirmAction(
        "Leave your mark?",
        `Retire at ${game.mode === "tower" ? "height" : "depth"} ${game.run.height}. You will receive ${game.mode === "tower" ? "Insight" : "Courage"} if this beats your best.`,
        "Retire ascent",
        () => {
          game.finish("Ascent retired");
          update();
        },
      );
    el("erase").onclick = () =>
      confirmAction(
        "Erase your legacy?",
        "All currencies, upgrades, records, and both current runs will be permanently erased.",
        "Erase everything",
        () => {
          game.save = defaults();
          game.summary = null;
          game.newRun();
          save();
          navigate("tower");
        },
      );
  }
}
const modal = el("modal") as HTMLDialogElement;
function confirmAction(
  title: string,
  body: string,
  label: string,
  action: () => void,
) {
  modal.innerHTML = `<small>THE HOLLOW SPIRE</small><h2>${title}</h2><p>${body}</p><div class="dialog-actions"><button id="cancel">Keep climbing</button><button id="confirm">${label}</button></div>`;
  modal.showModal();
  el("cancel").onclick = () => modal.close();
  el("confirm").onclick = () => {
    modal.close();
    action();
  };
}
function showSummary() {
  const s = game.summary!,
    currencyName = game.mode === "delve" ? "COURAGE" : "INSIGHT",
    heightName = game.mode === "tower" ? "ROOMS" : "HEIGHT";
  if (modal.open) return;
  modal.innerHTML = `<span class="summary-icon">✦</span><small>${s.reason.toUpperCase()}</small><h2>The tower remembers.</h2><p>Every ending is the beginning of a stronger ascent.</p><div class="summary-stats"><div><strong>${s.height}</strong>${heightName}</div><div><strong>${s.kills}</strong>VICTORIES</div><div><strong>+${s.earned}</strong>${currencyName}</div></div>${s.record ? "" : `<p class="hint">Beat your prior best to earn ${currencyName.toLowerCase()}.</p>`}${game.save[game.mode].revival ? `<p>Revive is available until your next move. ${currencyName[0]}${currencyName.slice(1).toLowerCase()} is awarded if you continue.</p><button class="wide" id="revive-now">Revive</button>` : ""}<button class="wide" id="again">${s.dead ? `Continue from ${game.mode === "tower" ? "room" : "floor"} 1` : "Begin another ascent →"}</button>`;
  modal.showModal();
  const revive = document.querySelector<HTMLButtonElement>("#revive-now");
  if (revive)
    revive.onclick = () => {
      modal.close();
      game.undo();
      navigate(game.mode);
    };
  el("again").onclick = () => {
    modal.close();
    game.summary = null;
    if (!s.dead) game.newRun();
    renderer.bottom = 0;
    renderer.playerX = game.run.player.x;
    renderer.playerY = 0;
    game.message = "A new ascent. A stronger legacy.";
    navigate(game.mode);
  };
}
modal.addEventListener("cancel", (e) => {
  if (game.summary) e.preventDefault();
});
el("auto").onclick = () => {
  if (!game.save.upgrades.auto) {
    navigate("upgrades");
    return;
  }
  game.route = [];
  game.auto = !game.auto;
  game.message = game.auto
    ? "Wayfinder is searching for a route."
    : "Manual climbing";
  update();
};
el("undo").onclick = () => {
  game.undo();
  update();
};
el("pause").onclick = () => {
  game.paused = !game.paused;
  update();
};
document
  .querySelectorAll<HTMLButtonElement>("[data-tab]")
  .forEach((b) => (b.onclick = () => navigate(b.dataset.tab!)));
bindInput(
  game,
  renderer,
  inspect,
  () => {
    if (selected && game.world.tile(selected.x, selected.y).kind === "enemy")
      inspect(selected.x, selected.y);
    update();
  },
  () => isBoard(tab),
);
function frame(time: number) {
  if (!document.hidden && isBoard(tab)) {
    renderer.draw(time);
    if (
      game.route.length &&
      !game.paused &&
      !game.summary &&
      !modal.open &&
      time - lastRoute > 130
    ) {
      lastRoute = time;
      game.routeStep();
      update();
    }
    if (
      game.auto &&
      !game.paused &&
      !game.summary &&
      !modal.open &&
      time - lastAuto > 1000 / game.save.settings.speed
    ) {
      lastAuto = time;
      const step = chooseStep(game);
      if (step) {
        game.move(step.dx, step.dy, false);
        game.message = step.label;
      } else
        game.message =
          "Waiting · no safe route. Explore or retire this ascent.";
      update();
    }
  }
  if (time - lastSave > 10000) {
    save();
    lastSave = time;
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  lastAuto = performance.now();
  save();
});
window.addEventListener("pagehide", save);
renderBoard();
update();
requestAnimationFrame(frame);
