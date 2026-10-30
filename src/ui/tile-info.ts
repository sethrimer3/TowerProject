import { enemyStat, keyCount, whole, wholeChange, wholeHp } from "../whole.ts";
import type { Enemy, Kind, Player, Tile } from "../entities.ts";
import { enemyTitle } from "../enemies/scaling.ts";
import type { Game, RouteEffects } from "../state.ts";
import { POTION_HEAL, potionRestores, resolveStep, shardStat } from "../step-effects.ts";
import { attackForFewerHits, defenseAgainst, instakill, lifestealHeal, netDamage, parryCut, predict, struckDamage, type CombatPrediction } from "../combat.ts";
import { forecast as critForecast, type CritForecast } from "../crit-forecast.ts";
import { arrowDamage, shotDamage } from "../enemies/ranged.ts";
import { goalUnlocked } from "../goals.ts";
import { chestReward, clearedInspiration } from "../tower/area-ledger.ts";
import { doorColor, doorDescription, doorName, doorRule, drainsHp, KEY_NAMES } from "../doors.ts";
import { MODES } from "../modes.ts";
import { litTorches } from "../board.ts";
import { point } from "../entities.ts";
import { itemSpriteId } from "../sprites/items.ts";
import { snap } from "../exact.ts";
import { goldIcon, itemSprite, uiSprite } from "./dom.ts";

/** What the inspect panel says about one board tile. */
export type TileInfo = { color: string; title: string; body: string };
type Board = Pick<Game, "world" | "run" | "mode" | "stepRules" | "save" | "enemyGold"> & { fights?: Pick<Game["fights"], "brokenAt"> };
type Describe = (t: Tile, p: Player, g: Board, at: { x: number; y: number }) => Omit<TileInfo, "color">;

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
  oneway: "#c7cedb",
};

const stairs: Describe = (_t, _p, g) => {
  if (g.run.outside)
    return { title: "Stairs", body: MODES[g.mode].words.entrance };
  return { title: "Stairs Up", body: `Leads to Floor ${g.run.height + 2}` };
};

/** A fight's net cost as words: "N damage", or "N Healing" when Lifesteal
 * heals the hero more than the fight hurts it. */
const cost = (net: number | string) => (typeof net === "number" && net < 0 ? `${-net} Healing` : `${net} damage`);

/** Damage Prediction's line, once unlocked: what the fight costs and
 * whether the hero survives it; a fight one strike wins (the hero strikes
 * first) is an Instakill, and one that costs no HP (as shown) Harmless. */
function prediction(r: CombatPrediction, p: Player, g: Board, c: CritForecast | null) {
  if (!goalUnlocked(g.save, "damagePrediction")) return "";
  if (c) return critPrediction(c);
  const damage = Number.isFinite(r.damage) ? wholeChange(netDamage(p, r)) : "∞";
  const verdict = instakill(r) ? "Instakill" : !r.survivable ? "LETHAL" : damage === 0 ? "Harmless" : "Survivable";
  return `<br><strong class="${r.survivable ? "safe" : "danger"}">${cost(damage)} · ${verdict}</strong>`;
}

/** The range a fight's net cost lands in nine fights of ten, from `low` to
 * `high` (below 0 healing). */
function costRange(low: number, high: number) {
  if (high <= 0) return `${-high}–${-low} Healing`;
  if (low >= 0) return `${low}–${high} damage`;
  return `${-low} Healing to ${high} damage`;
}

/** The prediction line for a hero with critical strikes: the damage to
 * expect (~), then a verdict that is certain where the odds are: Survivable
 * when even the guaranteed crits alone survive it, LETHAL when even every
 * crit landing doesn't, and otherwise the chance to live; with the range
 * the damage lands in nine fights of ten. */
function critPrediction(c: CritForecast) {
  const percent = (n: number) => `${Math.min(99, Math.max(1, Math.round(n * 100)))}%`;
  const expected = wholeChange(c.expected), range = costRange(wholeChange(c.p10), wholeChange(c.p90));
  let verdict: string;
  if (instakill(c.worst)) verdict = "Instakill";
  else if (!c.worst.survivable && !c.best.survivable) verdict = "LETHAL";
  else if (!c.worst.survivable) verdict = `Risky · ${percent(c.survive)} to survive`;
  else verdict = expected === 0 && c.p90 === 0 ? "Harmless" : "Survivable";
  const chance = !instakill(c.worst) && c.instakill > 0 ? ` · ${percent(c.instakill)} Instakill` : "";
  const spread = c.p10 === c.p90 ? "" : `<br><small>Usually ${range}</small>`;
  return `<br><strong class="${c.worst.survivable ? "safe" : c.best.survivable ? "risky" : "danger"}">~${cost(expected)} · ${verdict}${chance}</strong>${spread}`;
}

