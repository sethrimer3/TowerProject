import { controlIcon } from "./control-icon.ts";
import type { Game } from "../state.ts";
import type { EnemyStrength } from "../entities.ts";
import type { StrengthOdds, Trait, TraitOdds } from "../enemies/odds.ts";
import { enemyStat } from "../whole.ts";
import { shortStat } from "./hud.ts";
import { goldIcon, itemSprite, uiSprite } from "./dom.ts";
import { RANK_CHEVRONS } from "../render/rank-chevrons.ts";
import { COMBAT_MARKS, shieldSprite } from "../sprites/combat.ts";
import { pngIcon } from "../sprites/kit.ts";

const STRENGTH_NAMES: Record<EnemyStrength, string> = { weak: "Weak", normal: "Base", strong: "Strong", elite: "Elite", boss: "Boss", greaterBoss: "Greater Boss" };
const TRAIT_NAMES: Record<Trait, string> = { fast: "Fast", ranged: "Ranged", shielded: "Shielded", flying: "Flying", aggroed: "Aggroed" };

/** Each attribute's mark as the board draws it on the enemy; Aggroed wears none. */
const TRAIT_MARKS: Partial<Record<Trait, string>> = { fast: COMBAT_MARKS.fast, ranged: COMBAT_MARKS.ranged, flying: COMBAT_MARKS.flying, shielded: shieldSprite(48) };
/** A row's name after its marks, in a slot as wide in every row so the names line up. */
const named = (marks: string, name: string, kind: string) => `<span class="odds-name"><span class="odds-marks ${kind}">${marks}</span>${name}</span>`;
/** A strength's name after its rank chevrons, stacked as the board's enemies wear them. */
function strengthName(strength: EnemyStrength) {
  const { count, down } = RANK_CHEVRONS[strength];
  return named(pngIcon(down ? COMBAT_MARKS.rankDown : COMBAT_MARKS.rankUp, "odds-mark").repeat(count), STRENGTH_NAMES[strength], "odds-ranks");
}
const traitName = (trait: Trait) => named(TRAIT_MARKS[trait] ? pngIcon(TRAIT_MARKS[trait], `odds-mark odds-${trait}`) : "", TRAIT_NAMES[trait], "odds-traits");

/** A stat's column head: its icon, as the enemy's panel shows it, named for screen readers. */
const statHead = (icon: string, label: string) => `<th scope="col" title="${label}" aria-label="${label}">${icon}</th>`;
const statHeads = () => statHead(uiSprite("health", "stat-sprite"), "HP")
  + statHead(itemSprite("upgrade_attack", "stat-sprite"), "ATK")
  + statHead(itemSprite("upgrade_defense", "stat-sprite"), "DEF")
  + statHead(goldIcon(), "Gold");

/** A chance as the box shows it: to two decimals at most, with its %. */
const chance = (percent: number) => `${Number(percent.toFixed(2))}%`;
/** A speed, or a dash where the trait has none. */
const speed = (n: number | undefined) => (n === undefined ? "—" : enemyStat(n));

const strengthRow = (r: StrengthOdds) =>
  `<tr><th scope="row">${strengthName(r.strength)}</th><td>${chance(r.chance)}</td><td>${shortStat(r.hp)}</td><td>${shortStat(r.attack)}</td><td>${shortStat(r.defense)}</td><td>${shortStat(r.gold)}</td></tr>`;
const traitRow = (r: TraitOdds) =>
  `<tr><th scope="row">${traitName(r.trait)}</th><td>${chance(r.chance)}</td><td>${speed(r.attackSpeed)}</td><td>${speed(r.moveSpeed)}</td></tr>`;
/** An environment's row: its name, its chance, and a mark when the floor has it. */
const environmentRow = (e: Game["floorEnvironments"][number]) =>
  `<tr class="odds-env-${e.id}${e.here ? " here" : ""}"><th scope="row">${e.name}</th><td>${chance(e.chance)}</td><td>${e.here ? `<span class="odds-here" aria-label="This floor">●</span>` : ""}</td></tr>`;

/** What the box shows for the floor now, and the key it is redrawn by: a
 * new floor, or a Greater Boss appearing on it. Below the enemies, the
 * floor environments the run can roll, once any can. */
function content(game: Game) {
  const odds = game.enemyOdds;
  if (!odds) return null;
  const environments = game.floorEnvironments;
  const key = `${game.mode}|${game.tier}|${odds.floor}|${odds.strengths.length}|${environments.map((e) => `${e.id}${e.here ? "+" : ""}`).join(",")}`;
  const strengths = `<table class="enemy-odds-table"><thead><tr><th scope="col">Strength</th><th scope="col">Chance</th>${statHeads()}</tr></thead><tbody>${odds.strengths.map(strengthRow).join("")}</tbody></table>`;
  const traits = odds.traits.length
    ? `<table class="enemy-odds-table"><thead><tr><th scope="col">Attribute</th><th scope="col">Chance</th><th scope="col">Attack Speed</th><th scope="col">Move Speed</th></tr></thead><tbody>${odds.traits.map(traitRow).join("")}</tbody></table>`
    : "";
  const places = environments.length
    ? `<table class="enemy-odds-table environment-odds"><thead><tr><th scope="col">Environment</th><th scope="col">Chance</th><th scope="col">This Floor</th></tr></thead><tbody>${environments.map(environmentRow).join("")}</tbody></table>`
    : "";
  return { key, html: `<button type="button" class="enemy-odds-x" aria-label="Close">${controlIcon("close")}</button><h2>Enemies on this floor</h2>${strengths}${traits}${places}` };
}

/** The box over the middle of the screen listing the enemies the floor the
 * hero stands on can roll. It is no dialog: the game plays on behind it. A
 * press on its X or anywhere outside it puts it away; a second call does too. */
export function toggleEnemyOddsBox(game: Game) {
  const open = document.querySelector(".enemy-odds-layer");
  if (open) return open.remove();
  const c = content(game);
  if (!c) return;
  const layer = document.createElement("div");
  layer.className = "enemy-odds-layer";
  layer.innerHTML = `<div class="enemy-odds-box" role="dialog" aria-label="Enemies on this floor" data-key="${c.key}">${c.html}</div>`;
  layer.onclick = (e) => {
    const target = e.target as Element;
    if (target === layer || target.closest(".enemy-odds-x")) layer.remove();
  };
  (document.querySelector("#app") ?? document.body).append(layer);
}

/** Redraws the open box once the hero stands on a new floor (or a Greater
 * Boss appears), and puts it away once the run is over. */
export function refreshEnemyOddsBox(game: Game) {
  const box = document.querySelector<HTMLElement>(".enemy-odds-box");
  if (!box) return;
  const c = content(game);
  if (!c) return box.parentElement!.remove();
  if (box.dataset.key === c.key) return;
  box.dataset.key = c.key;
  box.innerHTML = c.html;
}
