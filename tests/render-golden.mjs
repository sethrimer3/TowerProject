// Characterization screenshots for the board renderer. The fixed scenes of
// tests/render-scenes.ts (Tower, dim Tower, Delve, outside,
// reduced motion, and decor: a crate stepped on, a pool waded into, tall grass
// walked through) are drawn at fixed timestamps with seeded randomness, and each canvas's pixels are hashed
// against tests/fixtures/render.golden.json. A scene is only hashed once every
// image the app asked for has loaded and a capture asks for no more, and then
// it must draw the same twice. Canvases are kept on the CPU (Chrome would
// otherwise move them there partway through, after enough pixel reads), so
// runs agree exactly; pixels can still differ between browsers and machines,
// so regenerate it with UPDATE_GOLDEN=1 on the code *before* a refactor, then
// run without it after. Baseline PNGs go to test-results/render-golden/ and
// current ones to test-results/render/, with a pixel-difference count for any
// mismatch. It runs against the snapshot build through `vite preview`
// (tests/snapshot-preview.mjs; `npm run test:render` builds it first).
// ONLY=<key prefixes> (or ONLY=failed) draws only the scenes that can make a
// matching frame and compares or records only those (tests/golden-filter.mjs).
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { bounded, startPreview } from "./snapshot-preview.mjs";
import { fixClock } from "./fixed-clock.mjs";
import { goldenFilter, NOTHING_MATCHED } from "./golden-filter.mjs";

const UPDATE = process.env.UPDATE_GOLDEN === "1";
const GOLDEN = new URL("./fixtures/render.golden.json", import.meta.url);
const BASELINE_DIR = "test-results/render-golden";
const OUT_DIR = "test-results/render";
const filter = goldenFilter("render");