/** What a pickup gives, as its item's icon and "+N" (`label` after it):
 * the amount a step onto it adds now, with every bonus counted, rather than
 * the stat before and after, which Regen and the rest soon outdate. */
const gain = (t: Tile, amount: string, label = "") =>
  `<span class="tile-gain">${itemSprite(itemSpriteId(t)!, "stat-sprite")} +${amount}${label}</span>`;

const hits = (n: number) => (n === 1 ? "Instakill" : `${n.toLocaleString("en-US")} hits to defeat`);

/** The Goals' lines under a fight's prediction, once unlocked: Combat
 * Forecast's hits to defeat the enemy (an Instakill only when Damage
 * Prediction hasn't said so already), and Attack Lore's ATK more that
 * takes one hit fewer. */
function forecast(p: Player, e: Enemy, turns: number, g: Board, crits = false) {
  if (!turns || g.run.outside) return "";
  let lines = "";
  const said = turns === 1 && goalUnlocked(g.save, "damagePrediction");
  if (goalUnlocked(g.save, "combatForecast") && !said) lines += `<br><span class="forecast">${hits(turns)}${crits ? " without crits" : ""}</span>`;
  const more = goalUnlocked(g.save, "attackLore") ? attackForFewerHits(p, e) : null;
  if (more) lines += `<br><span class="forecast lore">+${more.toLocaleString("en-US")} ATK: ${turns === 2 ? "Instakill" : `${(turns - 1).toLocaleString("en-US")} hits`}</span>`;
  return lines;
}

/** The ATK or DEF a step onto shard `t` adds, research and boons counted. */
function shardGain(t: Tile, p: Player, g: Board, stat: "attack" | "defense") {
  const after = resolveStep(p, t, g.stepRules);
  return enemyStat(after.blocked ? shardStat(t, g.stepRules) : snap(after.player[stat] - p[stat]));
}

/** A stat's icon and value, kept on one line; the icon's alt names the
 * stat, so the status row's plain text still does. */
const stat = (icon: string, label: string, value: string, extra = "") =>
  `<span class="enemy-stat">${icon.replace('alt=""', `alt="${label}"`)} ${value}${extra}</span>`;

/** What Armor Break has taken off `e`'s DEF so far (`broken`: a fight being
 * played out counted), to go after its DEF. */
const brokenStat = (e: Enemy, broken = e.broken ?? 0) => (broken ? ` (<span class="hit-heal">-${enemyStat(snap((e.defense * broken) / 100))}</span>)` : "");
/** Says what DEF below 0 does, once Armor Break has taken it there. */
function brokenLine(e: Enemy, p: Player, broken = e.broken ?? 0) {
  const defense = defenseAgainst(p, e, broken);
  return defense < 0 ? `<br><small>Armor broken: DEF ${enemyStat(defense)}, your hits deal ${enemyStat(-defense)} extra damage</small>` : "";
}

/** The enemy's stat line: its HP, its ATK with what each of its strikes
 * does to the hero (after DEF and a parry; with Lifesteal, what each of the
 * hero's strikes heals beside it), its DEF with what each of the hero's
 * strikes takes off it, and the Gold killing it would bank. */
function enemyStats(e: Enemy, p: Player, r: CombatPrediction, gold: number, broken?: number) {
  const taken = struckDamage(e.attack, p.defense, parryCut(p)), healed = p.lifesteal ? lifestealHeal(p, r.hit) : 0;
  const hurt = `<span class="hit-hurt">-${enemyStat(taken)}</span>`;
  const heal = healed ? ` <span class="hit-heal">+${enemyStat(healed)}</span>` : "";
  const coins = gold ? ` · ${stat(goldIcon(), "Gold", `<span class="hit-gold">${enemyStat(gold)}</span>`)}` : "";
  return `<span>${stat(uiSprite("health", "stat-sprite"), "HP", enemyStat(e.hp))}`
    + ` · ${stat(itemSprite("upgrade_attack", "stat-sprite"), "ATK", enemyStat(e.attack), ` (${hurt}${heal})`)}`
    + ` · ${stat(itemSprite("upgrade_defense", "stat-sprite"), "DEF", enemyStat(e.defense), `${brokenStat(e, broken)} (<span class="hit-hurt">-${enemyStat(r.hit)}</span>)`)}${coins}</span>`;
}

