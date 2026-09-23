import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { enemySpriteId, enemySpriteUrl } from "../src/enemy-sprites.ts";
import { TOWER_ZONE_ENEMIES } from "../src/scaling.ts";

test("every Tower enemy has one distinct deployable sprite", () => {
  const names = TOWER_ZONE_ENEMIES.flatMap((zone) => zone.map((enemy) => enemy.name));
  const ids = names.map(enemySpriteId);
  assert.equal(names.length, 30);
  assert.equal(new Set(ids).size, names.length);
  for (const name of names) {
    assert.match(enemySpriteUrl(name), /^\/assets\/enemies\/[a-z0-9-]+\.png$/);
    const path = fileURLToPath(new URL(`../public/assets/enemies/${enemySpriteId(name)}.png`, import.meta.url));
    assert.ok(existsSync(path), `missing sprite for ${name}`);
  }
});
