import { enemyStat, whole, wholeChange, wholeHp } from "../whole.ts";
import type { Enemy, Kind, Player, Tile } from "../entities.ts";
import { enemyTitle } from "../scaling.ts";
import type { Game, RouteEffects } from "../state.ts";
import { HEART_DOOR_HP, resolveStep, shardGain } from "../step-effects.ts";
import { attackForFewerHits, predict, type CombatPrediction } from "../combat.ts";
import { goalUnlocked } from "../goals.ts";
import { chestReward, CLEARED_INSPIRATION } from "../tower/area-ledger.ts";
import { doorColor, doorCost, doorDescription, doorName, doorRule, KEY_NAMES } from "../doors.ts";
import { MODES } from "../modes.ts";

/** What the inspect panel says about one board tile. */
export type TileInfo = { color: string; title: string; body: string };
type Board = Pick<Game, "world" | "run" | "mode" | "stepRules" | "save">;
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
    return { title: "Stairs", body: MODES[g.mode].words.entrance };
  const target = t.kind === "stairs" ? g.run.height + 2 : g.run.height;
  return { title: t.kind === "stairs" ? "Stairs Up" : "Stairs Down", body: `Leads to Floor ${target}` };
};

/** Damage Prediction's line, once unlocked: what the fight costs and
 * whether the hero survives it; a fight one strike wins (the hero strikes
 * first) is an Instakill, and one that costs no HP (as shown) Harmless. */
function prediction(r: CombatPrediction, g: Board) {
  if (!goalUnlocked(g.save, "damagePrediction")) return "";
  const damage = Number.isFinite(r.damage) ? wholeChange(r.damage) : "∞";
  const verdict = r.turns === 1 ? "Instakill" : !r.survivable ? "LETHAL" : damage === 0 ? "Harmless" : "Survivable";
  return `<br><strong class="${r.survivable ? "safe" : "danger"}">${damage} damage · ${verdict}</strong>`;
}

const hits = (n: number) => (n === 1 ? "Instakill" : `${n.toLocaleString("en-US")} hits to defeat`);

/** The Goals' lines under a fight's prediction, once unlocked: Combat
 * Forecast's hits to defeat the enemy (an Instakill only when Damage
 * Prediction hasn't said so already), and Attack Lore's ATK more that
 * takes one hit fewer. */
function forecast(p: Player, e: Enemy, turns: number, g: Board) {
  if (!turns || g.run.outside) return "";
  let lines = "";
  const said = turns === 1 && goalUnlocked(g.save, "damagePrediction");
  if (goalUnlocked(g.save, "combatForecast") && !said) lines += `<br><span class="forecast">${hits(turns)}</span>`;
  const more = goalUnlocked(g.save, "attackLore") ? attackForFewerHits(p, e) : null;
  if (more) lines += `<br><span class="forecast lore">+${more.toLocaleString("en-US")} ATK: ${turns === 2 ? "Instakill" : `${(turns - 1).toLocaleString("en-US")} hits`}</span>`;
  return lines;
}

const DESCRIBE: Partial<Record<Kind, Describe>> = {
  enemy: (t, p, g) => {
    const e = t.enemy!, r = predict(p, e);
    return {
      title: enemyTitle(e),
      body: `<span>HP ${enemyStat(e.hp)} · ATK ${enemyStat(e.attack)} · DEF ${enemyStat(e.defense)}</span>` + prediction(r, g) + forecast(p, e, r.impervious ? 0 : r.turns, g),
    };
  },
  wall: () => ({ title: "Wall", body: "Ancient stone. Find a passage around it." }),
  door: (t, p) => {
    const cost = doorCost(t, p);
    const keyLine =
      doorRule(t).type === "fullHp"
        ? `<br>HP: ${wholeHp(p.hp)} → ${wholeHp(Math.min(p.hp, HEART_DOOR_HP))}`
        : `<br>${cost
            ? cost.map((color) => `${KEY_NAMES[color]} key: ${p.keys[color]} → ${p.keys[color] - 1}`).join(", ")
            : "Locked — insufficient keys"}`;
    return { title: doorName(t), body: `<span>${doorDescription(t)}</span>${keyLine}` };
  },
  key: (t, p) => {
    const color = t.color!, name = KEY_NAMES[color];
    return { title: `${name} Key`, body: `<span>Unlocks ${name} doors</span><br>Keys: ${p.keys[color]} → ${p.keys[color] + 1}` };
  },
  potion: (t, p, g) => {
    const after = resolveStep(p, t, g.stepRules), percent = t.color === "red";
    const restores = percent ? `Restores HP and ${g.stepRules.percentPotion / 100}% of max HP` : "Restores HP";
    // A run with percent potions says how many of its potions are.
    const chance = g.run.percentPotions ? `<br><small>${g.run.percentPotions / 100}% of this run's potions are percent potions</small>` : "";
    return { title: percent ? "Percent Potion" : "Potion", body: `<span>${restores}</span><br>(${wholeHp(p.hp)} → ${wholeHp(after.blocked ? p.hp : after.player.hp)})${chance}` };
  },
  stairs,
  stairsDown: stairs,
  floor: (_t, _p, g) => ({ title: "Floor", body: MODES[g.mode].words.floor }),
  attack: (t) => ({ title: "Attack Shard", body: `Raises ATK by ${enemyStat(shardGain(t))} for this run.` }),
  defense: (t) => ({ title: "Defense Shard", body: `Raises DEF by ${enemyStat(shardGain(t))} for this run.` }),
  treasure: () => ({ title: "Treasure", body: "Contains gold and crafting materials." }),
  reward: (t) => chestReward(t.tier) === "mastered"
    ? { title: "Mastery Chest", body: "The area below was climbed without taking damage: the next checkpoint can be warped to." }
    : { title: "Clearing Chest", body: `Every enemy in the area below was defeated: +${CLEARED_INSPIRATION} Inspiration, already yours.` },
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
  if (effects.hp[0] !== effects.hp[1]) lines.push(`HP (${wholeHp(effects.hp[0])} → ${wholeHp(effects.hp[1])})`);
  if (effects.attack[0] !== effects.attack[1]) lines.push(`Atk (+${whole(effects.attack[0])} → +${whole(effects.attack[1])})`);
  if (effects.defense[0] !== effects.defense[1]) lines.push(`Def (+${whole(effects.defense[0])} → +${whole(effects.defense[1])})`);
  for (const color of ["yellow", "blue", "red"] as const) {
    const change = effects.keys[color];
    if (change) lines.push(`${KEY_NAMES[color]} Key (${change[0]} → ${change[1]})`);
  }
  return lines;
}
