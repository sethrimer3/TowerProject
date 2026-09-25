import { GOLD_SHOP, SAVE_KEY, UPGRADES } from "./config.ts";
import type { ModeSave, MoveSnapshot, Revival, Run, Save, Settings } from "./entities.ts";
import { emptyMaterials, MATERIAL_IDS, type MaterialId } from "./materials.ts";
import { EQUIPMENT_SLOTS, type CraftedEquipment, type EquipmentSlot } from "./equipment.ts";
import { CONSUMABLES, type ConsumableId } from "./crafting.ts";
import { decodeDefendSave, defaultDefendSave } from "./defend/progress.ts";
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
      decorOff: false,
      batterySaver: false,
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
  };
}
const finite = (n: unknown, max = 1e9) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
const isRecord = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
const oneOf = <T>(value: any, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value) ? value : fallback;
/** A floored count from `raw` when it is a finite number within `max`. */
const count = (raw: any, fallback: number, max?: number) =>
  finite(raw, max) ? Math.floor(raw) : fallback;
const CHEST_TIERS = ["silver", "gold", "platinum"] as const;
const KEY_COLORS = ["yellow", "blue", "red"] as const;
const POINT_KEY = /^\d+,\d+$/;
/** Every key is an `x,y` point and every value passes `valid`. */
const pointMap = (m: any, valid: (v: any) => boolean) =>
  isRecord(m) && Object.entries(m).every(([k, v]) => POINT_KEY.test(k) && valid(v));

// --- Runs ---
const validChange = (v: any) =>
  v?.kind === "floor" || v?.kind === "wall" ||
  (v?.kind === "openedChest" && (v.tier === undefined || CHEST_TIERS.includes(v.tier)));
const validChanges = (m: any) => pointMap(m, validChange);
const validFloors = (m: any) =>
  m === undefined ||
  (isRecord(m) && Object.entries(m).every(([k, v]) => /^\d+$/.test(k) && validChanges(v)));
/** Outside runs only exist in the forest clearing below the first floor. */
const validOutside = (r: any) =>
  (r.outside === undefined || typeof r.outside === "boolean") &&
  (!r.outside || (r.height === 0 && r.player?.y < 12 && r.floor === 0));
const validCounters = (r: any) =>
  Number.isInteger(r.seed) && finite(r.height) && finite(r.floor) && r.floor <= r.player?.y &&
  finite(r.kills) && finite(r.treasures);
const validPlayer = (p: any) =>
  !!p &&
  Number.isInteger(p.x) && p.x >= 0 && p.x < 30 &&
  Number.isInteger(p.y) && finite(p.y) &&
  finite(p.hp) && p.hp > 0 && finite(p.maxHp) && p.hp <= p.maxHp &&
  finite(p.attack) && finite(p.defense) &&
  KEY_COLORS.every((k) => finite(p.keys?.[k]));
const validDelveState = (r: any) =>
  (r.delveMilestone === undefined || (Number.isInteger(r.delveMilestone) && finite(r.delveMilestone))) &&
  (r.delveKnown === undefined || pointMap(r.delveKnown, (v) => v === true)) &&
  (r.delveVisited === undefined || pointMap(r.delveVisited, (v) => finite(v)));
const validReward = (c: any) =>
  Number.isInteger(c.x) && c.x >= 0 && c.x < 30 &&
  Number.isInteger(c.y) && c.y >= 0 && c.y < 20 &&
  CHEST_TIERS.includes(c.tier);
/** Validate an untrusted run payload; returns null if it does not match the
 * shape this session's Run/Player invariants require. */
const RUN_CHECKS: ((r: any) => boolean)[] = [
  validOutside,
  validCounters,
  (r) => validPlayer(r.player),
  validDelveState,
  (r) => validChanges(r.changes),
  (r) => validFloors(r.floors),
];
function validRun(r: any): Run | null {
  if (!r || !RUN_CHECKS.every((check) => check(r))) return null;
  // Older runs have no damage/key history; do not assume a perfect attempt.
  r.damaged = r.damaged !== false;
  r.keysSpent = r.keysSpent !== false;
  r.rewards = Array.isArray(r.rewards) ? r.rewards.filter(validReward) : [];
  return r;
}

