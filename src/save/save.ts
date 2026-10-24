import { decodeTrial } from "../proving-grounds/trial.ts";
import { defaultTrialAccess, decodeTrialAccess } from "../proving-grounds/access.ts";
import { TRAINER_GEMS, trainingSlots, type TrainingJob, type TrainingPaid } from "../progression/training-jobs.ts";
import { count, dropInvalid, finite, fraction, isRecord, wholeIn } from "./decode.ts";
import { TIERS } from "../tiers.ts";
import { GOLD_SHOP, PROVISION_BOOST_TURNS, USED_PROVISIONS, OLD_SAVE_KEY, SAVE_KEY, TOWER_WIDTH, TRAINING, UPGRADES, WIDTH, amountAt, trainingCeiling, trainingDef, type UpgradeId } from "../config.ts";
import type { AutomoveMemory, DelveRun, Fall, MoveSnapshot, Run, TowerRun } from "../runs.ts";
import type { ModeSave, Save } from "./shape.ts";
import { emptyMaterials, MATERIAL_IDS, type MaterialId } from "../economy/materials.ts";
import { decodeEquipment, defaultEquipment } from "../equipment/inventory.ts";
import { decodeDefendSave, defaultDefendSave } from "../defend/progress.ts";
import { decodeSettings, defaultSettings } from "./settings.ts";
import { keepUndos, loadout } from "../progression/loadout.ts";
import { BASE_HAND, CARD_IDS, HAND_SLOT_GEMS, IN_PLACE, MAX_HAND_SLOTS, deckCards, handSlots, keptLinks, type CardId, type CardLink } from "../cards/cards.ts";
import { decodeGemDrop, defaultGemDrop } from "../economy/gems.ts";
import { decodeArchives, defaultArchives, researched } from "../progression/archives.ts";
import { adsOff, BOOST_FOREVER, decodeEntitlements, permanentBoost } from "../shop/entitlements.ts";
import { decodeShop, defaultShop } from "../shop/ledger.ts";
import { decodeGoals, defaultGoals } from "../goals.ts";
import { decodeTournament, defaultTournament } from "../tournament/progress.ts";
import { decodeMail, defaultMail } from "../mail/progress.ts";
import { decodeMissions, defaultMissions } from "../missions/progress.ts";
import { decodeEvents, defaultEvents } from "../events/progress.ts";
import { decodeRelics } from "../economy/relics.ts";
import { decodeShrines, defaultShrines, validShrineRun } from "../shrines.ts";
import { decodeThemes, defaultThemes } from "../theme-collection.ts";
import { isTournamentRun } from "../tournament/run.ts";
import { decodeBadges, defaultBadges, validRunBadges } from "../cards/badges.ts";
import { backfillProfile, decodeProfile, defaultProfile } from "./profile.ts";
import { decodeFinds, defaultFinds, validNotes } from "../run-notes.ts";
import { isFoeKey } from "../cards/foe-cards.ts";
import { decodeCardXp } from "../cards/levels.ts";
import { decodeCardBuys, defaultCardBuys } from "../cards/buys.ts";
import { totalCardLevels, treeNode, decodeCardTrees, pointsSpent } from "../cards/trees.ts";
export function defaults(): Save {
  return {
    version: 4,
    tower: { run: null, history: [], fall: null, best: 0, reached: 0, inspiration: 0, lootedTiles: {}, runGold: 0, runFinds: defaultFinds(), runBoostGold: null, runCurrency: 0, runRecord: false, tier: 1, tiersOpen: 1, tierRecords: {} },
    delve: { run: null, history: [], fall: null, best: 0, reached: 0, courage: 0, lootedTiles: {}, runGold: 0, runFinds: defaultFinds(), runBoostGold: null, runCurrency: 0, runRecord: false, memory: { known: {}, visited: {} }, tier: 1, tiersOpen: 1, tierRecords: {} },
    gems: 0,
    ascensionShards: 0,
    medals: 0,
    cells: 0,
    gemDrop: defaultGemDrop(),
    goldBoostUntil: 0,
    gold: 0,
    provisions: Object.fromEntries(
      GOLD_SHOP.map((g) => [g.id, 0]),
    ) as Save["provisions"],
    xp: 0,
    bonusTrainingPoints: 0,
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
    equipment: defaultEquipment(),
    hand: [...BASE_HAND],
    cardLinks: [],
    cardXp: {},
    cardTrees: {},
    cardBuys: defaultCardBuys(),
    handSlots: 0,
    badges: defaultBadges(),
    tutorials: { deck: false, removeCard: false, addCard: false, upgrades: false, gear: false, onTheJob: false, speed: false, climb: false, enter: false, delve: false, chamber: false, cardPoints: false },
    treeNotices: { inspiration: false, courage: false },
    seen: { level: 0, training: 0, archives: 0, cards: [...BASE_HAND], cardLevels: 0, met: [...BASE_HAND] },
    archives: defaultArchives(),
    defend: defaultDefendSave(),
    entitlements: [],
    shop: defaultShop(),
    goals: defaultGoals(),
    tournament: defaultTournament(),
    mail: defaultMail(),
    missions: defaultMissions(),
    events: defaultEvents(),
    relics: [],
    shrines: defaultShrines(),
    themes: defaultThemes(),
    profile: defaultProfile(),
    trialAccess: defaultTrialAccess(),
  };
}
const CHEST_TIERS = ["silver", "gold"] as const;
const KEY_COLORS = ["yellow", "blue", "red"] as const;
const POINT_KEY = /^\d+,\d+$/;
/** Every key is an `x,y` point and every value passes `valid`. */
const pointMap = (m: any, valid: (v: any) => boolean) =>
  isRecord(m) && Object.entries(m).every(([k, v]) => POINT_KEY.test(k) && valid(v));

