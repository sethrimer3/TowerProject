import { writeFileSync } from "node:fs";
import { defineConfig } from "vite";
import { sourceStamp, STAMP_FILE } from "./tests/snapshot-stamp.mjs";

// `--mode snapshot` builds what the browser snapshot suites (test:render,
// test:ui) run against through `vite preview`: the app as deployed, but
// served from the root so its asset URLs match the dev server's, plus the
// modules the suites import in the page, at fixed names under /snapshot/,
// and the source stamp the suites check the build against.
export default defineConfig(({ mode }) =>
  mode === "snapshot"
    ? {
        base: "/",
        plugins: [{ name: "source-stamp", closeBundle: () => writeFileSync(STAMP_FILE, sourceStamp()) }],
        build: {
          outDir: "dist-snapshot",
          emptyOutDir: true,
          rollupOptions: {
            input: { index: "index.html", "render-scenes": "tests/render-scenes.ts", save: "src/save/save.ts", state: "src/state.ts" },
            preserveEntrySignatures: "exports-only",
            output: { entryFileNames: (chunk) => (chunk.name === "index" ? "assets/[name]-[hash].js" : "snapshot/[name].js") },
          },
        },
      }
    : { base: "./", server: { port: Number(process.env.PORT) || 5173 } },
);
