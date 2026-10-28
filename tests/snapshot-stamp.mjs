// The snapshot build's source stamp: a hash of everything `vite build --mode
// snapshot` builds from. The build writes it beside its files, and
// `startPreview` refuses a build whose stamp no longer matches the source, so
// a browser golden can never check (or, with UPDATE_GOLDEN, record) a build
// left over from other code, such as one made with a change set aside.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const STAMP_FILE = "dist-snapshot/source-stamp.txt";

/** The source the build reads: the app, its art, the page, the config, and
 * the test modules the build bundles (`tests/*.ts`; not the goldens). */
const SOURCES = ["src", "assets", "public", "index.html", "vite.config.ts", "tests"];
const included = (path) => !path.startsWith("tests") || (path.endsWith(".ts") && !path.includes("fixtures"));

function files(path) {
  if (!statSync(path, { throwIfNoEntry: false })) return [];
  if (!statSync(path).isDirectory()) return included(path) ? [path] : [];
  return readdirSync(path).sort().flatMap((name) => files(join(path, name)));
}

/** The hash of the source as it is now. */
export function sourceStamp() {
  const hash = createHash("sha256");
  for (const file of SOURCES.flatMap(files)) hash.update(file.replaceAll("\\", "/")).update("\0").update(readFileSync(file)).update("\0");
  return hash.digest("hex").slice(0, 16);
}
