import { CARDS, type CardId } from "./cards.ts";

/** Each card keeps its own name as live text; art is a reusable PNG face. */
export function cardSpriteSubject(id: CardId): string {
  const n = id.toLowerCase();
  if (n.includes("nonboss")) return "goblin";
  if (n.includes("boss")) return "demon";
  if (n.includes("elite")) return "knight";
  if (n.includes("strong")) return "orc";
  if (n.includes("flying")) return "bat";
  if (/enemy|monster/.test(n)) return "goblin";
  if (n.includes("archer")) return "archer";
  if (n.includes("stairs")) return "stairs";
  if (n.includes("torch")) return "torch";
  if (n.includes("chest")) return "chest-gold";
  if (n.includes("door")) return n.includes("heart") ? "heart" : n.includes("wood") ? "door-wood" : "door-steel";
  if (n.includes("blue")) return "key-blue";
  if (n.includes("red")) return "key-red";
  if (/key|siphon|trader/.test(n)) return "key-yellow";
  if (/atk|attack/.test(n)) return "sword";
  if (/def|defense/.test(n)) return "shield";
  if (/heal|hp/.test(n)) return "potion-blue";
  return "book";
}
export const CARD_SPRITE_SUBJECTS = Object.fromEntries((Object.keys(CARDS) as CardId[]).map(id => [id, cardSpriteSubject(id)]));
