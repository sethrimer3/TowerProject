import { TREES, skillAvailable, type TreeId } from "./skill-trees.ts";
import "./style.css";
import { load, persist, defaults } from "./save.ts";
import { Game } from "./state.ts";
import { Renderer } from "./rendering.ts";
import { outsideWeather } from "./outside.ts";
import { bindInput } from "./input.ts";
import { chooseStep } from "./automation.ts";
import { predict } from "./combat.ts";
import {
  UPGRADES,
  cost,
  levelForXp,
  GOLD_SHOP,
  COLORS,
  type UpgradeId,
  type GoldItemId,
} from "./config.ts";
import type { Kind } from "./entities.ts";
import { materialDef, METALS, GEMS, RARE_ENHANCEMENTS, type MaterialId, type MaterialStack, type MetalId } from "./materials.ts";
import {
  EQUIPMENT_SLOTS,
  RECIPES,
  SLOT_NAMES,
  calculateEquipmentStats,
  enhancementTotals,
  ENHANCEMENT_CAPS,
  equipmentName,
  type CraftedEquipment,
  type EquipmentSlot,
} from "./equipment.ts";
import { canCraft, getSalvageReturns, isEquipped, CONSUMABLES, canCraftConsumable, type ConsumableId } from "./crafting.ts";
import { doorColor, doorDescription, doorName } from "./doors.ts";
const icons = { tower: "♜", delve: "▼", gear: "♞", upgrades: "✦", settings: "⚙" };
const SLOT_ICONS: Record<EquipmentSlot, string> = {
  weapon: "⚔", shield: "⛨", helmet: "▲", chestplate: "■", leggings: "▼", boots: "▽", gloves: "✤", necklace: "◇", ring: "○",
};
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main class="shell"><div id="currencies" class="currencies" hidden><div class="essence">✦ <b id="essence">0</b><small>COURAGE</small></div><div class="essence">◆ <b id="shards">0</b><small>INSPIRATION</small></div></div><section id="stats" class="stats" aria-label="Player statistics"><div class="portrait"><canvas id="portrait-sprite" width="24" height="24"></canvas><small>WAYFARER</small><small id="level">LV 0</small><button id="log" aria-label="Adventure log">Log</button></div><div class="vitals"><div><span class="heart">♥</span> HP <b id="hp"></b></div><div class="health-track"><i id="health"></i></div><div class="combat-stats"><span>⚔ <b id="attack"></b></span><span>⛨ <b id="defense"></b></span></div></div><div class="keys"><span class="yellow">⚿ <b id="yellow"></b></span><span class="blue">⚿ <b id="blue"></b></span><span class="red">⚿ <b id="red"></b></span></div><div class="height"><small id="height-label">HEIGHT</small><strong id="height">0</strong><div class="height-bests"><span>RUN <b id="best-run">0</b></span><span>ALL <b id="best-all">0</b></span><span id="best-reward" class="height-reward" hidden>+<b id="best-reward-val">0</b> <i id="best-reward-type">COURAGE</i></span></div></div><div class="actions"><button id="auto-settings" class="mini-action" aria-label="Automove settings" title="Automove settings"><span class="mini-icon">⚙</span><small>SETTINGS</small></button><button id="auto" class="mini-action" aria-label="Automove" title="Automove"><span class="mini-icon">✦</span><small id="auto-state">LOCKED</small></button><button id="undo" class="mini-action" aria-label="Undo" title="Undo"><span class="mini-icon">↺</span><small id="undo-state">0/1</small></button></div></section><section id="board" class="page active"><div class="tower-heading"><span class="rule"></span><span id="board-title">THE HOLLOW SPIRE</span><span class="rule"></span></div><div class="ascent"><span>↑</span><small id="board-subtitle">HIGHER DANGERS · GREATER REWARDS</small></div><div class="board" id="board-frame"><canvas id="world" aria-label="Tower grid: tap a destination or swipe to move. Keyboard arrows and WASD also work."></canvas><span class="board-caption" id="density-label">20 × 20</span><div id="tile-highlight" class="tile-highlight" hidden></div><div id="inspect-box" class="inspect-box" hidden></div></div><div class="status"><span class="live-dot"></span><span id="message" aria-live="polite"></span></div><div class="controls"><div class="dpad" hidden><button data-move="-1,0" aria-label="Move left">←</button><div><button data-move="0,1" aria-label="Move up">↑</button><button data-move="0,-1" aria-label="Move down">↓</button></div><button data-move="1,0" aria-label="Move right">→</button></div></div><div id="inspect" class="inspection"></div></section><section id="gear" class="page"></section><section id="upgrades" class="page"></section><section id="settings" class="page"></section><nav aria-label="Main navigation">${Object.entries(
  icons,
)
  .map(
    ([id, icon]) =>
      `<button data-tab="${id}" class="${id === "tower" ? "selected" : ""}"><span>${icon}</span>${id[0].toUpperCase() + id.slice(1)}</button>`,
  )
  .join(
    "",
  )}</nav></main><dialog id="modal"></dialog>`;
const game = new Game(load());
const renderer = new Renderer(document.querySelector("#world")!, game);
Renderer.drawHero(
  (document.querySelector("#portrait-sprite") as HTMLCanvasElement).getContext("2d")!,
);
let tab = "tower",
  lastAuto = 0,
  lastRoute = 0,
  lastSave = 0,
  deathFaded = false;
const fadeOverlay = document.createElement("div");
fadeOverlay.className = "fade-overlay";
document.body.appendChild(fadeOverlay);
function fadeInFromBlack() {
  fadeOverlay.classList.add("active");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => fadeOverlay.classList.remove("active")),
  );
}
let selectedTree: TreeId = "inspiration";
let selectedSkill: UpgradeId = "shardHp";
let gearTab: "equipped" | "inventory" | "crafting" | "provisions" = "equipped";
let inventoryFilter: EquipmentSlot | "all" = "all";
let craftSlot: EquipmentSlot = "weapon";
let craftMetal: MetalId = "iron";
let craftEnhancements: MaterialStack[] = [];
const el = (id: string) => document.getElementById(id)!;
const text = (id: string, value: unknown) =>
  (el(id).textContent = String(value));
const isBoard = (id: string) => id === "tower" || id === "delve";
function save() {
  if (!persist(game.save))
    game.message =
      "Storage unavailable — progress is only kept for this session.";
}
const KIND_COLORS: Partial<Record<Kind, string>> = {
  wall: "#8d97a8",
  floor: "#8d97a8",
  enemy: "#df797e",
  key: "#eac16b",
  potion: "#e08fd0",
  attack: "#e2a15c",
  defense: "#6dbdf1",
  reward: "#f0cf7a",
  treasure: "#f0cf7a",
  stairs: "#c7cedb",
  stairsDown: "#c7cedb",
  oneway: "#c7cedb",
};
function inspectDetails(x: number, y: number): { color: string; title: string; body: string } {
  const t = game.world.tile(x, y),
    p = game.run.player;
  if (t.kind === "enemy") {
    const e = t.enemy!,
      r = predict(p, e);
    return {
      color: KIND_COLORS.enemy!,
      title: e.name,
      body: `<span>HP ${e.hp} · ATK ${e.attack} · DEF ${e.defense}</span><strong class="${r.survivable ? "safe" : "danger"}">${r.damage} damage · ${r.survivable ? "Survivable" : "LETHAL"}</strong>`,
    };
  }
  if (t.kind === "wall")
    return { color: KIND_COLORS.wall!, title: "Wall", body: "Ancient stone. Find a passage around it." };
  if (t.kind === "door")
    return {
      color: doorColor(t),
      title: doorName(t),
      body: doorDescription(t),
    };
  return {
    color: KIND_COLORS[t.kind] ?? "#c7cedb",
    title: t.kind[0].toUpperCase() + t.kind.slice(1),
    body: game.mode === "tower" ? `Row ${y}` : (t.kind === "floor" ? "Ancient cavern floor" : (t.kind[0].toUpperCase() + t.kind.slice(1))),
  };
}
let inspectBoxVisible = false;
function positionInspectBox(x: number, y: number) {
  const frame = el("board-frame"),
    box = el("inspect-box"),
    frameRect = frame.getBoundingClientRect(),
    canvasRect = renderer.canvas.getBoundingClientRect(),
    s = renderer.size,
    n = renderer.density,
    tileLeft = canvasRect.left - frameRect.left + (x - renderer.left) * s,
    tileTop = canvasRect.top - frameRect.top + (n - 1 - (y - renderer.bottom)) * s,
    boxRect = box.getBoundingClientRect();
  let left = tileLeft + s / 2 - boxRect.width / 2;
  left = Math.max(4, Math.min(frameRect.width - boxRect.width - 4, left));
  let top = tileTop - boxRect.height - 8;
  if (top < 4) top = Math.min(frameRect.height - boxRect.height - 4, tileTop + s + 8);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}
function showInspectBox(x: number, y: number) {
  const d = inspectDetails(x, y),
    box = el("inspect-box");
  box.innerHTML = `<b style="color:${d.color}">${d.title}</b><div>${d.body}</div>`;
  box.hidden = false;
  inspectBoxVisible = true;
  positionInspectBox(x, y);
}
function hideInspectBox() {
  el("inspect-box").hidden = true;
  inspectBoxVisible = false;
}
let highlighted: { x: number; y: number } | null = null;
let highlightFadeTimer: ReturnType<typeof setTimeout> | undefined;
function tileRect(x: number, y: number) {
  const frame = el("board-frame"),
    frameRect = frame.getBoundingClientRect(),
    canvasRect = renderer.canvas.getBoundingClientRect(),
    s = renderer.size,
    n = renderer.density,
    left = canvasRect.left - frameRect.left + (x - renderer.left) * s,
    top = canvasRect.top - frameRect.top + (n - 1 - (y - renderer.bottom)) * s;
  return { left, top, s };
}
function showTileHighlight(x: number, y: number) {
  highlighted = { x, y };
  const { left, top, s } = tileRect(x, y),
    glow = el("tile-highlight");
  clearTimeout(highlightFadeTimer);
  glow.style.left = `${left}px`;
  glow.style.top = `${top}px`;
  glow.style.width = `${s}px`;
  glow.style.height = `${s}px`;
  glow.hidden = false;
  glow.classList.remove("fade-out");
  glow.classList.add("active");
}
function hideTileHighlight() {
  highlighted = null;
  renderer.previewRoute = null;
  hideInspectBox();
  const glow = el("tile-highlight");
  if (glow.hidden) return;
  glow.classList.remove("active");
  glow.classList.add("fade-out");
  clearTimeout(highlightFadeTimer);
  highlightFadeTimer = setTimeout(() => {
    glow.hidden = true;
    glow.classList.remove("fade-out");
  }, 300);
}
function onTap(x: number, y: number) {
  const already = !!(highlighted && highlighted.x === x && highlighted.y === y);
  if (game.save.settings.oneTapMove || already) {
    hideTileHighlight();
    game.walkTo(x, y);
  } else {
    showTileHighlight(x, y);
    if (game.save.settings.showInfoBoxes === false) hideInspectBox();
    else showInspectBox(x, y);
    const route = game.previewRoute(x, y);
    renderer.previewRoute = route && route.length ? route.map((s) => ({ x: s.x, y: s.y })) : null;
  }
}
function update() {
  if (el("board").dataset.outside !== String(!!game.run.outside)) renderBoard();
  const p = game.run.player,
    slice = game.save[game.mode];
  if (highlighted && highlighted.x === p.x && highlighted.y === p.y) hideTileHighlight();
  text("hp", `${p.hp} / ${p.maxHp}`);
  text("attack", p.attack);
  text("defense", p.defense);
  for (const k of ["yellow", "blue", "red"] as const) text(k, p.keys[k]);
  text("height-label", game.mode === "tower" ? "HEIGHT" : "DEPTH");
  const currentVal = game.run.outside ? 0 : (game.mode === "delve" ? p.y : game.run.height);
  const runBest = game.run.maxHeight ?? game.run.height;
  const allBest = slice.best;
  text("height", currentVal);
  text("best-run", runBest);
  text("best-all", allBest);
  const divisor = game.mode === "delve" ? 10 : 1;
  const rewardEl = el("best-reward");
  if (runBest > allBest) {
    const potentialReward = Math.floor(runBest / divisor) - Math.floor(allBest / divisor);
    text("best-reward-val", potentialReward);
    text("best-reward-type", game.mode === "delve" ? "COURAGE" : "INSPIRATION");
    rewardEl.hidden = false;
  } else {
    rewardEl.hidden = true;
  }
  text("essence", game.save.delve.essence);
  text("shards", game.save.tower.shards);
  text("level", `LV ${levelForXp(game.save.xp)}`);
  text(
    "message",
    game.paused
      ? "Paused · take a breath."
      : highlighted
        ? (() => {
            const d = inspectDetails(highlighted!.x, highlighted!.y);
            return `${d.title} — ${d.body.replace(/<[^>]+>/g, " ").trim()}`;
          })()
        : game.message,
  );
  el("health").style.width = `${(100 * p.hp) / p.maxHp}%`;
  text(
    "auto-state",
    game.save.upgrades.auto ? (game.auto ? "ON" : "OFF") : "LOCKED",
  );
  el("auto").classList.toggle("enabled", game.auto);
  text(
    "density-label",
    `${renderer.density} × ${renderer.density}`,
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
  const delveTab = document.querySelector<HTMLButtonElement>('[data-tab="delve"]')!;
  delveTab.classList.toggle("mode-locked", !game.save.upgrades.delve);
  delveTab.title = game.save.upgrades.delve ? "Delve" : "Unlock Into the depths in the Inspiration tree";
  delveTab.setAttribute("aria-label", game.save.upgrades.delve ? "Delve" : "Delve (locked)");
  save();
  if (game.summary) {
    if (game.summary.dead && !deathFaded) {
      deathFaded = true;
      fadeInFromBlack();
    }
    if (game.summary.dead && game.summary.autoDeath) returnToForest();
    else showSummary();
  } else {
    deathFaded = false;
  }
}
function returnToForest() {
  game.summary = null;
  renderer.bottom = 0;
  renderer.playerX = game.run.player.x;
  renderer.playerY = 0;
  game.message = "Follow the forest path to the entrance.";
  navigate(game.mode);
}
function renderBoard() {
  el("board").dataset.outside = String(!!game.run.outside);
  el("board").classList.toggle("mode-tower", game.mode === "tower");
  if (game.run.outside) {
    text("board-title", game.mode === "tower" ? "THE TOWER APPROACH" : "THE MOUNTAIN HOLLOW");
    const labels = { cloudy: "CLOUDY", sunny: "SUNNY", rain: "RAINING", storm: "THUNDERSTORM" };
    text("board-subtitle", `FOREST CLEARING · ${labels[outsideWeather(game.run.seed)]}`);
    el("inspect").textContent = "Follow the forest path and step onto the entrance at the top to begin again.";
    hideTileHighlight();
    return;
  }
  text("board-title", game.mode === "tower" ? "THE ASCENT TRIALS" : "THE HOLLOW SPIRE");
  text(
    "board-subtitle",
    game.mode === "tower"
      ? "ONE CHAMBER AT A TIME"
      : "HIGHER DANGERS · GREATER REWARDS",
  );
  el("inspect").textContent = "";
  hideTileHighlight();
}
function navigate(id: string) {
  if (id === "delve" && !game.save.upgrades.delve) {
    selectedTree = "inspiration";
    selectedSkill = "delve";
    id = "upgrades";
  }
  tab = id;
  renderer.weather.silence();
  if (isBoard(id)) {
    game.switchMode(id as "tower" | "delve");
    renderBoard();
  } else game.route = [];
  el("stats").toggleAttribute("hidden", !isBoard(id));
  el("currencies").toggleAttribute("hidden", id !== "upgrades");
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
  if (tab === "gear") renderGearPage();
  if (tab === "upgrades") {
    const tree = TREES.find(t => t.id === selectedTree)!;
    const locked = !!tree.gate && !game.save.upgrades[tree.gate];
    const node = tree.nodes.find(n => n.id === selectedSkill) ?? tree.nodes[0];
    selectedSkill = node.id;
    const u = UPGRADES.find(u => u.id === node.id)!;
    const level = game.save.upgrades[u.id], price = cost(u.id, level);
    const balance = tree.currency === "shards" ? game.save.tower.shards : game.save.delve.essence;
    const available = skillAvailable(u.id, game.save.upgrades);
    const requirements = node.requires.filter(id => !game.save.upgrades[id]).map(id => UPGRADES.find(u => u.id === id)!.name);
    el("upgrades").innerHTML = `<div class="page-title"><small>WHAT REMAINS WHEN YOU FALL</small><h2>Paths of ascension</h2><p>Follow the branches. Shape your next journey.</p></div>
      <div class="tree-tabs" role="group" aria-label="Skill trees">${TREES.map(t => `<button data-tree="${t.id}" aria-pressed="${t.id === tree.id}"><span>${t.id === "inspiration" ? "◆" : t.id === "courage" ? "✦" : "♜"}</span>${t.name}<small>${t.gate && !game.save.upgrades[t.gate] ? "LOCKED" : "UNLOCKED"}</small></button>`).join("")}</div>
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><small>${locked ? "SEALED PATH" : `${balance} ${tree.currency === "shards" ? "INSPIRATION" : "COURAGE"}`}</small><h3>${tree.name} skill tree</h3><p>${tree.description}</p></header>
      ${locked ? `<p class="tree-lock">Unlock ${UPGRADES.find(u => u.id === tree.gate)!.name} in the ${tree.id === "courage" ? "Inspiration" : "Courage"} tree.</p>` : ""}
      <div class="tree-map"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${tree.nodes.flatMap(n => n.requires.map(id => { const parent = tree.nodes.find(p => p.id === id); return parent ? `<line x1="${parent.x}" y1="${parent.y}" x2="${n.x}" y2="${n.y}" class="${game.save.upgrades[id] ? "lit" : ""}"/>` : ""; })).join("")}</svg>
      ${tree.nodes.map(n => { const skill = UPGRADES.find(u => u.id === n.id)!; const rank = game.save.upgrades[n.id]; return `<button class="skill-node ${rank ? "owned" : ""} ${skillAvailable(n.id, game.save.upgrades) ? "available" : "locked"} ${n.id === node.id ? "chosen" : ""}" data-skill="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${skill.name}, ${rank} of ${skill.max}${skillAvailable(n.id, game.save.upgrades) ? "" : ", locked"}" aria-pressed="${n.id === node.id}"><span class="node-icon">${n.icon}</span><span class="node-name">${skill.name}</span><small>${rank} / ${skill.max}</small></button>`; }).join("")}</div>
      <article class="skill-detail" aria-live="polite"><div><small>${level} / ${u.max} RANKS</small><h3>${u.name}</h3><p>${u.description}.</p><p class="hint">${locked ? "Unlock this tree to learn its skills." : requirements.length ? `Requires: ${requirements.join(" + ")} (one rank each).` : "Revive, undos, and unlocks apply immediately. Starting stats apply next run."}</p></div><button data-buy="${u.id}" ${!available || level >= u.max || balance < price ? "disabled" : ""}>${level >= u.max ? "MASTERED" : `Learn · ${price} ${tree.currency === "shards" ? "Inspiration" : "Courage"}`}</button></article></section>`;
    document.querySelectorAll<HTMLButtonElement>("[data-tree]").forEach(b => b.onclick = () => {
      selectedTree = b.dataset.tree as TreeId;
      selectedSkill = TREES.find(t => t.id === selectedTree)!.nodes[0].id;
      renderPage();
    });
    document.querySelectorAll<HTMLButtonElement>("[data-skill]").forEach(b => b.onclick = () => { selectedSkill = b.dataset.skill as UpgradeId; renderPage(); });
    document.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach(b => b.onclick = () => { game.buy(b.dataset.buy as UpgradeId); update(); renderPage(); });
  }

  if (tab === "settings") {
    el("settings").innerHTML =
      `<div class="page-title"><small>MAKE THE ASCENT YOUR OWN</small><h2>Settings</h2></div><label class="setting">Automove speed<select id="speed">${[1, 3, 6, 10].map((n) => `<option ${game.save.settings.speed === n ? "selected" : ""} value="${n}">${n} steps / sec</option>`).join("")}</select></label><label class="setting">Movement transition<select id="transition">${(["smooth", "fast", "instant"] as const).map((mode) => `<option value="${mode}" ${game.save.settings.transition === mode ? "selected" : ""}>${mode === "instant" ? "Off (instant)" : mode === "fast" ? "Fast" : "Smooth"}</option>`).join("")}</select></label><label class="setting">Show directional buttons<input type="checkbox" id="arrows" ${game.save.settings.showArrows ? "checked" : ""}></label><label class="setting">Reduce motion<input type="checkbox" id="motion" ${game.save.settings.reduceMotion ? "checked" : ""}></label><label class="setting">Weather sounds<input type="checkbox" id="weather-sound" ${game.save.settings.weatherSound !== false ? "checked" : ""}></label><label class="setting">Show info boxes<input type="checkbox" id="info-boxes" ${game.save.settings.showInfoBoxes !== false ? "checked" : ""}></label><label class="setting">Move with one tap<input type="checkbox" id="one-tap" ${game.save.settings.oneTapMove ? "checked" : ""}></label><p class="hint">Automation pauses outside the board tabs and while the browser is hidden. Progress saves after each action.</p><button class="wide" id="retire">Retire this ${game.mode === "tower" ? "ascent" : "delve"}</button><p class="hint">Keep your milestone rewards and enter a freshly generated ${game.mode === "tower" ? "tower" : "descent"}.</p><button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
    (el("speed") as HTMLSelectElement).onchange = (e) => {
      game.save.settings.speed = Number((e.target as HTMLSelectElement).value);
      save();
    };
    (el("arrows") as HTMLInputElement).onchange = (e) => {
      game.save.settings.showArrows = (e.target as HTMLInputElement).checked;
      update();
    };
    (el("weather-sound") as HTMLInputElement).onchange = (e) => {
      game.save.settings.weatherSound = (e.target as HTMLInputElement).checked;
      if (!game.save.settings.weatherSound) renderer.weather.silence();
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
    (el("info-boxes") as HTMLInputElement).onchange = (e) => {
      game.save.settings.showInfoBoxes = (e.target as HTMLInputElement).checked;
      if (!game.save.settings.showInfoBoxes) hideInspectBox();
      save();
    };
    (el("one-tap") as HTMLInputElement).onchange = (e) => {
      game.save.settings.oneTapMove = (e.target as HTMLInputElement).checked;
      save();
    };
    el("retire").onclick = () =>
      confirmAction(
        "Leave your mark?",
        `Retire at ${game.mode === "tower" ? "height" : "depth"} ${game.run.height}. Milestone rewards are already yours. Uncollected clear chests will be claimed.`,
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
          game.mode = "tower";
          game.newRun();
          save();
          navigate("tower");
        },
      );
  }
}
function statBadges(s: { flatAttack: number; flatDefense: number; flatMaxHp: number; percentAttack: number; percentDefense: number; percentMaxHp: number }): string {
  const parts: string[] = [];
  if (s.flatAttack) parts.push(`⚔ +${s.flatAttack}`);
  if (s.flatDefense) parts.push(`⛨ +${s.flatDefense}`);
  if (s.flatMaxHp) parts.push(`♥ +${s.flatMaxHp}`);
  if (s.percentAttack) parts.push(`⚔ +${(s.percentAttack * 100).toFixed(1)}%`);
  if (s.percentDefense) parts.push(`⛨ +${(s.percentDefense * 100).toFixed(1)}%`);
  if (s.percentMaxHp) parts.push(`♥ +${(s.percentMaxHp * 100).toFixed(1)}%`);
  return parts.length ? parts.join(" · ") : "No bonuses";
}
function showItemActions(item: CraftedEquipment, equipped: boolean) {
  modal.innerHTML = `<small>${SLOT_NAMES[item.slot].toUpperCase()} · ${METALS.find(m => m.id === item.metal)!.name.toUpperCase()}</small><h2>${item.name}</h2><p>${statBadges(item)}</p><p class="hint">${item.enhancements.length ? "Enhanced with " + item.enhancements.map(e => `${e.quantity} ${materialDef(e.id).name}`).join(", ") + "." : "No enhancements."}</p><div class="dialog-actions">${equipped ? `<button id="item-unequip">Unequip</button>` : `<button id="item-equip">Equip</button><button id="item-salvage" class="danger">Salvage</button>`}<button id="item-close">Close</button></div>`;
  modal.showModal();
  el("item-close").onclick = () => modal.close();
  const equipBtn = document.querySelector<HTMLButtonElement>("#item-equip");
  if (equipBtn) equipBtn.onclick = () => { game.equipItem(item.id); modal.close(); save(); renderPage(); update(); };
  const unequipBtn = document.querySelector<HTMLButtonElement>("#item-unequip");
  if (unequipBtn) unequipBtn.onclick = () => { game.unequipSlot(item.slot); modal.close(); save(); renderPage(); update(); };
  const salvageBtn = document.querySelector<HTMLButtonElement>("#item-salvage");
  if (salvageBtn) salvageBtn.onclick = () => {
    const returns = getSalvageReturns(item);
    confirmAction(
      "Salvage this item?",
      returns.length ? `Returns ${returns.map(r => `${r.quantity} ${materialDef(r.id).name}`).join(", ")}. This cannot be undone.` : "Returns nothing. This cannot be undone.",
      "Salvage",
      () => { game.salvageEquipment(item.id); save(); renderPage(); update(); },
    );
  };
}
function equippedHtml(): string {
  return `<div class="slot-grid">${EQUIPMENT_SLOTS.map(slot => {
    const id = game.save.equipped[slot];
    const item = id ? game.save.equipmentInventory.find(e => e.id === id) : undefined;
    return `<button class="slot-card ${item ? "filled" : "empty"}" data-slot="${slot}"><div class="item-icon">${SLOT_ICONS[slot]}</div><div><small>${SLOT_NAMES[slot].toUpperCase()}</small><h3>${item ? item.name : "Empty"}</h3><p>${item ? statBadges(item) : "Tap to equip"}</p></div></button>`;
  }).join("")}</div>`;
}
function inventoryHtml(): string {
  const filters = `<div class="tree-tabs slot-filter"><button data-filter="all" aria-pressed="${inventoryFilter === "all"}">All</button>${EQUIPMENT_SLOTS.map(s => `<button data-filter="${s}" aria-pressed="${inventoryFilter === s}">${SLOT_ICONS[s]}</button>`).join("")}</div>`;
  const items = game.save.equipmentInventory.filter(e => inventoryFilter === "all" || e.slot === inventoryFilter);
  const cards = items.length
    ? items.map(item => {
      const equipped = isEquipped(game.save, item.id);
      return `<article class="card"><div class="item-icon">${SLOT_ICONS[item.slot]}</div><div><small>${SLOT_NAMES[item.slot].toUpperCase()} · ${METALS.find(m => m.id === item.metal)!.name.toUpperCase()}${equipped ? " · EQUIPPED" : ""}</small><h3>${item.name}</h3><p>${statBadges(item)}</p></div><div class="card-actions"><button data-inspect="${item.id}">Inspect</button>${equipped ? `<button data-unequip="${item.slot}">Unequip</button>` : `<button data-equip="${item.id}">Equip</button><button data-salvage="${item.id}" class="danger">Salvage</button>`}</div></article>`;
    }).join("")
    : `<p class="hint">No crafted equipment yet. Visit Crafting to build your first piece.</p>`;
  return filters + cards;
}
function craftingHtml(): string {
  const recipe = RECIPES[craftSlot];
  const metalDef = METALS.find(m => m.id === craftMetal)!;
  const owned = (id: MaterialId) => game.save.materials[id] ?? 0;
  const totals = enhancementTotals(craftEnhancements);
  const stats = calculateEquipmentStats(craftSlot, craftMetal, craftEnhancements);
  const ok = canCraft(game.save, craftSlot, craftMetal, craftEnhancements);
  const slotButtons = `<div class="tree-tabs slot-filter">${EQUIPMENT_SLOTS.map(s => `<button data-craft-slot="${s}" aria-pressed="${craftSlot === s}">${SLOT_ICONS[s]} ${SLOT_NAMES[s]}</button>`).join("")}</div>`;
  const metalButtons = `<div class="tree-tabs slot-filter">${METALS.map(m => `<button data-craft-metal="${m.id}" aria-pressed="${craftMetal === m.id}">${m.name}</button>`).join("")}</div>`;
  const barsOwned = owned(metalDef.materialId), commonOwned = owned(recipe.commonMaterial);
  const recipeLine = `<p class="hint">Recipe: <b class="${barsOwned >= recipe.bars ? "safe" : "danger"}">${recipe.bars} ${materialDef(metalDef.materialId).name}</b> (${barsOwned} owned) + <b class="${commonOwned >= recipe.commonAmount ? "safe" : "danger"}">${recipe.commonAmount} ${materialDef(recipe.commonMaterial).name}</b> (${commonOwned} owned)</p>`;
  const stepper = (id: MaterialId, label: string, cap: number, usedInCategory: number) => {
    const qty = craftEnhancements.find(s => s.id === id)?.quantity ?? 0;
    const atCap = usedInCategory >= cap && qty === 0;
    const atOwned = qty >= owned(id);
    return `<div class="stepper"><span>${materialDef(id).name} <small>${label} · ${owned(id)} owned</small></span><div class="stepper-controls"><button data-enh-minus="${id}" ${qty <= 0 ? "disabled" : ""}>−</button><b>${qty}</b><button data-enh-plus="${id}" ${atCap || atOwned ? "disabled" : ""}>+</button></div></div>`;
  };
  const gemRows = GEMS.map(g => stepper(g.id, `+${(g.enhancement.percent * 100).toFixed(1)}% ${g.enhancement.stat}/ea`, ENHANCEMENT_CAPS.gems, totals.gems)).join("");
  const rareRows = (Object.keys(RARE_ENHANCEMENTS) as MaterialId[]).map(id => {
    const def = RARE_ENHANCEMENTS[id]!;
    const label = [def.flatAttack ? `+${def.flatAttack} ATK` : "", def.flatDefense ? `+${def.flatDefense} DEF` : "", def.flatMaxHp ? `+${def.flatMaxHp} HP` : ""].filter(Boolean).join(" ");
    return stepper(id, `${label}/ea`, ENHANCEMENT_CAPS.rareParts, totals.rareParts);
  }).join("");
  const preview = `<p class="hint">Preview — ${equipmentName(craftSlot, craftMetal)}: ${statBadges(stats)}</p>`;
  const craftBtn = `<button class="wide" id="craft-btn" ${ok ? "" : "disabled"}>Craft ${equipmentName(craftSlot, craftMetal)}</button>`;
  const consumableRows = CONSUMABLES.map(c => {
    const ownedC = game.save.consumables[c.id] ?? 0;
    const craftableC = canCraftConsumable(game.save, c.id);
    return `<article class="card"><div class="item-icon">○</div><div><small>${ownedC ? `OWNED × ${ownedC}` : "CONSUMABLE"} · ${c.recipe.map(r => `${r.quantity} ${materialDef(r.id).name}`).join(" + ")}</small><h3>${c.name}</h3><p>${c.description}</p></div><div class="card-actions"><button data-craft-consumable="${c.id}" ${craftableC ? "" : "disabled"}>Craft</button>${ownedC ? `<button data-use-consumable="${c.id}" ${game.run.outside || game.summary ? "disabled" : ""}>Use</button>` : ""}</div></article>`;
  }).join("");
  return `<h3>1. Choose a slot</h3>${slotButtons}<h3>2. Choose a metal</h3>${metalButtons}${recipeLine}<h3>3. Optional enhancements</h3><p class="hint">Up to ${ENHANCEMENT_CAPS.gems} gems and ${ENHANCEMENT_CAPS.rareParts} rare monster parts (${totals.gems}/${ENHANCEMENT_CAPS.gems} gems, ${totals.rareParts}/${ENHANCEMENT_CAPS.rareParts} rare parts selected).</p>${gemRows}${rareRows}${preview}${craftBtn}<h3>Consumables</h3>${consumableRows}`;
}
function provisionsHtml(): string {
  return `<p class="hint">Spend Gold earned in the tower on provisions that apply next run. ◇ ${game.save.gold} Gold.</p>${GOLD_SHOP.map((item) => `<article class="card"><div class="item-icon">◇</div><div><small>${game.save.provisions[item.id] ? `OWNED × ${game.save.provisions[item.id]}` : "APPLIES NEXT RUN"}</small><h3>${item.name}</h3><p>${item.description}</p></div><button data-gold="${item.id}" ${game.save.gold < item.cost ? "disabled" : ""}>Buy · ◇ ${item.cost}</button></article>`).join("")}`;
}
function renderGearPage() {
  const body =
    gearTab === "equipped" ? equippedHtml()
    : gearTab === "inventory" ? inventoryHtml()
    : gearTab === "crafting" ? craftingHtml()
    : provisionsHtml();
  el("gear").innerHTML = `<div class="page-title"><small>YOUR COMPANIONS IN THE DARK</small><h2>Traveler’s gear</h2><p>Craft equipment from persistent materials collected in Tower and Delve, then equip up to nine pieces at once.</p></div>
    <div class="tree-tabs gear-tabs" role="group" aria-label="Gear tabs">
      <button data-geartab="equipped" aria-pressed="${gearTab === "equipped"}">Equipped</button>
      <button data-geartab="inventory" aria-pressed="${gearTab === "inventory"}">Inventory</button>
      <button data-geartab="crafting" aria-pressed="${gearTab === "crafting"}">Crafting</button>
      <button data-geartab="provisions" aria-pressed="${gearTab === "provisions"}">Provisions</button>
    </div>
    ${body}`;
  document.querySelectorAll<HTMLButtonElement>("[data-geartab]").forEach(b => b.onclick = () => { gearTab = b.dataset.geartab as typeof gearTab; renderPage(); });
  document.querySelectorAll<HTMLButtonElement>("[data-gold]").forEach(b => b.onclick = () => { game.buyGold(b.dataset.gold as GoldItemId); save(); renderPage(); });
  document.querySelectorAll<HTMLButtonElement>("[data-slot]").forEach(b => b.onclick = () => {
    const slot = b.dataset.slot as EquipmentSlot;
    const id = game.save.equipped[slot];
    if (id) {
      const item = game.save.equipmentInventory.find(e => e.id === id);
      if (item) showItemActions(item, true);
    } else {
      inventoryFilter = slot;
      gearTab = "inventory";
      renderPage();
    }
  });
  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(b => b.onclick = () => {
    inventoryFilter = b.dataset.filter as EquipmentSlot | "all";
    renderPage();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-inspect]").forEach(b => b.onclick = () => {
    const item = game.save.equipmentInventory.find(e => e.id === b.dataset.inspect);
    if (item) showItemActions(item, isEquipped(game.save, item.id));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-equip]").forEach(b => b.onclick = () => { game.equipItem(b.dataset.equip!); save(); renderPage(); update(); });
  document.querySelectorAll<HTMLButtonElement>("[data-unequip]").forEach(b => b.onclick = () => { game.unequipSlot(b.dataset.unequip as EquipmentSlot); save(); renderPage(); update(); });
  document.querySelectorAll<HTMLButtonElement>("[data-salvage]").forEach(b => b.onclick = () => {
    const item = game.save.equipmentInventory.find(e => e.id === b.dataset.salvage);
    if (!item) return;
    const returns = getSalvageReturns(item);
    confirmAction(
      "Salvage this item?",
      returns.length ? `Returns ${returns.map(r => `${r.quantity} ${materialDef(r.id).name}`).join(", ")}. This cannot be undone.` : "Returns nothing. This cannot be undone.",
      "Salvage",
      () => { game.salvageEquipment(item.id); save(); renderPage(); update(); },
    );
  });
  document.querySelectorAll<HTMLButtonElement>("[data-craft-slot]").forEach(b => b.onclick = () => { craftSlot = b.dataset.craftSlot as EquipmentSlot; craftEnhancements = []; renderPage(); });
  document.querySelectorAll<HTMLButtonElement>("[data-craft-metal]").forEach(b => b.onclick = () => { craftMetal = b.dataset.craftMetal as MetalId; renderPage(); });
  document.querySelectorAll<HTMLButtonElement>("[data-enh-plus]").forEach(b => b.onclick = () => {
    const id = b.dataset.enhPlus as MaterialId;
    const existing = craftEnhancements.find(s => s.id === id);
    if (existing) existing.quantity++; else craftEnhancements.push({ id, quantity: 1 });
    renderPage();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-enh-minus]").forEach(b => b.onclick = () => {
    const id = b.dataset.enhMinus as MaterialId;
    const existing = craftEnhancements.find(s => s.id === id);
    if (existing) { existing.quantity--; if (existing.quantity <= 0) craftEnhancements = craftEnhancements.filter(s => s.id !== id); }
    renderPage();
  });
  const craftBtn = document.querySelector<HTMLButtonElement>("#craft-btn");
  if (craftBtn) craftBtn.onclick = () => {
    if (game.craftEquipment(craftSlot, craftMetal, craftEnhancements)) craftEnhancements = [];
    save();
    renderPage();
  };
  document.querySelectorAll<HTMLButtonElement>("[data-craft-consumable]").forEach(b => b.onclick = () => { game.craftConsumable(b.dataset.craftConsumable as ConsumableId); save(); renderPage(); });
  document.querySelectorAll<HTMLButtonElement>("[data-use-consumable]").forEach(b => b.onclick = () => { game.useConsumable(b.dataset.useConsumable as ConsumableId); save(); renderPage(); update(); });
}
const modal = el("modal") as HTMLDialogElement;
el("log").onclick = () => {
  let page = 0;
  const renderLog = () => {
    const highest = game.save.tower.reached;
    const start = Math.max(0, highest - page * 25);
    const floors = Array.from({ length: Math.min(25, start + 1) }, (_, i) => start - i);
    modal.innerHTML = `<small>WAYFARER’S RECORD</small><h2>Adventure log</h2>
      <div class="summary-stats"><div><strong>${highest}</strong>HIGHEST FLOOR</div><div><strong>${game.save.delve.reached}</strong>DEEPEST DEPTH</div></div>
      <p>${game.save.tower.shards} Inspiration · ${game.save.delve.essence} Courage</p>
      <p class="hint">+1 Inspiration per new height. +1 Courage at each new 10-depth milestone. Revisits never pay again.</p>
      <div class="clear-legend"><p class="silver">Silver · all doors opened and enemies defeated.</p><p class="gold">Gold · Silver with no damage taken anywhere in the ascent.</p><p class="platinum">Platinum · Gold with no keys spent on that floor.</p><p class="diamond">Diamond · future challenge, not yet available.</p></div>
      <p class="hint">Each clear tier earns +1 Inspiration once per floor. Uncollected chests are claimed when you leave.</p>
      <div class="floor-log">${floors.map(floor => {
        const record = game.save.tower.log[floor];
        return `<div class="floor-record"><b>Floor ${floor}</b><span>${record?.earned.length ? record.earned.map(t => `<span class="${t}">${t[0].toUpperCase() + t.slice(1)}${record.claimed.includes(t) ? " ✓" : " · chest"}</span>`).join(" · ") : "Reached"}</span></div>`;
      }).join("")}</div><div class="dialog-actions"><button id="log-newer" ${page === 0 ? "disabled" : ""}>Higher</button><button id="log-older" ${start < 25 ? "disabled" : ""}>Lower</button><button id="log-close">Close</button></div>`;
    el("log-newer").onclick = () => { page--; renderLog(); };
    el("log-older").onclick = () => { page++; renderLog(); };
    el("log-close").onclick = () => modal.close();
  };
  renderLog();
  modal.showModal();
};
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
    currencyName = game.mode === "delve" ? "COURAGE" : "INSPIRATION",
    heightName = game.mode === "tower" ? "ROOMS" : "HEIGHT";
  if (modal.open) return;
  modal.innerHTML = `<span class="summary-icon">✦</span><small>${s.reason.toUpperCase()}</small><h2>The tower remembers.</h2><p>Your milestone and clear rewards are already saved.</p><div class="summary-stats"><div><strong>${s.height}</strong>${heightName}</div><div><strong>${s.kills}</strong>VICTORIES</div><div><strong>${game.mode === "tower" ? game.save.tower.shards : game.save.delve.essence}</strong>${currencyName} SAVED</div></div>${s.record ? "" : `<p class="hint">Milestone rewards were credited as you reached them. Clear rewards are kept.</p>`}${game.save[game.mode].revival ? `<p>Revive is available until your next move. ${currencyName[0]}${currencyName.slice(1).toLowerCase()} is awarded if you continue.</p><button class="wide" id="revive-now">Revive</button>` : ""}<button class="wide" id="again">${s.dead ? `Return to the forest` : "Begin another ascent →"}</button>`;
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
    if (!s.dead) {
      game.summary = null;
      game.newRun(true);
      renderer.bottom = 0;
      renderer.playerX = game.run.player.x;
      renderer.playerY = 0;
      game.message = "Follow the forest path to the entrance.";
      navigate(game.mode);
    } else returnToForest();
  };
}
function showAutoSettings() {
  if (modal.open) return;
  const owned = !!game.save.upgrades.autoPersist;
  modal.innerHTML = `<span class="summary-icon">⚙</span><small>WAYFINDER</small><h2>Automove settings</h2><label class="setting">Turn off upon death<input type="checkbox" id="auto-off-death" ${game.save.settings.autoOffOnDeath !== false ? "checked" : ""} ${owned ? "" : "disabled"}></label><p class="hint">${owned ? "Disable to keep the wayfinder moving after you fall in battle." : "Research Steadfast wayfinder in the Courage tree to configure this."}</p><div class="dialog-actions"><button id="auto-settings-close">Close</button></div>`;
  modal.showModal();
  el("auto-settings-close").onclick = () => modal.close();
  const cb = document.querySelector<HTMLInputElement>("#auto-off-death");
  if (cb)
    cb.onchange = () => {
      game.save.settings.autoOffOnDeath = cb.checked;
      save();
    };
}
modal.addEventListener("cancel", (e) => {
  if (game.summary) e.preventDefault();
});
el("auto-settings").onclick = () => showAutoSettings();
el("auto").onclick = () => {
  if (!game.save.upgrades.auto) {
    selectedTree = game.save.upgrades.delve ? "courage" : "inspiration";
    selectedSkill = game.save.upgrades.delve ? "auto" : "delve";
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
  hideTileHighlight();
  game.undo();
  update();
};
document
  .querySelectorAll<HTMLButtonElement>("[data-tab]")
  .forEach((b) => (b.onclick = () => navigate(b.dataset.tab!)));
bindInput(
  game,
  renderer,
  onTap,
  () => {
    if (highlighted && inspectBoxVisible) showInspectBox(highlighted.x, highlighted.y);
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
el("stats").toggleAttribute("hidden", !isBoard(tab));
el("currencies").toggleAttribute("hidden", tab !== "upgrades");
renderBoard();
update();
requestAnimationFrame(frame);
