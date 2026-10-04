import { TRAINER_GEMS, trainingSlots, type TrainingJob, type TrainingPaid } from "./training-jobs.ts";
import { count, dropInvalid, finite, fraction, isRecord, wholeIn } from "./decode.ts";
import { TIERS } from "./tiers.ts";
import { FIND_POTION_MAX, GOLD_SHOP, OLD_SAVE_KEY, RUN_TRAINING_CAP, SAVE_KEY, TOWER_WIDTH, TRAINING, UPGRADES, WIDTH } from "./config.ts";
import type { AutomoveMemory, DelveRun, ModeSave, Fall, MoveSnapshot, Run, Save, TowerRun } from "./entities.ts";
import { emptyMaterials, MATERIAL_IDS, type MaterialId } from "./materials.ts";
import { EQUIPMENT_SLOTS, type CraftedEquipment, type EquipmentSlot } from "./equipment.ts";
import { CONSUMABLES, type ConsumableId } from "./crafting.ts";
import { decodeDefendSave, defaultDefendSave } from "./defend/progress.ts";
import { decodeSettings, defaultSettings } from "./settings.ts";
import { keepUndos, loadout } from "./loadout.ts";
import { BASE_HAND, CARD_IDS, HAND_SLOT_GEMS, IN_PLACE, MAX_HAND_SLOTS, deckCards, handSlots, type CardId } from "./cards.ts";
import { decodeGemDrop, defaultGemDrop } from "./gems.ts";
import { decodeArchives, defaultArchives } from "./archives.ts";
import { BOOST_FOREVER, decodeEntitlements, permanentBoost } from "./shop/entitlements.ts";
import { decodeShop, defaultShop } from "./shop/ledger.ts";
import { decodeGoals, defaultGoals } from "./goals.ts";
import { decodeBadges, defaultBadges, validRunBadges } from "./badges.ts";
export function defaults(): Save {
  return {
    version: 3,
    tower: { run: null, history: [], fall: null, best: 0, reached: 0, inspiration: 0, lootedTiles: {}, runGold: 0, runCurrency: 0, tier: 1, tiersOpen: 1, tierRecords: {} },
    delve: { run: null, history: [], fall: null, best: 0, reached: 0, courage: 0, lootedTiles: {}, runGold: 0, runCurrency: 0, memory: { known: {}, visited: {} }, tier: 1, tiersOpen: 1, tierRecords: {} },
    gems: 0,
    gemDrop: defaultGemDrop(),
    gold: 0,
    provisions: Object.fromEntries(
      GOLD_SHOP.map((g) => [g.id, 0]),
    ) as Save["provisions"],
    xp: 0,
    training: Object.fromEntries(TRAINING.map((t) => [t.id, 0])) as Save["training"],
    trainingPaid: Object.fromEntries(TRAINING.map((t) => [t.id, { points: 0, gold: 0, ms: 0 }])) as Save["trainingPaid"],
    trainerRanks: Object.fromEntries(TRAINING.map((t) => [t.id, 0])) as Save["trainerRanks"],
    trainingJobs: [],
    trainingAuto: [],
    trainingBank: 0,
    trainingCredit: Object.fromEntries(TRAINING.map((t) => [t.id, 0])) as Save["trainingCredit"],
    trainingBoostUntil: 0,
    trainers: 0,
    upgrades: Object.fromEntries(
      UPGRADES.map((u) => [u.id, 0]),
    ) as Save["upgrades"],
    settings: defaultSettings(),
    materials: emptyMaterials(),
    equipmentInventory: [],
    equipped: {},
    consumables: Object.fromEntries(CONSUMABLES.map((c) => [c.id, 0])) as Save["consumables"],
    hand: [...BASE_HAND],
    handSlots: 0,
    badges: defaultBadges(),
    tutorials: { deck: false, removeCard: false, addCard: false, upgrades: false, gear: false, onTheJob: false, speed: false },
    treeNotices: { inspiration: false, courage: false },
    archives: defaultArchives(),
    defend: defaultDefendSave(),
    entitlements: [],
    shop: defaultShop(),
    goals: defaultGoals(),
  };
}
const CHEST_TIERS = ["silver", "gold"] as const;
const KEY_COLORS = ["yellow", "blue", "red"] as const;
const POINT_KEY = /^\d+,\d+$/;
/** Every key is an `x,y` point and every value passes `valid`. */
const pointMap = (m: any, valid: (v: any) => boolean) =>
  isRecord(m) && Object.entries(m).every(([k, v]) => POINT_KEY.test(k) && valid(v));

