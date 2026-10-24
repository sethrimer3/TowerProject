import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { checkpoint, goalUnlocked } from "../src/goals.ts";
import {
  DRAWN_MISSIONS, EVENT_DAYS, EVENT_MISSION_COUNT, EVENT_MISSIONS, FIXED_MISSIONS, STUB_MILESTONES, TIER_MEDALS,
  eventAt, eventEndsAt, eventStartsAt, nextReleaseAt, releasedBy, stubEvent, type EventMissionType,
} from "../src/events/catalog.ts";
import { baseMedals, decodeEvents, defaultEvents, isComplete, isFinished, milestoneReached, relicMedals, unclaimedMedals } from "../src/events/progress.ts";
import { decodeRelics } from "../src/relics.ts";
import { BADGE_IDS, MAX_COPIES } from "../src/cards/badges.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import type { Enemy, Tile } from "../src/entities.ts";
import type { Save } from "../src/save-shape.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

const HOUR = 3_600_000;
/** An event's first moment, Monday 00:00 GMT. */
const START = eventStartsAt(eventAt(Date.UTC(2026, 9, 10)));

/** A game on `save` (a fresh one) whose clock reads `at`, with Events open
 * (Tower I's floor 70 Goal claimed) unless `open` is false. */
function gameAt(at: number, save: Save = defaults(), open = true) {
  save.tutorials.climb = true;
  if (open) save.goals.claimed[1] = [70];
  const g = new Game(save);
  g.clock = () => at;
  return g;
}
const mission = (g: Game, type: EventMissionType) => g.events.missions.find((m) => m.type === type);
/** Claims every tier of mission `type` done, a press a tier; returns the Medals paid. */
function claimAll(g: Game, type: EventMissionType) {
  let paid = 0;
  for (let medals; (medals = g.events.claim(mission(g, type)!.id)) !== null;) paid += medals;
  return paid;
}

test("Goals: Tower I's floors 60, 70 and 80 pay the Tournament, Events and 25 Gems; Tower II's 60 and 70 Equipment and 10,000 Gold", () => {
  assert.deepEqual(checkpoint(1, 60)!.reward, { kind: "unlock", unlock: "tournament" });
  assert.deepEqual(checkpoint(1, 70)!.reward, { kind: "unlock", unlock: "events" });
  assert.deepEqual(checkpoint(1, 80)!.reward, { kind: "currency", currency: "gems", amount: 25 });
  assert.deepEqual(checkpoint(2, 60)!.reward, { kind: "unlock", unlock: "equipment" });
  assert.deepEqual(checkpoint(2, 70)!.reward, { kind: "currency", currency: "gold", amount: 10_000 });
  const save = defaults();
  save.goals.claimed[1] = [70];
  assert.ok(goalUnlocked(save, "events"));
  assert.ok(!goalUnlocked(save, "tournament"));
});

test("the schedule: fortnightly events from Monday 00:00 GMT, 7 missions on the first day and 2 a day for 7 more", () => {
  const id = eventAt(START);
  assert.equal(new Date(START).getUTCDay(), 1, "a Monday");
  assert.equal(eventAt(START - 1), id - 1);
  assert.equal(eventAt(START + EVENT_DAYS * DAY_MS - 1), id);
  assert.equal(eventEndsAt(id), START + EVENT_DAYS * DAY_MS);
  assert.equal(eventStartsAt(id + 1), eventEndsAt(id), "the next begins as one ends");
  assert.equal(EVENT_MISSION_COUNT, 21);
  assert.deepEqual([0, 1, 6, 7, 8, 13].map((d) => releasedBy(id, START + d * DAY_MS + HOUR)), [7, 9, 19, 21, 21, 21]);
  assert.equal(nextReleaseAt(id, START + HOUR), START + DAY_MS);
  assert.equal(nextReleaseAt(id, START + 6 * DAY_MS + HOUR), START + 7 * DAY_MS);
  assert.equal(nextReleaseAt(id, START + 7 * DAY_MS), null, "nothing new for the last six days");
  // The stand-in names it by its first day, with placeholder relics.
  assert.equal(stubEvent(id).name, `Event of ${new Date(START).getUTCDate()} ${new Date(START).toUTCString().slice(8, 11)} ${new Date(START).getUTCFullYear()}`);
  assert.ok(stubEvent(id).milestones.every((m) => m.relic === null));
  assert.deepEqual(STUB_MILESTONES.map((m) => [m.medals, m.premium]), [[350, false], [550, true], [700, false], [1100, true]]);
  assert.deepEqual([...TIER_MEDALS], [10, 15, 20]);
});

