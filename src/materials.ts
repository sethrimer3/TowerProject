// The metal bars treasure chests hold, which the Defend page spends.
// (Equipment's upgrade materials are its own, in equipment/catalog.ts.)

export type MetalId =
  | "iron"
  | "steel"
  | "silversteel"
  | "embersteel"
  | "starsteel"
  | "voidsteel";

export type MaterialId =
  | "ironBar"
  | "steelBar"
  | "silversteelBar"
  | "embersteelBar"
  | "starsteelBar"
  | "voidsteelBar";

export type MaterialCategory = "metal";

export type MaterialDef = {
  id: MaterialId;
  name: string;
  category: MaterialCategory;
  description: string;
  icon: string;
};

export type MaterialStack = { id: MaterialId; quantity: number };

export const METALS: { id: MetalId; name: string; materialId: MaterialId; unlockFloor: number; power: number }[] = [
  { id: "iron", name: "Iron", materialId: "ironBar", unlockFloor: 0, power: 1.0 },
  { id: "steel", name: "Steel", materialId: "steelBar", unlockFloor: 15, power: 1.6 },
  { id: "silversteel", name: "Silversteel", materialId: "silversteelBar", unlockFloor: 30, power: 2.4 },
  { id: "embersteel", name: "Embersteel", materialId: "embersteelBar", unlockFloor: 50, power: 3.5 },
  { id: "starsteel", name: "Starsteel", materialId: "starsteelBar", unlockFloor: 75, power: 5.0 },
  { id: "voidsteel", name: "Voidsteel", materialId: "voidsteelBar", unlockFloor: 100, power: 7.0 },
];

/** Weighting brackets applied once the base 28% chest metal roll succeeds. */
const METAL_WEIGHT_BRACKETS: { min: number; max: number; weights: Partial<Record<MetalId, number>> }[] = [
  { min: 0, max: 14, weights: { iron: 1.0 } },
  { min: 15, max: 29, weights: { iron: 0.7, steel: 0.3 } },
  { min: 30, max: 49, weights: { iron: 0.35, steel: 0.45, silversteel: 0.2 } },
  { min: 50, max: 74, weights: { iron: 0.15, steel: 0.25, silversteel: 0.4, embersteel: 0.2 } },
  { min: 75, max: 99, weights: { steel: 0.1, silversteel: 0.2, embersteel: 0.4, starsteel: 0.3 } },
  { min: 100, max: Infinity, weights: { silversteel: 0.1, embersteel: 0.2, starsteel: 0.4, voidsteel: 0.3 } },
];

export function metalWeightsForFloor(E: number): Partial<Record<MetalId, number>> {
  return (METAL_WEIGHT_BRACKETS.find((b) => E >= b.min && E <= b.max) ?? METAL_WEIGHT_BRACKETS[0]).weights;
}

/** Stack size 2-5, +1 to both bounds every 40 equivalent floors. */
export function metalStackRange(E: number): { min: number; max: number } {
  const bonus = Math.floor(E / 40);
  return { min: 2 + bonus, max: 5 + bonus };
}

export function metalUnlocked(id: MetalId, E: number): boolean {
  return E >= METALS.find((m) => m.id === id)!.unlockFloor;
}

export const MATERIALS: MaterialDef[] = [
  { id: "ironBar", name: "Iron Bar", category: "metal", description: "The common backbone of every defense.", icon: "▮" },
  { id: "steelBar", name: "Steel Bar", category: "metal", description: "Refined and dependable.", icon: "▮" },
  { id: "silversteelBar", name: "Silversteel Bar", category: "metal", description: "Streaked with pale silver veins.", icon: "▮" },
  { id: "embersteelBar", name: "Embersteel Bar", category: "metal", description: "Warm to the touch, faintly glowing.", icon: "▮" },
  { id: "starsteelBar", name: "Starsteel Bar", category: "metal", description: "Impossibly light, flecked with starlight.", icon: "▮" },
  { id: "voidsteelBar", name: "Voidsteel Bar", category: "metal", description: "Drinks in the light around it.", icon: "▮" },
];

export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

export function materialDef(id: MaterialId): MaterialDef {
  return MATERIALS.find((m) => m.id === id)!;
}

export function emptyMaterials(): Record<MaterialId, number> {
  return Object.fromEntries(MATERIAL_IDS.map((id) => [id, 0])) as Record<MaterialId, number>;
}