// --- Runs ---
const ENEMY_STRENGTHS = ["weak", "normal", "strong", "elite", "boss", "greaterBoss"];
const validEnemy = (e: any) =>
  isRecord(e) && ENEMY_STRENGTHS.includes(e.strength) && typeof e.name === "string" &&
  finite(e.hp) && e.hp > 0 && finite(e.attack) && e.attack >= 0 && finite(e.defense) && e.defense >= 0 && finite(e.tier) &&
  (e.spawn === undefined || wholeIn(e.spawn, 0, 1e9));
/** An enemy spawned onto the floor during the run (`Game.spawnEnemy`),
 * numbered among the run's spawns. TODO: drop the unnumbered Greater Boss
 * once saves from before spawn numbers are gone. */
const validSpawned = (e: any) => validEnemy(e) && (e.spawn !== undefined || e.strength === "greaterBoss");
/** An enemy the hero's arrows have wounded (enemies/ranged.ts): the generated or
 * spawned enemy, kept with its wound. */
const validWounded = (v: any) => finite(v.wound) && v.wound > 0 && validEnemy(v.enemy);
/** Open floor, maybe with a Flying enemy over it (enemies/flying.ts), generated
 * or moved there, kept with its wound. */
const validFloor = (v: any) => v.flyer === undefined ? v.wound === undefined : validEnemy(v.flyer) && (v.wound === undefined || (finite(v.wound) && v.wound > 0));
const validChange = (v: any) =>
  (v?.kind === "floor" && validFloor(v)) || v?.kind === "wall" ||
  (v?.kind === "enemy" && (v.wound === undefined ? validSpawned(v.enemy) : validWounded(v))) ||
  (v?.kind === "openedChest" && (v.tier === undefined || CHEST_TIERS.includes(v.tier))) ||
  (v?.kind === "reward" && CHEST_TIERS.includes(v.tier));
const validChanges = (m: any) => pointMap(m, validChange);
/** Outside runs only exist in the forest clearing below the first floor. */
const validOutside = (r: any) =>
  (r.outside === undefined || typeof r.outside === "boolean") &&
  (!r.outside || (r.height === 0 && r.player?.y < 12 && r.floor === 0));
const validCounters = (r: any) =>
  Number.isInteger(r.seed) && finite(r.height) && finite(r.floor) && r.floor <= r.player?.y &&
  finite(r.kills) && finite(r.treasures);