test("nothing counts before Events open", () => {
  const g = gameAt(START + HOUR, defaults(), false);
  assert.equal(g.events.refresh(), false);
  g.events.record("basic", 5000);
  assert.equal(g.events.missions.length, 0);
  assert.equal(g.save.medals, 0);
});

test("missions come: the four fixed ones first, then drawn ones, each kind once, released day by day", () => {
  const g = gameAt(START + HOUR);
  assert.ok(g.events.refresh());
  assert.equal(g.events.missions.length, 7);
  assert.deepEqual(g.events.missions.slice(0, 4).map((m) => m.type), FIXED_MISSIONS);
  assert.ok(g.events.missions.slice(4).every((m) => DRAWN_MISSIONS.includes(m.type)));
  assert.equal(mission(g, "login")!.progress, 1, "today's login counts");
  assert.equal(g.events.refresh(), false, "nothing more the same day");
  g.clock = () => START + DAY_MS + HOUR;
  assert.ok(g.events.refresh());
  assert.equal(g.events.missions.length, 9);
  assert.equal(mission(g, "login")!.progress, 2);
  // With every kind on offer, the event fills to 21 by its eighth day.
  Object.assign(g.save.upgrades, { critical: 1, freeTraining: 1, interest: 1 });
  g.save.equipment.unlocked = true;
  g.save.tower.best = 1000;
  g.clock = () => START + 7 * DAY_MS + HOUR;
  g.events.refresh();
  const types = g.events.missions.map((m) => m.type);
  assert.equal(types.length, Math.min(EVENT_MISSION_COUNT, FIXED_MISSIONS.length + DRAWN_MISSIONS.length));
  assert.equal(new Set(types).size, types.length, "each kind once");
});

test("the stand-in draws only what the player can work on", () => {
  const g = gameAt(START + 7 * DAY_MS + HOUR);
  g.events.refresh();
  for (const t of ["equipment", "merges", "crits", "freeUpgrades", "maxInterest", "strong", "elite"] as const) assert.equal(mission(g, t), undefined, t);
  assert.ok(g.events.missions.length < EVENT_MISSION_COUNT, "fewer than 21 while the pool is short");
  // The pool grows as the player opens more; the missing ones are given then.
  Object.assign(g.save.upgrades, { critical: 1 });
  g.events.refresh();
  assert.ok(mission(g, "crits"));
});

test("a tier done waits to be claimed, and a claim pays its Medals once; a key counts once", () => {
  const g = gameAt(START + HOUR);
  g.events.refresh();
  const t = g.save.events.missions.find((m) => m.type === "tournaments")!;
  g.events.record("tournaments", 1, "100");
  g.events.record("tournaments", 1, "100");
  assert.equal(t.progress, 1, "the same tournament counts once");
  assert.equal(g.save.medals, 0, "nothing paid before the claim");
  assert.equal(g.events.claim(t.id), 10);
  assert.equal(g.events.claim(t.id), null, "once");
  assert.equal(g.save.medals, 10);
  g.events.record("tournaments", 1, "101");
  g.events.record("tournaments", 1, "102");
  assert.ok(isComplete(t) && !isFinished(t));
  assert.equal(g.events.claim(t.id), 15, "one tier a claim");
  assert.ok(!isFinished(t));
  assert.equal(g.events.claim(t.id), 20, "then the next");
  assert.ok(isFinished(t));
  g.events.record("tournaments", 1, "103");
  assert.equal(t.progress, 3, "never past the last target");
  // A jump past two tiers pays both, at the claim.
  g.events.record("freeGems", 10);
  assert.equal(unclaimedMedals(g.save.events), 25);
  assert.equal(baseMedals(g.save.events), 45, "the Medals paid are those claimed");
  g.events.claim(mission(g, "freeGems")!.id);
  g.events.claim(mission(g, "freeGems")!.id);
  assert.equal(g.save.medals, 45 + 25);
  assert.equal(baseMedals(g.save.events), 70);
});

