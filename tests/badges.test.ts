import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { xpBase } from "../src/config.ts";
import { planHand, type CardId } from "../src/cards.ts";
import type { Board, Position } from "../src/board.ts";
import type { Enemy, Run, Tile } from "../src/entities.ts";
import {
  attachBadge, COPIES_FOR_LEVEL, copiesLeft, decodeBadges, defaultBadges, drawBadges, levelProgress, MAX_COPIES,
  BADGE_IDS, BADGES, badgeLevel, badgeValue, RARITY_WEIGHTS, runBadges, type BadgeId, type BadgesSave,
} from "../src/badges.ts";
import { DRAW_GEMS } from "../src/game/badge-desk.ts";

test("Badges costs 2 Courage and follows Focus in the Courage tree", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.save.upgrades.moveSpeed = 1;
  g.save.delve.courage = 10;
  assert.equal(g.buy("cardBadges"), false, "waits for Focus");
  g.save.upgrades.focus = 1;
  assert.ok(g.buy("cardBadges"));
  assert.equal(g.save.delve.courage, 8);
});

test("the first copy opens level 1 and counts toward level 2; 80 copies reach level 7", () => {
  assert.deepEqual(COPIES_FOR_LEVEL, [3, 5, 8, 12, 20, 32]);
  assert.equal(MAX_COPIES, 80);
  const levelAt = [0, 1, 2, 3, 7, 8, 15, 16, 27, 28, 47, 48, 79, 80].map(badgeLevel);
  assert.deepEqual(levelAt, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
  assert.deepEqual(levelProgress(1), { have: 1, need: 3 });
  assert.deepEqual(levelProgress(3), { have: 0, need: 5 }, "level 2 starts its count again");
  assert.deepEqual(levelProgress(79), { have: 31, need: 32 });
  assert.equal(levelProgress(80), null);
});

test("each badge's values by level, and a gate's threshold picked among those its level opened", () => {
  assert.deepEqual([1, 4, 7].map((l) => badgeValue("hp", l)), [1, 16, 49]);
  assert.deepEqual([1, 7].map((l) => badgeValue("goldTouch", l)), [1, 7]);
  assert.deepEqual(BADGES.hpGate.values, [100, 90, 75, 50, 35, 20, 5]);
  assert.equal(badgeValue("hpGate", 3, 2), 75);
  assert.equal(badgeValue("hpGate", 3, 6), 75, "a pick past the level's thresholds stops at the last opened");
  assert.equal(badgeValue("yellowGate", 7, 6), 1);
  assert.equal(badgeValue("stairward", 1), 7, "Stairward cools down for 7 floors at level 1");
  assert.equal(badgeValue("charge", 4), 4);
  const byRarity = (r: string) => BADGE_IDS.filter((id) => BADGES[id].rarity === r).length;
  assert.deepEqual([byRarity("common"), byRarity("rare"), byRarity("epic")], [5, 4, 4]);
  assert.deepEqual(RARITY_WEIGHTS, { common: 70, rare: 27, epic: 3 });
});

const UPGRADES = defaults().upgrades;

test("draws follow the rarity weights and carry on one saved stream, purchase after purchase", () => {
  const m = defaultBadges();
  // Few enough that no badge reaches the top level and leaves the pool.
  const draws = drawBadges(m, UPGRADES, 350, () => 0.25);
  const share = (r: string) => draws.filter((d) => BADGES[d.id].rarity === r).length / draws.length;
  assert.ok(BADGE_IDS.every((id) => (m.owned[id]?.copies ?? 0) < MAX_COPIES));
  assert.ok(Math.abs(share("common") - 0.7) < 0.07 && Math.abs(share("rare") - 0.27) < 0.07 && Math.abs(share("epic") - 0.03) < 0.03);
  // One purchase of ten draws what ten purchases of one would, from the same saved state.
  const once = defaultBadges(), apart = defaultBadges();
  const ten = drawBadges(once, UPGRADES, 10, () => 0.5);
  let seeds = 0;
  const seedOnce = () => {
    if (seeds++) throw new Error("seeded only once");
    return 0.5;
  };
  const ones = Array.from({ length: 10 }, () => drawBadges(apart, UPGRADES, 1, seedOnce)[0]);
  assert.deepEqual(ones.map((d) => d.id), ten.map((d) => d.id));
  assert.equal(apart.rng, once.rng);
  // A reload keeps the stream where it stands.
  const reloaded = decodeBadges(JSON.parse(JSON.stringify(once)), UPGRADES);
  assert.deepEqual(drawBadges(reloaded, UPGRADES, 5, () => 0).map((d) => d.id), drawBadges(once, UPGRADES, 5, () => 0).map((d) => d.id));
});

test("a badge at the top level leaves the pool, and an emptied rarity's weight goes to the rest", () => {
  const m = defaultBadges();
  for (const id of BADGE_IDS) if (BADGES[id].rarity !== "epic") m.owned[id] = { copies: MAX_COPIES, pick: 0 };
  m.owned.charge = { copies: MAX_COPIES, pick: 0 };
  const draws = drawBadges(m, UPGRADES, 30, () => 0.1);
  assert.ok(draws.every((d) => d.id !== "charge" && BADGES[d.id].rarity === "epic"), "only the epics still open are drawn");
  assert.equal(copiesLeft(m, UPGRADES), 3 * MAX_COPIES - 30);
  for (const id of BADGE_IDS) m.owned[id] = { copies: MAX_COPIES, pick: 0 };
  assert.deepEqual(drawBadges(m, UPGRADES, 10, () => 0), [], "nothing left to draw");
});

test("a badge goes on one card and a card holds one: dropping moves it, swaps, or takes the old one off", () => {
  const m: BadgesSave = { ...defaultBadges(), owned: { hp: { copies: 1, pick: 0 }, xp: { copies: 1, pick: 0 }, charge: { copies: 1, pick: 0 } } };
  attachBadge(m, "hp", "door");
  attachBadge(m, "xp", "stairs");
  assert.deepEqual(m.cards, { door: "hp", stairs: "xp" });
  attachBadge(m, "hp", "stairs");
  assert.deepEqual(m.cards, { door: "xp", stairs: "hp" }, "two attached tokens swap cards");
  attachBadge(m, "charge", "door");
  assert.deepEqual(m.cards, { door: "charge", stairs: "hp" }, "a token from the box takes the card's old one off");
  attachBadge(m, "charge", "monster");
  assert.deepEqual(m.cards, { stairs: "hp", monster: "charge" }, "a token moved to a bare card leaves its old one bare");
  assert.deepEqual(runBadges(m, ["stairs", "door"]), { stairs: { id: "hp", level: 1, pick: 0 } }, "a run takes only its hand's");
});

test("the desk draws for Gems (red-priced, never refused for show), attaches in the forest only, and picks thresholds", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  assert.equal(g.badges.draw(1), null, "needs Badges");
  g.save.upgrades.cardBadges = 1;
  g.save.gems = DRAW_GEMS[10] + DRAW_GEMS[1] - 1;
  assert.equal(g.badges.draw(10)?.length, 10);
  assert.equal(g.save.gems, DRAW_GEMS[1] - 1);
  assert.equal(g.badges.draw(1), null, "short of Gems");
  const owned = BADGE_IDS.filter((id) => g.save.badges.owned[id]);
  assert.equal(owned.reduce((n, id) => n + g.save.badges.owned[id]!.copies, 0), 10);
  assert.ok(g.badges.attach(owned[0], "stairs"));
  assert.equal(g.badges.attach(owned[0], "heal"), false, "only cards the player owns");
  g.save.badges.owned.hpGate = { copies: 3, pick: 0 };
  assert.ok(g.badges.setPick("hpGate", 1));
  assert.equal(g.badges.setPick("hpGate", 2), false, "level 2 opens two thresholds");
  g.newRun();
  assert.equal(g.badges.attach(owned[0], "door"), false, "not inside a run");
  assert.equal(g.badges.detach(owned[0]), false);
});

