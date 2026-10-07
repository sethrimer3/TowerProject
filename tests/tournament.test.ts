import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { checkpoint, goalUnlocked } from "../src/goals.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import { LEAGUES, LEAGUE_INFO, caveLabel, nextLeague } from "../src/tournament/leagues.ts";
import { PRIZES, PRIZE_LEVEL_TOP, oscillationFailures, placeOf, prizeFor, prizeLevel, type Prize } from "../src/tournament/prizes.ts";
import { decodeTournament, defaultTournament } from "../src/tournament/progress.ts";
import {
  CLAIM_MS, GRACE_MS, latestTournament, nextTournament, phaseOf, scoreCounts, shortCountdown, tournamentOn,
} from "../src/tournament/schedule.ts";
import { STUB_ENTRANTS, STUB_TABULATE_MS, stubField, stubSeeds, stubTournament, type TournamentInfo } from "../src/tournament/server.ts";
import { gemTicketPrice, grantFreeTicket, nextTicket, spendTicket, takeAdTicket, addGemTicket } from "../src/tournament/tickets.ts";

const HOUR = 3_600_000;
/** Wednesday 2026-10-07, 00:00 GMT: a tournament opens. */
const WED = Date.UTC(2026, 9, 7);
const SAT = Date.UTC(2026, 9, 10);

test("Tower I's floor 70 Goal unlocks the Tournament", () => {
  assert.deepEqual(checkpoint(1, 70)?.reward, { kind: "unlock", unlock: "tournament" });
  const save = defaults();
  assert.equal(goalUnlocked(save, "tournament"), false);
  save.goals.claimed[1] = [70];
  assert.equal(goalUnlocked(save, "tournament"), true);
});

test("tournaments open all of each Wednesday and Saturday, GMT, with four hours' grace", () => {
  assert.equal(new Date(WED).getUTCDay(), 3);
  const wed = latestTournament(WED + 5 * HOUR);
  assert.deepEqual(wed, { id: "2026-10-07", opensAt: WED, closesAt: WED + DAY_MS, graceEndsAt: WED + DAY_MS + GRACE_MS });
  assert.deepEqual(tournamentOn(Math.floor(WED / DAY_MS)), wed);
  // Thursday and Friday still belong to Wednesday's; Saturday opens the next.
  assert.equal(latestTournament(WED + 2 * DAY_MS + 23 * HOUR).id, "2026-10-07");
  assert.equal(latestTournament(SAT).id, "2026-10-10");
  // Sunday to Tuesday belong to Saturday's, and the next is the Wednesday after.
  assert.equal(latestTournament(SAT + 3 * DAY_MS + 23 * HOUR).id, "2026-10-10");
  assert.equal(nextTournament(SAT).id, "2026-10-14");
  assert.equal(nextTournament(WED - 1).id, "2026-10-07");
  assert.equal(nextTournament(WED).id, "2026-10-10", "the next after one has opened");
});

test("a tournament's phases: open, ending until finalized, results for a day", () => {
  const t = latestTournament(WED);
  assert.equal(phaseOf(t, WED - 1, null), "upcoming");
  assert.equal(phaseOf(t, WED, null), "open");
  assert.equal(phaseOf(t, WED + DAY_MS - 1, null), "open");
  assert.equal(phaseOf(t, WED + DAY_MS, null), "ending");
  const finalized = t.graceEndsAt + 2 * HOUR;
  assert.equal(phaseOf(t, t.graceEndsAt + HOUR, finalized), "ending", "finalized later than now: still ending");
  assert.equal(phaseOf(t, t.graceEndsAt + 5 * HOUR, null), "ending", "never results before the server finalizes");
  assert.equal(phaseOf(t, finalized, finalized), "results");
  assert.equal(phaseOf(t, finalized + CLAIM_MS - 1, finalized), "results");
  assert.equal(phaseOf(t, finalized + CLAIM_MS, finalized), "upcoming");
  // Depth reached counts from the opening until the grace is over.
  assert.equal(scoreCounts(t, WED - 1), false);
  assert.equal(scoreCounts(t, t.graceEndsAt - 1), true);
  assert.equal(scoreCounts(t, t.graceEndsAt), false);
});