test("best missions keep the most reached: a floor, and streaks of floors", () => {
  const g = gameAt(START + 7 * DAY_MS + HOUR);
  g.save.upgrades.interest = 1;
  g.events.refresh();
  // Make sure the streak and floor missions are in play.
  const e = g.save.events;
  for (const type of ["floor", "noDamage", "maxInterest"] as const)
    if (!e.missions.some((m) => m.type === type)) e.missions.push({ id: e.nextId++, type, progress: 0, claimed: 0 });
  g.events.best("floor", 600);
  g.events.best("floor", 400);
  assert.equal(mission(g, "floor")!.progress, 600);
  for (let i = 0; i < 5; i++) g.events.climbed("tower", 7, i < 3);
  assert.equal(mission(g, "noDamage")!.progress, 5);
  assert.equal(mission(g, "maxInterest")!.progress, 3, "the streak broke at the fourth floor");
  // A fight costing HP: the floor it was on doesn't count, and the streak starts over.
  g.events.hurt("tower", 7);
  g.events.climbed("tower", 7, false);
  g.events.climbed("tower", 7, false);
  assert.equal(g.save.events.streaks.floors, 1);
  assert.equal(mission(g, "noDamage")!.progress, 5, "the best stays");
  // A new run starts its streaks afresh.
  g.events.climbed("tower", 8, true);
  assert.deepEqual(g.save.events.streaks, { run: "tower:8", floors: 1, hurt: false, interest: 1 });
});

test("the Event Booster doubles the event's Medals, retroactively, and opens its premium relics", () => {
  const g = gameAt(START + HOUR);
  g.events.refresh();
  g.events.record("freeGems", 13);
  claimAll(g, "freeGems");
  assert.equal(g.save.medals, 45);
  assert.equal(g.buyOffer("eventBoost", START + HOUR), "unpaid", "real money, until the store confirms it");
  assert.equal(g.buyOffer("eventBoost", START + HOUR, true), null);
  assert.ok(g.events.boosted);
  assert.equal(g.save.medals, 90, "those already earned doubled");
  g.events.record("tournaments", 1, "1");
  g.events.claim(mission(g, "tournaments")!.id);
  assert.equal(g.save.medals, 110, "and new ones doubled");
  assert.equal(relicMedals(g.save.events), 110);
  assert.equal(g.buyOffer("eventBoost", START + 2 * HOUR, true), "owned", "once an event");
  // Medals from elsewhere never count toward relics.
  g.save.medals += 1000;
  assert.equal(relicMedals(g.save.events), 110);
  // Premium milestones need the booster.
  const e = { ...defaultEvents(), id: 1, missions: [{ id: 1, type: "basic" as const, progress: 90_000, claimed: 3 }] };
  for (let i = 2; i <= 13; i++) e.missions.push({ id: i, type: DRAWN_MISSIONS[i]!, progress: EVENT_MISSIONS[DRAWN_MISSIONS[i]!].targets[2], claimed: 3 });
  assert.equal(relicMedals(e), 13 * 45);
  assert.deepEqual(STUB_MILESTONES.map((m) => milestoneReached(e, m)), [true, false, false, false]);
  e.boosted = [1];
  assert.deepEqual(STUB_MILESTONES.map((m) => milestoneReached(e, m)), [true, true, true, true]);
});

test("a new event starts over, keeping the boosters bought and mailing the Medals left unclaimed", () => {
  const g = gameAt(START + HOUR);
  g.events.refresh();
  assert.equal(g.buyOffer("eventBoost", START + HOUR, true), null);
  g.events.record("freeGems", 13);
  g.events.record("tournaments", 1, "1");
  g.events.claim(mission(g, "tournaments")!.id);
  const medals = g.save.medals;
  g.clock = () => START + EVENT_DAYS * DAY_MS + HOUR;
  g.events.refresh();
  assert.equal(g.save.events.id, eventAt(START) + 1);
  assert.equal(g.events.missions.length, 7);
  assert.equal(mission(g, "freeGems")!.progress, 0);
  assert.ok(!g.events.boosted, "each event needs its own booster");
  assert.deepEqual(g.save.events.boosted, [eventAt(START)]);
  assert.equal(g.save.medals, medals, "Medals carry over");
  // The unclaimed tiers come as Mail, doubled by the booster, sent as the event ended, once.
  const mail = g.save.mail.stub.filter((m) => m.id === `event:${eventAt(START)}`);
  assert.equal(mail.length, 1);
  assert.deepEqual(mail[0]!.items, [{ kind: "currency", currency: "medals", amount: 2 * 45 }]);
  assert.equal(mail[0]!.sentAt, eventEndsAt(eventAt(START)));
  g.events.refresh();
  assert.equal(g.save.mail.stub.length, 1);
  // Erase All keeps the boosters bought.
  g.eraseAll();
  assert.deepEqual(g.save.events.boosted, [eventAt(START)]);
});

