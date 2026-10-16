import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyAmount, priceAmount } from "../src/ui/hud.ts";

test("gold prices read in full to 99,999, then shortened", () => {
  const cases: [number, string][] = [
    [0, "0"], [950.7, "950"], [12_345, "12,345"], [99_999, "99,999"],
    [100_000, "100K"], [123_456, "123K"], [999_999, "999K"],
    [1_000_000, "1M"], [4_567_890, "4.56M"], [45_678_901, "45.6M"], [2_500_000_000, "2.5B"],
    [12_345_000_000_000, "12.3T"], [1.5e15, "1.5q"], [2e18, "2Q"], [3e21, "3s"], [4e24, "4S"], [5e27, "5O"], [6e30, "6N"], [789e33, "789D"],
  ];
  for (const [gold, shown] of cases) assert.equal(priceAmount(gold), shown, `${gold}`);
});

test("run training's Silver prices shorten from 10,000", () => {
  const cases: [number, string][] = [[9_999, "9,999"], [10_000, "10K"], [12_345, "12.3K"], [123_456, "123K"], [4_567_890, "4.56M"]];
  for (const [silver, shown] of cases) assert.equal(priceAmount(silver, 10_000), shown, `${silver}`);
});

test("held currencies read in units up to decillions", () => {
  const cases: [number, string][] = [[999_999, "999,999"], [1_150_000, "1.15M"], [456.789e9, "456.78B"], [7e15, "7.00q"], [1.234e33, "1.23D"]];
  for (const [n, shown] of cases) assert.equal(currencyAmount(n), shown, `${n}`);
  assert.match(currencyAmount(1e36), /e\+36$/);
});