// --- Runs ---
/** The one enemy a run's changes may hold: a Greater Boss called onto the
 * floor (tower/greater-boss.ts). */
const validGreaterBoss = (e: any) =>
  isRecord(e) && e.strength === "greaterBoss" && typeof e.name === "string" &&
  finite(e.hp) && e.hp > 0 && finite(e.attack) && e.attack >= 0 && finite(e.defense) && e.defense >= 0 && finite(e.tier);
const validChange = (v: any) =>
  v?.kind === "floor" || v?.kind === "wall" ||
  (v?.kind === "enemy" && validGreaterBoss(v.enemy)) ||
  (v?.kind === "openedChest" && (v.tier === undefined || CHEST_TIERS.includes(v.tier))) ||
  (v?.kind === "reward" && CHEST_TIERS.includes(v.tier));
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
const validPlayer = (p: any, width: number) =>
  !!p &&
  Number.isInteger(p.x) && p.x >= 0 && p.x < width &&
  Number.isInteger(p.y) && finite(p.y) &&
  finite(p.hp) && p.hp >= 0 && finite(p.maxHp) && p.hp <= p.maxHp &&
  finite(p.attack) && finite(p.defense) && (p.shroud === undefined || (finite(p.shroud) && p.shroud >= 0)) &&
  (p.regen === undefined || (finite(p.regen) && p.regen >= 0)) &&
  KEY_COLORS.every((k) => finite(p.keys?.[k]));
/** Checks every run passes, whatever its mode; `width` is the mode's board. */
const validCore = (r: any, width: number) =>
  !!r && validOutside(r) && validCounters(r) && validPlayer(r.player, width) && validChanges(r.changes);
const validDelveState = (r: any) => Number.isInteger(r.milestone) && finite(r.milestone);
const TOWER_FIELDS = ["damaged", "floors", "summoned"];
const DELVE_FIELDS = ["milestone"];
/** Training ranks bought in a run: known rows, each a whole number of ranks. */
const validRunTraining = (t: any) =>
  isRecord(t) && Object.entries(t).every(([id, n]) => TRAINING.some((row) => row.id === id) && wholeIn(n, 0, RUN_TRAINING_CAP));
/** A run's hand: known cards, each once, no more than a hand can hold,
 * STAIRS among them. */
const validHand = (h: any) =>
  Array.isArray(h) && h.length <= MAX_HAND_SLOTS && new Set(h).size === h.length &&
  h.every((id) => CARD_IDS.includes(id)) && h.includes("stairs");
/** A run's optional fields, each dropped when malformed. */
const RUN_FIELD_CHECKS = {
  hand: validHand,
  silver: (v: unknown) => finite(v),
  xp: (v: unknown) => wholeIn(v, 0, 1e9),
  focusUsed: (v: unknown) => wholeIn(v, 0, 99),
  // The hand is checked first: a focused card must be in it.
  focused: (v: unknown, r: any) => !!r.hand?.includes(v),
  training: validRunTraining,
  cardUses: (v: unknown) => isRecord(v) && Object.entries(v).every(([id, n]) => IN_PLACE.has(id as CardId) && wholeIn(n, 1, 1e6)),
  tier: (v: unknown) => wholeIn(v, 2, TIERS),
  percentPotions: (v: unknown) => wholeIn(v, 1, FIND_POTION_MAX),
  // The hand is checked first: every card holding a badge must be in it.
  badges: (v: unknown, r: any) => validRunBadges(v) && Object.keys(v as object).every((card) => r.hand?.includes(card)),
  badgeFloors: (v: unknown) => isRecord(v) && Object.entries(v).every(([k, n]) => (k === "stairward" || k === "skipOpen") && wholeIn(n, 0, 1e6)),
  skipRolls: (v: unknown) => wholeIn(v, 1, 1e9),
  marks: (v: any) => isRecord(v) && wholeIn(v.floor, 0, 1e6) && wholeIn(v.made, 0, 1e6) &&
    [v.tiles, v.bangs].every((list) => Array.isArray(list) && list.every((t: unknown) => typeof t === "string" && POINT_KEY.test(t))),
  skipped: (v: any) => isRecord(v) && wholeIn(v.floor, 0, 1e6) && Array.isArray(v.tiles) && v.tiles.every((t: unknown) => typeof t === "string" && POINT_KEY.test(t)),
};
/** Drops fields a run of this mode doesn't keep: the other mode's, an
 * older run's chest list, Automove memory and Focus (chests stand in
 * `changes` now, and the memory beside the run), and malformed optional
 * fields. */
