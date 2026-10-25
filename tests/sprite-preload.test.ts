import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { SPRITE_ASSETS } from "../src/sprites/assets.ts";

test("startup covers every deployed sprite, control frame, theme preview", () => {
  const found: string[] = [];
  function scan(path: string) {
    for (const e of readdirSync(new URL(`../public/${path}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) scan(`${path}/${e.name}`);
      else if (/\.(png|svg|webp|jpe?g|gif)$/i.test(e.name)) found.push(`${path}/${e.name}`);
    }
  }
  for (const dir of ["assets/style", "assets/ui/frames", "assets/themes"]) scan(dir);
  assert.deepEqual([...SPRITE_ASSETS], found.sort(), "regenerate with npm run sprites:manifest after adding art");
  for (const path of SPRITE_ASSETS) {
    assert.ok(!/assets\/(cards|enemies|materials|sprites|tilesets)\//.test(path), path);
    if (!path.endsWith(".png")) continue;
    const png = readFileSync(new URL(`../public/${path}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", path);
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, path);
  }
});
