import { TOWER_START_X } from "../config.ts";
import { point, type Tile } from "../entities.ts";
import { isRanked, type RankedStrength } from "../enemy-schedule.ts";
import { dealProfiles, drawStrength, extraEnemies, profilesOn, rankStrengths, sharesOn } from "../enemy-stage.ts";
import { ENTRY, type Embedding } from "./embedder.ts";
import { enemyTile } from "./furnisher.ts";
import type { XY } from "./grid.ts";
import type { StrategicGraph } from "./types.ts";

export type EnemyCount = NonNullable<StrategicGraph["enemyCount"]>;

/** The Tower's enemy stage (docs/ENEMY_SCHEDULE.md section 3), the last
 * step before the unguarded loot, on its own stream `rng`: it adds enemies
 * for floor `room`'s count on plain floor tiles anywhere, as the floor's
 * own stand (never the way in or the tile just inside, `keep`, or a fork's
 * lane), then deals every enemy but bosses and those in fork lanes the
 * strengths of the floor's shares, weakest asked weakest, and the profiles of
 * its profile shares, each made anew for the floor. */
export function placeEnemies(cells: Map<string, Tile>, embedding: Embedding, room: number, tower: number, rng: () => number, keep: XY[]): EnemyCount {
  const lanes = new Set(embedding.doorways.filter((d) => d.lane !== undefined).map((d) => point(d.x, d.y)));
  const enemies: { key: string; asked: RankedStrength }[] = [];
  for (const [key, t] of cells)
    if (t.kind === "enemy" && t.enemy && isRanked(t.enemy.strength) && !lanes.has(key)) enemies.push({ key, asked: t.enemy.strength });
  const baseline = enemies.length, shares = sharesOn(room, tower);
  const wanted = extraEnemies(baseline, room, rng);

  const off = new Set([point(TOWER_START_X, 0), point(...ENTRY), ...keep.map((p) => point(...p)), ...lanes]);
  const open = [...cells].filter(([k, t]) => t.kind === "floor" && !off.has(k)).map(([k]) => k);
  let added = 0;
  for (; added < wanted && open.length; added++) {
    const [key] = open.splice(Math.floor(rng() * open.length), 1);
    enemies.push({ key, asked: drawStrength(shares, rng) });
  }

  const dealt = rankStrengths(enemies.map((e) => e.asked), shares, rng);
  const profiles = dealProfiles(enemies.length, profilesOn(room, tower), rng);
  enemies.forEach(({ key }, i) => cells.set(key, enemyTile(dealt[i], room, rng, profiles[i], tower)));
  return { baseline, added, dropped: wanted - added };
}
