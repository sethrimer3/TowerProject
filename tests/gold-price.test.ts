import { test } from "node:test";
import assert from "node:assert/strict";
import { goldPrice } from "../src/ui/hud.ts";

test("gold prices read in full to 99,999, then shortened", () => {
  const cases: [number, string][] = [
    [0, "0"], [950.7, "950"], [12_345, "12,345"], [99_999, "99,999"],
    [100_000, "100K"], [123_456, "123K"], [999_999, "999K"],
    [1_000_000, "1M"], [4_567_890, "4.56M"], [45_678_901, "45.6M"], [2_500_000_000, "2.5B"],
  ];
  for (const [gold, shown] of cases) assert.equal(goldPrice(gold), shown, `${gold}`);
});
