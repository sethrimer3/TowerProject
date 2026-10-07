import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { World } from "../src/delve/world.ts";
import type { Tile } from "../src/entities.ts";
import { snap } from "../src/exact.ts";
import { random } from "../src/random.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import { TournamentClient } from "../src/tournament/client.ts";
import { LEAGUE_INFO } from "../src/tournament/leagues.ts";
import { ordinal, placeText } from "../src/tournament/prizes.ts";
import { runStream, tournamentScore, type TournamentRun } from "../src/tournament/run.ts";
import { stubSeeds, stubTournament, type TournamentInfo } from "../src/tournament/server.ts";
import { PRIZES } from "../src/tournament/prizes.ts";
import { latestTournament } from "../src/tournament/schedule.ts";

const HOUR = 3_600_000;
/** Wednesday 2026-10-07, 01:00 GMT: a tournament is open. */
const OPEN = Date.UTC(2026, 9, 7) + HOUR;

/** A game in the Tower's forest whose player claimed floor 70's Goal, at `now`, with `tickets`. */
function unlockedGame(now: number, tickets = 1, rng?: () => number) {
  const save = defaults();
  save.goals.claimed[1] = [70];
  save.tournament.tickets = tickets;
  const g = new Game(save, rng);
  g.clock = () => now;
  // A new game's first run starts inside: wait in the forest instead.
  g.newRun({ outside: true });
  return g;
}

/** Wednesday's tournament as the server reports it for `league`. */
function info(league: TournamentInfo["league"] = "gold"): TournamentInfo {
  return { ...latestTournament(OPEN), finalizedAt: null, league, seeds: stubSeeds("2026-10-07", league), prizes: PRIZES };
}

/** The first enemy in the Delve's first chunk. */
function firstEnemy(world: World) {
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < world.width; x++) {
      const t = world.tile(x, y);
      if (t.kind === "enemy") return t as Tile & { kind: "enemy" };
    }
  throw new Error("no enemy");
}

test("a tournament run spends a Ticket and goes into the league's cave from its seeds, enemies ×1.1", () => {
  const g = unlockedGame(OPEN, 2), i = info("gold");
  assert.equal(g.mode, "tower");
  assert.ok(!g.save.upgrades.delve, "the Delve need not be open");
  assert.equal(g.canBeginTournament, true);
  assert.equal(g.beginTournament(i, "2026-10-07#1"), true);
  assert.equal(g.save.tournament.tickets, 1);
  assert.equal(g.mode, "delve");
  assert.equal(g.run.outside, false);
  assert.equal(g.run.seed, i.seeds.layout);
  assert.equal(g.run.tier, LEAGUE_INFO.gold.cave);
  assert.equal(g.save.delve.tier, 5, "its records are the cave's");
  const t = g.delveRun.tournament!;
  assert.deepEqual({ ...t, drawn: undefined }, { id: "2026-10-07", league: "gold", entry: "2026-10-07#1", seeds: i.seeds, drawn: undefined, back: { mode: "tower", tier: 1 } });
  assert.deepEqual(g.save.tournament.entries["2026-10-07"], { best: 0, place: 0, entrants: 0, pending: null, entry: "2026-10-07#1" });
  // Each enemy has 1.1 times the cave's stats.
  const plain = firstEnemy(new World({ seed: i.seeds.layout, changes: {}, floor: 0, milestone: 0, tier: 5 })).enemy!;
  const strong = firstEnemy(new World({ seed: i.seeds.layout, changes: {}, floor: 0, milestone: 0, tier: 5, tournament: t })).enemy!;
  for (const k of ["hp", "attack", "defense"] as const) assert.equal(strong[k], snap((plain[k] * 11) / 10), k);
  // Only one run at a time.
  assert.equal(g.canBeginTournament, false);
  assert.equal(g.beginTournament(i, "2026-10-07#2"), false);
  assert.equal(g.save.tournament.tickets, 1, "nothing spent");
});

test("no Ticket, no run; locked, no run", () => {
  const g = unlockedGame(OPEN, 0);
  assert.equal(g.beginTournament(info(), "e"), false);
  assert.equal(g.mode, "tower");
  const locked = new Game(defaults());
  locked.save.tournament.tickets = 1;
  assert.equal(locked.canBeginTournament, false);
  assert.equal(locked.beginTournament(info(), "e"), false);
});

