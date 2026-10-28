// Serves the snapshot build (`vite build --mode snapshot`, in dist-snapshot/)
// with `vite preview` for the browser snapshot suites: built files, so
// nothing can reload a page partway through a run, on a free port, so no dev
// server is needed.
import { existsSync, readFileSync } from "node:fs";
import { preview } from "vite";
import { sourceStamp, STAMP_FILE } from "./snapshot-stamp.mjs";

/** Starts the preview server on the first free port from `port` (each suite
 * starts from its own, so suites run side by side never race for one);
 * `url` is its root and `close` stops it. */
export async function startPreview(port) {
  if (!existsSync("dist-snapshot/snapshot/render-scenes.js"))
    throw Error("No snapshot build: run `vite build --mode snapshot` first (the npm script does).");
  if (!existsSync(STAMP_FILE) || readFileSync(STAMP_FILE, "utf8") !== sourceStamp())
    throw Error("The snapshot build is stale (built from other source): rebuild with `vite build --mode snapshot`, or run the npm script, which does.");
  const server = await preview({ mode: "snapshot", logLevel: "warn", preview: { host: "127.0.0.1", port, strictPort: false } });
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

/** Waits for `promise`, but no longer than `ms`: shutting down must never
 * leave a run hanging. */
export const bounded = (promise, ms = 10000) =>
  Promise.race([Promise.resolve(promise).catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms).unref())]);
