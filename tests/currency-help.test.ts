import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyHelp } from "../src/ui/currency-help.ts";
import { defaults } from "../src/save/save.ts";

test("the currency help tells the slower rates only once the player has climbed past them", () => {
  const save = defaults();
  const lines = (tree: "inspiration" | "breakthrough") => currencyHelp(save, tree).body;
  assert.doesNotMatch(lines("inspiration"), /Past floor/);
  assert.match(lines("inspiration"), /earn its floors' Inspiration again/);
  save.tower.tierRecords["2"] = { best: 100, reached: 100 };
  assert.match(lines("inspiration"), /Past floor 100, a point takes 10 new floors/);
  assert.doesNotMatch(lines("inspiration"), /Past floor 1,000/);
  save.tower.best = 1000;
  assert.match(lines("inspiration"), /Past floor 1,000, a point takes 100 new floors, up to floor 10,000/);
});

test("the Breakthrough help says a point comes from each Tower Goal claimed, and none from premium rewards", () => {
  const help = currencyHelp(defaults(), "breakthrough");
  assert.equal(help.title, "Earning Breakthrough");
  assert.match(help.body, /Claim a Tower Goal to earn a Breakthrough point/);
  assert.match(help.body, /Premium rewards pay no Breakthrough points/);
  assert.doesNotMatch(help.body, /depth/i);
});