/** The most HP a hero may hold, as a multiple of its max HP: all of
 * Overheal's ranks. */
const OVERHEAL_MOST = amountAt(trainingDef("overheal"), trainingDef("overheal").max) / 1000;
const validPlayer = (p: any, width: number) =>
  !!p &&
  Number.isInteger(p.x) && p.x >= 0 && p.x < width &&
  Number.isInteger(p.y) && finite(p.y) &&
  finite(p.hp) && p.hp >= 0 && finite(p.maxHp) && p.hp <= p.maxHp * OVERHEAL_MOST &&
  finite(p.attack) && finite(p.defense) && (p.shroud === undefined || (finite(p.shroud) && p.shroud >= 0)) &&
  (p.regen === undefined || (finite(p.regen) && p.regen >= 0)) &&
  (p.lifesteal === undefined || (finite(p.lifesteal) && p.lifesteal >= 0)) &&
  (p.thorns === undefined || (finite(p.thorns) && p.thorns >= 0)) &&
  (p.parry === undefined || (finite(p.parry) && p.parry >= 0 && p.parry <= 100)) &&
  (p.cardParry === undefined || (finite(p.cardParry) && p.cardParry >= 0 && p.cardParry <= 100)) &&
  (p.bossAttack === undefined || (finite(p.bossAttack) && p.bossAttack >= 0)) &&
  (p.pierce === undefined || (finite(p.pierce) && p.pierce >= 0 && p.pierce <= 100)) &&
  (p.stealOverheal === undefined || (finite(p.stealOverheal) && p.stealOverheal >= 0)) &&
  (p.doorShroud === undefined || (finite(p.doorShroud) && p.doorShroud >= 0)) &&
  (p.powerStrike === undefined || p.powerStrike === true) &&
  [p.takedown, p.tangle].every((cuts) => cuts === undefined || (isRecord(cuts) && Object.entries(cuts).every(([k, n]) => (k === "boss" || k === "greaterBoss") && finite(n) && n >= 0))) &&
  [p.foeAttack, p.foeDefense, p.foeShroud, p.foeCritChance, p.foeCritFactor, p.foeStealOverheal].every((m) => m === undefined || (isRecord(m) && Object.entries(m).every(([id, v]) => isFoeKey(id) && finite(v) && (v as number) >= 0))) &&
  KEY_COLORS.every((k) => finite(p.keys?.[k]));
/** Checks every run passes, whatever its mode; `width` is the mode's board. */
const validCore = (r: any, width: number) =>
  !!r && validOutside(r) && validCounters(r) && validPlayer(r.player, width) && validChanges(r.changes);
const validDelveState = (r: any) => Number.isInteger(r.milestone) && finite(r.milestone);
const TOWER_FIELDS = ["damaged", "enemiesLeft", "summoned", "start", "shrine"];
const DELVE_FIELDS = ["milestone", "tournament"];
/** Training ranks bought in a run: known rows, each a whole number of
 * ranks, no more than the row reaches in a run with every Limit Break. */
