import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVLOG, DEVLOG_TEXT_MAX } from "../src/devlog.ts";
import { devlogDay, devlogDays } from "../src/ui/devlog-dialog.ts";

// The DEVLOG lists every change, newest first, one short line each: AGENTS.md
// has each change add its line at the top.

test("every devlog entry has a real day and one short line", () => {
  assert.ok(DEVLOG.length > 0);
  for (const { date, text } of DEVLOG) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${date} is not YYYY-MM-DD`);
    assert.equal(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), date, `${date} is not a real day`);
    assert.ok(text.trim().length > 0, `the entry on ${date} has no text`);
    assert.ok(text.length <= DEVLOG_TEXT_MAX, `"${text}" runs ${text.length} characters (at most ${DEVLOG_TEXT_MAX})`);
    assert.ok(!text.includes("\n"), `"${text}" is more than one line`);
    // The dialog writes the text as HTML.
    assert.ok(!/[<>&]/.test(text), `"${text}" holds <, > or &`);
  }
});

test("the devlog lists the newest change first", () => {
  for (let i = 1; i < DEVLOG.length; i++)
    assert.ok(DEVLOG[i - 1].date >= DEVLOG[i].date, `${DEVLOG[i].date} ("${DEVLOG[i].text}") comes after the older ${DEVLOG[i - 1].date}`);
});

test("the devlog dialog groups the lines by day and names each day", () => {
  const days = devlogDays([
    { date: "2026-11-19", text: "A." },
    { date: "2026-11-19", text: "B." },
    { date: "2026-10-01", text: "C." },
  ]);
  assert.deepEqual(days, [{ date: "2026-11-19", texts: ["A.", "B."] }, { date: "2026-10-01", texts: ["C."] }]);
  assert.equal(devlogDay("2026-11-19"), "Nov 19<small>2026</small>");
  assert.equal(devlogDay("2027-01-05"), "Jan 5<small>2027</small>");
});