// --- Mode slices ---
type DecodedMode = Pick<ModeSave, "run" | "history" | "revival" | "lootedTiles">;
function snapshot(value: any): MoveSnapshot | null {
  if (!value || !finite(value.best)) return null;
  const run = validRun(value.run);
  return run ? { run, best: value.best } : null;
}
/** Undo history only survives for the same seed and layout as the live run. */
function decodeHistory(raw: any, run: Run, undoCapacity: number): MoveSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-undoCapacity)
    .map(snapshot)
    .filter((item): item is MoveSnapshot =>
      !!item && item.run.seed === run.seed && item.run.layoutVersion === run.layoutVersion);
}
function decodeRevival(raw: any, run: Run): Revival | null {
  if (!finite(raw?.earned)) return null;
  const item = snapshot(raw.snapshot);
  return item && item.run.layoutVersion === run.layoutVersion ? { snapshot: item, earned: raw.earned } : null;
}
function decodeLootedTiles(raw: any): Record<string, true> {
  const lootedTiles: Record<string, true> = {};
  if (isRecord(raw))
    for (const key of Object.keys(raw))
      if (/^-?\d+:(-?\d+:)?-?\d+,-?\d+$/.test(key)) lootedTiles[key] = true;
  return lootedTiles;
}
function decodeMode(s: any, undoCapacity: number): DecodedMode {
  const run = validRun(s?.run);
  return {
    run,
    history: run ? decodeHistory(s.history, run, undoCapacity) : [],
    revival: run ? decodeRevival(s.revival, run) : null,
    lootedTiles: decodeLootedTiles(s?.lootedTiles),
  };
}
function applyMode(slice: ModeSave, decoded: DecodedMode) {
  slice.run = decoded.run;
  slice.history = decoded.history;
  slice.revival = decoded.revival;
  slice.lootedTiles = decoded.lootedTiles;
}

// --- Inventory ---
function decodeMaterials(s: any): Record<MaterialId, number> {
  const materials = emptyMaterials();
  if (s && typeof s === "object")
    for (const id of MATERIAL_IDS) materials[id] = count(s[id], materials[id]);
  return materials;
}
const validStacks = (arr: any): boolean =>
  Array.isArray(arr) &&
  arr.every((m: any) => MATERIAL_IDS.includes(m?.id) && finite(m?.quantity, 999));
const validEquipment = (e: any) =>
  typeof e?.id === "string" && e.id.length > 0 && e.id.length < 100 &&
  EQUIPMENT_SLOTS.includes(e.slot) &&
  typeof e.name === "string" && e.name.length < 100 &&
  ["iron", "steel", "silversteel", "embersteel", "starsteel", "voidsteel"].includes(e.metal) &&
  finite(e.flatAttack, 9999) && finite(e.flatDefense, 9999) && finite(e.flatMaxHp, 9999) &&
  finite(e.percentAttack, 10) && finite(e.percentDefense, 10) && finite(e.percentMaxHp, 10) &&
  validStacks(e.baseRecipe) && validStacks(e.enhancements) &&
  finite(e.createdAt, 1e15);
function decodeEquipmentInventory(s: any): CraftedEquipment[] {
  return Array.isArray(s) ? s.filter(validEquipment) : [];
}
const owns = (inventory: CraftedEquipment[], id: unknown, slot: EquipmentSlot) =>
  typeof id === "string" && inventory.some((e) => e.id === id && e.slot === slot);
function decodeEquipped(s: any, inventory: CraftedEquipment[]): Partial<Record<EquipmentSlot, string>> {
  const equipped: Partial<Record<EquipmentSlot, string>> = {};
  if (isRecord(s))
    for (const slot of EQUIPMENT_SLOTS) if (owns(inventory, s[slot], slot)) equipped[slot] = s[slot];
  return equipped;
}
function decodeConsumables(s: any): Record<ConsumableId, number> {
  const consumables = Object.fromEntries(CONSUMABLES.map((c) => [c.id, 0])) as Record<ConsumableId, number>;
  if (s && typeof s === "object")
    for (const c of CONSUMABLES) consumables[c.id] = count(s[c.id], consumables[c.id], 999);
  return consumables;
}
/** Older (version-2) saves intentionally get an empty material/equipment
 * inventory rather than being invalidated. */
function decodeInventory(s: any, d: Save) {
  d.materials = decodeMaterials(s.materials);
  d.equipmentInventory = decodeEquipmentInventory(s.equipmentInventory);
  d.equipped = decodeEquipped(s.equipped, d.equipmentInventory);
  d.consumables = decodeConsumables(s.consumables);
}