const validRunTraining = (t: any) =>
  isRecord(t) && Object.entries(t).every(([id, n]) => {
    const row = TRAINING.find((r) => r.id === id);
    return !!row && wholeIn(n, 0, trainingCeiling(row));
  });
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
  ignoreUsed: (v: unknown) => wholeIn(v, 0, 99),
  targetUsed: (v: unknown) => wholeIn(v, 0, 99),
  bombsUsed: (v: unknown) => wholeIn(v, 0, 999),
  provisionsUsed: (v: unknown) => isRecord(v) && Object.entries(v).every(([k, n]) => (USED_PROVISIONS as readonly string[]).includes(k) && wholeIn(n, 1, 999)),
  boosts: (v: unknown) => isRecord(v) && Object.entries(v).every(([k, b]: [string, any]) => (k === "attack" || k === "defense") && isRecord(b) && finite(b.amount) && b.amount >= 0 && wholeIn(b.turns, 1, PROVISION_BOOST_TURNS)),
  keyFloor: (v: unknown) => wholeIn(v, 0, 1e9),
  undosUsed: (v: unknown) => wholeIn(v, 0, 99),
  regain: (v: unknown) => isRecord(v) && Object.entries(v).every(([k, n]) => ["focus", "ignore", "target"].includes(k) && wholeIn(n, 1, 1e6)),
  ignored: (v: any) => isRecord(v) && wholeIn(v.floor, 0, 1e6) && Array.isArray(v.tiles) && v.tiles.every((t: unknown) => typeof t === "string" && POINT_KEY.test(t)),
  targeted: (v: unknown) => typeof v === "string" && POINT_KEY.test(v),
  // The hand is checked first: a focused card must be in it.
  focused: (v: unknown, r: any) => !!r.hand?.includes(v),
  training: validRunTraining,
  cardUses: (v: unknown) => isRecord(v) && Object.entries(v).every(([id, n]) => IN_PLACE.has(id as CardId) && wholeIn(n, 1, 1e6)),
  tier: (v: unknown) => wholeIn(v, 2, TIERS),
  // HEAL's tree raises the trained chance, up to every potion.
  percentPotions: (v: unknown) => wholeIn(v, 1, 10_000),
  chestOdds: (v: any) => isRecord(v) && Object.keys(v).length === 2 && [v.supply, v.equipment].every((n) => finite(n) && n >= 0 && n <= 100) && v.supply + v.equipment > 0,
  treasureFloor: (v: unknown) => finite(v) && v > 0 && v <= 100,
  doorOdds: (v: any) => isRecord(v) && "skeleton" in v && "lockPick" in v
    && Object.entries(v).every(([k, n]) => ["skeleton", "lockPick", "transmute", "wood", "heartPick"].includes(k) && finite(n) && n >= 0 && n <= 100)
    && Object.values(v).some((n) => (n as number) > 0),
  // The hand is checked first: every card holding a badge must be in it.
  badges: (v: unknown, r: any) => validRunBadges(v) && Object.keys(v as object).every((card) => r.hand?.includes(card)),
  // The hand is checked first: every card with a tree copied must be in it.
  cardTrees: (v: unknown, r: any) => isRecord(v) && Object.entries(v).every(([card, nodes]) => !!r.hand?.includes(card) && isRecord(nodes) &&
    Object.entries(nodes).every(([id, n]) => { const node = treeNode(card as CardId, id); return !!node && wholeIn(n, 1, node.max); })),
  // The hand is checked first: each link joins cards side by side in it.
  links: (v: unknown, r: any) => Array.isArray(v) && v.length > 0 && keptLinks(r.hand ?? [], links(v)).length === v.length,
  badgeFloors: (v: unknown) => isRecord(v) && Object.entries(v).every(([k, n]) => (k === "stairward" || k === "skipOpen") && wholeIn(n, 0, 1e6)),
  skipRolls: (v: unknown) => wholeIn(v, 1, 1e9),
  freeRolls: (v: unknown) => isRecord(v) && Object.entries(v).every(([k, n]) => ["offense", "defense", "utility"].includes(k) && wholeIn(n, 1, 1e9)),
  goldCombo: (v: unknown) => wholeIn(v, 1, 1e9),
  maxHpBoost: (v: unknown) => finite(v) && v > 0 && v <= 1e9,
  spawns: (v: unknown) => wholeIn(v, 1, 1e9),
  volleys: (v: any) => isRecord(v) && wholeIn(v.turn, 0, 1e12) && (v.hero === undefined || wholeIn(v.hero, 0, 1e6)) &&
    (v.waited === undefined || wholeIn(v.waited, 1, 1e12)) && (v.rapid === undefined || wholeIn(v.rapid, 1, 1e4)) &&
    (v.foes === undefined || pointMap(v.foes, (n) => wholeIn(n, 0, 1e6))),
  notes: validNotes,
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
  if (!validCore(r, TOWER_WIDTH)) return null;
  // Older runs have no damage history; do not assume a perfect attempt.
  r.damaged = r.damaged !== false;
  dropInvalid(r, { summoned: (v: unknown) => Array.isArray(v) && v.every(Number.isInteger), start: (v: unknown) => Number.isInteger(v) && (v as number) > 0, shrine: validShrineRun, enemiesLeft: (v: unknown) => v === true });
  return without(r, [...DELVE_FIELDS, "keysSpent", "floors"]);
}
/** Validate an untrusted Delve run; null unless it has the shape a
 * DelveRun needs. */
