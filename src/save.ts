import { GOLD_SHOP, SAVE_KEY, UPGRADES } from "./config.ts";
import type { ModeSave, Run, Save } from "./entities.ts";
import { emptyMaterials, MATERIAL_IDS, type MaterialId } from "./materials.ts";
import { EQUIPMENT_SLOTS, type CraftedEquipment, type EquipmentSlot } from "./equipment.ts";
import { CONSUMABLES, type ConsumableId } from "./crafting.ts";
import { defaultDefendSave, DEFEND_WIDTH, DEFEND_HEIGHT, isBuildable, DEFEND_WALL_MAX_HP, type DefendSave, type DefendTileKind } from "./defend.ts";
import {
  defaultDefendWaveSave,
  DEFEND_WAVE_COUNT,
  ENEMY_DEFS,
  type DefendWaveSave,
  type EnemyKind,
} from "./defend-enemies.ts";
export function defaults(): Save {
  return {
    version: 3,
    tower: { run: null, history: [], revival: null, best: 0, reached: 0, shards: 0, log: {}, lootedTiles: {}, startSection: 0, sectionHp: {} },
    delve: { run: null, history: [], revival: null, best: 0, reached: 0, essence: 0, lootedTiles: {} },
    gold: 0,
    provisions: Object.fromEntries(
      GOLD_SHOP.map((g) => [g.id, 0]),
    ) as Save["provisions"],
    xp: 0,
    upgrades: Object.fromEntries(
      UPGRADES.map((u) => [u.id, 0]),
    ) as Save["upgrades"],
    settings: {
      spritesOff: false,
      weatherSound: true,
      transition: "smooth",
      showArrows: false,
      speed: 3,
      reduceMotion: false,
      brightness: 100,
      autoOffOnDeath: true,
      oneTapMove: false,
      infoDisplay: "both",
      devMode: false,
    },
    materials: emptyMaterials(),
    equipmentInventory: [],
    equipped: {},
    consumables: Object.fromEntries(CONSUMABLES.map((c) => [c.id, 0])) as Save["consumables"],
    defend: defaultDefendSave(),
    defendWaves: defaultDefendWaveSave(),
  };
}
const finite = (n: unknown, max = 1e9) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
/** Validate an untrusted run payload; returns null if it does not match the
 * shape this session's Run/Player invariants require. */
const validChanges = (m: any) =>
  m &&
  typeof m === "object" &&
  !Array.isArray(m) &&
  Object.entries(m).every(
    ([k, v]: [string, any]) => /^\d+,\d+$/.test(k) && v?.kind === "floor",
  );
