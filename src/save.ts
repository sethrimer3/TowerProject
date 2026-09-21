import { SAVE_KEY, UPGRADES } from "./config.ts";
import type { ModeSave, Run, Save } from "./entities.ts";
export function defaults(): Save {
  return {
    version: 2,
    tower: { run: null, history: [], revival: null, best: 0, shards: 0 },
    delve: { run: null, history: [], revival: null, best: 0, essence: 0 },
    gold: 0,
    xp: 0,
    upgrades: Object.fromEntries(
      UPGRADES.map((u) => [u.id, 0]),
    ) as Save["upgrades"],
    settings: {
      transition: "smooth",
      showArrows: false,
      density: 20,
      speed: 3,
      reduceMotion: false,
    },
  };
}
const finite = (n: unknown, max = 1e9) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
/** Validate an untrusted run payload; returns null if it does not match the
 * shape this session's Run/Player/gear invariants require. */
function validRun(r: any): Run | null {
  const p = r?.player;
  if (
    r &&
    Number.isInteger(r.seed) &&
    finite(r.height) &&
    finite(r.floor) &&
    r.floor <= p?.y &&
    finite(r.kills) &&
    finite(r.treasures) &&
    p &&
    Number.isInteger(p.x) &&
    p.x >= 0 &&
    p.x < 30 &&
    Number.isInteger(p.y) &&
    finite(p.y) &&
    finite(p.hp) &&
    p.hp > 0 &&
    finite(p.maxHp) &&
    p.hp <= p.maxHp &&
    finite(p.attack) &&
    finite(p.defense) &&
    ["yellow", "blue", "red"].every((k) => finite(p.keys?.[k])) &&
    Array.isArray(p.gear) &&
    p.gear.length === 2 &&
    p.gear.every(
      (g: any) =>
        ["weapon", "armor"].includes(g.slot) &&
        typeof g.name === "string" &&
        g.name.length < 80 &&
        finite(g.quality) &&
        finite(g.attack) &&
        finite(g.defense),
    ) &&
    r.changes &&
    typeof r.changes === "object" &&
    !Array.isArray(r.changes) &&
    Object.entries(r.changes).every(
      ([k, v]: [string, any]) => /^\d+,\d+$/.test(k) && v?.kind === "floor",
    )
  )
    return r;
  return null;
}
function decodeMode(
  s: any,
  undoCapacity: number,
): { run: Run | null; history: any[]; revival: any } {
  const run = validRun(s?.run);
  const history: { run: Run; best: number }[] = [];
  const snapshot = (value: any) => {
    if (!value || !finite(value.best)) return null;
    const loaded = validRun(value.run);
    return loaded ? { run: loaded, best: value.best } : null;
  };
  if (run && Array.isArray(s.history))
    for (const value of s.history.slice(-undoCapacity)) {
      const item = snapshot(value);
      if (
        item &&
        item.run.seed === run.seed &&
        item.run.layoutVersion === run.layoutVersion
      )
        history.push(item);
    }
  let revival = null;
  if (run && finite(s?.revival?.earned)) {
    const item = snapshot(s.revival.snapshot);
    if (item && item.run.layoutVersion === run.layoutVersion)
      revival = { snapshot: item, earned: s.revival.earned };
  }
  return { run, history, revival };
}
export function decode(raw: string | null): Save {
  const d = defaults();
  try {
    const s = JSON.parse(raw ?? "null");
    for (const u of UPGRADES)
      if (finite(s?.upgrades?.[u.id], u.max))
        d.upgrades[u.id] = Math.floor(s.upgrades[u.id]);
    const undoCapacity = 1 + d.upgrades.undos + d.upgrades.shardUndos;
    if ([16, 20, 24, 30].includes(s?.settings?.density))
      d.settings.density = s.settings.density;
    if ([1, 3, 6, 10].includes(s?.settings?.speed))
      d.settings.speed = s.settings.speed;
    if (["smooth", "fast", "instant"].includes(s?.settings?.transition))
      d.settings.transition = s.settings.transition;
    d.settings.showArrows = s?.settings?.showArrows === true;
    d.settings.reduceMotion = s?.settings?.reduceMotion === true;
    if (s?.version === 2) {
      if (finite(s.gold)) d.gold = Math.floor(s.gold);
      if (finite(s.xp)) d.xp = Math.floor(s.xp);
      if (finite(s.tower?.shards)) d.tower.shards = Math.floor(s.tower.shards);
      if (finite(s.tower?.best)) d.tower.best = Math.floor(s.tower.best);
      if (finite(s.delve?.essence))
        d.delve.essence = Math.floor(s.delve.essence);
      if (finite(s.delve?.best)) d.delve.best = Math.floor(s.delve.best);
      const tower = decodeMode(s.tower, undoCapacity);
      d.tower.run = tower.run;
      d.tower.history = tower.history as ModeSave["history"];
      d.tower.revival = tower.revival;
      const delve = decodeMode(s.delve, undoCapacity);
      d.delve.run = delve.run;
      d.delve.history = delve.history as ModeSave["history"];
      d.delve.revival = delve.revival;
    } else if (s?.version === 1) {
      // Migrate the single legacy run (the endless climb) into the new Delve slice.
      if (finite(s.best)) d.delve.best = Math.floor(s.best);
      if (finite(s.essence)) d.delve.essence = Math.floor(s.essence);
      const delve = decodeMode(
        { run: s.run, history: s.history, revival: s.revival },
        undoCapacity,
      );
      d.delve.run = delve.run;
      d.delve.history = delve.history as ModeSave["history"];
      d.delve.revival = delve.revival;
    }
  } catch {}
  return d;
}
export function load(): Save {
  try {
    return decode(localStorage.getItem(SAVE_KEY));
  } catch {
    return defaults();
  }
}
export function persist(save: Save): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
