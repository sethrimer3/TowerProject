import { analyzeDelve } from "./delve/analyzer.ts";
import { ownerAt, region, themeInfluence } from "./delve/labyrinth.ts";
import { capabilities, decisions } from "./delve/automove.ts";
import { TreeParticles } from "./tree-particles.ts";
import { TREES, skillAvailable, type TreeId } from "./skill-trees.ts";
import "./style.css";
import { load, persist, defaults } from "./save.ts";
import { Game, type RouteEffects } from "./state.ts";
import { Renderer } from "./rendering.ts";
import { outsideWeather } from "./outside.ts";
import { bindInput } from "./input.ts";
import { chooseStep } from "./automation.ts";
import { towerFloorReport } from "./tower/index.ts";
import { predict } from "./combat.ts";
import { DefendPage } from "./defend/ui.ts";
import {
  UPGRADES,
  cost,
  levelForXp,
  GOLD_SHOP,
  COLORS,
  TOWER_SECTION,
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

// Dungeon coordinates are zero-based internally, but player-facing progress
// starts at 1 once the entrance is crossed. The forest is the sole height /
// depth 0 area.
const displayedProgress = (value: number, outside = false) => outside ? 0 : value + 1;
import { canCraft, getSalvageReturns, isEquipped, CONSUMABLES, canCraftConsumable, type ConsumableId } from "./crafting.ts";
import { doorColor, doorCost, doorDescription, doorName, doorRule, KEY_NAMES } from "./doors.ts";
import { AREA1_ITEM_URLS } from "./area1-tileset.ts";
import { metalBarSprite, monsterPartSprite } from "./material-sprites.ts";
import { drawGameSprite } from "./game-sprites.ts";

type UiSprite = "tower" | "delve" | "defend" | "gear" | "upgrades" | "settings" | "health" | "attack" | "defense" | "undo" | "automove" | "revive" | "log" | "arrow-up" | "arrow-down" | "arrow-left" | "arrow-right" | EquipmentSlot | "gold";
const UI_ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const uiSprite = (name: UiSprite, className = "ui-sprite") =>
  `<img class="${className}" src="${UI_ASSET_BASE}assets/ui/${name}.png" alt="" aria-hidden="true">`;
const itemSprite = (name: keyof typeof AREA1_ITEM_URLS, className = "ui-sprite") =>
  `<img class="${className}" src="${AREA1_ITEM_URLS[name]}" alt="" aria-hidden="true">`;
const skillSprite = (id: UpgradeId) => {
  const reused: Partial<Record<UpgradeId, keyof typeof AREA1_ITEM_URLS>> = {
    shardAttack: "upgrade_attack", attack: "upgrade_attack",
    shardDefense: "upgrade_defense", defense: "upgrade_defense",
    yellow: "key_yellow", blue: "key_blue", red: "key_red",
  };
  if (reused[id]) return itemSprite(reused[id]!, "skill-sprite");
  const generated: Partial<Record<UpgradeId, UiSprite>> = {
    shardHp: "health", hp: "health", shardUndos: "undo", undos: "undo",
    delve: "delve", auto: "automove", autoPersist: "settings",
    revive: "revive", legacy: "tower", quality: "tower",
    wisdomFocus: "settings", wisdomMemory: "undo", wisdomSight: "upgrades",
    renownBanner: "tower", renownOath: "defense", renownCrown: "gear",
  };
  return uiSprite(generated[id] ?? "upgrades", "skill-sprite");
};
const icons = {
  tower: uiSprite("tower"), delve: uiSprite("delve"), defend: uiSprite("defend"), gear: uiSprite("gear"),
  upgrades: uiSprite("upgrades"), settings: uiSprite("settings"),
};
const SLOT_ICONS: Record<EquipmentSlot, string> = {
  weapon: uiSprite("weapon"), shield: uiSprite("shield"), helmet: uiSprite("helmet"),
  chestplate: uiSprite("chestplate"), leggings: uiSprite("leggings"), boots: uiSprite("boots"),
  gloves: uiSprite("gloves"), necklace: uiSprite("necklace"), ring: uiSprite("ring"),
};
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main class="shell"><div id="currencies" class="currencies" hidden><div class="essence">✦ <b id="essence">0</b><small>COURAGE</small></div><div class="essence">◆ <b id="shards">0</b><small>INSPIRATION</small></div></div><section id="stats" class="stats" aria-label="Player statistics"><div class="portrait"><div class="portrait-top"><canvas id="portrait-sprite" width="24" height="24"></canvas><small>WAYFARER</small><small id="level">LV 0</small></div><div class="portrait-actions"><button id="end-run" class="danger" aria-label="End current run">End Run</button><button id="log" aria-label="Adventure log">Log</button><button id="section-pick" aria-label="Choose starting floor" title="Choose starting floor">Floors</button></div></div><div class="vitals"><div class="hp-readout"><span class="heart">♥</span><span>HP</span><b id="hp"></b></div><div class="health-track"><i id="health"></i></div><div class="combat-stats"><span class="attack-stat">⚔ <b id="attack"></b></span><span class="secret-stat-slot" aria-hidden="true"></span><span class="defense-stat">⛨ <b id="defense"></b></span><span class="secret-stat-slot" aria-hidden="true"></span></div><div class="keys"><span class="yellow">⚿ <b id="yellow"></b></span><span class="blue">⚿ <b id="blue"></b></span><span class="red">⚿ <b id="red"></b></span><span id="skeleton-key" class="skeleton-key" hidden><span aria-hidden="true">☠</span> <b id="skeleton"></b></span></div></div><div class="height"><small id="height-label">HEIGHT</small><strong id="height">0</strong><div class="height-bests"><span>RUN <b id="best-run">0</b></span><span>ALL <b id="best-all">0</b></span><span id="best-reward" class="height-reward" hidden>+<b id="best-reward-val">0</b> <i id="best-reward-type">COURAGE</i></span></div></div><div class="actions"><button id="auto-settings" class="mini-action" aria-label="Automove settings" title="Automove settings"><span class="mini-icon">⚙</span><small>SETTINGS</small></button><button id="auto" class="mini-action" aria-label="Automove" title="Automove"><span class="mini-icon">✦</span><small id="auto-state">LOCKED</small></button><button id="undo" class="mini-action" aria-label="Undo" title="Undo"><span class="mini-icon">↺</span><small id="undo-state">0/1</small></button></div></section><section id="board" class="page active"><div class="tower-heading"><span class="rule"></span><span id="board-title">THE HOLLOW SPIRE</span><span class="rule"></span></div><div class="ascent"><span>↑</span><small id="board-subtitle">HIGHER DANGERS · GREATER REWARDS</small></div><div class="board-cell"><div class="board" id="board-frame"><canvas id="world" aria-label="Tower grid: tap a destination or swipe to move. Keyboard arrows and WASD also work."></canvas><span class="board-caption" id="density-label" hidden>20 × 20</span><div id="tile-highlight" class="tile-highlight" hidden></div><div id="inspect-box" class="inspect-box" hidden></div><div id="route-box" class="inspect-box route-box" hidden></div></div></div><div class="status" id="status-row"><span class="live-dot"></span><span id="message" aria-live="polite"></span></div><div class="controls"><div class="dpad" hidden><button data-move="-1,0" aria-label="Move left">←</button><div><button data-move="0,1" aria-label="Move up">↑</button><button data-move="0,-1" aria-label="Move down">↓</button></div><button data-move="1,0" aria-label="Move right">→</button></div></div><div id="inspect" class="inspection"></div></section><section id="defend" class="page"></section><section id="gear" class="page"></section><section id="upgrades" class="page"></section><section id="settings" class="page"></section><nav aria-label="Main navigation">${Object.entries(
  icons,
)
  .map(
    ([id, icon]) =>
      `<button data-tab="${id}" class="${id === "tower" ? "selected" : ""}"><span>${icon}</span>${id[0].toUpperCase() + id.slice(1)}</button>`,
  )
  .join(
    "",
  )}</nav></main><dialog id="modal"></dialog>`;
// The left rail is exclusively for the three mode actions. The identity card
// belongs to the stat cluster, alongside HP/combat and above both item rows.
{
  const oldPortrait = document.querySelector<HTMLElement>(".portrait")!;
  const identity = oldPortrait.querySelector<HTMLElement>(".portrait-top")!;
  const hudActions = oldPortrait.querySelector<HTMLElement>(".portrait-actions")!;
  const vitals = document.querySelector<HTMLElement>(".vitals")!;
  const heightPanel = document.querySelector<HTMLElement>(".height")!;
  const playerStats = document.createElement("div");
  playerStats.className = "player-stats";
  hudActions.classList.add("hud-controls");
  oldPortrait.replaceWith(hudActions, playerStats);
  playerStats.append(identity, vitals);
  heightPanel.insertAdjacentHTML("beforeend", `<div id="height-zone" class="height-zone">THE ASCENT TRIALS</div>`);
  vitals.insertAdjacentHTML(
    "beforeend",
    `<div class="inventory-divider" aria-hidden="true"></div><div class="run-consumables" aria-label="Run consumables">${CONSUMABLES.map(c => `<button type="button" data-hud-consumable="${c.id}" aria-label="Use ${c.name}" title="${c.name}: ${c.description}">${itemSprite("potion_flat", "consumable-sprite")}<b data-consumable-count="${c.id}">0</b></button>`).join("")}</div>`,
  );
  const boardFrame = document.querySelector<HTMLElement>("#board-frame")!;
  boardFrame.append(
    document.querySelector<HTMLElement>("#status-row")!,
    document.querySelector<HTMLElement>(".controls")!,
    document.querySelector<HTMLElement>("#inspect")!,
  );
}
const replaceGlyph = (selector: string, sprite: string) => {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  if (target.firstChild?.nodeType === Node.TEXT_NODE) target.firstChild.textContent = "";
  target.insertAdjacentHTML("afterbegin", sprite);
};
replaceGlyph(".currencies .essence:first-child", uiSprite("automove"));
replaceGlyph(".currencies .essence:last-child", uiSprite("upgrades"));
replaceGlyph(".heart", uiSprite("health"));
replaceGlyph(".combat-stats .attack-stat", itemSprite("upgrade_attack"));
replaceGlyph(".combat-stats .defense-stat", itemSprite("upgrade_defense"));
replaceGlyph(".keys .yellow", itemSprite("key_yellow"));
replaceGlyph(".keys .blue", itemSprite("key_blue"));
replaceGlyph(".keys .red", itemSprite("key_red"));
(document.querySelector("#auto-settings .mini-icon") as HTMLElement).innerHTML = uiSprite("settings");
(document.querySelector("#auto .mini-icon") as HTMLElement).innerHTML = uiSprite("automove");
(document.querySelector("#undo .mini-icon") as HTMLElement).innerHTML = uiSprite("undo");
(document.querySelector("#log") as HTMLElement).insertAdjacentHTML("afterbegin", uiSprite("log"));
(document.querySelector(".ascent > span") as HTMLElement).innerHTML = uiSprite("arrow-up");
const movementSprites: Record<string, UiSprite> = {
  "-1,0": "arrow-left", "1,0": "arrow-right", "0,1": "arrow-up", "0,-1": "arrow-down",
};
document.querySelectorAll<HTMLElement>("[data-move]").forEach((button) => {
  button.innerHTML = uiSprite(movementSprites[button.dataset.move!]!);
});
const game = new Game(load());
const renderer = new Renderer(document.querySelector("#world")!, game);
{
  const portraitCtx = (document.querySelector("#portrait-sprite") as HTMLCanvasElement).getContext("2d")!;
  if (game.save.settings.spritesOff || !drawGameSprite(portraitCtx, "player")) {
    Renderer.drawHero(portraitCtx);
  }
}
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
const treeParticles = new TreeParticles();
let selectedSkill: UpgradeId = "shardHp";
let treeTooltipVisible = false;
const treeViews: Partial<Record<TreeId, { x: number; y: number; scale: number }>> = {};
function getTreeView(id: TreeId) {
  return treeViews[id] ?? (treeViews[id] = { x: 0, y: 0, scale: 1 });
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
let gearTab: "equipped" | "inventory" | "crafting" | "provisions" = "equipped";
let inventoryFilter: EquipmentSlot | "all" = "all";
let craftSlot: EquipmentSlot = "weapon";
let craftMetal: MetalId = "iron";
let craftEnhancements: MaterialStack[] = [];
const el = (id: string) => document.getElementById(id)!;
const text = (id: string, value: unknown) =>
  (el(id).textContent = String(value));
const devAmount = (value: number) => game.save.settings.devMode ? "∞" : String(value);
const materialAmount = (id: MaterialId, value: number) => {
  const category = materialDef(id).category;
  return game.save.settings.devMode && (category === "metal" || category.startsWith("monster-"))
    ? "∞"
    : String(value);
};
const isBoard = (id: string) => id === "tower" || id === "delve";
function save() {
  if (!persist(game.save))
    game.message =
      "Storage unavailable — progress is only kept for this session.";
}
const defendPage = new DefendPage(el("defend"), {
  save: () => game.save.defend,
  wallet: () => ({ gold: game.save.gold, ironBar: game.save.materials.ironBar, steelBar: game.save.materials.steelBar }),
  setWallet: (w) => {
    game.save.gold = w.gold;
    game.save.materials.ironBar = w.ironBar;
    game.save.materials.steelBar = w.steelBar;
  },
  persist: save,
  reduceMotion: () => game.save.settings.reduceMotion,
  devMode: () => game.save.settings.devMode === true,
});
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
      body: `<span>HP ${e.hp} · ATK ${e.attack} · DEF ${e.defense}</span><br><strong class="${r.survivable ? "safe" : "danger"}">${r.damage} damage · ${r.survivable ? "Survivable" : "LETHAL"}</strong>`,
    };
  }
  if (t.kind === "wall")
    return { color: KIND_COLORS.wall!, title: "Wall", body: "Ancient stone. Find a passage around it." };
  if (t.kind === "door") {
    const rule = doorRule(t),
      cost = doorCost(t, p);
    const keyLine =
      rule.type === "fullHp"
        ? ""
        : `<br>${cost
            ? cost.map((color) => `${KEY_NAMES[color]} key: ${p.keys[color]} → ${p.keys[color] - 1}`).join(", ")
            : "Locked — insufficient keys"}`;
    return {
      color: doorColor(t),
      title: doorName(t),
      body: `<span>${doorDescription(t)}</span>${keyLine}`,
    };
  }
  if (t.kind === "key") {
    const color = t.color!,
      name = KEY_NAMES[color];
    return {
      color: KIND_COLORS.key!,
      title: `${name} Key`,
      body: `<span>Unlocks ${name} doors</span><br>Keys: ${p.keys[color]} → ${p.keys[color] + 1}`,
    };
  }
  if (t.kind === "potion") {
    const gain = Math.min(p.maxHp - p.hp, t.amount ?? 35);
    return {
      color: KIND_COLORS.potion!,
      title: "Potion",
      body: `<span>Restores HP</span><br>(${p.hp} → ${p.hp + gain})`,
    };
  }
  if (t.kind === "stairs" || t.kind === "stairsDown") {
    if (game.run.outside)
      return {
        color: KIND_COLORS[t.kind]!,
        title: "Stairs",
        body: game.mode === "tower" ? "Begin the climb — Floor 1" : "Descend into the cave",
      };
    const target = t.kind === "stairs" ? game.run.height + 2 : game.run.height;
    return {
      color: KIND_COLORS[t.kind]!,
      title: t.kind === "stairs" ? "Stairs Up" : "Stairs Down",
      body: `Leads to Floor ${target}`,
    };
  }
  if (t.kind === "floor")
    return {
      color: KIND_COLORS.floor!,
      title: "Floor",
      body: game.mode === "tower" ? "Well-worn stone floor." : "Ancient cavern floor.",
    };
  if (t.kind === "attack")
    return { color: KIND_COLORS.attack!, title: "Attack Shard", body: "Raises ATK by 2 for this run." };
  if (t.kind === "defense")
    return { color: KIND_COLORS.defense!, title: "Defense Shard", body: "Raises DEF by 1 for this run." };
  if (t.kind === "treasure")
    return { color: KIND_COLORS.treasure!, title: "Treasure", body: "Contains gold and crafting materials." };
  if (t.kind === "reward")
    return { color: KIND_COLORS.reward!, title: "Reward Chest", body: "Clear reward — claim it here." };
  return {
    color: KIND_COLORS[t.kind] ?? "#c7cedb",
    title: t.kind[0].toUpperCase() + t.kind.slice(1),
    body: "One-way passage.",
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
let routeBoxVisible = false;
let lastRouteEffects: RouteEffects | null = null;
function positionRouteBox() {
  const frame = el("board-frame"),
    inspectBox = el("inspect-box"),
    routeBox = el("route-box"),
    frameRect = frame.getBoundingClientRect(),
    inspectTop = parseFloat(inspectBox.style.top) || 0,
    inspectLeft = parseFloat(inspectBox.style.left) || 0,
    inspectHeight = inspectBox.getBoundingClientRect().height,
    routeRect = routeBox.getBoundingClientRect();
  let left = Math.max(4, Math.min(frameRect.width - routeRect.width - 4, inspectLeft));
  let top = inspectTop + inspectHeight + 6;
  if (top + routeRect.height > frameRect.height - 4) top = inspectTop - routeRect.height - 6;
  routeBox.style.left = `${left}px`;
  routeBox.style.top = `${top}px`;
}
function showRouteBox(effects: RouteEffects) {
  const lines: string[] = [];
  if (effects.hp[0] !== effects.hp[1]) lines.push(`HP (${effects.hp[0]} → ${effects.hp[1]})`);
  if (effects.attack[0] !== effects.attack[1]) lines.push(`Atk (+${effects.attack[0]} → +${effects.attack[1]})`);
  if (effects.defense[0] !== effects.defense[1]) lines.push(`Def (+${effects.defense[0]} → +${effects.defense[1]})`);
  for (const color of ["yellow", "blue", "red"] as const) {
    const change = effects.keys[color];
    if (change) lines.push(`${KEY_NAMES[color]} Key (${change[0]} → ${change[1]})`);
  }
  const box = el("route-box");
  if (!lines.length) {
    box.hidden = true;
    routeBoxVisible = false;
    return;
  }
  box.innerHTML = `<b>Route totals</b><div>${lines.join("<br>")}</div>`;
  box.hidden = false;
  routeBoxVisible = true;
  positionRouteBox();
}
function hideRouteBox() {
  el("route-box").hidden = true;
  routeBoxVisible = false;
  lastRouteEffects = null;
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
  hideRouteBox();
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
    const infoDisplay = game.save.settings.infoDisplay ?? "both";
    const showPopup = infoDisplay === "popup" || infoDisplay === "both";
    if (showPopup) showInspectBox(x, y);
    else hideInspectBox();
    const route = game.previewRoute(x, y);
    renderer.previewRoute = route && route.length ? route.map((s) => ({ x: s.x, y: s.y })) : null;
    const effects = showPopup && route ? game.previewRouteEffects(route) : null;
    if (effects) showRouteBox(effects);
    else hideRouteBox();
    lastRouteEffects = effects;
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
  const skeletonKeys = p.skeletonKeys ?? 0;
  text("skeleton", skeletonKeys);
  el("skeleton-key").hidden = skeletonKeys < 1;
  for (const c of CONSUMABLES) {
    const count = game.save.consumables[c.id] ?? 0;
    const countEl = document.querySelector<HTMLElement>(`[data-consumable-count="${c.id}"]`)!;
    const button = countEl.closest("button") as HTMLButtonElement;
    countEl.textContent = String(count);
    button.disabled = count < 1 || game.run.outside || !!game.summary;
  }
  text("height-label", game.mode === "tower" ? "HEIGHT" : "DEPTH");
  const currentVal = displayedProgress(game.run.height, !!game.run.outside);
  const rawRunBest = game.run.maxHeight ?? game.run.height;
  const rawAllBest = slice.best;
  const runBest = displayedProgress(rawRunBest, !!game.run.outside);
  const allBest = displayedProgress(rawAllBest);
  text("height", currentVal);
  text("best-run", runBest);
  text("best-all", allBest);
  const divisor = game.mode === "delve" ? 10 : 1;
  const rewardEl = el("best-reward");
  if (rawRunBest > rawAllBest) {
    const potentialReward = Math.floor(rawRunBest / divisor) - Math.floor(rawAllBest / divisor);
    text("best-reward-val", potentialReward);
    text("best-reward-type", game.mode === "delve" ? "COURAGE" : "INSPIRATION");
    rewardEl.hidden = false;
  } else {
    rewardEl.hidden = true;
  }
  const towerActions = game.mode === "tower";
  const logButton = el("log") as HTMLButtonElement;
  const floorsButton = el("section-pick") as HTMLButtonElement;
  logButton.textContent = towerActions ? "Log" : "Button 1";
  logButton.setAttribute("aria-label", towerActions ? "Adventure log" : "Future Delve action 1");
  floorsButton.textContent = towerActions ? "Floors" : "Button 2";
  floorsButton.setAttribute("aria-label", towerActions ? "Choose starting floor" : "Future Delve action 2");
  floorsButton.title = towerActions ? "Choose starting floor" : "Future Delve action 2";
  logButton.classList.toggle("placeholder-action", !towerActions);
  floorsButton.classList.toggle("placeholder-action", !towerActions);
  text("essence", devAmount(game.save.delve.essence));
  text("shards", devAmount(game.save.tower.shards));
  text("level", `LV ${levelForXp(game.save.xp)}`);
  const infoDisplay = game.save.settings.infoDisplay ?? "both";
  const showStatusInfo = highlighted && (infoDisplay === "status" || infoDisplay === "both");
  el("status-row").hidden = infoDisplay === "popup";
  text(
    "message",
    game.paused
      ? "Paused · take a breath."
      : showStatusInfo
        ? (() => {
            const d = inspectDetails(highlighted!.x, highlighted!.y);
            return `${d.title} — ${d.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`;
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
  const delveTab = document.querySelector<HTMLButtonElement>('[data-tab="delve"]');
  if (delveTab) {
    delveTab.hidden = !game.save.upgrades.delve;
    delveTab.title = game.save.upgrades.delve ? "Delve" : "Unlock Into the depths in the Inspiration tree";
    delveTab.setAttribute("aria-label", game.save.upgrades.delve ? "Delve" : "Delve (locked)");
  }
  const defendTab = document.querySelector<HTMLButtonElement>('[data-tab="defend"]');
  if (defendTab) {
    defendTab.hidden = !game.save.upgrades.legacy;
    defendTab.title = game.save.upgrades.legacy ? "Defend" : "Unlock An enduring legacy in the Courage tree";
    defendTab.setAttribute("aria-label", game.save.upgrades.legacy ? "Defend" : "Defend (locked)");
  }
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
    text("height-zone", game.mode === "tower" ? "THE TOWER APPROACH" : "THE MOUNTAIN HOLLOW");
    const labels = { cloudy: "CLOUDY", sunny: "SUNNY", rain: "RAINING", storm: "THUNDERSTORM" };
    text("board-subtitle", `FOREST CLEARING · ${labels[outsideWeather(game.run.seed)]}`);
    el("inspect").textContent = "Follow the forest path and step onto the entrance at the top to begin again.";
    hideTileHighlight();
    return;
  }
  text("board-title", game.mode === "tower" ? "THE ASCENT TRIALS" : "THE HOLLOW SPIRE");
  text("height-zone", game.mode === "tower" ? "THE ASCENT TRIALS" : "THE HOLLOW SPIRE");
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
    treeTooltipVisible = true;
    id = "upgrades";
  }
  if (id === "defend" && !game.save.upgrades.legacy) {
    selectedTree = "courage";
    selectedSkill = "legacy";
    treeTooltipVisible = true;
    id = "upgrades";
  }
  if (id !== "defend") defendPage.pause();
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
function skillTooltipHtml(id: UpgradeId): string {
  const tree = TREES.find(t => t.id === selectedTree)!;
  const node = tree.nodes.find(n => n.id === id)!;
  const u = UPGRADES.find(u => u.id === id)!;
  const level = game.save.upgrades[id];
  const price = cost(id, level);
  const balance = tree.currency === "shards" ? game.save.tower.shards : game.save.delve.essence;
  const available = skillAvailable(id, game.save.upgrades);
  const locked = !!tree.gate && !game.save.upgrades[tree.gate];
  const maxed = level >= u.max;
  const requirements = node.requires.filter(rid => !game.save.upgrades[rid]).map(rid => UPGRADES.find(u => u.id === rid)!.name);
  const currency = tree.currency === "shards" ? "Inspiration" : "Courage";
  let hint: string;
  if (locked) hint = "Unlock this tree to learn its skills.";
  else if (maxed) hint = "Mastered.";
  else if (requirements.length) hint = `Requires: ${requirements.join(" + ")} (one rank each).`;
  else if (!available) hint = "Locked.";
  else if (balance < price) hint = `Need ${price} ${currency} · have ${balance}.`;
  else hint = "Tap again to purchase.";
  const canBuy = !locked && !maxed && available && balance >= price;
  return `<b style="color:var(--tree-color)">${u.name}</b><div>${level} / ${u.max} ranks</div><div>${u.description}.</div><div class="${canBuy ? "safe" : ""}">${hint}</div>${!maxed && !locked ? `<div>Cost: ${price} ${currency}</div>` : ""}`;
}
function positionTreeTooltip(nodeEl: HTMLElement) {
  const viewport = el("tree-viewport"),
    tooltip = el("tree-tooltip"),
    viewportRect = viewport.getBoundingClientRect(),
    nodeRect = nodeEl.getBoundingClientRect(),
    tooltipRect = tooltip.getBoundingClientRect();
  let left = nodeRect.left - viewportRect.left + nodeRect.width / 2 - tooltipRect.width / 2;
  left = clamp(left, 4, viewportRect.width - tooltipRect.width - 4);
  let top = nodeRect.top - viewportRect.top - tooltipRect.height - 8;
  if (top < 4) top = nodeRect.bottom - viewportRect.top + 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
function showTreeTooltip(id: UpgradeId) {
  const nodeEl = document.querySelector<HTMLElement>(`[data-skill="${id}"]`);
  if (!nodeEl) return;
  const tooltip = el("tree-tooltip");
  tooltip.innerHTML = skillTooltipHtml(id);
  tooltip.hidden = false;
  positionTreeTooltip(nodeEl);
}
function hideTreeTooltip() {
  const tooltip = document.getElementById("tree-tooltip");
  if (tooltip) tooltip.hidden = true;
}
function handleSkillTap(id: UpgradeId) {
  const tree = TREES.find(t => t.id === selectedTree)!;
  if (selectedSkill === id && treeTooltipVisible) {
    const locked = !!tree.gate && !game.save.upgrades[tree.gate];
    const u = UPGRADES.find(u => u.id === id)!;
    const level = game.save.upgrades[id];
    const price = cost(id, level);
    const balance = tree.currency === "shards" ? game.save.tower.shards : game.save.delve.essence;
    const available = skillAvailable(id, game.save.upgrades);
    if (!locked && level < u.max && available && balance >= price) {
      game.buy(id);
      if (game.save.upgrades[id] > level && !game.save.settings.reduceMotion) treeParticles.purchase(tree.nodes.find(n => n.id === id)!);
      update();
    }
    renderPage();
    return;
  }
  selectedSkill = id;
  treeTooltipVisible = true;
  renderPage();
}
function setupTreeViewport(treeId: TreeId) {
  const viewport = el("tree-viewport"),
    map = el("tree-map"),
    view = getTreeView(treeId);
  function clampView() {
    const width = viewport.clientWidth,
      height = viewport.clientHeight,
      scaledWidth = width * view.scale,
      scaledHeight = height * view.scale;
    view.x = scaledWidth <= width ? (width - scaledWidth) / 2 : clamp(view.x, width - scaledWidth, 0);
    view.y = scaledHeight <= height ? (height - scaledHeight) / 2 : clamp(view.y, height - scaledHeight, 0);
  }
  function applyView() {
    clampView();
    map.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  }
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false, moved = false, startX = 0, startY = 0, startViewX = 0, startViewY = 0, pinchStartDist = 0, pinchStartScale = 1, downTarget: HTMLElement | null = null;
  viewport.onpointerdown = (e) => {
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      startViewX = view.x;
      startViewY = view.y;
      downTarget = e.target as HTMLElement;
    } else if (pointers.size === 2) {
      dragging = false;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScale = view.scale;
    }
  };
  viewport.onpointermove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDist > 0) {
        view.scale = clamp(pinchStartScale * (dist / pinchStartDist), 0.75, 2.5);
        applyView();
      }
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - startX,
      dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    if (moved) {
      view.x = startViewX + dx;
      view.y = startViewY + dy;
      applyView();
      if (treeTooltipVisible) {
        treeTooltipVisible = false;
        hideTreeTooltip();
      }
    }
  };
  function endPointer(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size === 0) {
      const wasDragging = dragging;
      dragging = false;
      if (wasDragging && !moved) {
        const target = downTarget?.closest<HTMLElement>("[data-skill]");
        if (target) handleSkillTap(target.dataset.skill as UpgradeId);
        else if (treeTooltipVisible) {
          treeTooltipVisible = false;
          hideTreeTooltip();
        }
      }
    }
  }
  viewport.onpointerup = endPointer;
  viewport.onpointercancel = endPointer;
  viewport.onwheel = (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect(),
      cx = e.clientX - rect.left,
      cy = e.clientY - rect.top,
      prevScale = view.scale,
      newScale = clamp(prevScale * (e.deltaY < 0 ? 1.1 : 0.9), 0.75, 2.5);
    view.x = cx - (cx - view.x) * (newScale / prevScale);
    view.y = cy - (cy - view.y) * (newScale / prevScale);
    view.scale = newScale;
    applyView();
    if (treeTooltipVisible) showTreeTooltip(selectedSkill);
  };
  applyView();
}
function renderPage() {
  if (tab === "defend") defendPage.show();
  if (tab === "gear") renderGearPage();
  if (tab === "upgrades") {
    const tree = TREES.find(t => t.id === selectedTree)!;
    const locked = !!tree.gate && !game.save.upgrades[tree.gate];
    const view = getTreeView(tree.id);
    el("upgrades").innerHTML = `<div class="tree-tabs" role="group" aria-label="Skill trees">${TREES.map(t => `<button data-tree="${t.id}" aria-pressed="${t.id === tree.id}"><span>${uiSprite(t.id === "inspiration" ? "upgrades" : t.id === "courage" ? "automove" : t.id === "legacy" ? "tower" : t.id === "wisdom" ? "settings" : "defend")}</span>${t.name}<small>${t.gate && !game.save.upgrades[t.gate] ? "LOCKED" : "UNLOCKED"}</small></button>`).join("")}</div>
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><h3>${tree.name} skill tree</h3></header>
      ${locked ? `<p class="tree-lock">Unlock ${UPGRADES.find(u => u.id === tree.gate)!.name} in the ${tree.id === "courage" ? "Inspiration" : "Courage"} tree.</p>` : ""}
      <div class="tree-viewport" id="tree-viewport"><div class="tree-map" id="tree-map" style="transform:translate(${view.x}px,${view.y}px) scale(${view.scale})"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${tree.nodes.flatMap(n => n.requires.map(id => { const parent = tree.nodes.find(p => p.id === id); return parent ? `<line x1="${parent.x}" y1="${parent.y}" x2="${n.x}" y2="${n.y}" class="${game.save.upgrades[id] ? "lit" : ""}"/>` : ""; })).join("")}</svg>
      <canvas class="tree-particles" aria-hidden="true"></canvas>
      ${tree.nodes.map(n => { const skill = UPGRADES.find(u => u.id === n.id)!; const rank = game.save.upgrades[n.id]; return `<button class="skill-node ${rank ? "owned" : ""} ${skillAvailable(n.id, game.save.upgrades) ? "available" : "locked"} ${n.id === selectedSkill && treeTooltipVisible ? "chosen" : ""}" data-skill="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${skill.name}, ${rank} of ${skill.max}${skillAvailable(n.id, game.save.upgrades) ? "" : ", locked"}" aria-pressed="${n.id === selectedSkill && treeTooltipVisible}"><span class="node-icon">${skillSprite(n.id)}</span><span class="node-name">${skill.name}</span><small>${rank} / ${skill.max}</small></button>`; }).join("")}</div><div class="inspect-box tree-tooltip" id="tree-tooltip" hidden></div></div></section>`;
    document.querySelectorAll<HTMLButtonElement>("[data-tree]").forEach(b => b.onclick = () => {
      selectedTree = b.dataset.tree as TreeId;
      treeTooltipVisible = false;
      renderPage();
    });
    setupTreeViewport(tree.id);
    if (treeTooltipVisible && tree.nodes.some(n => n.id === selectedSkill)) showTreeTooltip(selectedSkill);
  }

  if (tab === "settings") {
    el("settings").innerHTML =
      `<div class="page-title"><small>MAKE THE ASCENT YOUR OWN</small><h2>Settings</h2></div><label class="setting">Automove speed<select id="speed">${[1, 3, 6, 10].map((n) => `<option ${game.save.settings.speed === n ? "selected" : ""} value="${n}">${n} steps / sec</option>`).join("")}</select></label><label class="setting">Movement transition<select id="transition">${(["smooth", "fast", "instant"] as const).map((mode) => `<option value="${mode}" ${game.save.settings.transition === mode ? "selected" : ""}>${mode === "instant" ? "Off (instant)" : mode === "fast" ? "Fast" : "Smooth"}</option>`).join("")}</select></label><label class="setting">Brightness<span class="range-setting"><input type="range" id="brightness" min="20" max="100" step="5" value="${game.save.settings.brightness ?? 100}" aria-label="Dungeon brightness"><output id="brightness-value">${game.save.settings.brightness ?? 100}</output></span></label><label class="setting">Turn off Sprites<input type="checkbox" id="sprites-off" ${game.save.settings.spritesOff ? "checked" : ""}></label><label class="setting">Environment decor<input type="checkbox" id="decor" ${game.save.settings.decorOff ? "" : "checked"}></label><label class="setting">Battery saver (30 fps while idle)<input type="checkbox" id="battery-saver" ${game.save.settings.batterySaver ? "checked" : ""}></label><label class="setting">Show directional buttons<input type="checkbox" id="arrows" ${game.save.settings.showArrows ? "checked" : ""}></label><label class="setting">Reduce motion<input type="checkbox" id="motion" ${game.save.settings.reduceMotion ? "checked" : ""}></label><label class="setting">Weather sounds<input type="checkbox" id="weather-sound" ${game.save.settings.weatherSound !== false ? "checked" : ""}></label><label class="setting">Tile info display<select id="info-display">${([["both", "Popup + status line"], ["popup", "Popup only"], ["status", "Status line only"], ["none", "Off"]] as const).map(([mode, label]) => `<option value="${mode}" ${(game.save.settings.infoDisplay ?? "both") === mode ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="setting">Move with one tap<input type="checkbox" id="one-tap" ${game.save.settings.oneTapMove ? "checked" : ""}></label><label class="setting">Dev mode (unlimited currency, all floors &amp; modes unlocked)<input type="checkbox" id="dev-mode" ${game.save.settings.devMode ? "checked" : ""}></label><p class="hint">Automation pauses outside the board tabs and while the browser is hidden. Progress saves after each action.</p><button class="wide" id="retire">Retire this ${game.mode === "tower" ? "ascent" : "delve"}</button><p class="hint">Keep your milestone rewards and enter a freshly generated ${game.mode === "tower" ? "tower" : "descent"}.</p><button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
    (el("speed") as HTMLSelectElement).onchange = (e) => {
      game.save.settings.speed = Number((e.target as HTMLSelectElement).value);
      save();
    };
    (el("arrows") as HTMLInputElement).onchange = (e) => {
      game.save.settings.showArrows = (e.target as HTMLInputElement).checked;
      update();
    };
    // Live preview while dragging; the renderer reads the setting each frame.
    (el("brightness") as HTMLInputElement).oninput = (e) => {
      const value = Number((e.target as HTMLInputElement).value);
      game.save.settings.brightness = value;
      el("brightness-value").textContent = String(value);
    };
    (el("brightness") as HTMLInputElement).onchange = () => save();
    (el("sprites-off") as HTMLInputElement).onchange = (e) => {
      game.save.settings.spritesOff = (e.target as HTMLInputElement).checked;
      save();
    };
    (el("decor") as HTMLInputElement).onchange = (e) => {
      game.save.settings.decorOff = !(e.target as HTMLInputElement).checked;
      save();
    };
    (el("battery-saver") as HTMLInputElement).onchange = (e) => {
      game.save.settings.batterySaver = (e.target as HTMLInputElement).checked;
      save();
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
    (el("info-display") as HTMLSelectElement).onchange = (e) => {
      game.save.settings.infoDisplay = (e.target as HTMLSelectElement)
        .value as typeof game.save.settings.infoDisplay;
      if (game.save.settings.infoDisplay === "status" || game.save.settings.infoDisplay === "none") hideInspectBox();
      save();
      update();
    };
    (el("one-tap") as HTMLInputElement).onchange = (e) => {
      game.save.settings.oneTapMove = (e.target as HTMLInputElement).checked;
      save();
    };
    (el("dev-mode") as HTMLInputElement).onchange = (e) => {
      game.setDevMode((e.target as HTMLInputElement).checked);
      save();
      update();
      renderPage();
    };
    el("retire").onclick = () =>
      confirmAction(
        "Leave your mark?",
        `Retire at ${game.mode === "tower" ? "height" : "depth"} ${displayedProgress(game.run.height, !!game.run.outside)}. Milestone rewards are already yours. Uncollected clear chests will be claimed.`,
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
          game.newRun(true);
          save();
          navigate("tower");
        },
      );
  }
}
function statBadges(s: { flatAttack: number; flatDefense: number; flatMaxHp: number; percentAttack: number; percentDefense: number; percentMaxHp: number }): string {
  const parts: string[] = [];
  if (s.flatAttack) parts.push(`${itemSprite("upgrade_attack", "stat-sprite")} +${s.flatAttack}`);
  if (s.flatDefense) parts.push(`${itemSprite("upgrade_defense", "stat-sprite")} +${s.flatDefense}`);
  if (s.flatMaxHp) parts.push(`${uiSprite("health", "stat-sprite")} +${s.flatMaxHp}`);
  if (s.percentAttack) parts.push(`${itemSprite("upgrade_attack", "stat-sprite")} +${(s.percentAttack * 100).toFixed(1)}%`);
  if (s.percentDefense) parts.push(`${itemSprite("upgrade_defense", "stat-sprite")} +${(s.percentDefense * 100).toFixed(1)}%`);
  if (s.percentMaxHp) parts.push(`${uiSprite("health", "stat-sprite")} +${(s.percentMaxHp * 100).toFixed(1)}%`);
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
  const metalButtons = `<div class="tree-tabs slot-filter">${METALS.map(m => `<button data-craft-metal="${m.id}" aria-pressed="${craftMetal === m.id}">${metalBarSprite(m.id)} ${m.name}</button>`).join("")}</div>`;
  const barsOwned = owned(metalDef.materialId), commonOwned = owned(recipe.commonMaterial);
  const recipeLine = `<p class="hint">Recipe: ${metalBarSprite(metalDef.id, "stat-sprite")} <b class="${barsOwned >= recipe.bars ? "safe" : "danger"}">${recipe.bars} ${materialDef(metalDef.materialId).name}</b> (${materialAmount(metalDef.materialId, barsOwned)} owned) + ${monsterPartSprite(recipe.commonMaterial, "stat-sprite")} <b class="${commonOwned >= recipe.commonAmount ? "safe" : "danger"}">${recipe.commonAmount} ${materialDef(recipe.commonMaterial).name}</b> (${materialAmount(recipe.commonMaterial, commonOwned)} owned)</p>`;
  const stepper = (id: MaterialId, label: string, cap: number, usedInCategory: number) => {
    const qty = craftEnhancements.find(s => s.id === id)?.quantity ?? 0;
    const atCap = usedInCategory >= cap && qty === 0;
    const atOwned = qty >= owned(id);
    return `<div class="stepper"><span>${monsterPartSprite(id, "stat-sprite")}${materialDef(id).name} <small>${label} · ${materialAmount(id, owned(id))} owned</small></span><div class="stepper-controls"><button data-enh-minus="${id}" ${qty <= 0 ? "disabled" : ""}>−</button><b>${qty}</b><button data-enh-plus="${id}" ${atCap || atOwned ? "disabled" : ""}>+</button></div></div>`;
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
    return `<article class="card"><div class="item-icon">${itemSprite("potion_flat")}</div><div><small>${ownedC ? `OWNED × ${ownedC}` : "CONSUMABLE"} · ${c.recipe.map(r => `${r.quantity} ${materialDef(r.id).name}`).join(" + ")}</small><h3>${c.name}</h3><p>${c.description}</p></div><div class="card-actions"><button data-craft-consumable="${c.id}" ${craftableC ? "" : "disabled"}>Craft</button>${ownedC ? `<button data-use-consumable="${c.id}" ${game.run.outside || game.summary ? "disabled" : ""}>Use</button>` : ""}</div></article>`;
  }).join("");
  return `<h3>1. Choose a slot</h3>${slotButtons}<h3>2. Choose a metal</h3>${metalButtons}${recipeLine}<h3>3. Optional enhancements</h3><p class="hint">Up to ${ENHANCEMENT_CAPS.gems} gems and ${ENHANCEMENT_CAPS.rareParts} rare monster parts (${totals.gems}/${ENHANCEMENT_CAPS.gems} gems, ${totals.rareParts}/${ENHANCEMENT_CAPS.rareParts} rare parts selected).</p>${gemRows}${rareRows}${preview}${craftBtn}<h3>Consumables</h3>${consumableRows}`;
}
function provisionsHtml(): string {
  const provisionSprite = (id: GoldItemId) => itemSprite(id === "heal" ? "potion_flat" : id === "edge" ? "upgrade_attack" : "upgrade_defense");
  return `<p class="hint">Spend Gold earned in the tower on provisions that apply next run. ${uiSprite("gold", "stat-sprite")} ${devAmount(game.save.gold)} Gold.</p>${GOLD_SHOP.map((item) => `<article class="card"><div class="item-icon">${provisionSprite(item.id)}</div><div><small>${game.save.provisions[item.id] ? `OWNED × ${game.save.provisions[item.id]}` : "APPLIES NEXT RUN"}</small><h3>${item.name}</h3><p>${item.description}</p></div><button data-gold="${item.id}" ${game.save.gold < item.cost ? "disabled" : ""}>Buy · ${uiSprite("gold", "stat-sprite")} ${item.cost}</button></article>`).join("")}`;
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
document.querySelectorAll<HTMLButtonElement>("[data-hud-consumable]").forEach(button => {
  button.onclick = () => {
    if (!game.useConsumable(button.dataset.hudConsumable as ConsumableId)) return;
    save();
    update();
  };
});
el("log").onclick = () => {
  if (game.mode !== "tower") return;
  let page = 0;
  const renderLog = () => {
    const highest = game.save.tower.reached;
    const start = Math.max(0, highest - page * 25);
    const floors = Array.from({ length: Math.min(25, start + 1) }, (_, i) => start - i);
    modal.innerHTML = `<small>WAYFARER’S RECORD</small><h2>Adventure log</h2>
      <div class="summary-stats"><div><strong>${displayedProgress(highest)}</strong>HIGHEST FLOOR</div><div><strong>${displayedProgress(game.save.delve.reached)}</strong>DEEPEST DEPTH</div></div>
      <p>${devAmount(game.save.tower.shards)} Inspiration · ${devAmount(game.save.delve.essence)} Courage</p>
      <p class="hint">+1 Inspiration per new height. +1 Courage at each new 10-depth milestone. Revisits never pay again.</p>
      <div class="clear-legend"><p class="silver">${itemSprite("chest_silver", "log-sprite")} Silver · all doors opened and enemies defeated.</p><p class="gold">${itemSprite("chest_gold", "log-sprite")} Gold · Silver with no damage taken anywhere in the ascent.</p><p class="platinum">${itemSprite("chest_platinum", "log-sprite")} Platinum · Gold with no keys spent on that floor.</p><p class="diamond">Diamond · future challenge, not yet available.</p></div>
      <p class="hint">Each clear tier earns +1 Inspiration once per floor. Uncollected chests are claimed when you leave.</p>
      <div class="floor-log">${floors.map(floor => {
        const record = game.save.tower.log[floor];
        return `<div class="floor-record"><b>Floor ${displayedProgress(floor)}</b><span>${record?.earned.length ? record.earned.map(t => `<span class="${t}">${itemSprite(`chest_${t}` as "chest_silver" | "chest_gold" | "chest_platinum", "log-sprite")}${t[0].toUpperCase() + t.slice(1)}${record.claimed.includes(t) ? " ✓" : " · chest"}</span>`).join(" · ") : "Reached"}</span></div>`;
      }).join("")}</div><div class="dialog-actions"><button id="log-newer" ${page === 0 ? "disabled" : ""}>Higher</button><button id="log-older" ${start < 25 ? "disabled" : ""}>Lower</button><button id="log-close">Close</button></div>`;
    el("log-newer").onclick = () => { page--; renderLog(); };
    el("log-older").onclick = () => { page++; renderLog(); };
    el("log-close").onclick = () => modal.close();
  };
  renderLog();
  modal.showModal();
};
el("section-pick").onclick = () => {
  if (game.mode !== "tower") return;
  const renderSections = () => {
    const tower = game.save.tower,
      maxHp = tower.run?.player.maxHp ?? game.combatStats().maxHp,
      current = game.startSection(),
      unlocked = Object.keys(tower.sectionHp).map(Number),
      // Every unlocked section, plus the next one as a locked goal.
      count = Math.max(0, ...unlocked) + 2,
      inside = !!tower.run && !tower.run.outside;
    modal.innerHTML = `<small>THE ASCENT TRIALS</small><h2>Starting floor</h2>
      <p class="hint">Every 10 floors is its own trial: the way down seals behind you and ATK/DEF from items resets. Each trial begins with the highest HP you have ever reached its first floor with.</p>
      <div class="section-list">${Array.from({ length: count }, (_, s) => {
        const first = s * TOWER_SECTION + 1,
          open = game.sectionUnlocked(s),
          hp = s === 0 ? `${maxHp} HP · full` : open ? `${tower.sectionHp[s]} HP` : `Reach floor ${first}`;
        return `<button class="section-option${s === current ? " selected" : ""}" data-section="${s}" ${open ? "" : "disabled"}><b>Floors ${first}–${first + TOWER_SECTION - 1}</b><span>${hp}</span></button>`;
      }).join("")}</div>
      ${inside ? `<p class="hint">Your current ascent continues; the new start applies to your next one.</p>` : ""}
      <div class="dialog-actions"><button id="section-close">Close</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>("[data-section]").forEach(b => {
      b.onclick = () => {
        if (!game.setStartSection(Number(b.dataset.section))) return;
        save();
        renderSections();
      };
    });
    el("section-close").onclick = () => modal.close();
  };
  renderSections();
  modal.showModal();
};
el("end-run").onclick = () =>
  confirmAction(
    "End this run?",
    `End the current ${game.mode === "tower" ? "Tower run" : "Delve run"} at ${game.mode === "tower" ? "height" : "depth"} ${displayedProgress(game.run.height, !!game.run.outside)}. Milestone rewards are already yours, and uncollected clear chests will be claimed.`,
    "End run",
    () => {
      game.finish(game.mode === "tower" ? "Tower run ended" : "Delve run ended");
      update();
    },
  );
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
  modal.innerHTML = `<span class="summary-icon">${uiSprite("automove")}</span><small>${s.reason.toUpperCase()}</small><h2>The tower remembers.</h2><p>Your milestone and clear rewards are already saved.</p><div class="summary-stats"><div><strong>${displayedProgress(s.height)}</strong>${heightName}</div><div><strong>${s.kills}</strong>VICTORIES</div><div><strong>${devAmount(game.mode === "tower" ? game.save.tower.shards : game.save.delve.essence)}</strong>${currencyName} SAVED</div></div>${s.record ? "" : `<p class="hint">Milestone rewards were credited as you reached them. Clear rewards are kept.</p>`}${game.save[game.mode].revival ? `<p>Revive is available until your next move. ${currencyName[0]}${currencyName.slice(1).toLowerCase()} is awarded if you continue.</p><button class="wide" id="revive-now">Revive</button>` : ""}<button class="wide" id="again">${s.dead ? `Return to the forest` : "Begin another ascent →"}</button>`;
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
  modal.innerHTML = `<span class="summary-icon">${uiSprite("settings")}</span><small>WAYFINDER</small><h2>Automove settings</h2><label class="setting">Turn off upon death<input type="checkbox" id="auto-off-death" ${game.save.settings.autoOffOnDeath !== false ? "checked" : ""} ${owned ? "" : "disabled"}></label><p class="hint">${owned ? "Disable to keep the wayfinder moving after you fall in battle." : "Research Steadfast wayfinder in the Courage tree to configure this."}</p><div class="dialog-actions"><button id="auto-settings-close">Close</button></div>`;
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
    treeTooltipVisible = true;
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
    if (highlighted && routeBoxVisible && lastRouteEffects) showRouteBox(lastRouteEffects);
    update();
  },
  () => isBoard(tab),
);
let lastBoardDraw = -Infinity;
function frame(time: number) {
  if (!document.hidden && tab === "upgrades") {
    const canvas = document.querySelector<HTMLCanvasElement>(".tree-particles");
    const tree = TREES.find(t => t.id === selectedTree)!;
    if (canvas) treeParticles.draw(canvas, time, tree.id, tree.nodes, treeTooltipVisible ? selectedSkill : null, game.save.settings.reduceMotion);
  }
  if (!document.hidden && isBoard(tab)) {
    // Battery saver: while nothing is moving, draw every other frame.
    const skip = game.save.settings.batterySaver && time - lastBoardDraw < 30 && renderer.isIdle(time);
    if (!skip) {
      renderer.draw(time);
      lastBoardDraw = time;
    }
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
  if (!document.hidden && tab === "defend" && !modal.open) defendPage.frame(time);
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
// Developer aid (console only, no UI): `towerDebug()` prints the strategic
// generation summary and map of the Tower floor currently being played.
(window as unknown as { towerDebug: () => void }).towerDebug = () => {
  const text = towerFloorReport(game.save.tower.run?.seed ?? game.run.seed, game.save.tower.run?.height ?? 0).text;
  console.log(text);
};
// Developer-only live navigation diagnostics; no generation hints go to Automove.
(window as unknown as { delveDebug: () => unknown }).delveDebug = () => {
  if (!game.save.settings.devMode || game.mode !== 'delve') return null;
  const milestone = game.run.delveMilestone ?? 0, p = game.run.player, seed = game.run.seed;
  const influence = themeInfluence(seed, p.x, p.y), blend = influence - Math.floor(influence);
  const seen = decisions.get(game) ?? [];
  const report = { ...analyzeDelve(seed, milestone),
    progressionDepth: game.run.height, physicalY: p.y, physicalArea: ownerAt(seed, p.x, p.y),
    lastMilestone: milestone * 100, nextMilestone: (milestone + 1) * 100,
    transition: { gateId: `transition_${(milestone + 1) * 100}`, gate: region(seed, milestone).gate, crossed: false, previousSealed: milestone > 0 },
    themeBlend: { [`area${Math.floor(influence) + 1}`]: +(1 - blend).toFixed(2), [`area${Math.floor(influence) + 2}`]: +blend.toFixed(2) },
    knownTiles: Object.keys(game.run.delveKnown ?? {}).length,
    branches: { frontiers: seen.filter(d => d.frontier).length, knownDeadEnds: seen.filter(d => d.deadEnd).length },
    capabilities: capabilities(game), decisions: seen };
  console.log(report); return report;
};
// `defendDebug(seconds, { rain }?)` fast-forwards a running DEFEND
// battle, optionally forcing its weather.
(window as unknown as { defendDebug: typeof defendPage.fastForward }).defendDebug = (s, w) => defendPage.fastForward(s, w);
el("stats").toggleAttribute("hidden", !isBoard(tab));
el("currencies").toggleAttribute("hidden", tab !== "upgrades");
renderBoard();
update();
requestAnimationFrame(frame);
