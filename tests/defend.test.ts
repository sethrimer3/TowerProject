import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS_W, CELL_COUNT, ORTHO, SUB, cellIndex, tileKey } from '../src/defend/grid.ts';
import {
  defaultLayout,
  fitLayout,
  moveKeep,
  placeCityTile,
  placeStructure,
  removeCityTile,
  type Layout,
} from '../src/defend/layout.ts';
import { CellType, generateCity } from '../src/defend/citygen.ts';
import { DefendSim, buildWave } from '../src/defend/sim.ts';
import { UPGRADES, purchasePrice, STARTING_OWNED } from '../src/defend/catalog.ts';
import { available, buyItem, buyUpgrade, decodeDefendSave, defaultDefendSave } from '../src/defend/progress.ts';

const zeroLevels = () => Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as any;

/** The keep plus a 3×3 block of city tiles around it. */
function squareCity(): Layout {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const next = placeCityTile(l, tx + dx, ty + dy);
    assert.ok(next, `city tile ${tx + dx},${ty + dy} should be placeable`);
    l = next;
  }
  return l;
}

function mapOf(l: Layout, seed = 3) {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, seed);
}

test('city tiles must touch the city orthogonally and stay off the spawn row', () => {
  const l = defaultLayout();
  const { tx, ty } = l.keep;
  assert.ok(placeCityTile(l, tx + 1, ty));
  assert.equal(placeCityTile(l, tx + 1, ty + 1), null, 'diagonal only');
  assert.equal(placeCityTile(l, tx + 3, ty), null, 'disconnected');
  let chain = l;
  for (let y = ty - 1; y >= 1; y--) chain = placeCityTile(chain, tx, y)!;
  assert.equal(placeCityTile(chain, tx, 0), null, 'spawn row');
});

test('removing a city tile may not split the city', () => {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  l = placeCityTile(l, tx, ty - 1)!;
  l = placeCityTile(l, tx, ty - 2)!;
  assert.equal(removeCityTile(l, tx, ty - 1), null);
  assert.ok(removeCityTile(l, tx, ty - 2));
});

test('barracks need the city; towers may stand outside', () => {
  const l = squareCity();
  const { tx, ty } = l.keep;
  assert.equal(placeStructure(l, 'barracks', tx, ty - 3), null);
  assert.ok(placeStructure(l, 'archerTower', tx, ty - 3));
  assert.ok(placeStructure(l, 'watchTower', tx + 3, ty));
  assert.ok(placeStructure(l, 'barracks', tx - 1, ty - 1));
});

test('several structures can share a tile until it is full', () => {
  let l = squareCity();
  const { tx, ty } = l.keep;
  l = placeStructure(l, 'barracks', tx - 1, ty - 1)!;
  const withTower = placeStructure(l, 'archerTower', tx - 1, ty - 1);
  assert.ok(withTower, 'a 3×4 barracks and a 2×2 tower share a 7×7 tile');
  const fit = fitLayout(withTower!);
  assert.ok(fit.ok);
  // Structures never touch, so a street always fits between them.
  const [a, b] = fit.structures.filter((s) => s.tx === tx - 1 && s.ty === ty - 1).map((s) => s.rect);
  const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  assert.ok(Math.max(gapX, gapY) >= 1);
  let full: Layout | null = withTower;
  let placed = 0;
  while (full && placed < 10) {
    const next = placeStructure(full, 'barracks', tx - 1, ty - 1);
    if (!next) break;
    full = next;
    placed++;
  }
  assert.ok(placed < 10, 'a tile eventually fills up');
});

test('the keep moves by swapping with another city tile', () => {
  const l = squareCity();
  const { tx, ty } = l.keep;
  const moved = moveKeep(l, tx + 1, ty);
  assert.ok(moved);
  assert.deepEqual(moved!.keep, { tx: tx + 1, ty });
  assert.ok(moved!.cityTiles.includes(tileKey(tx, ty)));
  assert.equal(moveKeep(l, tx + 3, ty), null, 'not onto open ground');
});

test('the wall rings the city just outside its tiles', () => {
  const map = mapOf(squareCity());
  for (let i = 0; i < CELL_COUNT; i++) {
    if (map.wall[i]) assert.equal(map.city[i], 0, 'walls never sit inside a city tile');
  }
  // Every city cell on the boundary is sealed off from open ground by wall.
  const { tx, ty } = squareCity().keep;
  const x0 = (tx - 1) * SUB;
  const y0 = (ty - 1) * SUB;
  assert.equal(map.type[cellIndex(x0 - 1, y0 + 5)], CellType.WALL);
  assert.equal(map.type[cellIndex(x0 - 2, y0 + 5)], CellType.WALL);
  assert.equal(map.type[cellIndex(x0 - 3, y0 + 5)], CellType.OUT);
});

