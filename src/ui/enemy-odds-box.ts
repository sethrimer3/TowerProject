import { controlIcon } from "./control-icon.ts";
import type { Game } from "../state.ts";
import type { EnemyStrength } from "../entities.ts";
import type { StrengthOdds, Trait, TraitOdds } from "../enemies/odds.ts";
import { enemyStat } from "../whole.ts";
import { shortStat } from "./hud.ts";

const STRENGTH_NAMES: Record<EnemyStrength, string> = { weak: "Weak", normal: "Base", strong: "Strong", elite: "Elite", boss: "Boss", greaterBoss: "Greater Boss" };
const TRAIT_NAMES: Record<Trait, string> = { fast: "Fast", ranged: "Ranged", shielded: "Shielded", flying: "Flying", aggroed: "Aggroed" };

/** A chance as the box shows it: to two decimals at most, with its %. */
const chance = (percent: number) => `${Number(percent.toFixed(2))}%`;
/** A speed, or a dash where the trait has none. */
const speed = (n: number | undefined) => (n === undefined ? "—" : enemyStat(n));

const strengthRow = (r: StrengthOdds) =>
  `<tr><th scope="row">${STRENGTH_NAMES[r.strength]}</th><td>${chance(r.chance)}</td><td>${shortStat(r.hp)}</td><td>${shortStat(r.attack)}</td><td>${shortStat(r.defense)}</td><td>${shortStat(r.gold)}</td></tr>`;
const traitRow = (r: TraitOdds) =>
  `<tr><th scope="row">${TRAIT_NAMES[r.trait]}</th><td>${chance(r.chance)}</td><td>${speed(r.attackSpeed)}</td><td>${speed(r.moveSpeed)}</td></tr>`;

/** What the box shows for the floor now, and the key it is redrawn by: a
 * new floor, or a Greater Boss appearing on it. */
function content(game: Game) {
  const odds = game.enemyOdds;
  if (!odds) return null;
  const key = `${game.mode}|${game.tier}|${odds.floor}|${odds.strengths.length}`;
  const strengths = `<table class="enemy-odds-table"><thead><tr><th scope="col">Strength</th><th scope="col">Chance</th><th scope="col">HP</th><th scope="col">ATK</th><th scope="col">DEF</th><th scope="col">Gold</th></tr></thead><tbody>${odds.strengths.map(strengthRow).join("")}</tbody></table>`;
  const traits = odds.traits.length
    ? `<table class="enemy-odds-table"><thead><tr><th scope="col">Attribute</th><th scope="col">Chance</th><th scope="col">Attack Speed</th><th scope="col">Move Speed</th></tr></thead><tbody>${odds.traits.map(traitRow).join("")}</tbody></table>`
    : "";
  return { key, html: `<button type="button" class="enemy-odds-x" aria-label="Close">${controlIcon("close")}</button><h2>Enemies on this floor</h2>${strengths}${traits}` };
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
