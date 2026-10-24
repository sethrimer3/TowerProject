import assert from "node:assert/strict";
import test from "node:test";
import { decode, defaults } from "../src/save/save.ts";
import { SETTINGS, settingValue, type Setting, type SettingKey } from "../src/save/settings.ts";

const rows = Object.entries(SETTINGS) as [SettingKey, Setting][];
const decoded = (settings: unknown) => decode(JSON.stringify({ version: 3, settings })).settings;

/** Values each setting's row allows, and ones a save could hold that it doesn't. */
function values(row: Setting): { good: unknown[]; bad: unknown[] } {
  switch (row.kind) {
    case "toggle": return { good: [true, false], bad: ["yes", 1, 0, null, {}] };
    case "choice": return { good: row.choices.map(([c]) => c), bad: [String(row.choices[0][0]) + "x", null, [], typeof row.default === "number" ? String(row.default) : 3] };
    case "range": return { good: [row.min, row.max, row.default], bad: ["50", NaN, Infinity, null] };
  }
}

test("every setting defaults to a value its own row allows", () => {
  const d = defaults().settings;
  assert.deepEqual(Object.keys(d), Object.keys(SETTINGS));
  for (const [key, row] of rows) assert.equal(settingValue(row, d[key]), d[key], key);
});

test("retired sprite switches are discarded without losing animation or door preferences", () => {
  for (const uiSprites of [false, true]) for (const spritesOff of [false, true]) {
    const s = decoded({ uiSprites, spritesOff, spriteAnimations: true, squareDoors: true });
    assert.equal("uiSprites" in s, false);
    assert.equal("spritesOff" in s, false);
    assert.equal(s.spriteAnimations, true);
    assert.equal(s.squareDoors, true);
  }
});

test("each setting keeps every value it allows and defaults the rest", () => {
  for (const [key, row] of rows) {
    const { good, bad } = values(row);
    for (const v of good) assert.equal(decoded({ [key]: v })[key], v, `${key} = ${JSON.stringify(v)}`);
    for (const v of bad) assert.equal(decoded({ [key]: v })[key], row.default, `${key} = ${String(v)}`);
  }
  assert.equal(decoded({ brightness: 7 }).brightness, 20);
  assert.equal(decoded({ brightness: 101.4 }).brightness, 100);
  assert.equal(decoded({ brightness: 52.6 }).brightness, 53);
});

test("settings on the page have their own control ids", () => {
  const ids = rows.flatMap(([, row]) => (row.page ? [row.page.id] : []));
  assert.equal(new Set(ids).size, ids.length);
});

test("no setting's control shares an id with the page shell's", async () => {
  // The shell's elements stay in the document while Settings shows, so a
  // shared id finds the other element (it once hid the cinematic Gem option).
  const { readFileSync } = await import("node:fs");
  const shell = readFileSync(new URL("../src/ui/shell.ts", import.meta.url), "utf8");
  const shellIds = new Set([...shell.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  assert.ok(shellIds.has("cinematic-gems"));
  for (const [key, row] of rows) {
    if (!("page" in row) || !row.page) continue;
    for (const id of [row.page.id, `${row.page.id}-value`]) assert.ok(!shellIds.has(id), `${key}: #${id}`);
  }
});

test("a save with a dev section setting on opens with Dev Mode on, which grants nothing", () => {
  assert.equal(decoded({}).devTools, false);
  assert.equal(decoded({ devMode: true }).devTools, true);
  assert.equal(decoded({ freePurchases: true }).devTools, true);
  assert.equal(decoded({ devTools: true }).devMode, false);
});
