import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { random } from "../src/random.ts";
import type { League } from "../src/tournament/leagues.ts";
import { PRIZES } from "../src/tournament/prizes.ts";
import { tournamentScore } from "../src/tournament/run.ts";
import { tournamentById } from "../src/tournament/schedule.ts";
import { stubSeeds, type TournamentInfo } from "../src/tournament/server.ts";

// Characterization trace of seeded tournament runs: each league's run, from
// the stand-in server's seeds for one tournament, played by the hand, every
// turn's observable state hashed against a golden file. It pins the seeds,
// the ×1.1 enemies of each cave and the run's own chance streams.
// Regenerate (only when a tournament or gameplay change is intended) with
// UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/tournament-trace.golden.json", import.meta.url);
const TURNS = 250;
const ID = "2026-10-07";

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex").slice(0, 12);

/** A player with the Tournament and Equipment open, a trained hero, and the
 * game's own stream started from `gameSeed`, entered into league `league`'s
 * run of the tournament. */
function entered(league: League, gameSeed: number) {
  const save = defaults();
  save.goals.claimed = { 1: [70] };
  save.equipment.unlocked = true;
  save.tournament.tickets = 1;
  Object.assign(save.tutorials, { climb: true, speed: true });
  Object.assign(save.training, { attack: 30, defense: 30, maxHp: 30 });
  // A hero of a high level, so the Silver run (cave 3) lasts too.
  save.xp = 200_000;
  const g = new Game(save, random(gameSeed));
  g.clock = () => tournamentById(ID).opensAt + 3_600_000;
  g.newRun({ outside: true });
  const info: TournamentInfo = { ...tournamentById(ID), finalizedAt: null, league, seeds: stubSeeds(ID, league), prizes: PRIZES };
  assert.ok(g.beginTournament(info, `${ID}#1`));
  return g;
}

/** The enemies of the run's first rows, as the run meets them. */
function enemies(g: Game) {
  const out: number[][] = [];
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < g.world.width; x++) {
      const t = g.world.tile(x, y);
      if (t.kind === "enemy" && t.enemy) out.push([x, y, t.enemy.hp, t.enemy.attack, t.enemy.defense]);
    }
  return out;
}

function trace(league: League, gameSeed: number): string[] {
  const g = entered(league, gameSeed), out = [hash({ seed: g.run.seed, tier: g.run.tier, enemies: enemies(g) })];
  for (let i = 0; i < TURNS && !g.fallen && !g.handStuck; i++) {
    g.autoTurn();
    const r = g.delveRun, materials = Object.values(g.save.equipment.materials).reduce((a, b) => a + b, 0);
    out.push(hash({
      player: r.player, height: r.height, maxHeight: r.maxHeight, kills: r.kills, treasures: r.treasures,
      gold: g.save.gold, silver: r.silver, xp: g.save.xp, materials, items: g.save.equipment.items.length,
      drawn: r.tournament!.drawn, score: tournamentScore(r), fallen: g.fallen,
    }));
  }
  return out;
}

const LEAGUES_TRACED: League[] = ["copper", "silver", "champion"];

test("seeded tournament runs match the recorded trace", () => {
  const actual = Object.fromEntries(LEAGUES_TRACED.map((l) => [l, trace(l, 1)]));
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual) + "\n");
    return;
  }
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  for (const [name, turns] of Object.entries(actual)) {
    const first = turns.findIndex((h, i) => h !== expected[name]?.[i]);
    assert.equal(first, -1, `${name} diverges at turn ${first}`);
    assert.equal(turns.length, expected[name].length, `${name} lasts as long`);
  }
});

test("two players on the same seeds play the same run, whatever their game's own stream", () => {
  for (const league of LEAGUES_TRACED) assert.deepEqual(trace(league, 2), trace(league, 3), league);
  // Guards the corpus: the Copper run lasts, fights and draws from its own streams.
  const g = entered("copper", 1);
  for (let i = 0; i < TURNS && !g.fallen && !g.handStuck; i++) g.autoTurn();
  assert.ok(g.delveRun.kills > 5, `only ${g.delveRun.kills} kills`);
  assert.ok(g.delveRun.tournament!.drawn.game + g.delveRun.tournament!.drawn.equipment > 0, "no draws from the run's streams");
});
