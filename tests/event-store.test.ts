import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { eventAt, eventStartsAt, stubEvent } from "../src/events/catalog.ts";
import { BLUE_MOON, EVENT_CYCLE, EVENT_THEME_NAMES, eventTheme, newYearEvent, originEvent } from "../src/events/themes.ts";
import { CURRENCY_ROWS, THEME_MEDALS, buyStoreItem, featuredTheme, featuredThemes, offerMedals, storePrice } from "../src/events/store.ts";
import { THEMES, THEME_IDS, themesOf, type ThemeId, type ThemeKind } from "../src/theme-collection.ts";
import { RELICS } from "../src/economy/relics.ts";
import { RELIC_SETS } from "../src/economy/relic-catalog.ts";
import { RELIC_SPECIALS, bonusText, relicAmount } from "../src/economy/relic-effects.ts";
import { TRAINING, trainedAmount, trainingDef, type TrainingId } from "../src/progression/training.ts";
import { loadout } from "../src/progression/loadout.ts";
import { bout, predict } from "../src/combat.ts";
import { EQUIP_MATERIAL_IDS } from "../src/equipment/catalog.ts";
import type { Enemy, Player } from "../src/entities.ts";

// Names, stats and amounts are tuned in relic-catalog.ts and events/store.ts;
// these tests check how they behave, not what they are.

const YEARS = Array.from({ length: 41 }, (_, i) => 2020 + i);

test("each year's cycle opens with the event holding 1 January, then runs through the themes, a 27th event being Blue Moon", () => {
  for (const year of YEARS) {
    const first = newYearEvent(year), next = newYearEvent(year + 1);
    assert.ok(eventStartsAt(first) <= Date.UTC(year, 0, 1) && Date.UTC(year, 0, 1) < eventStartsAt(first + 1), `${year}'s New Year holds 1 January`);
    assert.ok(next - first === EVENT_CYCLE.length || next - first === EVENT_CYCLE.length + 1, `${year} holds 26 or 27 events`);
    for (let id = first; id < next; id++) {
      const { theme, year: cycle } = eventTheme(id), slot = id - first;
      assert.equal(cycle, year);
      assert.equal(theme, slot < EVENT_CYCLE.length ? EVENT_CYCLE[slot]!.id : BLUE_MOON.id);
    }
  }
  assert.equal(eventTheme(originEvent()).theme, "newYear");
  assert.equal(new Date(eventStartsAt(originEvent())).toISOString().slice(0, 10), "2026-12-28", "the first public event");
  assert.ok(YEARS.some((y) => newYearEvent(y + 1) - newYearEvent(y) > EVENT_CYCLE.length), "Blue Moon comes now and then");
  // Before the first public event the cycle counts backward: never blank.
  for (const ms of [0, Date.UTC(2026, 10, 5), Date.UTC(2026, 11, 27)]) assert.ok(stubEvent(eventAt(ms)).name);
});

test("an event features one theme of each kind: its namesake's only in the event named alike, the rest in turn", () => {
  const names = new Set(Object.values(EVENT_THEME_NAMES));
  const first = newYearEvent(2027), last = newYearEvent(2031);
  const seen: Record<ThemeKind, Set<ThemeId>> = { ui: new Set(), game: new Set() };
  for (let id = first; id < last; id++) {
    const name = EVENT_THEME_NAMES[eventTheme(id).theme], f = featuredThemes(id);
    for (const kind of ["ui", "game"] as const) {
      const shown = f[kind]!;
      assert.ok(shown && THEMES[shown].kind === kind);
      seen[kind].add(shown);
      const namesake = themesOf(kind).find((t) => THEMES[t].name === name);
      if (namesake) assert.equal(shown, namesake, `${name} features its own ${kind} theme`);
      else assert.ok(!names.has(THEMES[shown].name), `${name} features no other event's theme`);
    }
  }
  for (const kind of ["ui", "game"] as const) assert.deepEqual([...seen[kind]].sort(), [...themesOf(kind)].sort(), `every ${kind} theme comes round`);
});

test("a theme added later joins the rotation from its day on, leaving the events before as they were", () => {
  const ids = THEME_IDS as string[], themes = THEMES as Record<string, (typeof THEMES)[ThemeId]>;
  const join = newYearEvent(2029) + 5, span = Array.from({ length: 120 }, (_, i) => newYearEvent(2027) + i);
  const before = span.map((id) => featuredTheme("ui", id));
  ids.push("testUi");
  themes.testUi = { kind: "ui", look: "classic", name: "Test", since: new Date(eventStartsAt(join)).toISOString().slice(0, 10) };
  try {
    const after = span.map((id) => featuredTheme("ui", id));
    assert.deepEqual(after.filter((_, i) => span[i]! < join), before.filter((_, i) => span[i]! < join), "events before keep what they featured");
    assert.ok(after.includes("testUi" as ThemeId), "the new theme comes round after");
  } finally {
    ids.pop();
    delete themes.testUi;
  }
});

test("the Store's currencies grow dearer with each bought and start over with the next event", () => {
  const save = defaults();
  save.events.id = newYearEvent(2027);
  const offers = CURRENCY_ROWS.flat();
  assert.equal(CURRENCY_ROWS[1]!.length, EQUIP_MATERIAL_IDS.length, "one box a supply");
  for (const o of offers) {
    save.medals = 10_000;
    const first = offerMedals(save, o.id), gems = save.gems, arcanite = save.arcanite, materials = { ...save.equipment.materials };
    assert.ok(buyStoreItem(save, { kind: "currency", id: o.id }));
    assert.equal(save.medals, 10_000 - first);
    if (o.reward.kind === "material") assert.equal(save.equipment.materials[o.reward.material], materials[o.reward.material] + o.amount);
    else if (o.reward.currency === "gems") assert.equal(save.gems, gems + o.amount);
    else assert.equal(save.arcanite, arcanite + o.amount);
    assert.equal(offerMedals(save, o.id), first + o.step, "the next is dearer");
  }
  save.medals = 0;
  assert.equal(buyStoreItem(save, { kind: "currency", id: offers[0]!.id }), false, "short of Medals");
  save.events.bought = {};
  assert.equal(offerMedals(save, offers[0]!.id), offers[0]!.medals, "a new event starts the prices over");
});

