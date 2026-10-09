import { add, addSchedule, averaged, censusSeed, tileCounts, type CensusBand, type CensusOptions, type Counts } from '../tower/census.ts';
import { region } from './labyrinth.ts';

/** The door and key census for the Delve (docs/DOOR_AND_KEY_SCHEDULE.md):
 * what its areas hold per equivalent floor, by delve and band of floors,
 * against the schedules of the tower of the same number. An area is ten
 * equivalent floors, so a band covers every area holding one of its floors
 * (`--floors 1-200` is areas 0 to 19). `npm run delve:report -- --census`. */
export function delveCensus(o: CensusOptions): CensusBand[] {
  const bands: CensusBand[] = [];
  for (const tier of o.towers)
    for (let from = o.from; from <= o.to; from += o.band) {
      const to = Math.min(o.to, from + o.band - 1);
      const sum: Counts = {};
      let floors = 0;
      for (let area = Math.floor((from - 1) / 10); area <= Math.floor((to - 1) / 10); area++)
        for (let s = 0; s < o.seeds; s++) {
          const r = region(censusSeed(s), area, tier);
          const forks = r.nodes.flatMap(n => (n.fork ? [n.fork.lanes] : []));
          for (const [k, n] of Object.entries(tileCounts(r.cells.values(), forks, r.doorQuota))) add(sum, k, n);
          add(sum, 'enemies:baseline', r.enemyCount.baseline);
          add(sum, 'enemies:dropped', r.enemyCount.dropped);
          for (let f = area * 10; f < area * 10 + 10; f++) addSchedule(sum, f, tier);
          floors += 10;
        }
      bands.push({ tower: tier, from, to, floors, avg: averaged(sum, floors) });
    }
  return bands;
}
