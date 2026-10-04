import assert from "node:assert/strict";
import test from "node:test";
import { decode, defaults } from "../src/save.ts";
import { SETTINGS, settingValue, type Setting, type SettingKey } from "../src/settings.ts";

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