test("every entrant's run draws the same chances, whatever the game's own stream", () => {
  const a = unlockedGame(OPEN, 1, random(1)), b = unlockedGame(OPEN, 1, random(2)), i = info("silver");
  a.beginTournament(i, "a");
  b.beginTournament(i, "b");
  // A treasure chest's roll comes from the run's own stream.
  const loot = (g: Game) => (g as unknown as { purse: { treasure(x: number, y: number): unknown } }).purse.treasure(4, 9);
  assert.deepEqual(loot(a), loot(b));
  assert.ok(a.delveRun.tournament!.drawn.game > 0);
  assert.deepEqual(a.delveRun.tournament!.drawn, b.delveRun.tournament!.drawn);
  // The stream is the seed's, a draw at a time, and the count carries it on.
  const t: TournamentRun = { ...a.delveRun.tournament!, drawn: { game: 0, equipment: 0 } };
  const draw = runStream(t, "game"), plain = random(t.seeds.game);
  for (let k = 0; k < 5; k++) assert.equal(draw(), plain());
  assert.equal(t.drawn.game, 5);
  const resumed = runStream(t, "game");
  assert.equal(resumed(), plain(), "a reload carries on where it stopped");
});

test("ending a tournament run keeps its score to send, and returns to the player's own forest and tier", () => {
  const g = unlockedGame(OPEN, 1);
  g.save.delve.tiersOpen = 3;
  g.save.delve.tier = 2;
  g.save.delve.best = 77;
  g.beginTournament(info("platinum"), "e1");
  assert.equal(g.save.delve.tier, 7);
  assert.equal(g.save.delve.best, 0, "the cave's own records");
  g.run.height = 41;
  g.run.maxHeight = 41;
  assert.equal(tournamentScore(g.run), 42);
  g.finish("Delve ended");
  assert.equal(g.mode, "tower");
  assert.equal(g.save.delve.tier, 2);
  assert.equal(g.save.delve.best, 77);
  assert.equal(g.save.delve.run?.tournament, undefined);
  assert.equal(g.save.delve.run?.outside, true);
  assert.deepEqual(g.save.tournament.entries["2026-10-07"], { best: 42, place: 0, entrants: 0, pending: 42, entry: "e1" });
});

test("the client enters through the server, sends the score, and keeps one it can't send", async () => {
  let now = OPEN;
  const g = unlockedGame(now, 0);
  const client = new TournamentClient(g, stubTournament(() => g.save.tournament, () => now));
  assert.equal(await client.begin(), "noTicket");
  assert.equal(await client.refresh(), true, "the free Ticket");
  assert.equal(await client.begin(), null);
  assert.equal(g.mode, "delve");
  assert.equal(g.run.tier, undefined, "Copper plays the first cave");
  g.run.maxHeight = 9;
  const s = (await client.sendRun())!;
  assert.equal(s.best, 10);
  assert.ok(s.place >= 1 && s.entrants === 1000);
  assert.equal(g.save.tournament.entries["2026-10-07"]!.pending, null);
  // Ending the run sends nothing more: the server has that score.
  g.finish("Delve ended");
  assert.equal(g.save.tournament.entries["2026-10-07"]!.pending, null);
  // Entry closed: no more runs begin.
  g.save.tournament.tickets = 1;
  now = OPEN + DAY_MS;
  g.clock = () => now;
  assert.equal(await client.begin(), "closed");
  // A score waiting past the grace can never count, and is dropped.
  g.save.tournament.entries["2026-10-07"]!.pending = 12;
  now = OPEN + DAY_MS + 4 * HOUR;
  g.clock = () => now;
  await client.sendPending();
  assert.equal(g.save.tournament.entries["2026-10-07"]!.pending, null);
});

test("the save keeps a tournament run inside, and drops a malformed one", () => {
  const g = unlockedGame(OPEN, 1);
  g.beginTournament(info("champion"), "e9");
  const saved = decode(JSON.stringify(g.save));
  assert.deepEqual(saved.delve.run?.tournament, g.delveRun.tournament);
  // Reloaded, the game opens in the Delve run, the Delve unopened or not.
  assert.equal(new Game(saved).mode, "delve");
  const bad = JSON.parse(JSON.stringify(g.save));
  bad.delve.run.tournament.seeds.game = -1;
  assert.equal(decode(JSON.stringify(bad)).delve.run?.tournament, undefined);
});

test("places read as ordinals with the share of entrants at or above them", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  assert.equal(placeText(12, 1480), "12th of 1,480 · top 1%");
  assert.equal(placeText(500, 1000), "500th of 1,000 · top 50%");
});

