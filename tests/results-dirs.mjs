// Where a browser golden suite (render, ui) writes what it captured, a
// folder for each run: test-results/<suite>-runs/<label>/. The label is the
// snapshot build's source stamp (tests/snapshot-stamp.mjs), or `RUN_LABEL`
// when set, so a run on unchanged code and a run with a change land side by
// side and neither overwrites the other; a second run of the same code
// reuses its folder. A run recorded with UPDATE_GOLDEN is the baseline the
// next runs compare against (`<suite>-baseline.txt` names its folder), and
// `<suite>-latest.txt` names the last run's. The newest `KEPT` runs are kept,
// and the baseline whatever its age. tests/compare-runs.mjs compares two runs.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sourceStamp } from "./snapshot-stamp.mjs";

const ROOT = "test-results";
/** How many runs of a suite are kept, the baseline aside. */
const KEPT = 6;

const runsDir = (suite) => join(ROOT, `${suite}-runs`);
const pointer = (suite, which) => join(ROOT, `${suite}-${which}.txt`);
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8").trim() : null);

/** The folder run `label` of `suite` wrote, or null; `label` may also be
 * `baseline` or `latest`, the folders those pointers name. */
export function runDir(suite, label) {
  const dir = label === "baseline" || label === "latest" ? read(pointer(suite, label)) : join(runsDir(suite), label);
  return dir && existsSync(dir) ? dir : null;
}

/** This run's folder for `suite` and the baseline it compares against
 * (null before any was recorded). A full run (`partial` false) starts its
 * folder empty, and a full recording (`update`) makes it the baseline; a
 * partial run (ONLY=) adds to its folder, and a partial recording writes its
 * keys into the baseline there is (or makes this run the baseline, without one). */
export function resultsDirs(suite, { update, partial }) {
  const label = (process.env.RUN_LABEL || sourceStamp()).replace(/[^\w.-]/g, "_");
  const out = join(runsDir(suite), label);
  // A full run starts empty, but never wipes the baseline it would compare against.
  if (!partial && (update || runDir(suite, "baseline") !== out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(pointer(suite, "latest"), out);
  if (update && (!partial || !runDir(suite, "baseline"))) writeFileSync(pointer(suite, "baseline"), out);
  prune(suite);
  const baseline = runDir(suite, "baseline");
  return { out, baseline: update ? baseline ?? out : baseline };
}

/** Removes all but the newest `KEPT` runs of `suite`, never the baseline. */
function prune(suite) {
  const keep = new Set([read(pointer(suite, "baseline")), read(pointer(suite, "latest"))]);
  const runs = readdirSync(runsDir(suite)).map((name) => join(runsDir(suite), name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const dir of runs.slice(KEPT)) if (!keep.has(dir)) rmSync(dir, { recursive: true, force: true });
}