test("the Store sells the event's featured themes once each, and no other", () => {
  const save = defaults();
  save.events.id = newYearEvent(2027) + 3;
  save.medals = 10_000;
  const f = featuredThemes(save.events.id);
  const other = THEME_IDS.find((id) => id !== f.ui && id !== f.game)!;
  assert.equal(storePrice(save, { kind: "theme", id: other }), null);
  for (const id of [f.ui!, f.game!]) {
    assert.equal(storePrice(save, { kind: "theme", id }), THEME_MEDALS[THEMES[id].kind]);
    assert.ok(buyStoreItem(save, { kind: "theme", id }));
    assert.ok(save.themes.includes(id));
    assert.equal(buyStoreItem(save, { kind: "theme", id }), false, "owned");
  }
  assert.equal(save.medals, 10_000 - THEME_MEDALS.ui - THEME_MEDALS.game);
});

test("every event theme has its relics, each a Training row's boost or a known effect, each id once", () => {
  for (const t of [...EVENT_CYCLE, BLUE_MOON]) assert.ok(RELIC_SETS[t.id].length, `${t.name} has relics`);
  const rows = new Set(TRAINING.map((r) => r.id));
  for (const [id, r] of Object.entries(RELICS)) {
    assert.ok(r.name && !/^the /i.test(r.name), `${id} is named, without "The"`);
    if (r.bonus.kind === "boost") assert.ok(rows.has(r.bonus.stat), `${id} boosts a Training row`);
    else assert.ok(r.bonus.effect in RELIC_SPECIALS, `${id}'s effect is known`);
    assert.ok(bonusText(r.bonus) && !/beyond cap/i.test(bonusText(r.bonus)));
  }
  // Each track place gives a relic of the event's own theme.
  for (let id = newYearEvent(2027); id < newYearEvent(2028); id++) for (const m of stubEvent(id).milestones) assert.ok(m.relic && RELICS[m.relic]);
});

/** A relic in the catalog boosting `stat`, whatever it's called. */
const boostOf = (stat: TrainingId) => Object.entries(RELICS).find(([, r]) => r.bonus.kind === "boost" && r.bonus.stat === stat)?.[0];
const specialOf = (effect: string) => Object.entries(RELICS).find(([, r]) => r.bonus.kind === "special" && r.bonus.effect === effect)?.[0];

test("a free relic multiplies its row's value, beyond what training reaches, and the hero's stats", () => {
  const save = defaults();
  for (const stat of ["goldBonus", "critChance", "attack", "hp"] as const) {
    const id = boostOf(stat);
    if (!id) continue;
    const pct = (RELICS[id]!.bonus as { percent: number }).percent;
    if (trainingDef(stat).requires) save.upgrades[trainingDef(stat).requires!] = 1;
    save.training[stat] = 20;
    if ("stat" in trainingDef(stat)) {
      const key = (trainingDef(stat) as { stat: "attack" | "maxHp" }).stat;
      const without = loadout({ ...save, relics: [] })[key], owned = loadout({ ...save, relics: [id] })[key];
      assert.ok(Math.abs(owned - (without * (100 + pct)) / 100) < 1e-6, `${stat}: ${owned} is ${without} × ${pct}% more`);
    } else {
      const without = trainedAmount({ ...save, relics: [] }, stat), owned = trainedAmount({ ...save, relics: [id] }, stat);
      assert.ok(owned > without, `${stat} rises`);
    }
  }
});

const hero = (more: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 10_000, maxHp: 10_000, attack: 30, defense: 2, shroud: 40, keys: { yellow: 0, blue: 0, red: 0 }, ...more } as Player);
const boss: Enemy = { name: "Boss", hp: 600, attack: 60, defense: 1, strength: "boss" };
/** What a fight played out strike by strike takes from the hero. */
const played = (p: Player, e: Enemy) => {
  const strikes = bout(p, e).strikes.filter((s) => s.by === "enemy");
  return strikes.length ? p.hp - strikes[strikes.length - 1]!.hp : 0;
};

test("relics' boss ATK cut and shroud guard lighten a fight, and its prediction and playback agree", () => {
  assert.ok(specialOf("bossAttackCut") && specialOf("shroudGuard"), "both are given by some relic");
  const plain = predict(hero(), boss).damage;
  for (const more of [{ bossAttackCut: 5 }, { shroudGuard: 3 }, { bossAttackCut: 5, shroudGuard: 3 }]) {
    const p = hero(more), predicted = predict(p, boss).damage;
    assert.ok(predicted < plain, `${JSON.stringify(more)} costs less`);
    assert.equal(played(p, boss), predicted, "played out as predicted");
  }
  const rat: Enemy = { ...boss, strength: "normal" };
  assert.equal(predict(hero({ bossAttackCut: 5 }), rat).damage, predict(hero(), rat).damage, "the cut spares other enemies");
  const save = defaults();
  save.relics = [specialOf("bossAttackCut")!];
  assert.ok(relicAmount(save, "bossAttackCut") > 0);
});
