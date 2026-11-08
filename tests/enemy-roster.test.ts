import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { Enemy } from "../src/entities.ts";
import { ENEMY_ROSTER, ROSTER_TRAITS, rosterEntry, rosterTrait } from "../src/enemies/roster.ts";
import { enemyTitle, getTowerGateEnemy, TOWER_ZONE_ENEMIES, DELVE_ENEMY_NAMES } from "../src/enemies/scaling.ts";
import { kitEnemy } from "../src/sprites/kit.ts";
import { defaults, decode } from "../src/save/save.ts";
import { decodePng } from "../tools/ui-atlas-png.mjs";

test("every strength, trait and profile resolves to its own name and sprite without changing combat", () => {
  assert.equal(ENEMY_ROSTER.length, 126);
  assert.equal(new Set(ENEMY_ROSTER.map(e => e.id)).size, 126);
  assert.equal(new Set(ENEMY_ROSTER.map(e => e.name)).size, 126);
  for (const entry of ENEMY_ROSTER) {
    const enemy: Enemy = { ...getTowerGateEnemy(500, entry.strength, entry.profile), strength: entry.strength };
    if (entry.trait !== "ordinary") enemy[entry.trait === "aggroed" ? "aggro" : entry.trait] = true;
    const before = structuredClone(enemy);
    assert.equal(rosterEntry(enemy)?.id, entry.id);
    assert.equal(kitEnemy(enemy), entry.id);
    assert.ok(enemyTitle(enemy).endsWith(entry.name));
    assert.ok(enemyTitle(enemy, true).endsWith(enemy.name));
    assert.equal(kitEnemy(enemy, true), kitEnemy(enemy.name));
    assert.deepEqual(enemy, before);
  }
});

test("combined traits and pursuit choose a stable body and preserve the original traits", () => {
  const e = { ...getTowerGateEnemy(500, "normal", "defenseHeavy"), fast:true, ranged:true, armored:true, shielded:true, flying:true } as Enemy;
  assert.equal(rosterTrait(e), "flying");
  assert.equal(rosterTrait({...e, aggro:true}), "aggroed");
  assert.equal(rosterTrait({...e, flying:undefined}), "shielded");
  assert.equal(rosterTrait({...e, flying:undefined, shielded:undefined}), "armored");
  assert.equal(rosterTrait({...e, flying:undefined, shielded:undefined, armored:undefined}), "ranged");
  assert.ok(ROSTER_TRAITS.includes(rosterTrait(e)));
});

test("old Tower and Delve identities resolve, while scripted trial actors keep their identity", () => {
  for (const name of [...TOWER_ZONE_ENEMIES.flatMap(z=>z.map(e=>e.name)), ...DELVE_ENEMY_NAMES]) {
    assert.ok(rosterEntry({name, strength:"normal"}), name);
  }
  for(const name of ["Light Elemental", "Keymaster", "Mimic", "Arcane Spire"]) {
    assert.equal(rosterEntry({name, strength:"boss"}), undefined);
    assert.equal(enemyTitle({name}), name);
  }
});

test("Legacy Enemies defaults off and survives save round trips", () => {
  assert.equal(defaults().settings.legacyEnemies, false);
  for (const legacyEnemies of [false,true]) {
    const save = defaults(); save.settings.legacyEnemies = legacyEnemies;
    assert.equal(decode(JSON.stringify(save)).settings.legacyEnemies, legacyEnemies);
  }
});

test("all 126 individual sprites use the shared palette and exactly match their padded atlas", () => {
  const root = new URL("../public/assets/", import.meta.url);
  const m = JSON.parse(readFileSync(new URL("enemy-roster/atlas.json",root),"utf8"));
  const atlas = decodePng(readFileSync(new URL("enemy-roster/atlas.png",root)));
  const words = readFileSync(new URL("../assets/ui-sprites/palette.ppm",import.meta.url),"utf8").replace(/#[^\n]*/g,"").trim().split(/\s+/).slice(4).map(Number);
  const palette = new Set(Array.from({length:words.length/3},(_,i)=>words.slice(i*3,i*3+3).join(",")));
  const occupied = new Set<string>();
  for(const e of ENEMY_ROSTER) {
    const r = m.regions[e.id], p = decodePng(readFileSync(new URL(`style/${e.id}.png`,root)));
    assert.equal(p.width,24); assert.equal(p.height,24);
    let visible = 0;
    for(let y=0;y<24;y++)for(let x=0;x<24;x++) {
      const i=(y*24+x)*4,a=((r.y+y)*atlas.width+r.x+x)*4;
      assert.deepEqual(p.pixels.subarray(i,i+4),atlas.pixels.subarray(a,a+4),e.id);
      assert.ok(p.pixels[i+3]===0||p.pixels[i+3]===255,e.id);
      if(p.pixels[i+3]){visible++;assert.ok(palette.has([...p.pixels.subarray(i,i+3)].join(",")),e.id);}
      if(x===0||y===0||x===23||y===23)assert.equal(p.pixels[i+3],0,e.id);
    }
    assert.ok(visible>30,e.id);
    for(let y=r.y-2;y<r.y+26;y++)for(let x=r.x-2;x<r.x+26;x++) {
      const key=`${x},${y}`; assert.ok(!occupied.has(key),`overlap: ${e.id}`); occupied.add(key);
      if(x<r.x||y<r.y||x>=r.x+24||y>=r.y+24)assert.equal(atlas.pixels[(y*atlas.width+x)*4+3],0,e.id);
    }
  }
});