function without<R>(r: any, fields: string[]): R {
  for (const k of ["rewards", "known", "visited", "focus", ...fields]) delete r[k];
  dropInvalid(r, RUN_FIELD_CHECKS);
  return r;
}
/** Validate an untrusted Tower run; null unless it has the shape a
 * TowerRun needs. */
function decodeTowerRun(r: any): TowerRun | null {
  if (!validCore(r, TOWER_WIDTH) || !validFloors(r.floors)) return null;
  // Older runs have no damage history; do not assume a perfect attempt.
  r.damaged = r.damaged !== false;
  dropInvalid(r, { summoned: (v: unknown) => Array.isArray(v) && v.every(Number.isInteger) });
  return without(r, [...DELVE_FIELDS, "keysSpent"]);
}
/** Validate an untrusted Delve run; null unless it has the shape a
 * DelveRun needs. */
function decodeDelveRun(r: any): DelveRun | null {
  if (!validCore(r, WIDTH) || !validDelveState(r)) return null;
  dropInvalid(r, { top: Number.isInteger });
  return without(r, TOWER_FIELDS);
}

// --- Mode slices ---
type DecodedMode<R extends Run> = Pick<ModeSave<R>, "run" | "history" | "fall" | "lootedTiles" | "runGold" | "runCurrency">;
type RunDecoder<R extends Run> = (raw: any) => R | null;
const validSnapshot = (value: any) => !!value && finite(value.best) && finite(value.xp);
function snapshot<R extends Run>(value: any, decodeRun: RunDecoder<R>): MoveSnapshot<R> | null {
  if (!validSnapshot(value)) return null;
  const run = decodeRun(value.run);
  return run ? { run, best: value.best, xp: Math.floor(value.xp) } : null;
}
/** Whether an undo snapshot belongs to `run`: its seed and layout. */
const sameRun = <R extends Run>(item: MoveSnapshot<R> | null, run: Run): item is MoveSnapshot<R> =>
  !!item && item.run.seed === run.seed && item.run.layoutVersion === run.layoutVersion;
/** Undo history only survives for the same seed and layout as the live run. */
function decodeHistory<R extends Run>(raw: any, run: R, undoCapacity: number, decodeRun: RunDecoder<R>): MoveSnapshot<R>[] {
  if (!Array.isArray(raw)) return [];
  return keepUndos(raw, undoCapacity)
    .map((item) => snapshot(item, decodeRun))
    .filter((item): item is MoveSnapshot<R> => sameRun(item, run));
}
/** A fall is kept only beside a run whose hero lies fallen, from the same
 * run and layout. */
