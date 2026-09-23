import type { Tile, Player } from "./entities.ts";
import { predict } from "./combat.ts";
import { point } from "./entities.ts";
import { doorCost } from "./doors.ts";

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Conservative state-space search proving at least one legal route exists
 * from entrance to exit. State tracks position, remaining keys, HP, current
 * ATK/DEF, and which pickup/enemy tiles have already been consumed — so a
 * key, stat pickup, or defeated enemy can never be collected/re-fought twice
 * by revisiting its tile from a different key/stat combination. Rooms are
 * only 20x20 so this stays small in practice. */
export function validatePhysicalLayout(
  cells: Map<string, Tile>,
  startX: number,
  startY: number,
  exitX: number,
  exitY: number,
  startPlayer: Player,
): boolean {
  type State = {
    x: number;
    y: number;
    keys: Record<string, number>;
    hp: number;
    attack: number;
    defense: number;
    consumed: Set<string>;
  };
  const keyState = (k: Record<string, number>) =>
    Object.entries(k).map(([c, n]) => `${c}:${n}`).sort().join(",");
  const consumedState = (c: Set<string>) => [...c].sort().join(";");
  const stateId = (s: State) =>
    `${s.x},${s.y}|${keyState(s.keys)}|${s.hp}|${s.attack}|${s.defense}|${consumedState(s.consumed)}`;

  const start: State = {
    x: startX,
    y: startY,
    keys: { ...startPlayer.keys },
    hp: startPlayer.hp,
    attack: startPlayer.attack,
    defense: startPlayer.defense,
    consumed: new Set(),
  };
  const seen = new Set<string>([stateId(start)]);
  const queue = [start];

  for (let i = 0; i < queue.length && i < 200000; i++) {
    const curr = queue[i];
    if (curr.x === exitX && curr.y === exitY) return true;

    for (const [dx, dy] of DIRS) {
      const nx = curr.x + dx,
        ny = curr.y + dy,
        p = point(nx, ny),
        t = cells.get(p);
      if (!t || t.kind === "wall") continue;
      if (curr.hp <= 0) continue;

      const next: State = {
        x: nx,
        y: ny,
        keys: { ...curr.keys },
        hp: curr.hp,
        attack: curr.attack,
        defense: curr.defense,
        consumed: curr.consumed,
      };
      let canPass = true;

      if (t.kind === "door") {
        const cost = doorCost(t, { keys: next.keys as Player["keys"], hp: next.hp, maxHp: startPlayer.maxHp });
        if (cost === null) canPass = false;
        else for (const color of cost) next.keys[color]--;
      } else if (t.kind === "key" && !curr.consumed.has(p)) {
        next.consumed = new Set(curr.consumed).add(p);
        next.keys[t.color!] = (next.keys[t.color!] || 0) + 1;
      } else if (t.kind === "potion" && !curr.consumed.has(p)) {
        next.consumed = new Set(curr.consumed).add(p);
        next.hp = Math.min(curr.hp + 35, startPlayer.hp);
      } else if (t.kind === "attack" && !curr.consumed.has(p)) {
        next.consumed = new Set(curr.consumed).add(p);
        next.attack = curr.attack + 2;
      } else if (t.kind === "defense" && !curr.consumed.has(p)) {
        next.consumed = new Set(curr.consumed).add(p);
        next.defense = curr.defense + 1;
      } else if (t.kind === "treasure" && !curr.consumed.has(p)) {
        next.consumed = new Set(curr.consumed).add(p);
        next.attack = curr.attack + 2;
        next.defense = curr.defense + 1;
      } else if (t.kind === "enemy") {
        if (!curr.consumed.has(p)) {
          const pState: Player = { ...startPlayer, hp: curr.hp, attack: curr.attack, defense: curr.defense };
          const pred = predict(pState, t.enemy!);
          if (pred.impervious || !pred.survivable) {
            canPass = false;
          } else {
            next.consumed = new Set(curr.consumed).add(p);
            next.hp = curr.hp - pred.damage;
          }
        }
      }

      if (canPass) {
        const id = stateId(next);
        if (!seen.has(id)) {
          seen.add(id);
          queue.push(next);
        }
      }
    }
  }

  return false;
}
