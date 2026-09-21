import "./style.css";
import { load, persist, defaults } from "./save.ts";
import { Game } from "./state.ts";
import { Renderer } from "./rendering.ts";
import { bindInput } from "./input.ts";
import { chooseStep } from "./automation.ts";
import { predict } from "./combat.ts";
import { UPGRADES, cost, type UpgradeId } from "./config.ts";
const icons = { tower: "♜", gear: "♞", upgrades: "✦", settings: "⚙" };
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main class="shell"><header class="brand"><div><span class="eyebrow">AN ENDLESS ASCENT</span><h1>Tower<span>Incramental</span></h1></div><div class="essence">✦ <b id="essence">0</b><small>ESSENCE</small></div></header><section class="stats" aria-label="Player statistics"><div class="portrait"><span>♞</span><small>WAYFARER</small></div><div class="vitals"><div><span class="heart">♥</span> HP <b id="hp"></b></div><div class="health-track"><i id="health"></i></div><div class="combat-stats"><span>⚔ <b id="attack"></b></span><span>⛨ <b id="defense"></b></span></div></div><div class="keys"><span class="yellow">⚿ <b id="yellow"></b></span><span class="blue">⚿ <b id="blue"></b></span><span class="red">⚿ <b id="red"></b></span></div><div class="height"><small>HEIGHT</small><strong id="height">0</strong><span>BEST <b id="best">0</b></span></div></section><section id="tower" class="page active"><div class="tower-heading"><span class="rule"></span><span>THE HOLLOW SPIRE</span><span class="rule"></span></div><div class="ascent"><span>↑</span><small>HIGHER DANGERS · GREATER REWARDS</small></div><div class="board"><canvas id="world" aria-label="Tower grid: use arrow keys, WASD, or the directional buttons to move"></canvas><span class="board-caption" id="density-label">20 × 20</span></div><div class="status"><span class="live-dot"></span><span id="message" aria-live="polite"></span></div><div class="controls"><button id="auto" class="auto">✦ AUTO-CLIMB <span>LOCKED</span></button><button id="pause" aria-label="Pause game">Ⅱ</button><div class="dpad"><button data-move="-1,0" aria-label="Move left">←</button><div><button data-move="0,1" aria-label="Move up">↑</button><button data-move="0,-1" aria-label="Move down">↓</button></div><button data-move="1,0" aria-label="Move right">→</button></div></div><div id="inspect" class="inspection">Tap a creature to inspect it. Use arrows, WASD, or the controls to climb.</div></section><section id="gear" class="page"></section><section id="upgrades" class="page"></section><section id="settings" class="page"></section><nav aria-label="Main navigation">${Object.entries(
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
  lastSave = 0;
let selected: { x: number; y: number } | null = null;
const el = (id: string) => document.getElementById(id)!;
const text = (id: string, value: unknown) =>
  (el(id).textContent = String(value));
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
      `<b>${e.name}</b><span>HP ${e.hp} · ATK ${e.attack} · DEF ${e.defense}</span><strong class="${r.survivable ? "safe" : "danger"}">${r.damage} damage · ${r.survivable ? "Survivable" : "LETHAL"}</strong>${!r.survivable && Math.abs(x - p.x) + Math.abs(y - p.y) === 1 ? '<button id="risk">Challenge anyway</button>' : ""}`;
    const risk = document.querySelector<HTMLButtonElement>("#risk");
    if (risk)
      risk.onclick = () =>
        confirmAction(
          "Challenge a lethal foe?",
          "This fight will end your run. Your legacy will be preserved.",
          "Enter battle",
          () => {
            game.move(x - p.x, y - p.y, true);
            update();
          },
        );
  } else {
    el("inspect").textContent =
      t.kind === "wall"
        ? "Ancient stone. Find a passage around it."
        : t.kind === "door"
          ? `${t.color} door · requires one matching key`
          : `${t.kind[0].toUpperCase() + t.kind.slice(1)} · height ${y}`;
  }
}
function update() {
  const p = game.run.player;
  text("hp", `${p.hp} / ${p.maxHp}`);
  text("attack", p.attack);
  text("defense", p.defense);
  for (const k of ["yellow", "blue", "red"] as const) text(k, p.keys[k]);
  text("height", game.run.height);
  text("best", game.save.best);
  text("essence", game.save.essence);
  text("message", game.paused ? "Paused · take a breath." : game.message);
  el("health").style.width = `${(100 * p.hp) / p.maxHp}%`;
  el("auto").innerHTML =
    `✦ AUTO-CLIMB <span>${game.save.upgrades.auto ? (game.auto ? "ON" : "OFF") : "LOCKED"}</span>`;
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
  save();
  if (game.summary) showSummary();
}
function navigate(id: string) {
  tab = id;
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.toggle("active", p.id === id));
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === id);
    b.setAttribute("aria-current", b.dataset.tab === id ? "page" : "false");
  });
  renderPage();
}
function renderPage() {
  if (tab === "gear") {
    el("gear").innerHTML =
      `<div class="page-title"><small>YOUR COMPANIONS IN THE DARK</small><h2>Traveler’s gear</h2><p>Treasure improves both equipped pieces for this ascent.</p></div>${game.run.player.gear.map((g) => `<article class="card"><div class="item-icon">${g.slot === "weapon" ? "⚔" : "⛨"}</div><div><small>${g.slot.toUpperCase()} · QUALITY ${g.quality}</small><h3>${g.name}</h3><p>+${g.attack || g.defense} ${g.attack ? "attack" : "defense"}</p></div></article>`).join("")}<p class="hint">Heirloom steel upgrades improve your starting equipment on every new run.</p>`;
  }
  if (tab === "upgrades") {
    el("upgrades").innerHTML =
      `<div class="page-title"><small>WHAT REMAINS WHEN YOU FALL</small><h2>A lasting legacy</h2><p>Spend Essence to strengthen future ascents. Wayfinder unlocks immediately.</p></div>${UPGRADES.map(
        (u) => {
          const n = game.save.upgrades[u.id],
            c = cost(u.id, n);
          return `<article class="upgrade"><div><h3>${u.name} <small>${n} / ${u.max}</small></h3><p>${u.description}</p></div><button data-buy="${u.id}" ${n >= u.max || c > game.save.essence ? "disabled" : ""}>${n >= u.max ? "MAX" : `✦ ${c}`}</button></article>`;
        },
      ).join(
        "",
      )}<p class="hint">Retire an ascent to earn Essence: 1 per 8 heights, plus combat and treasure bonuses. Minimum 1.</p>`;
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
      `<div class="page-title"><small>MAKE THE ASCENT YOUR OWN</small><h2>Settings</h2></div><label class="setting">Viewport density<select id="density">${[16, 20, 24, 30].map((n) => `<option ${game.save.settings.density === n ? "selected" : ""} value="${n}">${n} × ${n}</option>`).join("")}</select></label><label class="setting">Auto-climb speed<select id="speed">${[1, 3, 6, 10].map((n) => `<option ${game.save.settings.speed === n ? "selected" : ""} value="${n}">${n} steps / sec</option>`).join("")}</select></label><label class="setting">Reduce motion<input type="checkbox" id="motion" ${game.save.settings.reduceMotion ? "checked" : ""}></label><p class="hint">Automation pauses outside the Tower tab and while the browser is hidden. Progress saves after each action.</p><button class="wide" id="retire">Retire this ascent</button><p class="hint">Claim your Essence and enter a freshly generated tower.</p><button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
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
    (el("motion") as HTMLInputElement).onchange = (e) => {
      game.save.settings.reduceMotion = (e.target as HTMLInputElement).checked;
      save();
    };
    el("retire").onclick = () =>
      confirmAction(
        "Leave your mark?",
        `Retire at height ${game.run.height}. You will receive Essence for this ascent.`,
        "Retire ascent",
        () => {
          game.finish("Ascent retired");
          update();
        },
      );
    el("erase").onclick = () =>
      confirmAction(
        "Erase your legacy?",
        "All Essence, upgrades, records, and the current run will be permanently erased.",
        "Erase everything",
        () => {
          game.save = defaults();
          game.summary = null;
          game.newRun();
          save();
          navigate("tower");
          update();
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
  const s = game.summary!;
  if (modal.open) return;
  modal.innerHTML = `<span class="summary-icon">✦</span><small>${s.reason.toUpperCase()}</small><h2>The tower remembers.</h2><p>Every ending is the beginning of a stronger ascent.</p><div class="summary-stats"><div><strong>${s.height}</strong>HEIGHT</div><div><strong>${s.kills}</strong>VICTORIES</div><div><strong>+${s.earned}</strong>ESSENCE</div></div><button class="wide" id="again">Begin another ascent →</button>`;
  modal.showModal();
  el("again").onclick = () => {
    modal.close();
    game.summary = null;
    game.newRun();
    renderer.bottom = 0;
    renderer.playerX = game.run.player.x;
    renderer.playerY = 0;
    game.message = "A new ascent. A stronger legacy.";
    navigate("tower");
    update();
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
  game.auto = !game.auto;
  game.message = game.auto
    ? "Wayfinder is searching for a route."
    : "Manual climbing";
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
  () => tab === "tower",
);
function frame(time: number) {
  if (!document.hidden && tab === "tower") {
    renderer.draw(time);
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
        game.move(step.dx, step.dy);
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
update();
requestAnimationFrame(frame);