test('every house touches a street and every street reaches the keep', () => {
  let l = squareCity();
  const { tx, ty } = l.keep;
  l = placeStructure(l, 'barracks', tx - 1, ty - 1)!;
  l = placeStructure(l, 'archerTower', tx + 1, ty - 1)!;
  for (const seed of [1, 2, 3, 4, 5]) {
    const map = mapOf(l, seed);
    const road = (i: number) => map.type[i] === CellType.ROAD;
    const neighbours = (i: number) => {
      const x = i % CELLS_W, y = Math.floor(i / CELLS_W);
      return ORTHO.map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < CELLS_W && ny < CELL_COUNT / CELLS_W).map(([nx, ny]) => cellIndex(nx, ny));
    };
    for (const b of map.buildings) {
      if (b.kind === 'wall') continue;
      assert.ok(b.cells.some((c) => neighbours(c).some(road)), `${b.kind} at ${b.rect.x},${b.rect.y} touches a road (seed ${seed})`);
    }
    const keep = map.buildings.find((b) => b.kind === 'keep')!;
    const seen = new Set<number>();
    const stack = keep.cells.flatMap(neighbours).filter(road);
    for (const s of stack) seen.add(s);
    while (stack.length) for (const n of neighbours(stack.pop()!)) if (road(n) && !seen.has(n)) (seen.add(n), stack.push(n));
    for (let i = 0; i < CELL_COUNT; i++) if (road(i)) assert.ok(seen.has(i), `road cell ${i} connects to the keep (seed ${seed})`);
  }
});

test('the same layout and seed always generate the same city', () => {
  const a = mapOf(squareCity(), 9);
  const b = mapOf(squareCity(), 9);
  assert.deepEqual([...a.type], [...b.type]);
});

test('waves grow and escalate in variety', () => {
  const r = () => 0.5;
  assert.ok(buildWave(1, r).every((k) => k === 'roach'));
  assert.ok(buildWave(10, r).length > buildWave(1, r).length);
  assert.ok(new Set(buildWave(12, Math.random)).size > 1);
});

test('an undefended city eventually falls, and enemies breach the wall to do it', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 5);
  let breached = false;
  while (!sim.lost && sim.time < 600) {
    sim.step(1 / 30);
    if (!breached) breached = sim.map.buildings.some((b) => b.kind === 'wall' && !sim.intact(b));
  }
  assert.ok(sim.lost, 'keep falls');
  assert.ok(breached, 'walls were breached');
});

test('barracks keep their garrison topped up', () => {
  let l = squareCity();
  l = placeStructure(l, 'barracks', l.keep.tx - 1, l.keep.ty - 1)!;
  const sim = new DefendSim(mapOf(l), zeroLevels(), 1);
  for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
  assert.equal(sim.soldiers.length, 2, 'two swordsmen at level 0');
  sim.soldiers[0].hp = 0;
  sim.step(1 / 30);
  assert.equal(sim.soldiers.length, 1);
  for (let i = 0; i < 30 * 6; i++) sim.step(1 / 30);
  assert.equal(sim.soldiers.length, 2, 'the fallen swordsman is replaced after the training time');
});

test('civilians rebuild ruins one section at a time', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 1);
  const house = sim.map.buildings.find((b) => b.kind === 'house' && b.cells.length >= 2)!;
  sim.damageBuilding(house.id, 1e6);
  assert.equal(sim.intact(house), false);
  assert.ok(house.cells.every((c) => !sim.solid[c]), 'rubble is walkable');
  let partial = false;
  for (let i = 0; i < 30 * 60 && !sim.intact(house); i++) {
    sim.step(1 / 30);
    const built = house.cells.filter((c) => sim.solid[c]).length;
    if (built > 0 && built < house.cells.length) partial = true;
  }
  assert.ok(sim.intact(house), 'house fully rebuilt');
  assert.ok(partial, 'it came back piece by piece');
});

test('bombs and watch-tower marks hurt enemies', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 1);
  while (!sim.enemies.length) sim.step(1 / 30);
  const e = sim.enemies[0];
  const hp = e.hp;
  e.marked = true;
  sim.hurtEnemy(e, 1);
  assert.equal(e.hp, hp - 2, 'marked enemies take double damage');
  sim.dropBomb(e.x, e.y);
  assert.ok(e.hp <= 0);
});

test('shop: palette counts, purchases and upgrades use the wallet', () => {
  const save = defaultDefendSave();
  assert.equal(available(save, 'cityTile'), STARTING_OWNED.cityTile);
  const wallet = { gold: 10_000, ironBar: 100, steelBar: 100 };
  const price = purchasePrice('watchTower', save.owned.watchTower);
  assert.ok(buyItem(save, wallet, 'watchTower'));
  assert.equal(available(save, 'watchTower'), 1);
  assert.equal(wallet.gold, 10_000 - price.gold);
  assert.ok(purchasePrice('watchTower', save.owned.watchTower).gold > price.gold, 'each extra costs more');
  assert.ok(buyUpgrade(save, wallet, 'barracksCapacity'));
  assert.equal(save.levels.barracksCapacity, 1);
  const broke = { gold: 0, ironBar: 0, steelBar: 0 };
  assert.equal(buyItem(save, broke, 'barracks'), false);
});

