// Compares two runs of a browser golden suite file by file
// (tests/results-dirs.mjs): `node tests/compare-runs.mjs <suite> [a] [b]`,
// each run a label (a source stamp or RUN_LABEL), `baseline` or `latest`,
// by default the baseline against the latest run. Lists the keys whose
// output differs and those only one run has; exits 1 when any differ.
// The render suite keeps only the frames that changed (all when recording),
// so compare render runs against a recorded baseline.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { runDir } from "./results-dirs.mjs";

const [suite, a = "baseline", b = "latest"] = process.argv.slice(2);
if (suite !== "ui" && suite !== "render") {
  console.error("Usage: node tests/compare-runs.mjs <ui|render> [run a] [run b]");
  process.exit(2);
}
const dirA = runDir(suite, a), dirB = runDir(suite, b);
for (const [label, dir] of [[a, dirA], [b, dirB]]) if (!dir) {
  console.error(`No ${suite} run "${label}" in test-results/${suite}-runs/.`);
  process.exit(2);
}
if (dirA === dirB) console.warn(`"${a}" and "${b}" are the same run (${dirA}).`);

const files = (dir) => new Set(existsSync(dir) ? readdirSync(dir) : []);
const inA = files(dirA), inB = files(dirB);
const key = (file) => file.replace(/\.(html|png)$/, "");
const changed = [...inA].filter((f) => inB.has(f) && !readFileSync(`${dirA}/${f}`).equals(readFileSync(`${dirB}/${f}`))).map(key);
const onlyA = [...inA].filter((f) => !inB.has(f)).map(key), onlyB = [...inB].filter((f) => !inA.has(f)).map(key);

console.log(`${suite}: ${dirA} vs ${dirB}`);
for (const [title, list] of [["differ", changed], [`only in ${a}`, onlyA], [`only in ${b}`, onlyB]])
  if (list.length) console.log(`${list.length} ${title}:\n  ${list.sort().join("\n  ")}`);
if (!changed.length) console.log(`No output differs between the ${[...inA].filter((f) => inB.has(f)).length} keys both have.`);
process.exit(changed.length ? 1 : 0);