function decodeDelveRun(r: any): DelveRun | null {
  if (!validCore(r, WIDTH) || !validDelveState(r)) return null;
  dropInvalid(r, { top: Number.isInteger, tournament: isTournamentRun });
  return without(r, TOWER_FIELDS);
}

// --- Mode slices ---
type DecodedMode<R extends Run> = Pick<ModeSave<R>, "run" | "history" | "fall" | "lootedTiles" | "runGold" | "runBoostGold" | "runCurrency" | "runRecord" | "runFinds">;
type RunDecoder<R extends Run> = (raw: any) => R | null;
const validSnapshot = (value: any) => !!value && finite(value.best) && finite(value.xp);
function snapshot<R extends Run>(value: any, decodeRun: RunDecoder<R>): MoveSnapshot<R> | null {
  if (!validSnapshot(value)) return null;
  const run = decodeRun(value.run);
  return run ? { run, best: value.best, xp: Math.floor(value.xp), ...(finite(value.silver) ? { silver: fraction(value.silver, 0) } : {}), ...(isRecord(value.cardXp) ? { cardXp: decodeCardXp(value.cardXp) } : {}), ...(value.quiet === true ? { quiet: true as const } : {}) } : null;
}
/** Whether an undo snapshot belongs to `run`: its seed and layout. */
const sameRun = <R extends Run>(item: MoveSnapshot<R> | null, run: Run): item is MoveSnapshot<R> =>
  !!item && item.run.seed === run.seed && item.run.layoutVersion === run.layoutVersion;
/** Undo history only survives for the same seed and layout as the live run,
 * and holds no more moves than the run has undos left. */
function decodeHistory<R extends Run>(raw: any, run: R, undoCapacity: number, decodeRun: RunDecoder<R>): MoveSnapshot<R>[] {
  if (!Array.isArray(raw)) return [];
  return keepUndos(raw, undoCapacity - (run.undosUsed ?? 0))
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
      if (/^-?\d+:(-?\d+:)?-?\d+,-?\d+(:\w+)?$/.test(key)) lootedTiles[key] = true;
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
    runBoostGold: run && s.runBoostGold !== null && s.runBoostGold !== undefined ? fraction(s.runBoostGold, 0) : null,
    runCurrency: run ? count(s.runCurrency, 0) : 0,
    runRecord: !!run && s.runRecord === true,
    runFinds: run ? decodeFinds(s.runFinds) : defaultFinds(),
  };
}
function applyMode<R extends Run>(slice: ModeSave<R>, decoded: DecodedMode<R>) {
  slice.run = decoded.run;
  slice.history = decoded.history;
  slice.fall = decoded.fall;
  slice.lootedTiles = decoded.lootedTiles;
  slice.runGold = decoded.runGold;
  slice.runBoostGold = decoded.runBoostGold;
  slice.runCurrency = decoded.runCurrency;
  slice.runRecord = decoded.runRecord;
  slice.runFinds = decoded.runFinds;
}

// --- Inventory ---
function decodeMaterials(s: any): Record<MaterialId, number> {
  const materials = emptyMaterials();
  if (s && typeof s === "object")
    for (const id of MATERIAL_IDS) materials[id] = count(s[id], materials[id]);
  return materials;
}
/** Older (version-2) saves intentionally get an empty material inventory
 * rather than being invalidated. The crafted equipment of earlier saves
 * (`equipmentInventory`, never reachable in play) is dropped. */
function decodeInventory(s: any, d: Save) {
  d.materials = decodeMaterials(s.materials);
}

// --- Settings, currencies and records ---
/** Upgrades renamed since a save may have been made: each new id's old one,
 * read when the save has none under the new id.
 * TODO: remove these conversions in a future save version. */