test("the button's countdown reads days and hours, then hours and minutes, then minutes", () => {
  assert.equal(shortCountdown(2 * DAY_MS + 5 * HOUR + 30_000), "2d5h");
  assert.equal(shortCountdown(5 * HOUR + 12 * 60_000), "5h12m");
  assert.equal(shortCountdown(12 * 60_000 - 1), "12m");
  assert.equal(shortCountdown(0), "1m");
});

test("leagues play caves 1, 3, 5, 7 and 9, shown with a +", () => {
  assert.deepEqual(LEAGUES.map((l) => LEAGUE_INFO[l].cave), [1, 3, 5, 7, 9]);
  assert.deepEqual(LEAGUES.map(caveLabel), ["Delve 1+", "Delve 3+", "Delve 5+", "Delve 7+", "Delve 9+"]);
});

test("the top 13% move up; the bottom 20% move down, never back into Copper or Silver", () => {
  assert.equal(nextLeague("copper", 13, 100), "silver");
  assert.equal(nextLeague("copper", 14, 100), "copper");
  assert.equal(nextLeague("copper", 100, 100), "copper");
  assert.equal(nextLeague("silver", 100, 100), "silver", "no one is demoted into Copper");
  assert.equal(nextLeague("gold", 100, 100), "gold", "no one is demoted into Silver");
  assert.equal(nextLeague("platinum", 80, 100), "platinum");
  assert.equal(nextLeague("platinum", 81, 100), "gold");
  assert.equal(nextLeague("champion", 1, 100), "champion");
  assert.equal(nextLeague("champion", 81, 100), "platinum");
});

test("ties share their cohort's lowest place, and a boundary tie falls to the lower prize level", () => {
  // Five players tie for 3rd to 7th: all are 7th.
  const scores = [90, 80, 50, 50, 50, 50, 50, 10];
  assert.equal(placeOf(scores, 50), 7);
  assert.equal(placeOf(scores, 90), 1);
  // Of 100 entrants, 3rd is level 1, 4th level 2 … 80th level 9, 81st level 10.
  assert.deepEqual([3, 4, 7, 8, 13, 14, 52, 53, 80, 81, 100].map((p) => prizeLevel(p, 100)), [1, 2, 2, 3, 3, 4, 8, 9, 9, 10, 10]);
  // The level shares: 3, 4, 6, 7, 8, 8, 8, 8, 28 and 20 percent.
  assert.deepEqual(PRIZE_LEVEL_TOP.map((top, i) => top - (PRIZE_LEVEL_TOP[i - 1] ?? 0)), [3, 4, 6, 7, 8, 8, 8, 8, 28, 20]);
  // A sole entrant is in the top 3%.
  assert.equal(prizeLevel(1, 1), 1);
  assert.deepEqual(prizeFor("gold", 30, 1000), { shards: 80, gems: 300 });
  assert.deepEqual(prizeFor("gold", 31, 1000), { shards: 70, gems: 240 }, "30 ahead of 1,000 is past the top 3%");
});

test("prizes: the specified endpoints, rising toward the top, and the oscillation rule", () => {
  const ends = (p: readonly Prize[]) => [p[9], p[0]];
  assert.deepEqual(ends(PRIZES.copper), [{ shards: 5, gems: 10 }, { shards: 20, gems: 100 }]);
  assert.deepEqual(ends(PRIZES.silver), [{ shards: 12, gems: 40 }, { shards: 40, gems: 200 }]);
  assert.deepEqual(ends(PRIZES.gold), [{ shards: 20, gems: 50 }, { shards: 80, gems: 300 }]);
  assert.deepEqual(ends(PRIZES.platinum), [{ shards: 20, gems: 100 }, { shards: 180, gems: 425 }]);
  assert.deepEqual(ends(PRIZES.champion), [{ shards: 20, gems: 175 }, { shards: 300, gems: 550 }]);
  for (const league of LEAGUES) {
    const p = PRIZES[league];
    assert.equal(p.length, 10);
    for (let i = 1; i < 10; i++) assert.ok(p[i]!.shards <= p[i - 1]!.shards && p[i]!.gems <= p[i - 1]!.gems, `${league} level ${i + 1}`);
  }
  assert.deepEqual(oscillationFailures(PRIZES, (l) => LEAGUE_INFO[l].demotes), []);
  // The rule bites: one more Shard at Gold's level 4 breaks it.
  const raised = { ...PRIZES, gold: PRIZES.gold.map((p, i) => (i === 3 ? { ...p, shards: p.shards + 1 } : p)) };
  assert.deepEqual(oscillationFailures(raised, (l) => LEAGUE_INFO[l].demotes), ["gold → platinum shards"]);
});