test("the save keeps badges, their cards and the stream, dropping what doesn't fit", () => {
  const save = defaults();
  save.badges = { owned: { hp: { copies: 4, pick: 0 }, hpGate: { copies: 3, pick: 1 } }, cards: { stairs: "hp", door: "hpGate" }, rng: 12345 };
  assert.deepEqual(decode(JSON.stringify(save)).badges, save.badges);
  const bad = { owned: { hp: { copies: 81 }, xp: { copies: 2, pick: 5 }, nope: { copies: 1 } }, cards: { stairs: "xp", door: "xp", heal: "xp", monster: "hp" }, rng: -1 };
  assert.deepEqual(decodeBadges(bad, UPGRADES), { owned: { xp: { copies: 2, pick: 0 } }, cards: { stairs: "xp" }, rng: null });
});

// --- In a run ---

/** A Tower floor drawn row by row, the first row highest; `@` is the hero.
 * Badges is owned and undo open. */
function floor(rows: string[]) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  g.save.upgrades.cardBadges = 1;
  const w = g.world as RoomWorld, height = rows.length;
  w.cells = new Map();
  rows.forEach((row, j) => [...row].forEach((c, x) => {
    const y = height - 1 - j;
    w.cells.set(`${x},${y}`, TILES[c] ?? { kind: "floor" });
    if (c === "@") [g.run.player.x, g.run.player.y] = [x, y];
  }));
  return g;
}
const WEAK: Enemy = { name: "Weak", hp: 1, attack: 1, defense: 0, tier: 0, strength: "normal" };
const TILES: Record<string, Tile> = {
  "#": { kind: "wall" }, S: { kind: "stairs" }, P: { kind: "potion" }, K: { kind: "key", color: "yellow" },
  M: { kind: "enemy", enemy: WEAK }, D: { kind: "door", color: "yellow" }, A: { kind: "attack" },
};
/** Gives card `card` badge `id` at `level` (a gate's threshold `pick`). */
function badge(g: Game, card: CardId, id: BadgeId, level = 1, pick = 0) {
  g.run.badges = { ...g.run.badges, [card]: { id, level, pick } };
}
const at = (g: Game) => [g.run.player.x, g.run.player.y];
const turns = (g: Game, n: number) => { for (let i = 0; i < n; i++) g.autoTurn(); };