const RENAMED_UPGRADES: Partial<Record<UpgradeId, string>> = { parry: "evade", dash: "rush", dashRegen: "rushRegen", dashBadge: "rushBadge" };
/** Rush became Dash: its research projects' and badge's old ids, renamed
 * in the raw save before the Archives and badges decode it.
 * TODO: remove this conversion in a future save version. */
const RUSH_RENAMES = new Map([["rush", "dash"], ["rushRegen", "dashRegen"]]);
function renameRush(s: any) {
  const a = s.archives;
  if (isRecord(a)) {
    for (const k of ["levels", "progress"]) {
      const m = a[k];
      if (isRecord(m)) for (const [old, now] of RUSH_RENAMES) if (old in m && !(now in m)) m[now] = m[old];
    }
    for (const slot of Array.isArray(a.slots) ? a.slots : []) if (isRecord(slot?.job) && RUSH_RENAMES.has(slot.job.research)) slot.job.research = RUSH_RENAMES.get(slot.job.research);
    for (const r of Array.isArray(a.history) ? a.history : []) if (isRecord(r) && RUSH_RENAMES.has(r.research)) r.research = RUSH_RENAMES.get(r.research);
  }
  const b = s.badges, dash = (id: unknown) => (id === "rush" ? "dash" : id);
  if (isRecord(b?.owned) && "rush" in b.owned && !("dash" in b.owned)) b.owned.dash = b.owned.rush;
  if (isRecord(b?.cards)) for (const card of Object.keys(b.cards)) if (Array.isArray(b.cards[card])) b.cards[card] = b.cards[card].map(dash);
  for (const mode of ["tower", "delve"]) {
    const badges = s[mode]?.run?.badges;
    if (isRecord(badges)) for (const list of Object.values(badges)) if (Array.isArray(list)) for (const r of list) if (isRecord(r)) r.id = dash(r.id);
  }
}
/** DOOR's legendary Master Key became Secret Knock (KEY's tree took the
 * name), and its epic Locksmith Lock Pick (KEY's has its own): their levels
 * spent and opened, and a run inside's, with the run's door odds, renamed
 * in the raw save before the trees decode it.
 * TODO: remove this conversion in a future save version. */
const DOOR_RENAMES = [["masterKey", "secretKnock"], ["locksmith", "lockPick"]] as const;
function renameDoorNodes(s: any) {
  for (const trees of [s.cardTrees, s.cardBuys?.opened, s.tower?.run?.cardTrees, s.delve?.run?.cardTrees]) {
    const door = isRecord(trees) ? trees.door : undefined;
    if (isRecord(door)) for (const [old, now] of DOOR_RENAMES) if (old in door && !(now in door)) {
      door[now] = door[old];
      delete door[old];
    }
  }
  for (const mode of ["tower", "delve"]) {
    const odds = s[mode]?.run?.doorOdds;
    if (isRecord(odds) && "locksmith" in odds && !("lockPick" in odds)) {
      odds.lockPick = odds.locksmith;
      delete odds.locksmith;
    }
  }
}
/** KEY took GOLD KEY's place in the base hand, and GOLD KEY became an
 * Inspiration skill: a save with no KEY card that hasn't earned GOLD KEY
 * holds KEY in its place, in the hand, its links and the badges on it (and
 * a run inside's), renamed in the raw save before it decodes. The skill
 * earns GOLD KEY back.
 * TODO: remove this conversion in a future save version. */
