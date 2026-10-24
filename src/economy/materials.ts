// The metal bars the Defend page spends, which nothing finds any more:
// treasure chests stopped holding them. (Equipment's upgrade materials are
// its own, in equipment/catalog.ts.)

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