function decodeFall<R extends Run>(raw: any, run: R, decodeRun: RunDecoder<R>): Fall<R> | null {
  if (run.outside || run.player.hp > 0) return null;
  const item = snapshot(raw?.snapshot, decodeRun);
  if (!sameRun(item, run)) return null;
  return { snapshot: item, by: typeof raw.by === "string" ? raw.by : "" };
}
/** Automove's memory, each half kept only when every entry is well formed. */
function decodeMemory(raw: any): AutomoveMemory {
  return {
    known: pointMap(raw?.known, (v) => v === true) ? raw.known : {},
    visited: pointMap(raw?.visited, (v) => finite(v)) ? raw.visited : {},
  };
}
function decodeLootedTiles(raw: any): Record<string, true> {
  const lootedTiles: Record<string, true> = {};
  if (isRecord(raw))
    for (const key of Object.keys(raw))
      if (/^-?\d+:(-?\d+:)?-?\d+,-?\d+$/.test(key)) lootedTiles[key] = true;
  return lootedTiles;
}
function decodeMode<R extends Run>(s: any, undoCapacity: number, decodeRun: RunDecoder<R>): DecodedMode<R> {
  const run = decodeRun(s?.run);
  return {
    run,
    history: run ? decodeHistory(s.history, run, undoCapacity, decodeRun) : [],
    fall: run ? decodeFall(s.fall, run, decodeRun) : null,
    lootedTiles: decodeLootedTiles(s?.lootedTiles),
    runGold: run ? fraction(s.runGold, 0) : 0,
    runCurrency: run ? count(s.runCurrency, 0) : 0,
  };
}
function applyMode<R extends Run>(slice: ModeSave<R>, decoded: DecodedMode<R>) {
  slice.run = decoded.run;
  slice.history = decoded.history;
  slice.fall = decoded.fall;
  slice.lootedTiles = decoded.lootedTiles;
  slice.runGold = decoded.runGold;
  slice.runCurrency = decoded.runCurrency;
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
function decodeProgress(s: any, d: Save, undoCapacity: number) {
  d.gold = fraction(s.gold, d.gold);
  d.gems = count(s.gems, d.gems);
  d.gemDrop = decodeGemDrop(s.gemDrop);
  for (const g of GOLD_SHOP) d.provisions[g.id] = count(s.provisions?.[g.id], d.provisions[g.id], 999);
  d.xp = count(s.xp, d.xp);
  decodeTraining(s, d);
  decodeModeRecords(s.tower ?? {}, s.delve ?? {}, d);
  applyMode(d.tower, decodeMode(s.tower, undoCapacity, decodeTowerRun));
  applyMode(d.delve, decodeMode(s.delve, undoCapacity, decodeDelveRun));
  d.delve.memory = decodeMemory(s.delve?.memory);
}
/** The hero's Training: ranks, what they were paid with, the ranks trainers
 * finished (their own schedule), the trainers and
 * their jobs, each stat's time credit, the time bank and the boost. */
function decodeTraining(s: any, d: Save) {
  for (const t of TRAINING) d.training[t.id] = count(s.training?.[t.id], d.training[t.id], "max" in t ? t.max : 1e6);
  for (const t of TRAINING) d.trainingPaid[t.id] = decodePaid(s.trainingPaid?.[t.id], t.cost * d.training[t.id]);
  for (const t of TRAINING) d.trainerRanks[t.id] = count(s.trainerRanks?.[t.id], 0, d.training[t.id]);
  d.trainers = count(s.trainers, d.trainers, TRAINER_GEMS.length);
  d.trainingJobs = decodeTrainingJobs(s.trainingJobs, trainingSlots(d));
  d.trainingAuto = TRAINING.filter((t) => Array.isArray(s.trainingAuto) && s.trainingAuto.includes(t.id)).map((t) => t.id);
  // Times in ms: credit can run to months, and the boost's end is a timestamp.
  for (const t of TRAINING) d.trainingCredit[t.id] = count(s.trainingCredit?.[t.id], 0, Number.MAX_SAFE_INTEGER);
  d.trainingBank = count(s.trainingBank, 0, Number.MAX_SAFE_INTEGER);
  d.trainingBoostUntil = count(s.trainingBoostUntil, d.trainingBoostUntil, Number.MAX_SAFE_INTEGER);
}
/** Each mode's currency (under its older name too) and best. */
function decodeModeRecords(tower: any, delve: any, d: Save) {
  d.tower.inspiration = count(tower.inspiration ?? tower.shards, d.tower.inspiration);
  d.tower.best = count(tower.best, d.tower.best);
  d.delve.courage = count(delve.courage ?? delve.essence, d.delve.courage);
  d.delve.best = count(delve.best, d.delve.best);
}
/** What a stat's ranks were paid with; a save from before this was kept
 * paid for them all in points (`points`). */
function decodePaid(raw: any, points: number): TrainingPaid {
  if (!raw || typeof raw !== "object") return { points, gold: 0, ms: 0 };
  return { points: count(raw.points, 0), gold: count(raw.gold, 0, Number.MAX_SAFE_INTEGER), ms: count(raw.ms, 0, Number.MAX_SAFE_INTEGER) };
}
/** The ranks in training: only well-formed jobs for distinct rows, up to the slots. */
function decodeTrainingJobs(raw: any, slots: number): TrainingJob[] {
  const jobs: TrainingJob[] = [];
  if (!Array.isArray(raw)) return jobs;
  for (const j of raw) {
    const fits = jobs.length < slots && !jobs.some((o) => o.id === j?.id);
    if (fits && validJob(j)) jobs.push(decodeJob(j));
  }
  return jobs;
}
/** A job for a known row, completing no earlier than it started. */
const validJob = (j: any) =>
  TRAINING.some((t) => t.id === j?.id) && Number.isFinite(j.startedAt) && Number.isFinite(j.completesAt) && j.completesAt >= j.startedAt;
const decodeJob = (j: any): TrainingJob => ({
  id: j.id, startedAt: j.startedAt, completesAt: j.completesAt,
  gold: count(j.gold, 0, Number.MAX_SAFE_INTEGER), ms: count(j.ms, j.completesAt - j.startedAt, Number.MAX_SAFE_INTEGER),
});
/** Version 1 had a single run (the endless climb); it becomes the Delve slice. */
function migrateV1(s: any, d: Save, undoCapacity: number) {
  d.delve.best = count(s.best, d.delve.best);
  d.delve.courage = count(s.essence, d.delve.courage);
  applyMode(d.delve, decodeMode({ run: s.run, history: s.history, fall: s.fall }, undoCapacity, decodeDelveRun));
}
/** Existing records are already rewarded; preserve old balances without double-paying. */
function decodeReached(s: any, d: Save) {
  for (const mode of ["tower", "delve"] as const) {
    d[mode].reached = count(s?.[mode]?.reached, d[mode].best);
    d[mode].best = Math.max(d[mode].best, d[mode].reached);
  }
}
/** Each mode's tiers: the highest opened, the one selected (its records
 * are the slice's), and the others' records. */
function decodeTiers(s: any, d: Save) {
  for (const mode of ["tower", "delve"] as const) {
    const raw = s?.[mode], slice = d[mode];
    slice.tiersOpen = Math.max(1, count(raw?.tiersOpen, 1, TIERS));
    slice.tier = Math.max(1, Math.min(slice.tiersOpen, count(raw?.tier, 1)));
    if (isRecord(raw?.tierRecords)) decodeTierRecords(raw.tierRecords, slice);
  }
}
type TieredSlice = Pick<ModeSave, "tier" | "tiersOpen" | "tierRecords">;
/** The records of each tier opened but not selected. */
function decodeTierRecords(raw: Record<string, any>, slice: TieredSlice) {
  for (const [key, r] of Object.entries(raw)) {
    if (!isOtherTier(key, slice) || !isRecord(r)) continue;
    const reached = count(r.reached, 0);
    slice.tierRecords[key] = { best: Math.max(reached, count(r.best, 0)), reached };
  }
}
/** Whether `key` names an opened tier other than the one selected. */
const isOtherTier = (key: string, slice: TieredSlice) =>
  /^[1-9]$/.test(key) && Number(key) <= slice.tiersOpen && Number(key) !== slice.tier;
const touchedDelve = (d: Save) =>
  !!(d.delve.run || d.delve.best || d.delve.courage) ||
  UPGRADES.some((u) => u.currency === "courage" && d.upgrades[u.id]);
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
/** The saved hand's cards the player owns, in order, each once and no
 * more than the hand holds (`slots`), or the base hand when the save has
 * none or lost its STAIRS card, which every hand must hold. */
function decodeHand(raw: any, owned: CardId[], slots: number): CardId[] {
  if (!Array.isArray(raw)) return [...BASE_HAND];
  const hand = [...new Set(raw.filter((id): id is CardId => owned.includes(id)))].slice(0, slots);
  return validHand(hand) ? hand : [...BASE_HAND];
}
export function decode(raw: string | null): Save {
  const d = defaults();
  try {
    const s = JSON.parse(raw ?? "null") ?? {};
    decodeUpgrades(s.upgrades, d);
    // Undo capacity counts Undo Count research, so the Archives come first.
    d.archives = decodeArchives(s.archives);
    const { undoCapacity } = loadout(d);
    d.settings = decodeSettings(s.settings);
    for (const step of VERSION_STEPS.get(s.version) ?? []) step(s, d, undoCapacity);
    d.entitlements = decodeEntitlements(s.entitlements);
    d.shop = decodeShop(s.shop);
    d.goals = decodeGoals(s.goals);
    if (permanentBoost(d)) d.trainingBoostUntil = BOOST_FOREVER;
    decodeReached(s, d);
    decodeTiers(s, d);
    migratePreSkillTrees(s.upgrades, d);
    d.defend = decodeDefendSave(s.defend);
    // Slots bought with Gems count only with Larger Hand, which opens them.
    if (d.upgrades.largerHand) d.handSlots = count(s.handSlots, 0, HAND_SLOT_GEMS.length);
    d.hand = decodeHand(s.hand, deckCards(d.upgrades), handSlots(d));
    d.badges = decodeBadges(s.badges, d.upgrades);
    for (const k of ["deck", "removeCard", "addCard", "upgrades", "gear", "onTheJob", "speed"] as const) d.tutorials[k] = s.tutorials?.[k] === true;
    for (const k of ["inspiration", "courage"] as const) d.treeNotices[k] = s.treeNotices?.[k] === true;
  } catch {}
  return d;
}
export function load(): Save {
  try {
    return decode(localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(OLD_SAVE_KEY));
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
