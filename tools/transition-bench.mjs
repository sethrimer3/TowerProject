// Times the board transitions (a Tower climb, the Delve's walk up through
// new chunks and areas, going in from the forest) in a real browser with the
// CPU slowed down like a phone's: how long the game's own step takes, the
// first frame drawn after it, and the frames after that catching up on
// rationed work (decor planning, torch light): the next nine after a climb
// or going in, the next three after each of the Delve's steps.
// Not a test: numbers vary by machine, so compare runs on one machine.
//
//   node tools/transition-bench.mjs                 # 4x CPU slowdown
//   THROTTLE=1 node tools/transition-bench.mjs      # full speed
//   CLIMBS=60 node tools/transition-bench.mjs       # more samples
//   ONLY=tower node tools/transition-bench.mjs      # one scenario (tower, delve, forest)
//   PROFILE=1 node tools/transition-bench.mjs       # also list where each scenario's time went
//
// It starts its own Vite server (from this checkout) and runs in Edge
// (PLAYWRIGHT_CHANNEL=chrome otherwise).
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const throttle = Number(process.env.THROTTLE ?? 4);
const climbs = Number(process.env.CLIMBS ?? 40);
const only = process.env.ONLY?.split(",");
const server = await createServer({ server: { host: "127.0.0.1", port: 5197, strictPort: false }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  // A bare page beside the app, so the game's own frame loop isn't running too.
  const root = server.resolvedUrls.local[0];
  await page.route("**/__bench.html", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><canvas id="c" style="width:390px;height:390px;display:block"></canvas></body>` }));
  await page.goto(`${root}__bench.html`);
  await page.evaluate(async () => {
    const { preloadSprites } = await import("/src/sprites/preload.ts");
    await preloadSprites(() => {});
    const { Game } = await import("/src/state.ts");
    const { defaults } = await import("/src/save/save.ts");
    const { Renderer } = await import("/src/render/rendering.ts");
    const canvas = document.getElementById("c");
    let now = 1000;
    const timed = (f) => { const a = performance.now(); f(); return performance.now() - a; };
    /** Draws one frame a 60 Hz frame later than the last. */
    const frame = (r) => timed(() => r.draw((now += 1000 / 60)));
    /** The first frame after a transition, and the next `more` summed. */
    const after = (r, more = 9) => { const first = frame(r); let rest = 0; for (let i = 0; i < more; i++) rest += frame(r); return { first, rest }; };
    const steadyOf = (r, out) => { for (let i = 0; i < 5; i++) out.push(frame(r)); };
    const sample = () => ({ logic: [], first: [], rest: [], steady: [] });
    window.scenarios = {
      // A Tower climb: the stairs taken, then the new floor drawn.
      tower(climbs) {
        const out = sample(), g = new Game(defaults());
        g.newRun({ seed: 12345 });
        const r = new Renderer(canvas, g);
        for (let i = 0; i < 20; i++) frame(r);
        for (let i = 0; i < climbs + 5; i++) {
          const steady = [];
          steadyOf(r, steady);
          const logic = timed(() => g.advanceTowerRoom());
          const { first, rest } = after(r);
          if (i < 5) continue; // warming up
          out.logic.push(logic); out.first.push(first); out.rest.push(rest); out.steady.push(...steady);
        }
        return out;
      },
      // The Delve: the hero walked up one row a step, the world kept two
      // chunks ahead as a real step keeps it; areas are generated on the way.
      delve(climbs) {
        const out = sample(), save = defaults();
        save.upgrades.breakthrough = 1;
        const g = new Game(save);
        g.switchMode("delve");
        g.newRun({ seed: 12345 });
        const r = new Renderer(canvas, g);
        for (let i = 0; i < 20; i++) frame(r);
        const p = g.run.player, world = g.world, start = p.y;
        for (let y = start + 1; y < start + 25 * climbs; y++) {
          let x = -1;
          for (let dx = 0; dx < world.width && x < 0; dx++) if (world.tile(dx, y).kind !== "wall") x = dx;
          if (x < 0) continue;
          const logic = timed(() => { p.x = x; p.y = y; world.maintain(y); });
          const { first, rest } = after(r, 3);
          out.logic.push(logic); out.first.push(first); out.rest.push(rest);
          if (y % 25 === 0) steadyOf(r, out.steady);
        }
        return out;
      },
      // Going in from the forest: Enter pressed, then the first floor drawn.
      forest(climbs) {
        const out = sample();
        for (let i = 0; i < Math.max(8, climbs / 4) + 2; i++) {
          const g = new Game(defaults());
          g.newRun({ outside: true, seed: 500 + i });
          const r = new Renderer(canvas, g);
          for (let k = 0; k < 20; k++) frame(r);
          const steady = [];
          steadyOf(r, steady);
          const logic = timed(() => g.enterRun());
          const { first, rest } = after(r);
          if (i < 2) continue;
          out.logic.push(logic); out.first.push(first); out.rest.push(rest); out.steady.push(...steady);
        }
        return out;
      },
    };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  if (process.env.PROFILE) await cdp.send("Profiler.enable"), await cdp.send("Profiler.setSamplingInterval", { interval: 200 });

  const fmt = (xs) => {
    if (!xs.length) return "—";
    const s = [...xs].sort((a, b) => a - b), at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
    return `${at(0.5).toFixed(1)} / ${at(0.9).toFixed(1)} / ${s[s.length - 1].toFixed(1)}`;
  };
  const rows = [["", "step logic", "first frame", "next frames (sum)", "steady frame"]];
  const profiles = [];
  let delveWorst = "";
  for (const name of ["tower", "delve", "forest"]) {
    if (only && !only.includes(name)) continue;
    if (process.env.PROFILE) await cdp.send("Profiler.start");
    const r = await page.evaluate(([name, climbs]) => window.scenarios[name](climbs), [name, climbs]);
    if (process.env.PROFILE) profiles.push([name, (await cdp.send("Profiler.stop")).profile]);
    rows.push([`${name} (${r.logic.length})`, fmt(r.logic), fmt(r.first), fmt(r.rest), fmt(r.steady)]);
    if (name === "delve")
      delveWorst = r.logic.map((v, i) => ({ v, f: r.first[i] })).sort((a, b) => b.v + b.f - a.v - a.f).slice(0, 5)
        .map((w) => `${w.v.toFixed(1)}+${w.f.toFixed(1)}`).join(", ");
  }
  console.log(`CPU slowdown ${throttle}x · ms as median / p90 / max\n`);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join("  "));
  if (delveWorst) console.log(`\ndelve's 5 slowest steps (logic + first frame): ${delveWorst}`);

  // Each scenario's self time by function, and the time spent inside each
  // function (inclusive), from the CPU profile.
  for (const [name, profile] of profiles) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const label = (n) => {
      const f = n.callFrame, file = f.url.replace(/^.*\/src\//, "").replace(/\?.*$/, "");
      return `${f.functionName || "(anonymous)"} ${file ? `${file}:${f.lineNumber + 1}` : ""}`;
    };
    const self = new Map(), total = new Map(), dt = profile.timeDeltas;
    let all = 0;
    profile.samples.forEach((id, i) => {
      const ms = (dt[i + 1] ?? 0) / 1000;
      all += ms;
      const l = label(byId.get(id));
      self.set(l, (self.get(l) ?? 0) + ms);
      const seen = new Set();
      for (let at = id; at !== undefined; at = parent.get(at)) {
        const up = label(byId.get(at));
        if (!seen.has(up)) seen.add(up), total.set(up, (total.get(up) ?? 0) + ms);
      }
    });
    const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([l, ms]) => `  ${(ms / all * 100).toFixed(1).padStart(5)}%  ${l}`).join("\n");
    console.log(`\n${name}: self time\n${top(self, 15)}\n${name}: inclusive time\n${top(total, 35)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
