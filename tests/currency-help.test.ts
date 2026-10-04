import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyHelp } from "../src/ui/currency-help.ts";
import { defaults } from "../src/save.ts";

test("the currency help tells the slower rates only once the player has climbed past them", () => {
  const save = defaults();
  const lines = (tree: "inspiration" | "courage") => currencyHelp(save, tree).body;
  assert.doesNotMatch(lines("inspiration"), /Past floor/);
  assert.match(lines("inspiration"), /\+10 more/);
  save.tower.tierRecords["2"] = { best: 100, reached: 100 };
  assert.match(lines("inspiration"), /Past floor 100, a point takes 10 new floors/);
  assert.doesNotMatch(lines("inspiration"), /Past floor 1,000/);
  save.tower.best = 1000;
  assert.match(lines("inspiration"), /Past floor 1,000, a point takes 100 new floors, up to floor 10,000/);
  // The Delve counts ten depth as a floor.
  save.delve.best = 999;
  assert.doesNotMatch(lines("courage"), /Past depth/);
  save.delve.best = 1000;
  assert.match(lines("courage"), /Past depth 1,000, a point takes 100 new depth/);
});