function retireYellowKey(s: any) {
  if ((isRecord(s.upgrades) && s.upgrades.cardYellowKey) || !Array.isArray(s.hand) || s.hand.includes("key")) return;
  const card = (id: unknown) => (id === "yellowKey" ? "key" : id);
  const cards = (list: unknown) => (Array.isArray(list) ? list.map(card) : list);
  const pairs = (list: unknown) => (Array.isArray(list) ? list.map(cards) : list);
  /** Moves the badges a map by card holds on GOLD KEY onto KEY. */
  const badges = (byCard: unknown) => {
    if (!isRecord(byCard) || !("yellowKey" in byCard) || "key" in byCard) return;
    byCard.key = byCard.yellowKey;
    delete byCard.yellowKey;
  };
  s.hand = cards(s.hand);
  s.cardLinks = pairs(s.cardLinks);
  badges(s.badges?.cards);
  for (const mode of ["tower", "delve"]) {
    const run = s[mode]?.run;
    if (!isRecord(run) || !Array.isArray(run.hand) || run.hand.includes("key")) continue;
    run.hand = cards(run.hand);
    run.links = pairs(run.links);
    badges(run.badges);
  }
}
function decodeUpgrades(raw: any, d: Save) {
  for (const u of UPGRADES) d.upgrades[u.id] = count(raw?.[u.id] || raw?.[RENAMED_UPGRADES[u.id] ?? ""], d.upgrades[u.id], u.max);
}
function decodeProgress(s: any, d: Save, undoCapacity: number) {
  d.gold = fraction(s.gold, d.gold);
  d.gems = count(s.gems, d.gems);
  d.ascensionShards = count(s.ascensionShards, d.ascensionShards);
  d.medals = count(s.medals, d.medals);
  d.cells = fraction(s.cells, d.cells);
  d.gemDrop = decodeGemDrop(s.gemDrop);
  d.goldBoostUntil = count(s.goldBoostUntil, 0, Number.MAX_SAFE_INTEGER);
  for (const g of GOLD_SHOP) d.provisions[g.id] = count(s.provisions?.[g.id], d.provisions[g.id], 999);
  d.xp = count(s.xp, d.xp);
  d.bonusTrainingPoints = count(s.bonusTrainingPoints, d.bonusTrainingPoints);
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
  for (const t of TRAINING) d.training[t.id] = count(s.training?.[t.id], d.training[t.id], trainingCeiling(t));
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
  ranks: Math.max(1, count(j.ranks, 1, 1000)), speed: Math.max(1, count(j.speed, 1, 10)), used: count(j.used, 0, Number.MAX_SAFE_INTEGER),
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
/** Each mode's tiers: the highest opened (the Tower's, which the Delve's
 * caves follow), the one selected (its records are the slice's), and the
 * others' records. */
function decodeTiers(s: any, d: Save) {
  const open = Math.max(1, count(s?.tower?.tiersOpen, 1, TIERS));
  for (const mode of ["tower", "delve"] as const) {
    const raw = s?.[mode], slice = d[mode];
    slice.tiersOpen = open;
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

/** Provisions became uses a run carries, at a hundred times the price, in
 * version 4: a version 3 save's provisions, bought cheaply as starting
 * stats, are dropped (the Gold they cost isn't returned).
 * TODO: remove this reset in a future save version. */
function resetProvisions(_s: any, d: Save) {
  for (const g of GOLD_SHOP) d.provisions[g.id] = 0;
}
type VersionStep = (s: any, d: Save, undoCapacity: number) => void;
/** What each save version carries beyond upgrades and settings. A Map, so
 * lookups match versions strictly (no "3" or prototype keys). */
const VERSION_STEPS = new Map<unknown, VersionStep[]>([
  [1, [migrateV1]],
  [2, [decodeProgress]],
  [3, [decodeProgress, decodeInventory, resetProvisions]],
  [4, [decodeProgress, decodeInventory]],
]);
/** Whether `decode` reads saves of `version`. */
export const decodableVersion = (version: unknown) => VERSION_STEPS.has(version);
/** The saved hand's cards the player owns, in order, each once and no
 * more than the hand holds (`slots`), or the base hand when the save has
 * none or lost its STAIRS card, which every hand must hold. */
/** The well-formed links of `raw`: pairs of card ids. */
function links(raw: unknown): CardLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is CardLink => Array.isArray(l) && l.length === 2 && l.every((id) => CARD_IDS.includes(id)));
}
function decodeHand(raw: any, owned: CardId[], slots: number): CardId[] {
  if (!Array.isArray(raw)) return [...BASE_HAND];
  const hand = [...new Set(raw.filter((id): id is CardId => owned.includes(id)))].slice(0, slots);
  return validHand(hand) ? hand : [...BASE_HAND];
}
/** The dots' dismissals; a save without them has seen, and met, the deck
 * it holds and its cards' levels. */
function decodeSeen(s: any, d: Save): Save["seen"] {
  const held = deckCards(d.upgrades, d.goals), known = (raw: unknown) => Array.isArray(raw) ? CARD_IDS.filter((id) => raw.includes(id)) : held;
  const cardLevels = s?.cardLevels === undefined ? totalCardLevels(d) : count(s.cardLevels, 0);
  return { level: count(s?.level, 0), training: count(s?.training, 0), archives: count(s?.archives, 0), cards: known(s?.cards), cardLevels, met: known(s?.met) };
}
export function decode(raw: string | null): Save {
  const d = defaults();
  try {
    const s = JSON.parse(raw ?? "null") ?? {};
    if (isRecord(s)) renameRush(s);
    if (isRecord(s)) retireYellowKey(s);
    if (isRecord(s)) renameDoorNodes(s);
    decodeUpgrades(s.upgrades, d);
    // Undo capacity counts Undo Count research, so the Archives come first.
    d.archives = decodeArchives(s.archives);
    const { undoCapacity } = loadout(d);
    d.settings = decodeSettings(s.settings);
    for (const step of VERSION_STEPS.get(s.version) ?? []) step(s, d, undoCapacity);
    d.equipment = decodeEquipment(s.equipment);
    d.entitlements = decodeEntitlements(s.entitlements);
    d.shop = decodeShop(s.shop);
    d.goals = decodeGoals(s.goals);
    d.tournament = decodeTournament(s.tournament);
    d.mail = decodeMail(s.mail);
    d.missions = decodeMissions(s.missions);
    d.events = decodeEvents(s.events);
    d.relics = decodeRelics(s.relics);
    d.shrines = decodeShrines(s.shrines);
    d.themes = decodeThemes(s.themes);
    const trial = decodeTrial(s.provingGrounds);
    d.trialAccess = decodeTrialAccess(s.trialAccess);
    if (trial) d.provingGrounds = trial;
    // The boost runs for good only while a pack that grants it is owned.
    if (permanentBoost(d)) d.trainingBoostUntil = BOOST_FOREVER;
    else if (d.trainingBoostUntil === BOOST_FOREVER) d.trainingBoostUntil = 0;
    // With Ad-Disable there is no Gold ad, so no time stored by one.
    if (adsOff(d)) d.goldBoostUntil = 0;
    decodeReached(s, d);
    decodeTiers(s, d);
    migratePreSkillTrees(s.upgrades, d);
    d.defend = decodeDefendSave(s.defend);
    // Slots bought with Gems count only with Larger Hand, which opens them.
    if (d.upgrades.largerHand) d.handSlots = count(s.handSlots, 0, HAND_SLOT_GEMS.length);
    d.hand = decodeHand(s.hand, deckCards(d.upgrades, d.goals), handSlots(d));
    d.cardLinks = keptLinks(d.hand, links(s.cardLinks));
    d.cardXp = decodeCardXp(s.cardXp);
    d.cardBuys = decodeCardBuys(s.cardBuys);
    d.cardTrees = decodeCardTrees(s.cardTrees, d.cardXp, d.cardBuys.opened);
    d.badges = decodeBadges(s.badges, d.upgrades, researched(d.archives, "badgeSlots"), d.goals);
    for (const k of ["deck", "removeCard", "addCard", "upgrades", "gear", "onTheJob", "speed", "climb", "enter", "delve", "chamber", "cardPoints"] as const) d.tutorials[k] = s.tutorials?.[k] === true;
    // A player who has already spent a card point needs no lesson on it.
    if (CARD_IDS.some((id) => pointsSpent(d.cardTrees, id) > 0)) d.tutorials.cardPoints = true;
    for (const k of ["inspiration", "courage"] as const) d.treeNotices[k] = s.treeNotices?.[k] === true;
    d.seen = decodeSeen(s.seen, d);
    d.profile = decodeProfile(s.profile);
    backfillProfile(d);
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
