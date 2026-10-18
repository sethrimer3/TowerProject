import type { CardId } from "./cards.ts";

/** All faces share a 48 × 64 frame and leave the lower band for live names.
 * Large subjects use 24 pixels; secondary subjects use 12 or 16 pixels. */
export type CardSpriteLayer = { sprite: string; x: number; y: number; size: number };
const subject = (sprite: string): CardSpriteLayer => ({ sprite, x: 12, y: 12, size: 24 });
const mark = (sprite: string): CardSpriteLayer => ({ sprite, x: 28, y: 30, size: 12 });
const trio = (...sprites: string[]): CardSpriteLayer[] => sprites.map((sprite, i) => ({ sprite, x: 6 + i * 10, y: 10 + i * 8, size: 16 }));
const trade = (from: string, to: string): CardSpriteLayer[] => [
  { sprite: from, x: 6, y: 10, size: 16 }, { sprite: to, x: 26, y: 10, size: 16 },
  { sprite: "card-exchange", x: 16, y: 28, size: 16 },
];
const doorKeys: CardSpriteLayer[] = ["yellow", "blue", "red"].map((color, i) => ({ sprite: `key-${color}`, x: 10 + i * 10, y: 34, size: 8 }));

/** Explicit compositions avoid ambiguous substring matches (for example,
 * YK to HP depicts a trade, and a Heart Door still depicts a door). */
export const CARD_SPRITE_LAYERS = {
  stairs: [subject("stairs")],
  heal: [subject("potion-red"), mark("heart")],
  door: [subject("door-steel"), ...doorKeys],
  key: trio("key-yellow", "key-blue", "key-red"),
  yellowKey: [subject("key-yellow")],
  blueKey: [subject("key-blue")],
  monster: trio("slime", "goblin", "demon"),
  atkUp: [subject("sword"), mark("badge-effective")],
  defUp: [subject("shield"), mark("badge-effective")],
  keySiphon: trade("heart", "key-yellow"),
  yellowDoor: [subject("door-steel"), mark("key-yellow")],
  heartDoor: [subject("door-wood"), mark("heart")],
  weakEnemy: [subject("slime")],
  baseEnemy: [subject("goblin")],
  strongEnemy: [subject("orc")],
  eliteEnemy: [subject("knight")],
  bossEnemy: [subject("demon")],
  nonBossEnemy: trio("slime", "goblin", "orc"),
  fastEnemy: [subject("goblin"), mark("badge-dash")],
  chest: [subject("chest-gold")],
  blueSiphon: trade("shield", "key-blue"),
  blueTrader: trade("key-yellow", "key-blue"),
  keyToHp: trade("key-yellow", "heart"),
  redKey: [subject("key-red")],
  redSiphon: trade("sword", "key-red"),
  torch: [subject("torch")],
  woodenDoor: [subject("door-wood")],
  flyingEnemy: [subject("bat")],
  archer: [subject("archer")],
} satisfies Record<CardId, CardSpriteLayer[]>;
