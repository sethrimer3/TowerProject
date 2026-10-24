// Runs part of a browser snapshot suite (tests/render-golden.mjs,
// tests/ui-golden.mjs): ONLY is a comma-separated list of key prefixes
// (`ONLY=rich.goals,floor.`), or `failed` for the keys that failed when the
// suite last compared. A suite runs only the scenes or sections that can
// make a matching key, compares only matching keys, and with UPDATE_GOLDEN=1
// records only those into the golden file, leaving every other hash as it
// was. Each run keeps test-results/<suite>-failed.json current: the keys it
// checked come off the list and the ones that failed go on, so
// `ONLY=failed` reruns what is still failing until the list is empty.
// A suite whose prefixes match nothing exits with NOTHING_MATCHED, which
// tests/snapshot-suites.mjs reads as "not this suite's keys"; one with no
// failures left to rerun passes.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export const NOTHING_MATCHED = 2;

/** Whether a key prefix and a scene's or section's own prefix can meet: one
 * names a key under the other. */
export const overlaps = (prefix, own) => own.startsWith(prefix) || prefix.startsWith(own);

/** The suite's filter from ONLY; passes at once when `ONLY=failed` finds
 * no failures recorded. */
export function goldenFilter(suite) {
  const failedFile = `test-results/${suite}-failed.json`;
  const readFailed = () => (existsSync(failedFile) ? JSON.parse(readFileSync(failedFile, "utf8")) : []);
  const only = (process.env.ONLY ?? "").trim();
  let prefixes = null;
  if (only === "failed") {
    prefixes = readFailed();
    if (!prefixes.length) {
      console.log(`No ${suite} failures recorded in ${failedFile}; nothing to rerun.`);
      process.exit(0);
    }
  } else if (only) prefixes = only.split(",").map((p) => p.trim()).filter(Boolean);
  const matches = (key) => !prefixes || prefixes.some((p) => key.startsWith(p));
  const pick = (record) => Object.fromEntries(Object.entries(record).filter(([k]) => matches(k)));
  return {
    prefixes,
    active: !!prefixes,
    describe: prefixes ? ` matching ONLY=${only === "failed" ? `failed (${prefixes.length} keys)` : only}` : "",
    matches,
    /** Whether a scene or section whose keys all start with one of `owns` may
     * make a matching key. */
    wants: (...owns) => !prefixes || prefixes.some((p) => owns.some((own) => overlaps(p, own))),
    /** The matching entries of a record. */
    pick,
    /** The golden's keys this run is answerable for: the matching ones it
     * holds and the matching ones the run made. */
    checked: (golden, hashes) => Object.keys({ ...pick(golden), ...pick(hashes) }),
    /** The golden with this run's matching keys recorded: matching keys keep
     * their place, ones the run no longer makes go, new ones go at the end. */
    merge(golden, hashes) {
      if (!prefixes) return hashes;
      const out = {};
      for (const [k, v] of Object.entries(golden)) if (!matches(k)) out[k] = v;
      else if (k in hashes) out[k] = hashes[k];
      for (const [k, v] of Object.entries(hashes)) if (!(k in out)) out[k] = v;
      return out;
    },
    /** Takes the checked keys off the failure list and puts the failed ones on. */
    recordFailures(checked, failed) {
      const done = new Set(checked);
      const next = [...new Set([...(prefixes ? readFailed().filter((k) => !done.has(k)) : []), ...failed])];
      mkdirSync("test-results", { recursive: true });
      if (next.length) writeFileSync(failedFile, JSON.stringify(next, null, 2) + "\n");
      else rmSync(failedFile, { force: true });
      return next;
    },
  };
}