const server = await startPreview(4180);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
let exitCode = 1;
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 1 });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Every image the app asks for, so a capture can wait until all of them have
  // loaded (or failed) instead of guessing how long loading takes.
  await page.addInitScript(() => {
    // The app's random streams' start-up seeds, pinned by name (as in
    // tests/ui-golden.mjs), so they never depend on which module drew first.
    globalThis.__pinnedSeeds = { game: 3513001552 };
    const Real = window.Image, images = (window.__images = []);
    window.Image = function Image(...args) {
      const img = new Real(...args);
      images.push(img);
      return img;
    };
    window.Image.prototype = Real.prototype;
    // Chrome moves a canvas from the GPU to the CPU after enough pixel reads,
    // and the two draw gradients and blends a little differently, so frames
    // would change partway through a run. Keep every canvas on the CPU from
    // the start: the same pixels every run, and less tied to the GPU.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      return getContext.call(this, type, type === "2d" ? { ...options, willReadFrequently: true } : options);
    };
  });
  await page.goto(server.url);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('16px "Tower Pixel"');
  });

  // The recorded hashes, so the page encodes PNGs and redraws scenes only
  // where they are needed; none when recording.
  const golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, "utf8")) : null;
  const recorded = UPDATE ? null : golden;
  const drawn = await page.evaluate(async ([recorded, prefixes]) => {
    const { JOBS } = await import("/snapshot/render-scenes.js");

    const board = document.createElement("canvas");
    board.style.cssText = "position:fixed;left:0;top:0;width:408px;height:408px";
    document.body.append(board);
    const pixelsOf = (cv) => ({ pixels: cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.slice(), width: cv.width, height: cv.height });
    /** A captured frame as a PNG, made only for a frame someone will look at. */
    const encode = ({ pixels, width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
      return c.toDataURL("image/png");
    };
    /** One job's frames: its pixels at each grab. */
    const capture = (job) => {
      const cv = board;
      const out = {};
      job.play(cv, (frame) => (out[frame] = pixelsOf(cv)));
      return out;
    };
    const hash = async (pixels) => {
      const digest = await crypto.subtle.digest("SHA-256", pixels);
      return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    };

    /** Waits until every image asked for so far has loaded or failed. */
    const settle = async () => {
      for (let pending; (pending = window.__images.filter((img) => !img.complete)).length; )
        await Promise.all(pending.map((img) => img.decode().catch(() => {})));
    };
    const hashShot = async (shot) => {
      const hashes = {};
      for (const [frame, { pixels }] of Object.entries(shot)) hashes[frame] = await hash(pixels);
      return hashes;
    };

    const results = {};
    for (const job of JOBS) {
      const { name } = job, run = () => capture(job);
      // A filtered run skips scenes none of whose frames it asked for.
      if (prefixes && !prefixes.some((p) => name.startsWith(p) || p.startsWith(name))) continue;
      // Art loads asynchronously, and a scene may only ask for some of it
      // partway through. A capture counts once every image was settled before
      // it began and it asked for no new ones: then all its art was drawn.
      let shot = null;
      for (let attempt = 0; attempt < 10 && !shot; attempt++) {
        await settle();
        const asked = window.__images.length, candidate = run();
        if (window.__images.length === asked) shot = candidate;
      }
      if (!shot) throw Error(`${name}: kept asking for new art`);
      const hashes = await hashShot(shot);
      const frames = Object.keys(hashes);
      const changed = recorded ? frames.filter((frame) => recorded[`${name}.${frame}`] !== hashes[frame]) : frames;
      // With its art in place a scene draws the same every time. Recording
      // checks that for every scene; otherwise a scene is drawn again only
      // when it no longer matches, to tell a nondeterminism bug (not loading)
      // from a real change.
      if (changed.length) {
        const again = await hashShot(run());
        const drift = frames.filter((frame) => hashes[frame] !== again[frame]);
        if (drift.length) throw Error(`${name}: drew differently twice with all art loaded (${drift.join(", ")})`);
      }
      for (const frame of frames)
        results[`${name}.${frame}`] = { hash: hashes[frame], png: changed.includes(frame) ? encode(shot[frame]) : null };
    }
    board.remove();
    return results;
  }, [recorded, filter.prefixes]);
  const shots = filter.pick(drawn);

  const png = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
  const hashes = Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.hash]));
  // Only the frames that changed (every frame when recording) come back as
  // PNGs; clear the old ones so what is here is this run's.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [k, v] of Object.entries(shots)) if (v.png) writeFileSync(`${OUT_DIR}/${k}.png`, png(v.png));

  if (filter.active && !filter.checked(golden ?? {}, hashes).length) {
    console.error(`No render frames${filter.describe}.`);
    exitCode = NOTHING_MATCHED;
  } else if (!recorded) {
    mkdirSync(BASELINE_DIR, { recursive: true });
    for (const [k, v] of Object.entries(shots)) writeFileSync(`${BASELINE_DIR}/${k}.png`, png(v.png));
    writeFileSync(GOLDEN, JSON.stringify(filter.merge(golden ?? {}, hashes), null, 2) + "\n");
    filter.recordFailures(Object.keys(hashes), []);
    console.log(`Wrote ${Object.keys(hashes).length} render hashes${filter.describe} to the golden file.`);
  } else {
    const checked = filter.checked(golden, hashes);
    const changed = checked.filter((k) => golden[k] !== hashes[k]);
    filter.recordFailures(checked, changed);
    for (const k of changed) {
      const base = `${BASELINE_DIR}/${k}.png`;
      let detail = "no local baseline PNG to compare";
      if (existsSync(base) && shots[k]) {
        const diff = await page.evaluate(async ([a, b]) => {
          const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };
          const [x, y] = await Promise.all([load(a), load(b)]);
          const read = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
          const p = read(x), q = read(y);
          if (p.length !== q.length) return "different sizes";
          let n = 0, max = 0;
          for (let i = 0; i < p.length; i += 4) {
            const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]), Math.abs(p[i + 3] - q[i + 3]));
            if (d) { n++; max = Math.max(max, d); }
          }
          return `${n} pixels differ (max channel delta ${max})`;
        }, [`data:image/png;base64,${readFileSync(base).toString("base64")}`, shots[k].png]);
        detail = diff;
      }
      console.error(`${k}: ${golden[k] ?? "missing"} -> ${hashes[k] ?? "missing"} (${detail})`);
    }
    if (changed.length) {
      throw Error(`${changed.length} render frames changed; see ${OUT_DIR}/ vs ${BASELINE_DIR}/`);
    }
    console.log(`All ${Object.keys(hashes).length} render frames${filter.describe} match the golden hashes (${createHash("sha256").update(JSON.stringify(hashes)).digest("hex").slice(0, 8)}).`);
  }
  if (errors.length) throw Error(errors.join("\n"));
  if (exitCode !== NOTHING_MATCHED) exitCode = 0;
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  // Always shut down, so a run never hangs waiting on the browser or server.
  await bounded(browser.close());
  await bounded(server.close());
}
process.exit(exitCode);
