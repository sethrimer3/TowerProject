/** Persistent DEFEND state: the city layout the player designed, what they
 * own and have upgraded, and their best wave. A run itself is never saved —
 * it always starts fresh from the layout. */
import {
  BOMB_PRICE,
  SPEED3_PRICE,
  PALETTE_ITEMS,
  STARTING_OWNED,
  UPGRADES,
  purchasePrice,
  upgradePrice,
  type PaletteItem,
  type Price,
  type UpgradeId,
} from "./catalog.ts";
import { SPAWN_ROW, TILES_H, TILES_W, parseTileKey, tileKey } from "./grid.ts";
import { defaultLayout, fitLayout, placedCount, tilesConnected, type Layout, type PlacedKind } from "./layout.ts";

export type DefendSave = {
  layout: Layout;
  owned: Record<PaletteItem, number>;
  levels: Record<UpgradeId, number>;
  bombs: number;
  bestWave: number;
  paletteSide: "left" | "right";
  /** 3× battle speed has been bought in the Armory. */
  speed3: boolean;
  /** Seed for the filler city, so the same layout always looks the same. */
  seed: number;
};

export function defaultDefendSave(): DefendSave {
  return {
    layout: defaultLayout(),
    owned: { ...STARTING_OWNED },
    levels: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>,
    bombs: 0,
    bestWave: 0,
    paletteSide: "left",
    speed3: false,
    seed: 1 + Math.floor(Math.random() * 1e9),
  };
}

/** How many of a palette item are still in the palette (owned, not placed). */
export function available(save: DefendSave, item: PaletteItem): number {
  return Math.max(0, save.owned[item] - placedCount(save.layout, item as PlacedKind | "cityTile"));
}

/** The wallet DEFEND spends from: main-game gold and metal bars. */
export type Wallet = { gold: number; ironBar: number; steelBar: number };

export const canAfford = (w: Wallet, p: Price) =>
  w.gold >= p.gold && w.ironBar >= (p.ironBar ?? 0) && w.steelBar >= (p.steelBar ?? 0);

export function pay(w: Wallet, p: Price) {
  w.gold -= p.gold;
  w.ironBar -= p.ironBar ?? 0;
  w.steelBar -= p.steelBar ?? 0;
}

export function buyItem(save: DefendSave, w: Wallet, item: PaletteItem): boolean {
  const price = purchasePrice(item, save.owned[item]);
  if (!canAfford(w, price)) return false;
  pay(w, price);
  save.owned[item]++;
  return true;
}

export function buyUpgrade(save: DefendSave, w: Wallet, id: UpgradeId): boolean {
  const def = UPGRADES.find((u) => u.id === id)!;
  const level = save.levels[id];
  if (level >= def.maxLevel) return false;
  const price = upgradePrice(level);
  if (!canAfford(w, price)) return false;
  pay(w, price);
  save.levels[id]++;
  return true;
}

export function buySpeed3(save: DefendSave, w: Wallet): boolean {
  if (save.speed3 || !canAfford(w, SPEED3_PRICE)) return false;
  pay(w, SPEED3_PRICE);
  save.speed3 = true;
  return true;
}

export function buyBomb(save: DefendSave, w: Wallet): boolean {
  if (!canAfford(w, BOMB_PRICE)) return false;
  pay(w, BOMB_PRICE);
  save.bombs++;
  return true;
}

// ── Decoding untrusted saves ─────────────────────────────────────────────
const int = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const PLACED: PlacedKind[] = ["barracks", "archerTower", "cannonTower", "watchTower"];

export function decodeDefendSave(s: any): DefendSave {
  const d = defaultDefendSave();
  if (!s || typeof s !== "object") return d;
  for (const item of PALETTE_ITEMS) if (int(s.owned?.[item], STARTING_OWNED[item], 999)) d.owned[item] = s.owned[item];
  for (const u of UPGRADES) if (int(s.levels?.[u.id], 0, u.maxLevel)) d.levels[u.id] = s.levels[u.id];
  if (int(s.bombs, 0, 9999)) d.bombs = s.bombs;
  if (int(s.bestWave, 0, 1e6)) d.bestWave = s.bestWave;
  if (s.paletteSide === "right") d.paletteSide = "right";
  if (s.speed3 === true) d.speed3 = true;
  if (int(s.seed, 0, 2 ** 32)) d.seed = s.seed;
  const l = decodeLayout(s.layout, d.owned);
  if (l) d.layout = l;
  return d;
}

function decodeLayout(s: any, owned: Record<PaletteItem, number>): Layout | null {
  if (!s || typeof s !== "object") return null;
  const tileOk = (tx: unknown, ty: unknown) => int(tx, 0, TILES_W - 1) && int(ty, 0, TILES_H - 1) && ty !== SPAWN_ROW;
  if (!tileOk(s.keep?.tx, s.keep?.ty)) return null;
  if (!Array.isArray(s.cityTiles) || !Array.isArray(s.structures) || !int(s.nextUid, 1, 1e9)) return null;
  const keepKey = tileKey(s.keep.tx, s.keep.ty);
  const cityTiles: string[] = [];
  for (const k of s.cityTiles) {
    if (typeof k !== "string" || !/^\d+,\d+$/.test(k)) return null;
    const { tx, ty } = parseTileKey(k);
    if (!tileOk(tx, ty) || k === keepKey || cityTiles.includes(k)) return null;
    cityTiles.push(k);
  }
  const structures = [];
  const uids = new Set<number>();
  for (const p of s.structures) {
    if (!PLACED.includes(p?.kind) || !tileOk(p.tx, p.ty) || !int(p.uid, 1, s.nextUid - 1) || uids.has(p.uid)) return null;
    uids.add(p.uid);
    structures.push({ uid: p.uid, kind: p.kind as PlacedKind, tx: p.tx, ty: p.ty });
  }
  const layout: Layout = { keep: { tx: s.keep.tx, ty: s.keep.ty }, cityTiles, structures, nextUid: s.nextUid };
  if (cityTiles.length > owned.cityTile) return null;
  for (const k of PLACED) if (placedCount(layout, k) > owned[k]) return null;
  if (!tilesConnected(new Set([keepKey, ...cityTiles]), layout.keep)) return null;
  return fitLayout(layout).ok ? layout : null;
}
