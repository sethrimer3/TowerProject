// Runs both browser snapshot suites (tests/render-golden.mjs and
// tests/ui-golden.mjs) side by side on the snapshot build, which
// `npm run test:snapshots` makes once first. Each suite serves the build
// itself on its own port, so they share nothing but the files they read.
// Every output line is tagged with its suite; the run fails if either does.
// UPDATE_GOLDEN, ONLY and the other environment variables pass through; a
// suite with nothing matching ONLY is skipped, and the run fails only if
// neither had any (tests/golden-filter.mjs).
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { NOTHING_MATCHED } from "./golden-filter.mjs";

const SUITES = { render: "tests/render-golden.mjs", ui: "tests/ui-golden.mjs" };

/** Runs one suite, tagging its output, and settles with its exit code and time. */
function run(name, script) {
  const start = Date.now();
  const child = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "pipe"] });
  for (const [from, to] of [[child.stdout, process.stdout], [child.stderr, process.stderr]])
    createInterface({ input: from }).on("line", (line) => to.write(`[${name}] ${line}\n`));
  return new Promise((resolve) => {
    child.on("error", (error) => resolve({ name, code: 1, seconds: 0, error }));
    child.on("close", (code) => resolve({ name, code: code ?? 1, seconds: (Date.now() - start) / 1000 }));
  });
}

const start = Date.now();
const results = await Promise.all(Object.entries(SUITES).map(([name, script]) => run(name, script)));
for (const r of results)
  console.log(`${r.name}: ${r.code === 0 ? "passed" : r.code === NOTHING_MATCHED ? "skipped (nothing matched ONLY)" : `failed (exit ${r.code})`} in ${r.seconds.toFixed(0)}s${r.error ? ` (${r.error.message})` : ""}`);
console.log(`Both suites ran in ${((Date.now() - start) / 1000).toFixed(0)}s.`);
const ran = results.filter((r) => r.code !== NOTHING_MATCHED);
process.exit(ran.length && ran.every((r) => r.code === 0) ? 0 : 1);