/** A Flying enemy's panel (enemies/flying.ts): its HP, its ATK with what each of
 * its shots does to the hero, its DEF with what one of the hero's arrows
 * takes off it before ATK / m and critical hits, and the Gold killing it
 * would bank; then that only arrows reach it, and whether it is Aggroed. */
function flyerInfo(e: Enemy, p: Player, gold: number) {
  const shot = shotDamage(p, e).damage, arrow = Math.max(0, arrowDamage(p, e));
  const coins = gold ? ` · ${stat(goldIcon(), "Gold", `<span class="hit-gold">${enemyStat(gold)}</span>`)}` : "";
  const line = `<span>${stat(uiSprite("health", "stat-sprite"), "HP", enemyStat(e.hp))}`
    + ` · ${stat(itemSprite("upgrade_attack", "stat-sprite"), "ATK", enemyStat(e.attack), ` (<span class="hit-hurt">-${enemyStat(shot)}</span>)`)}`
    + ` · ${stat(itemSprite("upgrade_defense", "stat-sprite"), "DEF", enemyStat(e.defense), `${brokenStat(e)} (<span class="hit-hurt">-${enemyStat(arrow)}</span>)`)}${coins}</span>`;
  const aggro = e.aggro ? "<br><small>Aggroed: it closes in on you as fast as it shoots</small>" : "";
  return `${line}${brokenLine(e, p)}<br><small>Flying: it shoots you from the air; only your arrows reach it, and you walk under it freely</small>${aggro}`;
}

/** What a Shielded enemy's bubble does to an enemy standing in it (enemies/shielded.ts). */
const guardLine = (e: Enemy) => (e.guard ? `<br><small>Shielded: your strikes do ${e.guard}% less</small>` : "");

