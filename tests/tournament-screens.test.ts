import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { MODES } from "../src/modes.ts";
import { BLACKSMITH, OutsideWorld, TOURNAMENT_HALL } from "../src/outside.ts";
import { TournamentClient } from "../src/tournament/client.ts";
import { PRIZES, prizeFor, placeOf } from "../src/tournament/prizes.ts";
import { stubField, stubTournament, STUB_TABULATE_MS } from "../src/tournament/server.ts";
import { latestTournament, tournamentOn } from "../src/tournament/schedule.ts";
import { gmtDay } from "../src/shop/clock.ts";

const HOUR = 3_600_000;
/** Monday 2026-10-05, noon GMT: between tournaments. */
const MONDAY = Date.UTC(2026, 9, 5, 12);
/** Wednesday 2026-10-07, 01:00 GMT: a tournament is open. */
const OPEN = Date.UTC(2026, 9, 7, 1);

/** The forest tiles the hero can walk to from (x, y). */
function walkable(forest: OutsideWorld, x: number, y: number) {
  const seen = new Set([`${x},${y}`]), queue = [{ x, y }];
  for (const p of queue)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = forest.step(p.x, p.y, dx, dy);
      if (!n || seen.has(`${n.x},${n.y}`) || forest.tile(n.x, n.y).kind === "wall") continue;
      seen.add(`${n.x},${n.y}`);
      queue.push(n);
    }
  return seen;
}

test("claiming floor 70's Goal raises the Tournament Hall in the forest at once, in both forests", () => {
  for (const mode of ["tower", "delve"] as const) {
    const center = MODES[mode].entranceX, x = center + TOURNAMENT_HALL.dx + 1, y = TOURNAMENT_HALL.y + 1;
    const forest = new OutsideWorld(7, mode, true, true);
    assert.equal(forest.isTournamentHall(x, y), true);
    assert.equal(forest.tile(x, y).kind, "wall", "its walls block the way");
    assert.equal(new OutsideWorld(7, mode, true, false).isTournamentHall(x, y), false, "not before it is unlocked");
    // The path stays open, and the hero can walk up to the Hall's door.
    for (let row = 0; row < 12; row++) assert.notEqual(forest.tile(center, row).kind, "wall");
    const open = walkable(forest, center, 7);
    assert.ok(open.has(`${center + TOURNAMENT_HALL.dx - 1},${TOURNAMENT_HALL.y}`), "the yard before its door is reachable");
    // It never stands on the Blacksmith.
    assert.equal(forest.isBlacksmith(x, y), false);
    assert.equal(forest.isTournamentHall(center + BLACKSMITH.dx + 1, BLACKSMITH.y + 1), false);
  }
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 7 });
  const x = MODES.tower.entranceX + TOURNAMENT_HALL.dx + 1, y = TOURNAMENT_HALL.y + 1;
  assert.equal(g.atTournamentHall(x, y), false);
  g.save.tower.reached = 70;
  assert.ok(g.claimGoal(1, 70, false));
  assert.equal(g.atTournamentHall(x, y), true, "standing at once in the forest the claim was made from");
});

test("the desk says when the next tournament opens and whether the player has entered", () => {
  const save = defaults();
  save.goals.claimed[1] = [70];
  save.tournament.tickets = 1;
  const g = new Game(save);
  g.clock = () => MONDAY;
  assert.equal(g.tournament.phase, "upcoming");
  assert.equal(g.tournament.nextOpensAt, Date.UTC(2026, 9, 7), "Wednesday, 00:00 GMT");
  g.clock = () => OPEN;
  assert.equal(g.tournament.phase, "open");
  assert.equal(g.tournament.nextOpensAt, Date.UTC(2026, 9, 10), "while one is open, the one after it: Saturday");
  assert.equal(g.tournament.entered, false);
  g.tournament.enter("2026-10-07", "2026-10-07#1");
  assert.equal(g.tournament.entered, true);
});

test("the client claims the final prize once, after the results are final", async () => {
  const save = defaults();
  save.goals.claimed[1] = [70];
  const id = "2026-10-07";
  save.tournament.entries[id] = { best: 40, place: 0, entrants: 0, pending: null, entry: `${id}#1` };
  const g = new Game(save);
  const t = tournamentOn(gmtDay(OPEN));
  let now = t.graceEndsAt + HOUR / 2;
  g.clock = () => now;
  const client = new TournamentClient(g, stubTournament(() => g.save.tournament, () => now));
  await client.refresh();
  assert.equal(g.tournament.phase, "ending", "tallying");
  assert.equal(await client.claim(), null, "nothing to claim before the results");
  now = t.graceEndsAt + STUB_TABULATE_MS + HOUR;
  await client.refresh();
  assert.equal(g.tournament.phase, "results");
  assert.equal(g.tournament.claimable, true);
  const scores = [...stubField(id, "copper"), 40], expected = prizeFor("copper", placeOf(scores, 40), scores.length);
  const gems = g.save.gems, shards = g.save.ascensionShards;
  assert.deepEqual(await client.claim(), expected);
  assert.equal(g.save.gems, gems + expected.gems);
  assert.equal(g.save.ascensionShards, shards + expected.shards);
  assert.equal(g.tournament.claimable, false);
  assert.equal(await client.claim(), null, "only once");
  assert.ok(PRIZES.copper.includes(expected));
  assert.equal(latestTournament(now).id, id);
});
