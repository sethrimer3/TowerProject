import type { UpgradeId, Currency } from "./config.ts";
export type TreeId = "inspiration" | "courage" | "legacy" | "wisdom" | "renown";
export type SkillNode = { id: UpgradeId; icon: string; x: number; y: number; requires: UpgradeId[] };
export const TREES: { id: TreeId; name: string; currency: Currency; gate?: UpgradeId; description: string; nodes: SkillNode[] }[] = [
  { id: "inspiration", name: "Inspiration", currency: "shards", description: "Earn Inspiration by beating your best Tower climb.", nodes: [
    { id: "shardHp", icon: "♥", x: 50, y: 12, requires: [] },
    { id: "shardAttack", icon: "⚔", x: 23, y: 36, requires: ["shardHp"] },
    { id: "shardDefense", icon: "⛨", x: 77, y: 36, requires: ["shardHp"] },
    { id: "shardUndos", icon: "↺", x: 23, y: 65, requires: ["shardAttack"] },
    { id: "delve", icon: "▼", x: 50, y: 87, requires: ["shardAttack", "shardDefense"] },
  ] },
  { id: "courage", name: "Courage", currency: "essence", gate: "delve", description: "Earn Courage by beating your best Delve depth.", nodes: [
    { id: "auto", icon: "✦", x: 50, y: 10, requires: ["delve"] },
    { id: "autoPersist", icon: "⚙", x: 82, y: 10, requires: ["auto"] },
    { id: "hp", icon: "♥", x: 18, y: 34, requires: ["auto"] },
    { id: "attack", icon: "⚔", x: 50, y: 34, requires: ["auto"] },
    { id: "defense", icon: "⛨", x: 82, y: 34, requires: ["auto"] },
    { id: "undos", icon: "↺", x: 23, y: 61, requires: ["hp"] },
    { id: "revive", icon: "☼", x: 77, y: 61, requires: ["defense"] },
    { id: "legacy", icon: "♜", x: 50, y: 87, requires: ["attack", "undos", "revive"] },
  ] },
  { id: "legacy", name: "Legacy", currency: "essence", gate: "legacy", description: "Spend Courage on heirlooms carried into every new run.", nodes: [
    { id: "quality", icon: "♜", x: 50, y: 15, requires: ["legacy"] },
    { id: "yellow", icon: "⚿", x: 23, y: 40, requires: ["quality"] },
    { id: "blue", icon: "⚿", x: 77, y: 65, requires: ["yellow"] },
    { id: "red", icon: "⚿", x: 50, y: 87, requires: ["blue"] },
  ] },
  { id: "wisdom", name: "Wisdom", currency: "shards", gate: "legacy", description: "A path awaiting its final purpose.", nodes: [
    { id: "wisdomFocus", icon: "◈", x: 50, y: 20, requires: ["legacy"] },
    { id: "wisdomMemory", icon: "◇", x: 28, y: 52, requires: ["wisdomFocus"] },
    { id: "wisdomSight", icon: "✧", x: 72, y: 78, requires: ["wisdomMemory"] },
  ] },
  { id: "renown", name: "Renown", currency: "essence", gate: "legacy", description: "A path awaiting its final purpose.", nodes: [
    { id: "renownBanner", icon: "⚑", x: 50, y: 18, requires: ["legacy"] },
    { id: "renownOath", icon: "◆", x: 72, y: 50, requires: ["renownBanner"] },
    { id: "renownCrown", icon: "♛", x: 38, y: 80, requires: ["renownOath"] },
  ] },
];
export function skillAvailable(id: UpgradeId, levels: Record<UpgradeId, number>) {
  const tree = TREES.find(t => t.nodes.some(n => n.id === id));
  const node = tree?.nodes.find(n => n.id === id);
  return !!node && (!tree?.gate || levels[tree.gate] > 0) && node.requires.every(key => levels[key] > 0);
}