test("Buy badges completes once every badge is owned and maxed", () => {
  const g = gameAt(START + HOUR);
  g.save.upgrades.cardBadges = 1;
  g.events.refresh();
  assert.equal(mission(g, "badges")!.progress, 0);
  g.save.badges.owned = Object.fromEntries(BADGE_IDS.map((id) => [id, { copies: MAX_COPIES }])) as typeof g.save.badges.owned;
  g.events.refresh();
  assert.ok(isComplete(mission(g, "badges")!));
  assert.equal(claimAll(g, "badges"), 45);
});

test("the Events button's dot: missions not yet seen, a tier to claim, or finished and not yet moved", () => {
  const g = gameAt(START + HOUR);
  g.events.refresh();
  assert.ok(g.events.waiting);
  g.events.seenAll();
  assert.ok(!g.events.waiting);
  g.events.record("freeGems", 7);
  assert.ok(g.events.waiting, "a tier to claim");
  g.events.claim(mission(g, "freeGems")!.id);
  assert.ok(!g.events.waiting);
  g.events.record("freeGems", 6);
  claimAll(g, "freeGems");
  assert.ok(g.events.waiting, "finished, not yet moved");
  g.events.move(mission(g, "freeGems")!.id);
  assert.ok(!g.events.waiting);
});

test("decoding keeps known missions and fields, each once", () => {
  const g = gameAt(START + HOUR);
  g.events.refresh();
  g.events.record("tournaments", 1, "9");
  g.events.record("freeGems", 10);
  g.events.claim(mission(g, "freeGems")!.id);
  g.events.record("freeGems", 1);
  const e = g.save.events;
  assert.deepEqual(decodeEvents(JSON.parse(JSON.stringify(e))), e);
  const raw = {
    ...JSON.parse(JSON.stringify(e)),
    missions: [...e.missions, { id: 1, type: "basic", progress: 0 }, { id: 99, type: "login", progress: 0 }, { id: 98, type: "nope", progress: 0 }, { id: 97, type: "basic", progress: 1e9 }],
    seen: [1, 1, 500], moved: ["x"], boosted: [3, 3, -1], streaks: { run: 5 },
  };
  const d = decodeEvents(raw);
  assert.deepEqual(d.missions, e.missions, "duplicate ids and kinds, unknown kinds and progress past the last target dropped");
  assert.deepEqual([d.seen, d.moved, d.boosted], [[1], [], [3]]);
  assert.deepEqual(d.streaks, defaultEvents().streaks);
  // Claimed tiers never past those done; a save from before claims counts its tiers done as claimed.
  const claimed = (c: unknown) => decodeEvents({ id: 1, missions: [{ id: 1, type: "tournaments", progress: 2, claimed: c }] }).missions[0]!.claimed;
  assert.deepEqual([claimed(1), claimed(3), claimed(-1), claimed(undefined)], [1, 0, 0, 2]);
  assert.deepEqual(decodeEvents(null), defaultEvents());
  assert.deepEqual(decodeRelics(["unknown", 3]), [], "no relic is defined yet");
});

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength });
/** The Tower hero at (0, 0) with `tiles` to its right, one a step. */
function corridor(g: Game, ...tiles: Tile[]) {
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ...tiles.map((t, i) => [`${i + 1},0`, t] as [string, Tile])]);
  Object.assign(g.run.player, { x: 0, y: 0 });
}

test("play counts: kills by strength once a tile, potions, chests and floors climbed", () => {
  const g = gameAt(START + HOUR);
  g.save.upgrades.inspirationUndos = 1;
  const e = g.save.events;
  e.id = eventAt(START);
  e.missions = (["basic", "bosses", "potions", "chests", "floor", "noDamage"] as const).map((type, i) => ({ id: i + 1, type, progress: 0, claimed: 0 }));
  const tiles: Tile[] = [{ kind: "enemy", enemy: enemy("normal") }, { kind: "enemy", enemy: enemy("boss") }, { kind: "potion" }, { kind: "treasure" }, { kind: "stairs" }];
  corridor(g, ...tiles);
  assert.ok(g.move(1, 0));
  assert.ok(g.undo());
  corridor(g, ...tiles);
  for (let i = 0; i < 5; i++) assert.ok(g.move(1, 0));
  assert.deepEqual(e.missions.map((m) => m.progress), [1, 1, 1, 1, 2, 1], "the kill undone and fought again counts once; floor 2 reached");
});