test("Tickets: one free a tournament, then one for an ad, then 10, 20, 30 … Gems, starting over each tournament", () => {
  const t = defaultTournament();
  assert.equal(grantFreeTicket(t, "2026-10-07"), true);
  assert.equal(grantFreeTicket(t, "2026-10-07"), false, "once a tournament");
  assert.equal(nextTicket(t, "2026-10-07"), "ad");
  assert.equal(takeAdTicket(t, "2026-10-07"), true);
  assert.equal(takeAdTicket(t, "2026-10-07"), false);
  assert.equal(nextTicket(t, "2026-10-07"), "gems");
  assert.equal(gemTicketPrice(t, "2026-10-07"), 10);
  addGemTicket(t, "2026-10-07");
  addGemTicket(t, "2026-10-07");
  assert.equal(gemTicketPrice(t, "2026-10-07"), 30);
  assert.equal(t.tickets, 4);
  // The next tournament starts the ad and Gem prices over; Tickets carry over.
  assert.equal(nextTicket(t, "2026-10-10"), "ad");
  assert.equal(gemTicketPrice(t, "2026-10-10"), 10);
  assert.equal(grantFreeTicket(t, "2026-10-10"), true);
  assert.equal(t.tickets, 5);
  for (let i = 0; i < 5; i++) assert.equal(spendTicket(t), true);
  assert.equal(spendTicket(t), false);
});

/** A Game with the Tournament unlocked, its clock at `now`. */
function unlockedGame(now: number) {
  const save = defaults();
  save.goals.claimed[1] = [70];
  const g = new Game(save);
  g.clock = () => now;
  return g;
}

test("the desk grants the free Ticket once the server reports a tournament open, and sells the rest", async () => {
  let now = WED + HOUR;
  const g = unlockedGame(now);
  const server = stubTournament(() => g.save.tournament, () => now);
  const info = (await server.current())!;
  assert.equal(info.id, "2026-10-07");
  assert.equal(info.league, "copper");
  assert.deepEqual(info.seeds, stubSeeds("2026-10-07", "copper"));
  assert.equal(g.tournament.observe(info, now), true);
  assert.equal(g.tournament.observe(info, now), false, "never twice");
  assert.equal(g.save.tournament.tickets, 1);
  assert.equal(g.tournament.phase, "open");
  assert.equal(g.tournament.nextTicket, "ad");
  assert.equal(g.tournament.buyGemTicket(), false, "the ad Ticket comes first");
  assert.equal(g.tournament.takeAdTicket(), true);
  assert.equal(g.tournament.takeAdTicket(), false);
  // Gem Tickets: refused short of Gems, then 10 and 20.
  assert.equal(g.tournament.buyGemTicket(), false);
  assert.equal(g.save.tournament.tickets, 2);
  g.save.gems = 35;
  assert.equal(g.tournament.buyGemTicket(), true);
  assert.equal(g.tournament.gemTicketPrice, 20);
  assert.equal(g.tournament.buyGemTicket(), true);
  assert.equal(g.save.gems, 5);
  assert.equal(g.save.tournament.tickets, 4);
  // Entry closes: no Tickets can be taken, and nothing is granted.
  now = WED + DAY_MS + HOUR;
  g.clock = () => now;
  assert.equal(g.tournament.observe((await server.current())!, now), false);
  assert.equal(g.tournament.phase, "ending");
  assert.equal(g.tournament.nextTicket, null);
  assert.equal(g.tournament.buyGemTicket(), false);
});

test("nothing is granted before the Tournament is unlocked", async () => {
  const save = defaults(), g = new Game(save);
  g.clock = () => WED + HOUR;
  const info = (await stubTournament(() => save.tournament, () => WED + HOUR).current())!;
  assert.equal(g.tournament.observe(info, WED + HOUR), false);
  assert.equal(save.tournament.tickets, 0);
  assert.equal(g.tournament.takeAdTicket(), false);
});

