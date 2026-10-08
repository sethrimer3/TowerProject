import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { TournamentClient } from "../src/tournament/client.ts";
import { nextLeague } from "../src/tournament/leagues.ts";
import { placeOf, prizeFor, prizeLevel } from "../src/tournament/prizes.ts";
import { CLAIM_MS, tournamentById } from "../src/tournament/schedule.ts";
import { stubField, stubTournament, STUB_TABULATE_MS } from "../src/tournament/server.ts";

const MINUTE = 60_000, HOUR = 60 * MINUTE;
const ID = "2026-10-07", T = tournamentById(ID);
/** When the stub finalizes Wednesday's results. */
const FINAL = T.graceEndsAt + STUB_TABULATE_MS;

/** A game in the forest whose player claimed floor 70's Goal, on a clock
 * the test moves, with a client of the stub server on the same clock. */
function setup() {
  const save = defaults();
  save.goals.claimed[1] = [70];
  const clock = { now: T.opensAt + HOUR };
  const g = new Game(save);
  g.clock = () => clock.now;
  g.newRun({ outside: true });
  const client = new TournamentClient(g, stubTournament(() => g.save.tournament, () => clock.now));
  return { g, client, clock };
}

/** Where the player's best score of `best` places them among the stub's Copper field. */
function copperPlace(best: number) {
  const scores = [...stubField(ID, "copper"), best];
  return { place: placeOf(scores, best), entrants: scores.length };
}

test("a tournament from entry to the next: depth counts until the grace ends, the results come, the prize is claimed once, then expires", async () => {
  const { g, client, clock } = setup(), desk = g.tournament;
  assert.equal(await client.refresh(), true, "the free Ticket");
  assert.equal(await client.begin(), null);
  // Depth is kept as it is reached, so it counts even if the run outlasts the grace.
  g.run.maxHeight = 9;
  client.tick(clock.now);
  await client.sendPending();
  assert.equal(g.save.tournament.entries[ID]!.best, 10);
  assert.equal(g.save.tournament.entries[ID]!.pending, null, "sent");
  clock.now = T.closesAt + HOUR;
  assert.equal(desk.phase, "ending");
  assert.equal(desk.counts(ID), true, "the grace");
  g.run.maxHeight = 19;
  client.tick(clock.now + TournamentClient.RETRY_MS);
  await client.sendPending();
  assert.equal(g.save.tournament.entries[ID]!.best, 20);
  // Past the grace: depth no longer counts, and the server is asked for the results.
  clock.now = T.graceEndsAt + 10 * MINUTE;
  assert.equal(desk.counts(ID), false);
  assert.equal(desk.awaitingResults, true);
  g.run.maxHeight = 29;
  client.tick(clock.now + 2 * TournamentClient.RETRY_MS);
  g.finish("Delve ended");
  await client.sendPending();
  assert.equal(g.save.tournament.entries[ID]!.best, 20, "depth reached after the grace is never kept");
  assert.equal(g.save.tournament.entries[ID]!.pending, null);
  // Finalized: still Ending until the server is asked again.
  clock.now = FINAL + MINUTE;
  assert.equal(desk.phase, "ending");
  assert.equal(desk.final, null);
  await client.refresh();
  assert.equal(desk.phase, "results");
  assert.equal(desk.awaitingResults, false);
  const { place, entrants } = copperPlace(20), level = prizeLevel(place, entrants);
  assert.deepEqual(desk.final, { place, entrants, level, league: nextLeague("copper", place, entrants) });
  assert.equal(desk.claimable, true);
  const prize = prizeFor("copper", place, entrants), gems = g.save.gems;
  assert.deepEqual(await client.claim(), prize);
  assert.equal(g.save.gems, gems + prize.gems);
  assert.equal(await client.claim(), null, "once");
  assert.equal(desk.phase, "upcoming", "claimed: nothing more of it shows, only the next one's opening");
  // A day after finalization the Results are over, but the final standing is still known.
  clock.now = FINAL + CLAIM_MS + MINUTE;
  assert.equal(desk.phase, "upcoming");
  assert.equal(desk.claimable, false);
  assert.equal(desk.final?.place, place);
  // Saturday's opens on the clock before the server is asked: the old report says nothing of it.
  clock.now = Date.UTC(2026, 9, 10, 0, 30);
  assert.equal(desk.phase, "open");
  assert.equal(desk.tournament.id, "2026-10-10");
  assert.equal(desk.entered, false);
  assert.equal(desk.final, null);
  const tickets = g.save.tournament.tickets;
  assert.equal(await client.refresh(), true, "Saturday's free Ticket");
  assert.equal(g.save.tournament.tickets, tickets + 1);
  assert.equal(g.save.tournament.league, nextLeague("copper", place, entrants), "played in the league the results moved the player to");
});

test("a final prize left unclaimed expires a day after the results", async () => {
  const { g, client, clock } = setup(), desk = g.tournament;
  await client.refresh();
  await client.begin();
  g.run.maxHeight = 4;
  g.finish("Delve ended");
  await client.sendPending();
  clock.now = FINAL + CLAIM_MS - MINUTE;
  await client.refresh();
  assert.equal(desk.phase, "results");
  assert.equal(desk.claimable, true);
  clock.now = FINAL + CLAIM_MS;
  assert.equal(desk.phase, "upcoming");
  assert.equal(desk.claimable, false);
  const gems = g.save.gems;
  assert.equal(await client.claim(), null);
  assert.equal(g.save.gems, gems, "nothing paid");
  assert.deepEqual(g.save.tournament.claimed, []);
});

test("a tournament the player never entered shows only the next one's opening once entry closes", async () => {
  const { g, client, clock } = setup(), desk = g.tournament;
  await client.refresh();
  assert.equal(desk.phase, "open");
  for (const now of [T.closesAt + HOUR, T.graceEndsAt + MINUTE, FINAL + MINUTE]) {
    clock.now = now;
    await client.refresh();
    assert.equal(desk.phase, "upcoming");
    assert.equal(desk.claimable, false);
    assert.equal(desk.final, null);
  }
  assert.equal(desk.live?.finalizedAt, FINAL, "the server's results are in, but none are the player's");
  assert.equal(desk.nextOpensAt, tournamentById("2026-10-10").opensAt);
});

test("without the server's answer, a closed tournament reads as over once its grace ends, and never as final", () => {
  const { g, clock } = setup(), desk = g.tournament;
  g.save.tournament.entries[ID] = { best: 5, place: 0, entrants: 0, pending: null, entry: `${ID}#1` };
  clock.now = T.graceEndsAt - MINUTE;
  assert.equal(desk.phase, "ending");
  clock.now = T.graceEndsAt;
  assert.equal(desk.phase, "upcoming");
  assert.equal(desk.awaitingResults, false, "nothing to ask again for until the server answers once");
  assert.equal(desk.final, null);
});