test('saves round-trip and reject tampered layouts', () => {
  const save = defaultDefendSave();
  save.layout = squareCity();
  save.bestWave = 7;
  const back = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(back.layout, save.layout);
  assert.equal(back.bestWave, 7);
  const cheat = JSON.parse(JSON.stringify(save));
  cheat.layout.structures.push({ uid: 99, kind: 'barracks', tx: 1, ty: 1 });
  cheat.layout.nextUid = 100;
  assert.equal(decodeDefendSave(cheat).layout.structures.length, 0, 'unowned / illegal structures reset the layout');
  // Saves from the old tile-grid DEFEND fall back to a fresh city.
  assert.deepEqual(decodeDefendSave({ tiles: [], keep: { x: 4, y: 6 } }).layout, defaultLayout());
});

test('city lights: tower fires with corner pillars, lanterns hung on houses', async () => {
  const { cityLights, roadStones } = await import('../src/defend/lighting.ts');
  let l = squareCity();
  l = placeStructure(l, 'archerTower', l.keep.tx, l.keep.ty - 3)!;
  const map = mapOf(l);
  const lights = cityLights(map);
  const archer = lights.find((x) => x.kind === 'archerTower')!;
  assert.equal(archer.pillars.length, 4, 'four corner pillars');
  assert.ok(archer.inside, 'the tower does not shadow its own fire');
  const lanterns = lights.filter((x) => x.kind === 'lantern');
  assert.ok(lanterns.length >= 4);
  for (const a of lanterns) {
    assert.equal(map.buildings[a.owner].kind, 'house');
    for (const b of lanterns) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 5.5, 'lanterns are spread out');
  }
  assert.ok(roadStones(map).every((s) => map.type[cellIndex(Math.floor(s.x), Math.floor(s.y))] === CellType.ROAD));
});

test('weather: 30% rain, 10% night', async () => {
  const { rollWeather, lightsOn } = await import('../src/defend/weather.ts');
  let rain = 0, night = 0;
  const r = (await import('../src/defend/grid.ts')).rng(42);
  for (let i = 0; i < 20000; i++) {
    const w = rollWeather(r);
    rain += +w.rain;
    night += +w.night;
  }
  assert.ok(Math.abs(rain / 20000 - 0.3) < 0.02);
  assert.ok(Math.abs(night / 20000 - 0.1) < 0.015);
  assert.equal(lightsOn({ rain: false, night: false }), false);
});

test('struck buildings flash', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 1);
  const wall = sim.map.buildings.find((b) => b.kind === 'wall')!;
  sim.damageBuilding(wall.id, 1);
  assert.ok(sim.flash[wall.id] > 0);
  for (let i = 0; i < 10; i++) sim.step(1 / 30);
  assert.equal(sim.flash[wall.id], 0);
});

test('patrol routes: max level sends swordsmen after enemies anywhere in the city', () => {
  let l = squareCity();
  // Stretch the city so its far end is well beyond the base leash.
  for (let y = l.keep.ty + 2; y <= 12; y++) l = placeCityTile(l, l.keep.tx - 1, y) ?? l;
  l = placeStructure(l, 'barracks', l.keep.tx + 1, l.keep.ty - 1)!;
  const map = mapOf(l);
  const far = (lv: number) => {
    const levels = { ...zeroLevels(), soldierReach: lv };
    const sim = new DefendSim(map, levels, 1);
    for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
    sim.enemies = [];
    sim.spawnQueue = [];
    // An enemy on a street at the far end of the city.
    let cell = -1;
    for (let i = CELL_COUNT - 1; i >= 0 && cell < 0; i--) if (map.city[i] && map.type[i] === CellType.ROAD) cell = i;
    const x = (cell % CELLS_W) + 0.5, y = Math.floor(cell / CELLS_W) + 0.5;
    sim.enemies.push({ id: 9999, kind: 'ogre', x, y, hp: 1e9, maxHp: 1e9, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 } as any);
    for (let i = 0; i < 30; i++) {
      (sim as any).indexEnemies();
      for (const s of sim.soldiers) (sim as any).stepSoldier(s, 1 / 30);
    }
    return sim.soldiers.some((s) => s.target === 9999);
  };
  assert.equal(far(0), false, 'base patrols stay near the barracks');
  assert.equal(far(4), true, 'citywide patrols hunt it down');
});

test('3× speed unlock is bought once and saved', async () => {
  const { buySpeed3 } = await import('../src/defend/progress.ts');
  const save = defaultDefendSave();
  const wallet = { gold: 10_000, ironBar: 100, steelBar: 0 };
  assert.ok(buySpeed3(save, wallet));
  assert.equal(buySpeed3(save, wallet), false);
  assert.equal(decodeDefendSave(JSON.parse(JSON.stringify(save))).speed3, true);
});