function validRun(r: any): Run | null {
  const p = r?.player;
  if (
    r &&
    (r.outside === undefined || typeof r.outside === "boolean") &&
    (!r.outside || (r.height === 0 && p?.y < 12 && r.floor === 0)) &&
    Number.isInteger(r.seed) &&
    finite(r.height) &&
    finite(r.floor) &&
    r.floor <= p?.y &&
    finite(r.kills) &&
    finite(r.treasures) &&
    p &&
    Number.isInteger(p.x) &&
    p.x >= 0 &&
    p.x < 30 &&
    Number.isInteger(p.y) &&
    finite(p.y) &&
    finite(p.hp) &&
    p.hp > 0 &&
    finite(p.maxHp) &&
    p.hp <= p.maxHp &&
    finite(p.attack) &&
    finite(p.defense) &&
    ["yellow", "blue", "red"].every((k) => finite(p.keys?.[k])) &&
    validChanges(r.changes) &&
    (r.floors === undefined ||
      (typeof r.floors === "object" &&
        !Array.isArray(r.floors) &&
        Object.entries(r.floors).every(
          ([k, v]: [string, any]) => /^\d+$/.test(k) && validChanges(v),
        )))
  )
    {
      // Older runs have no damage/key history; do not assume a perfect attempt.
      r.damaged = r.damaged !== false;
      r.keysSpent = r.keysSpent !== false;
      r.rewards = Array.isArray(r.rewards) ? r.rewards.filter((c: any) => Number.isInteger(c.x) && c.x >= 0 && c.x < 30 && Number.isInteger(c.y) && c.y >= 0 && c.y < 20 && ["silver", "gold", "platinum"].includes(c.tier)) : [];
      return r;
    }
  return null;
}
function decodeMode(
  s: any,
  undoCapacity: number,
): { run: Run | null; history: any[]; revival: any; lootedTiles: Record<string, true> } {
  const run = validRun(s?.run);
  const history: { run: Run; best: number }[] = [];
  const snapshot = (value: any) => {
    if (!value || !finite(value.best)) return null;
    const loaded = validRun(value.run);
    return loaded ? { run: loaded, best: value.best } : null;
  };
  if (run && Array.isArray(s.history))
    for (const value of s.history.slice(-undoCapacity)) {
      const item = snapshot(value);
      if (
        item &&
        item.run.seed === run.seed &&
        item.run.layoutVersion === run.layoutVersion
      )
        history.push(item);
    }
  let revival = null;
  if (run && finite(s?.revival?.earned)) {
    const item = snapshot(s.revival.snapshot);
    if (item && item.run.layoutVersion === run.layoutVersion)
      revival = { snapshot: item, earned: s.revival.earned };
  }
  const lootedTiles: Record<string, true> = {};
  if (s?.lootedTiles && typeof s.lootedTiles === "object" && !Array.isArray(s.lootedTiles))
    for (const key of Object.keys(s.lootedTiles))
      if (/^-?\d+:(-?\d+:)?-?\d+,-?\d+$/.test(key)) lootedTiles[key] = true;
  return { run, history, revival, lootedTiles };
}
function decodeMaterials(s: any): Record<MaterialId, number> {
  const materials = emptyMaterials();
  if (s && typeof s === "object")
    for (const id of MATERIAL_IDS)
      if (finite(s[id], 1e9)) materials[id] = Math.floor(s[id]);
  return materials;
}
function decodeEquipmentInventory(s: any): CraftedEquipment[] {
  if (!Array.isArray(s)) return [];
  const validStacks = (arr: any): boolean =>
    Array.isArray(arr) &&
    arr.every((m: any) => MATERIAL_IDS.includes(m?.id) && finite(m?.quantity, 999));
  return s.filter(
    (e: any) =>
      typeof e?.id === "string" &&
      e.id.length > 0 &&
      e.id.length < 100 &&
      EQUIPMENT_SLOTS.includes(e.slot) &&
      typeof e.name === "string" &&
      e.name.length < 100 &&
      ["iron", "steel", "silversteel", "embersteel", "starsteel", "voidsteel"].includes(e.metal) &&
      finite(e.flatAttack, 9999) &&
      finite(e.flatDefense, 9999) &&
      finite(e.flatMaxHp, 9999) &&
      finite(e.percentAttack, 10) &&
      finite(e.percentDefense, 10) &&
      finite(e.percentMaxHp, 10) &&
      validStacks(e.baseRecipe) &&
      validStacks(e.enhancements) &&
      finite(e.createdAt, 1e15),
  );
}
function decodeEquipped(s: any, inventory: CraftedEquipment[]): Partial<Record<EquipmentSlot, string>> {
  const equipped: Partial<Record<EquipmentSlot, string>> = {};
  if (s && typeof s === "object" && !Array.isArray(s))
    for (const slot of EQUIPMENT_SLOTS) {
      const id = s[slot];
      if (typeof id === "string" && inventory.some((e) => e.id === id && e.slot === slot)) equipped[slot] = id;
    }
  return equipped;
}
const DEFEND_TILE_KINDS = ["empty", "keep", "wall", "barracks"];
function decodeDefend(s: any): DefendSave {
  const d = defaultDefendSave();
  if (
    Array.isArray(s?.tiles) &&
    s.tiles.length === DEFEND_HEIGHT &&
    s.tiles.every(
      (row: any) =>
        Array.isArray(row) &&
        row.length === DEFEND_WIDTH &&
        row.every((kind: any) => DEFEND_TILE_KINDS.includes(kind)),
    ) &&
    Number.isInteger(s?.keep?.x) &&
    Number.isInteger(s?.keep?.y) &&
    isBuildable(s.keep.x, s.keep.y) &&
    s.tiles[s.keep.y][s.keep.x] === "keep" &&
    finite(s.keepHp, s.keepMaxHp ?? 1e9) &&
    finite(s.keepMaxHp) &&
    Number.isInteger(s.wallCapacity) &&
    s.wallCapacity >= 0 &&
    s.wallCapacity <= 999 &&
    s.tiles.flat().filter((k: DefendTileKind) => k === "wall").length <= s.wallCapacity
  ) {
    d.tiles = s.tiles;
    d.keep = { x: s.keep.x, y: s.keep.y };
    d.keepHp = s.keepHp;
    d.keepMaxHp = s.keepMaxHp;
    d.lost = s.lost === true;
    d.wallCapacity = s.wallCapacity;
    const wallHp: Record<string, number> = {};
    d.tiles.forEach((row, y) =>
      row.forEach((kind, x) => {
        if (kind !== "wall") return;
        const key = `${x},${y}`;
        const hp = s.wallHp?.[key];
        wallHp[key] = finite(hp, DEFEND_WALL_MAX_HP) && hp > 0 ? hp : DEFEND_WALL_MAX_HP;
      }),
    );
    d.wallHp = wallHp;
  }
  return d;
}
const DEFEND_ENEMY_KINDS: EnemyKind[] = ["roach", "orc", "bombat"];
function decodeDefendWaves(s: any): DefendWaveSave {
  const d = defaultDefendWaveSave();
  if (
    Number.isInteger(s?.wavesStarted) &&
    s.wavesStarted >= 0 &&
    s.wavesStarted <= DEFEND_WAVE_COUNT &&
    Number.isInteger(s?.nextEnemyId) &&
    s.nextEnemyId >= 1 &&
    s.nextEnemyId <= 1e6 &&
    Array.isArray(s?.enemies) &&
    s.enemies.length <= 200 &&
    s.enemies.every(
      (e: any) =>
        Number.isInteger(e?.id) &&
        e.id > 0 &&
        e.id < s.nextEnemyId &&
        DEFEND_ENEMY_KINDS.includes(e?.kind) &&
        Number.isInteger(e?.x) &&
        e.x >= 0 &&
        e.x < DEFEND_WIDTH &&
        Number.isInteger(e?.y) &&
        e.y >= 0 &&
        e.y < DEFEND_HEIGHT &&
        finite(e?.maxHp, ENEMY_DEFS[e.kind as EnemyKind].hp) &&
        finite(e?.hp, e.maxHp),
    )
  ) {
    d.wavesStarted = s.wavesStarted;
    d.nextEnemyId = s.nextEnemyId;
    d.enemies = s.enemies.map((e: any) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp }));
  }
  return d;
}
function decodeConsumables(s: any): Record<ConsumableId, number> {
  const consumables = Object.fromEntries(CONSUMABLES.map((c) => [c.id, 0])) as Record<ConsumableId, number>;
  if (s && typeof s === "object")
    for (const c of CONSUMABLES)
      if (finite(s[c.id], 999)) consumables[c.id] = Math.floor(s[c.id]);
  return consumables;
}
export function decode(raw: string | null): Save {
  const d = defaults();
  try {
    const s = JSON.parse(raw ?? "null");
    for (const u of UPGRADES)
      if (finite(s?.upgrades?.[u.id], u.max))
        d.upgrades[u.id] = Math.floor(s.upgrades[u.id]);
    const undoCapacity = 1 + d.upgrades.undos + d.upgrades.shardUndos;
    if ([1, 3, 6, 10].includes(s?.settings?.speed))
      d.settings.speed = s.settings.speed;
    if (["smooth", "fast", "instant"].includes(s?.settings?.transition))
      d.settings.transition = s.settings.transition;
    d.settings.showArrows = s?.settings?.showArrows === true;
    d.settings.spritesOff = s?.settings?.spritesOff === true;
    d.settings.reduceMotion = s?.settings?.reduceMotion === true;
    const brightness = s?.settings?.brightness;
    d.settings.brightness =
      typeof brightness === "number" && Number.isFinite(brightness)
        ? Math.round(Math.min(100, Math.max(20, brightness)))
        : 100;
    d.settings.weatherSound = s?.settings?.weatherSound !== false;
    d.settings.autoOffOnDeath = s?.settings?.autoOffOnDeath !== false;
    d.settings.oneTapMove = s?.settings?.oneTapMove === true;
    d.settings.infoDisplay = ["both", "popup", "status", "none"].includes(s?.settings?.infoDisplay)
      ? s.settings.infoDisplay
      : s?.settings?.showInfoBoxes === false
        ? "none"
        : "both";
    d.settings.devMode = s?.settings?.devMode === true;
    if (s?.version === 2 || s?.version === 3) {
      if (finite(s.gold)) d.gold = Math.floor(s.gold);
      for (const g of GOLD_SHOP)
        if (finite(s.provisions?.[g.id], 999))
          d.provisions[g.id] = Math.floor(s.provisions[g.id]);
      if (finite(s.xp)) d.xp = Math.floor(s.xp);
      if (finite(s.tower?.shards)) d.tower.shards = Math.floor(s.tower.shards);
      if (finite(s.tower?.best)) d.tower.best = Math.floor(s.tower.best);
      if (finite(s.delve?.essence))
        d.delve.essence = Math.floor(s.delve.essence);
      if (finite(s.delve?.best)) d.delve.best = Math.floor(s.delve.best);
      const tower = decodeMode(s.tower, undoCapacity);
      d.tower.run = tower.run;
      d.tower.history = tower.history as ModeSave["history"];
      d.tower.revival = tower.revival;
      d.tower.lootedTiles = tower.lootedTiles;
      const delve = decodeMode(s.delve, undoCapacity);
      d.delve.run = delve.run;
      d.delve.history = delve.history as ModeSave["history"];
      d.delve.revival = delve.revival;
      d.delve.lootedTiles = delve.lootedTiles;
      if (s.version === 3) {
        // Older (version-2) saves intentionally get an empty material/equipment
        // inventory rather than being invalidated - see decodeMaterials etc.
        d.materials = decodeMaterials(s.materials);
        d.equipmentInventory = decodeEquipmentInventory(s.equipmentInventory);
        d.equipped = decodeEquipped(s.equipped, d.equipmentInventory);
        d.consumables = decodeConsumables(s.consumables);
      }
    } else if (s?.version === 1) {
      // Migrate the single legacy run (the endless climb) into the new Delve slice.
      if (finite(s.best)) d.delve.best = Math.floor(s.best);
      if (finite(s.essence)) d.delve.essence = Math.floor(s.essence);
      const delve = decodeMode(
        { run: s.run, history: s.history, revival: s.revival },
        undoCapacity,
      );
      d.delve.run = delve.run;
      d.delve.history = delve.history as ModeSave["history"];
      d.delve.revival = delve.revival;
    }
    for (const mode of ["tower", "delve"] as const) {
      // Existing records are already rewarded; preserve old balances without double-paying.
      d[mode].reached = finite(s?.[mode]?.reached) ? Math.floor(s[mode].reached) : d[mode].best;
      d[mode].best = Math.max(d[mode].best, d[mode].reached);
    }
    if (s?.tower?.log && typeof s.tower.log === "object") {
      for (const [floor, record] of Object.entries(s.tower.log) as [string, any][]) {
        if (!/^\d+$/.test(floor) || !finite(Number(floor)) || !Array.isArray(record?.earned)) continue;
        const earned = (["silver", "gold", "platinum"] as const).filter(t => record.earned.includes(t));
        const claimed = earned.filter(t => Array.isArray(record.claimed) && record.claimed.includes(t));
        d.tower.log[floor] = { earned, claimed };
      }
    }
    if (s?.tower?.sectionHp && typeof s.tower.sectionHp === "object")
      for (const [section, hp] of Object.entries(s.tower.sectionHp) as [string, any][])
        if (/^[1-9]\d*$/.test(section) && finite(hp) && hp > 0) d.tower.sectionHp[section] = Math.floor(hp);
    if (finite(s?.tower?.startSection) && (s.tower.startSection === 0 || d.tower.sectionHp[s.tower.startSection]))
      d.tower.startSection = Math.floor(s.tower.startSection);
    // Preserve access and purchases in saves made before skill trees existed.
    if (s?.upgrades && !("delve" in s.upgrades)) {
      if (d.delve.run || d.delve.best || d.delve.essence || UPGRADES.some(u => u.currency === "essence" && d.upgrades[u.id])) d.upgrades.delve = 1;
      if (["quality", "yellow", "blue", "red"].some(id => s.upgrades[id] > 0)) d.upgrades.legacy = 1;
    }
    d.defend = decodeDefend(s?.defend);
    d.defendWaves = decodeDefendWaves(s?.defendWaves);
  } catch {}
  return d;
}
export function load(): Save {
  try {
    return decode(localStorage.getItem(SAVE_KEY));
  } catch {
    return defaults();
  }
}
export function persist(save: Save): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