test("a gate keeps its card from acting while its condition fails; a Focus overrides it", () => {
  const g = floor(["@.K", "..."]);
  g.run.hand = ["yellowKey"];
  badge(g, "yellowKey", "hpGate");
  g.autoTurn();
  assert.ok(g.handStuck, "at full HP, HP < 100% keeps the card closed");
  g.run.player.hp = 99;
  assert.equal(planHand(g, g.run.hand, "tower")?.card, 0, "below full HP it acts");
  g.run.player.hp = 100;
  badge(g, "yellowKey", "yellowGate", 1, 0);
  g.run.player.keys.yellow = 10;
  assert.equal(planHand(g, g.run.hand, "tower"), null, "holding 10 yellow keys closes YK < 10");
  g.save.upgrades.focus = 1;
  assert.equal(g.focus(0), "focused", "a Focus plans the card whatever its gate");
  turns(g, 2);
  assert.equal(g.run.player.keys.yellow, 11);
});

test("activation pays when the card reaches its target: HP, HP %, Silver, XP scaled by floor", () => {
  const g = floor(["@.P.A"]);
  g.run.hand = ["heal", "atkUp"];
  g.run.player.hp = 50;
  badge(g, "heal", "hp", 4);
  badge(g, "atkUp", "silverTouch", 3);
  const hpBefore = g.run.player.hp;
  turns(g, 2);
  assert.ok(g.run.player.hp > hpBefore + 16 - 0.001 && g.run.player.hp >= hpBefore + 16, "the potion and HP's 16 both heal");
  const silver = g.silver;
  turns(g, 2);
  assert.equal(g.silver, silver + 3, "Silver Touch at level 3 pays 3 (no Silver bonus owned)");
  // XP rises with the floor as a kill's does.
  const h = floor(["@.A"]);
  h.run.hand = ["atkUp"];
  h.run.height = 30;
  badge(h, "atkUp", "xp", 7);
  const xp = h.save.xp;
  turns(h, 2);
  assert.equal(h.save.xp - xp, Math.round((49 * xpBase(30)) / xpBase(0)));
  // HP % heals a share of max HP.
  const p = floor(["@.A"]);
  p.run.hand = ["atkUp"];
  p.run.player.hp = 10;
  badge(p, "atkUp", "hpPercent", 5);
  turns(p, 2);
  assert.equal(p.run.player.hp, 10 + p.run.player.maxHp * 0.05);
});

test("Gold Touch pays once a target, even after undo; Goldback only on the hand's last card", () => {
  const g = floor(["@.A.K"]);
  g.run.hand = ["atkUp", "yellowKey"];
  badge(g, "atkUp", "goldTouch", 5);
  const gold = g.save.gold;
  turns(g, 2);
  assert.equal(g.save.gold, gold + 5);
  assert.ok(g.undo());
  turns(g, 1);
  assert.equal(g.save.gold, gold + 5, "taking the step again pays nothing more");
  const back = floor(["@.A.K"]);
  back.run.hand = ["atkUp", "yellowKey"];
  badge(back, "atkUp", "goldback", 4);
  badge(back, "yellowKey", "goldback", 4);
  const before = back.save.gold;
  turns(back, 2);
  assert.equal(back.save.gold, before, "ATK UP is not the last card");
  turns(back, 2);
  assert.equal(back.save.gold, before + 4, "YELLOW KEY is");
});