test("the stand-in: entering, standings with ties, finalizing, claiming once within a day, and leagues", async () => {
  let now = WED + HOUR;
  const g = unlockedGame(now);
  const server = stubTournament(() => g.save.tournament, () => now);
  const field = stubField("2026-10-07", "copper");
  assert.equal(field.length, STUB_ENTRANTS);
  assert.deepEqual(stubField("2026-10-07", "copper"), field, "the same field every time");
  assert.equal(await server.enter("2026-10-10", "copper"), null, "not a tournament that is open");
  const entry = (await server.enter("2026-10-07", "copper"))!;
  assert.ok(entry);
  // A score better than every made-up one is first of 1,000.
  const top = Math.max(...field) + 1;
  const s = (await server.submit(entry, top))!;
  assert.deepEqual(s, { id: "2026-10-07", best: top, place: 1, entrants: 1000, final: false });
  g.tournament.recordStanding(s);
  assert.deepEqual(g.save.tournament.entries["2026-10-07"], { best: top, place: 1, entrants: 1000, pending: null });
  // A worse run never lowers the best.
  assert.equal((await server.submit(entry, 0))!.best, top);
  // Not claimable before the results are final.
  assert.equal(await server.claim("2026-10-07"), null);
  now = latestTournament(WED).graceEndsAt + STUB_TABULATE_MS;
  g.clock = () => now;
  const info = (await server.current())!;
  assert.equal(info.finalizedAt, now);
  g.tournament.observe(info, now);
  assert.equal(g.tournament.phase, "results");
  assert.equal(g.tournament.claimable, true);
  assert.equal((await server.standing("2026-10-07"))!.final, true);
  const prize = (await server.claim("2026-10-07"))!;
  assert.deepEqual(prize, { shards: 20, gems: 100 });
  const gems = g.save.gems;
  assert.equal(g.tournament.claim("2026-10-07", prize), true);
  assert.equal(g.tournament.claim("2026-10-07", prize), false, "once");
  assert.equal(g.save.gems, gems + 100);
  assert.equal(g.save.ascensionShards, 20);
  assert.equal(g.tournament.claimable, false);
  assert.equal(await server.claim("2026-10-07"), null, "the stand-in reads the claim back");
  // First place in Copper plays Saturday's tournament in Silver, from Silver's seeds.
  now = SAT + HOUR;
  const sat = (await server.current())! as TournamentInfo;
  assert.equal(sat.league, "silver");
  assert.deepEqual(sat.seeds, stubSeeds("2026-10-10", "silver"));
  assert.notDeepEqual(stubSeeds("2026-10-10", "silver"), stubSeeds("2026-10-10", "copper"));
  // A day after finalizing, the prize can no longer be claimed.
  g.save.tournament.claimed = [];
  now = info.finalizedAt! + CLAIM_MS;
  assert.equal(await server.claim("2026-10-07"), null);
});

test("the save keeps Tickets, the league, Tickets taken, entries and claims, and drops what is malformed", () => {
  const save = defaults();
  Object.assign(save.tournament, {
    tickets: 3, league: "gold", granted: "2026-10-07", adTicket: "2026-10-07", gemTickets: { id: "2026-10-07", bought: 2 },
    entries: { "2026-10-07": { best: 41, place: 12, entrants: 1480, pending: null }, "2026-10-03": { best: 9, place: 0, entrants: 0, pending: 9 } },
    claimed: ["2026-10-03"],
  });
  assert.deepEqual(decode(JSON.stringify(save)).tournament, save.tournament);
  assert.deepEqual(decodeTournament(undefined), defaultTournament());
  assert.deepEqual(
    decodeTournament({
      tickets: -2, league: "bronze", granted: 7, adTicket: "yesterday", gemTickets: { id: "x", bought: 3 },
      entries: { nope: { best: 1 }, "2026-10-07": { best: -1 }, "2026-10-10": { best: 5, place: "1", pending: 2.5 } },
      claimed: ["2026-10-07", "2026-10-07", 3],
    }),
    { ...defaultTournament(), entries: { "2026-10-10": { best: 5, place: 0, entrants: 0, pending: null } }, claimed: ["2026-10-07"] },
  );
});