// --- Settings, currencies and records ---
function decodeUpgrades(raw: any, d: Save) {
  for (const u of UPGRADES) d.upgrades[u.id] = count(raw?.[u.id], d.upgrades[u.id], u.max);
}
const OFF_BY_DEFAULT = ["showArrows", "spritesOff", "reduceMotion", "decorOff", "batterySaver", "oneTapMove", "devMode"] as const;
const ON_BY_DEFAULT = ["weatherSound", "autoOffOnDeath"] as const;
/** Brightness is clamped to 20–100 rather than rejected when out of range. */
const brightness = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(20, v))) : 100;
function decodeSettings(raw: any, settings: Settings) {
  const s = raw ?? {};
  settings.speed = oneOf(s.speed, [1, 3, 6, 10], settings.speed);
  settings.transition = oneOf(s.transition, ["smooth", "fast", "instant"] as const, settings.transition);
  for (const key of OFF_BY_DEFAULT) settings[key] = s[key] === true;
  for (const key of ON_BY_DEFAULT) settings[key] = s[key] !== false;
  settings.brightness = brightness(s.brightness);
  // Older saves had a single showInfoBoxes toggle.
  const legacyInfo = s.showInfoBoxes === false ? "none" : "both";
  settings.infoDisplay = oneOf(s.infoDisplay, ["both", "popup", "status", "none"] as const, legacyInfo);
}
function decodeProgress(s: any, d: Save, undoCapacity: number) {
  d.gold = count(s.gold, d.gold);
  for (const g of GOLD_SHOP) d.provisions[g.id] = count(s.provisions?.[g.id], d.provisions[g.id], 999);
  d.xp = count(s.xp, d.xp);
  d.tower.shards = count(s.tower?.shards, d.tower.shards);
  d.tower.best = count(s.tower?.best, d.tower.best);
  d.delve.essence = count(s.delve?.essence, d.delve.essence);
  d.delve.best = count(s.delve?.best, d.delve.best);
  applyMode(d.tower, decodeMode(s.tower, undoCapacity));
  applyMode(d.delve, decodeMode(s.delve, undoCapacity));
}
/** Version 1 had a single run (the endless climb); it becomes the Delve slice. */
function migrateV1(s: any, d: Save, undoCapacity: number) {
  d.delve.best = count(s.best, d.delve.best);
  d.delve.essence = count(s.essence, d.delve.essence);
  applyMode(d.delve, decodeMode({ run: s.run, history: s.history, revival: s.revival }, undoCapacity));
}
/** Existing records are already rewarded; preserve old balances without double-paying. */
function decodeReached(s: any, d: Save) {
  for (const mode of ["tower", "delve"] as const) {
    d[mode].reached = count(s?.[mode]?.reached, d[mode].best);
    d[mode].best = Math.max(d[mode].best, d[mode].reached);
  }
}
function decodeTowerLog(raw: any): Save["tower"]["log"] {
  const log: Save["tower"]["log"] = {};
  if (!raw || typeof raw !== "object") return log;
  for (const [floor, record] of Object.entries(raw) as [string, any][]) {
    if (!/^\d+$/.test(floor) || !finite(Number(floor)) || !Array.isArray(record?.earned)) continue;
    const earned = CHEST_TIERS.filter((t) => record.earned.includes(t));
    const claimed = earned.filter((t) => Array.isArray(record.claimed) && record.claimed.includes(t));
    log[floor] = { earned, claimed };
  }
  return log;
}
function decodeSectionHp(raw: any): Record<string, number> {
  const sectionHp: Record<string, number> = {};
  if (raw && typeof raw === "object")
    for (const [section, hp] of Object.entries(raw) as [string, any][])
      if (/^[1-9]\d*$/.test(section) && finite(hp) && hp > 0) sectionHp[section] = Math.floor(hp);
  return sectionHp;
}
function decodeSections(tower: any, d: Save) {
  d.tower.log = decodeTowerLog(tower?.log);
  d.tower.sectionHp = decodeSectionHp(tower?.sectionHp);
  // A section can only be the start once it has been reached (has a recorded HP).
  const start = tower?.startSection;
  const unlocked = start === 0 || !!d.tower.sectionHp[start];
  if (finite(start) && unlocked) d.tower.startSection = Math.floor(start);
}
const touchedDelve = (d: Save) =>
  !!(d.delve.run || d.delve.best || d.delve.essence) ||
  UPGRADES.some((u) => u.currency === "essence" && d.upgrades[u.id]);
/** Preserve access and purchases in saves made before skill trees existed. */
function migratePreSkillTrees(upgrades: any, d: Save) {
  if (!upgrades || "delve" in upgrades) return;
  if (touchedDelve(d)) d.upgrades.delve = 1;
  if (["quality", "yellow", "blue", "red"].some((id) => upgrades[id] > 0)) d.upgrades.legacy = 1;
}

type VersionStep = (s: any, d: Save, undoCapacity: number) => void;
/** What each save version carries beyond upgrades and settings. A Map, so
 * lookups match versions strictly (no "3" or prototype keys). */
const VERSION_STEPS = new Map<unknown, VersionStep[]>([
  [1, [migrateV1]],
  [2, [decodeProgress]],
  [3, [decodeProgress, decodeInventory]],
]);
export function decode(raw: string | null): Save {
  const d = defaults();
  try {
    const s = JSON.parse(raw ?? "null") ?? {};
    decodeUpgrades(s.upgrades, d);
    const undoCapacity = 1 + d.upgrades.undos + d.upgrades.shardUndos;
    decodeSettings(s.settings, d.settings);
    for (const step of VERSION_STEPS.get(s.version) ?? []) step(s, d, undoCapacity);
    decodeReached(s, d);
    decodeSections(s.tower, d);
    migratePreSkillTrees(s.upgrades, d);
    d.defend = decodeDefendSave(s.defend);
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