test("undo takes back the HP, Silver and XP an activation paid", () => {
  const g = floor(["@.A"]);
  g.run.hand = ["atkUp"];
  g.run.player.hp = 40;
  badge(g, "atkUp", "hp", 3);
  g.autoTurn();
  const hp = g.run.player.hp, silver = g.silver, xp = g.save.xp;
  g.autoTurn();
  assert.equal(g.run.player.hp, hp + 9);
  assert.ok(g.undo());
  assert.deepEqual([g.run.player.hp, g.silver, g.save.xp], [hp, silver, xp]);
});

test("Stairward picks the target with the shortest walk on to the stairs, then rests for its cooldown", () => {
  const rows = [
    "K....S",
    "######",
    ".@.K..",
  ];
  const g = floor(rows);
  (g.world as RoomWorld).cells.set("0,1", { kind: "floor" });
  g.run.hand = ["yellowKey"];
  assert.deepEqual(planHand(g, g.run.hand, "tower")!.path.at(-1), { x: 3, y: 0, dx: 1, dy: 0 }, "without it, the closest key");
  badge(g, "yellowKey", "stairward", 1);
  const end = planHand(g, g.run.hand, "tower")!.path.at(-1)!;
  assert.deepEqual([end.x, end.y], [0, 2], "the key beside the walk up to the stairs");
  g.autoTurn();
  assert.equal(g.run.badgeFloors?.stairward, 0, "it worked on this floor");
  g.run.height = 3;
  assert.equal(g.cardRules("yellowKey"), undefined, "level 1 rests for 7 floors");
  g.run.height = 7;
  assert.deepEqual(g.cardRules("yellowKey"), { stairward: true });
});

test("Skip Open Nodes passes over a monster that opens no new ground, and marks it for the floor", () => {
  const g = floor([
    "..M..",
    "@....",
    "###M#",
    "...P.",
  ]);
  g.run.hand = ["monster"];
  const plain = planHand(g, g.run.hand, "tower")!.path.at(-1)!;
  assert.deepEqual([plain.x, plain.y], [2, 3], "without it, the closest monster, in the open");
  badge(g, "monster", "skipOpen", 1);
  const end = planHand(g, g.run.hand, "tower")!.path.at(-1)!;
  assert.deepEqual([end.x, end.y], [3, 1], "the monster guarding the potion's row");
  assert.deepEqual(g.skipMarks, ["2,3"]);
  assert.equal(g.run.badgeFloors?.skipOpen, 0);
});

test("Charge paths through up to its level of monsters and doors to reach a target", () => {
  const g = floor(["@MD.S"]);
  g.run.hand = ["stairs"];
  g.run.player.keys.yellow = 1;
  assert.equal(planHand(g, g.run.hand, "tower"), null, "the stairs lie past a monster and a door");
  badge(g, "stairs", "charge", 1);
  assert.equal(planHand(g, g.run.hand, "tower"), null, "level 1 charges through one");
  badge(g, "stairs", "charge", 2);
  assert.equal(planHand(g, g.run.hand, "tower")!.path.length, 4);
  turns(g, 4);
  assert.equal(g.run.height, 1, "the hero fought, opened the door and climbed");
});

/** A hand-built board for the planner alone. */
function boardOf(rows: string[]): Position {
  const height = rows.length, width = rows[0].length, cell = (x: number, y: number) => rows[height - 1 - y]?.[x];
  let px = 0, py = 0;
  rows.forEach((row, j) => [...row].forEach((c, x) => { if (c === "@") [px, py] = [x, height - 1 - j]; }));
  const world: Board = {
    width, floor: 0, clear: () => {},
    tile: (x, y) => TILES[cell(x, y) ?? "#"] ?? { kind: "floor" },
    step: (x, y, dx, dy) => (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height ? null : { x: x + dx, y: y + dy }),
  };
  return { world, run: { player: { x: px, y: py, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } } } as Run };
}

test("Charge never goes through a door without its keys, and a plain hand plans as before", () => {
  const b = boardOf(["@D.S"]);
  assert.equal(planHand({ ...b, cardRules: () => ({ charge: 3 }) }, ["stairs"], "tower"), null);
  b.run.player.keys.yellow = 1;
  assert.equal(planHand({ ...b, cardRules: () => ({ charge: 3 }) }, ["stairs"], "tower")!.path.length, 3);
  assert.equal(planHand(b, ["stairs"], "tower"), null);
});
