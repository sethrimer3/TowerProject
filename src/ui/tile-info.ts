import type { Kind, Player, Tile } from "../entities.ts";
import type { Game, RouteEffects } from "../state.ts";
import { ATTACK_SHARD, DEFENSE_SHARD, resolveStep } from "../step-effects.ts";
import { predict } from "../combat.ts";
import { doorColor, doorCost, doorDescription, doorName, doorRule, KEY_NAMES } from "../doors.ts";

/** What the inspect panel says about one board tile. */
export type TileInfo = { color: string; title: string; body: string };
type Board = Pick<Game, "world" | "run" | "mode">;
type Describe = (t: Tile, p: Player, g: Board) => Omit<TileInfo, "color">;

const KIND_COLORS: Partial<Record<Kind, string>> = {
  wall: "#8d97a8",
  floor: "#8d97a8",
  enemy: "#df797e",
  key: "#eac16b",
  potion: "#e08fd0",
  attack: "#e2a15c",
  defense: "#6dbdf1",
  reward: "#f0cf7a",
  treasure: "#f0cf7a",
  stairs: "#c7cedb",
  stairsDown: "#c7cedb",
  oneway: "#c7cedb",
};

const stairs: Describe = (t, _p, g) => {
  if (g.run.outside)
    return { title: "Stairs", body: g.mode === "tower" ? "Begin the climb — Floor 1" : "Descend into the cave" };
  const target = t.kind === "stairs" ? g.run.height + 2 : g.run.height;
  return { title: t.kind === "stairs" ? "Stairs Up" : "Stairs Down", body: `Leads to Floor ${target}` };
};

const DESCRIBE: Partial<Record<Kind, Describe>> = {
  enemy: (t, p) => {
    const e = t.enemy!, r = predict(p, e);
    return {
      title: e.name,
      body: `<span>HP ${e.hp} · ATK ${e.attack} · DEF ${e.defense}</span><br><strong class="${r.survivable ? "safe" : "danger"}">${r.damage} damage · ${r.survivable ? "Survivable" : "LETHAL"}</strong>`,
    };
  },
  wall: () => ({ title: "Wall", body: "Ancient stone. Find a passage around it." }),
  door: (t, p) => {
    const cost = doorCost(t, p);
    const keyLine =
      doorRule(t).type === "fullHp"
        ? ""
        : `<br>${cost
            ? cost.map((color) => `${KEY_NAMES[color]} key: ${p.keys[color]} → ${p.keys[color] - 1}`).join(", ")
            : "Locked — insufficient keys"}`;
    return { title: doorName(t), body: `<span>${doorDescription(t)}</span>${keyLine}` };
  },
  key: (t, p) => {
    const color = t.color!, name = KEY_NAMES[color];
    return { title: `${name} Key`, body: `<span>Unlocks ${name} doors</span><br>Keys: ${p.keys[color]} → ${p.keys[color] + 1}` };
  },
  potion: (t, p) => {
    const after = resolveStep(p, t);
    return { title: "Potion", body: `<span>Restores HP</span><br>(${p.hp} → ${after.blocked ? p.hp : after.player.hp})` };
  },
  stairs,
  stairsDown: stairs,
  floor: (_t, _p, g) => ({ title: "Floor", body: g.mode === "tower" ? "Well-worn stone floor." : "Ancient cavern floor." }),
  attack: () => ({ title: "Attack Shard", body: `Raises ATK by ${ATTACK_SHARD} for this run.` }),
  defense: () => ({ title: "Defense Shard", body: `Raises DEF by ${DEFENSE_SHARD} for this run.` }),
  treasure: () => ({ title: "Treasure", body: "Contains gold and crafting materials." }),
  reward: () => ({ title: "Reward Chest", body: "Clear reward — claim it here." }),
};

/** Title, colour and HTML body for the tile at (x, y), as seen by the player. */
export function tileInfo(g: Board, x: number, y: number): TileInfo {
  const t = g.world.tile(x, y);
  const describe = DESCRIBE[t.kind];
  if (t.kind === "door") return { color: doorColor(t), ...describe!(t, g.run.player, g) };
  if (describe) return { color: KIND_COLORS[t.kind]!, ...describe(t, g.run.player, g) };
  return {
    color: KIND_COLORS[t.kind] ?? "#c7cedb",
    title: t.kind[0].toUpperCase() + t.kind.slice(1),
    body: "One-way passage.",
  };
}

/** The tile info as one line of plain text, for the status row. */
export const tileInfoLine = (d: TileInfo) =>
  `${d.title} — ${d.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`;

/** One line per stat or key a previewed route would change. */
export function routeTotalLines(effects: RouteEffects): string[] {
  const lines: string[] = [];
  if (effects.hp[0] !== effects.hp[1]) lines.push(`HP (${effects.hp[0]} → ${effects.hp[1]})`);
  if (effects.attack[0] !== effects.attack[1]) lines.push(`Atk (+${effects.attack[0]} → +${effects.attack[1]})`);
  if (effects.defense[0] !== effects.defense[1]) lines.push(`Def (+${effects.defense[0]} → +${effects.defense[1]})`);
  for (const color of ["yellow", "blue", "red"] as const) {
    const change = effects.keys[color];
    if (change) lines.push(`${KEY_NAMES[color]} Key (${change[0]} → ${change[1]})`);
  }
  return lines;
}