const DESCRIBE: Partial<Record<Kind, Describe>> = {
  enemy: (t, p, g, at) => {
    // Critical strikes count in the prediction only with Critical Prediction.
    const crit = g.save.upgrades.critPrediction ? g.stepRules.crit : undefined;
    const e = t.enemy!, r = predict(p, e), c = crit && !r.impervious ? critForecast(p, e, crit) : null;
    const gold = g.run.outside ? 0 : g.enemyGold(at.x, at.y, !r.impervious && instakill(r)), broken = g.fights?.brokenAt(at.x, at.y);
    return {
      title: enemyTitle(e),
      body: enemyStats(e, p, r, gold, broken) + brokenLine(e, p, broken) + guardLine(e) + prediction(r, p, g, c) + forecast(p, e, r.impervious ? 0 : r.turns, g, !!crit),
    };
  },
  wall: () => ({ title: "Wall", body: "Impassable obstacle." }),
  door: (t, p, g) => {
    // The step's own rules decide what opening it takes, so Key Efficiency
    // and Heart Door Resilience show as they will be paid.
    const rule = doorRule(t), after = resolveStep(p, t, g.stepRules);
    const opened = after.blocked ? null : after;
    const hp = opened ? opened.player.hp : p.hp, hpChange = `HP ${wholeHp(p.hp)} → ${wholeHp(hp)}`;
    const keys = (spent: readonly (keyof Player["keys"])[]) =>
      spent.map((color) => `${KEY_NAMES[color]} key: ${keyCount(p.keys[color])} → ${keyCount(opened!.player.keys[color])}`).join(", ");
    let keyLine: string;
    if (rule.type === "fullHp") keyLine = `<br>${hpChange}`;
    else if (rule.type === "wood" && opened && !opened.keysSpent.length) keyLine = `<br>Break: ${hpChange}`;
    else if (rule.type === "wood" && !opened) keyLine = `<br>No key, and too weak to break it down`;
    else keyLine = `<br>${opened ? keys(opened.keysSpent) : "Locked — insufficient keys"}${opened && drainsHp(rule) ? `<br>${hpChange}` : ""}`;
    const durability = rule.type === "wood" ? `<br><small>Durability ${wholeChange(rule.durability)}</small>` : "";
    return { title: doorName(t), body: `<span>${doorDescription(t)}</span>${keyLine}${durability}` };
  },
  key: (t, p, g) => {
    const color = t.color!, name = KEY_NAMES[color], after = resolveStep(p, t, g.stepRules);
    const added = after.blocked ? 0 : after.player.keys[color] - p.keys[color];
    return { title: `${name} Key`, body: `<span>Unlocks ${name} doors</span><br>${gain(t, keyCount(snap(added)))}` };
  },
  potion: (t, p, g) => {
    // What it restores in full: the heal of a hero at 0 HP, up to max HP.
    const after = resolveStep({ ...p, hp: 0 }, t, g.stepRules), percent = t.color === "red";
    const total = wholeChange(potionRestores(t, p.maxHp, g.stepRules)), share = g.stepRules.percentPotion / 100;
    // A percent potion names its share of max HP beside its own HP.
    const restores = percent && share
      ? `Restores ${wholeChange(t.amount ?? POTION_HEAL).toLocaleString("en-US")} HP + ${share}% of max HP (${total.toLocaleString("en-US")} HP)`
      : `Restores ${total.toLocaleString("en-US")} HP`;
    // A run with percent potions says how many of its potions are.
    const chance = g.run.percentPotions ? `<br><small>${g.run.percentPotions / 100}% of this ${MODES[g.mode].words.run}'s potions are percent potions</small>` : "";
    return { title: percent ? "Percent Potion" : "Potion", body: `<span>${restores}</span><br>${gain(t, String(wholeChange(after.blocked ? 0 : after.healed)), " HP")}${chance}` };
  },
  stairs,
  floor: (_t, _p, g) => ({ title: "Floor", body: MODES[g.mode].words.floor }),
  attack: (t, p, g) => ({ title: "Attack Shard", body: `<span>Raises ATK for this ${MODES[g.mode].words.run}</span><br>${gain(t, shardGain(t, p, g, "attack"), " ATK")}` }),
  defense: (t, p, g) => ({ title: "Defense Shard", body: `<span>Raises DEF for this ${MODES[g.mode].words.run}</span><br>${gain(t, shardGain(t, p, g, "defense"), " DEF")}` }),
  treasure: (t) => t.chest === "supply" ? { title: "Supply Chest", body: "Contains Gold and upgrade materials." }
    : t.chest === "equipment" ? { title: "Equipment Chest", body: "Contains Gold and a piece of equipment." }
    : { title: "Treasure", body: "Contains Gold." },
  reward: (t, _p, g) => chestReward(t.tier) === "mastered"
    ? { title: "Mastery Chest", body: "The area below was climbed without taking damage: the next checkpoint can be warped to." }
    : { title: "Clearing Chest", body: `Every enemy in the area below was defeated: +${clearedInspiration(g.run.height)} Inspiration, already yours.` },
};

/** Title, colour and HTML body for the tile at (x, y), as seen by the player. */
export function tileInfo(g: Board, x: number, y: number): TileInfo {
  const t = g.world.tile(x, y);
  const describe = DESCRIBE[t.kind];
  if (t.flyer) return { color: KIND_COLORS.enemy!, title: enemyTitle(t.flyer), body: flyerInfo(t.flyer, g.run.player, g.run.outside ? 0 : g.enemyGold(x, y)) };
  if (t.kind === "door") return { color: doorColor(t), ...describe!(t, g.run.player, g, { x, y }) };
  // A floor tile holding a lit torch is the torch.
  if (t.kind === "floor" && litTorches(g.world).has(point(x, y)))
    return { color: "#f2b25c", title: "Torch", body: "A burning torch. Stepping here puts it out." };
  if (describe) return { color: KIND_COLORS[t.kind]!, ...describe(t, g.run.player, g, { x, y }) };
  return {
    color: KIND_COLORS[t.kind] ?? "#c7cedb",
    title: t.kind[0].toUpperCase() + t.kind.slice(1),
    body: "One-way passage.",
  };
}

/** The tile info as one line of plain text, for the status row. */
export const tileInfoLine = (d: TileInfo) =>
  `${d.title} — ${d.body.replace(/<img[^>]*alt="([^"]+)"[^>]*>/g, " $1 ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`;

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
