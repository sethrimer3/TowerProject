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

test("every relative link in a gameplay page resolves", () => {
  for (const page of PAGES) {
    const base = new URL(`docs/gameplay/${page}`, ROOT), text = readFileSync(base, "utf8");
    for (const [, link] of text.matchAll(/\]\(([^)#:]+)(?:#[^)]*)?\)/g)) assert.ok(existsSync(new URL(link, base)), `${page} links to ${link}, which does not exist`);
  }
});

/** The other pages the README indexes: the project docs and the design notes. */
const OTHER = [
  ...readdirSync(new URL("docs/project/", ROOT)).filter((f) => f.endsWith(".md")).map((f) => `docs/project/${f}`),
  ...readdirSync(new URL("docs/", ROOT)).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`),
  ...readdirSync(new URL("docs/art/", ROOT)).filter((f) => f.endsWith(".md")).map((f) => `docs/art/${f}`),
];

test("the README indexes every project doc and design note", () => {
  const links = new Set([...README.matchAll(/\]\(([^)#:]+)\)/g)].map((m) => m[1]));
  for (const page of OTHER) assert.ok(links.has(page), `${page} is missing from the README's index`);
});

test("every relative link in the README and the project docs resolves", () => {
  const pages = ["README.md", ...OTHER.filter((p) => p.startsWith("docs/project/"))];
  for (const page of pages) {
    const base = new URL(page, ROOT), text = readFileSync(base, "utf8");
    for (const [, link] of text.matchAll(/\]\(([^)#:]+)(?:#[^)]*)?\)/g)) assert.ok(existsSync(new URL(link, base)), `${page} links to ${link}, which does not exist`);
  }
});

test("the README stays slim", () => {
  const size = Buffer.byteLength(README, "utf8");
  assert.ok(size <= MAX_README, `README.md is ${size} bytes (at most ${MAX_README}): move the detail into a page it indexes`);
});
