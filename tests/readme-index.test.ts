import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

// The README stays slim: the gameplay rules live in docs/gameplay/, one topic
// a page, and the README's Gameplay reference indexes every one of them.
const ROOT = new URL("../", import.meta.url);
const README = readFileSync(new URL("README.md", ROOT), "utf8");
const PAGES = readdirSync(new URL("docs/gameplay/", ROOT)).filter((f) => f.endsWith(".md"));
/** The most the README may weigh (bytes) before its detail belongs in a page. */
const MAX_README = 8000;
const indexed = [...README.matchAll(/\]\((docs\/gameplay\/[^)]+)\)/g)].map((m) => m[1]);

test("the README indexes every gameplay page", () => {
  for (const page of PAGES) assert.ok(indexed.includes(`docs/gameplay/${page}`), `docs/gameplay/${page} is missing from the README's Gameplay reference`);
});

test("every README link to a gameplay page resolves", () => {
  for (const link of indexed) assert.ok(existsSync(new URL(link, ROOT)), `${link} does not exist`);
});

test("the README stays slim", () => {
  const size = Buffer.byteLength(README, "utf8");
  assert.ok(size <= MAX_README, `README.md is ${size} bytes (at most ${MAX_README}): move the detail into a page in docs/gameplay/`);
});
