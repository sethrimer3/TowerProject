// Characterization snapshots for the DOM built in src/main.ts (pages, HUD,
// inspect panel, dialogs). Fixed saves are loaded with seeded randomness,
// a scripted walk clicks through every page, subtab, tooltip and dialog, and
// after each step the normalized `#app` HTML is hashed against
// tests/fixtures/ui.golden.json. Regenerate with UPDATE_GOLDEN=1 on the code
// *before* a UI refactor, then run without it after. Baseline HTML goes to
// test-results/ui-golden/ and current HTML to test-results/ui/, and the first
// differing line is printed for any mismatch. It runs against the snapshot
// build through `vite preview` (tests/snapshot-preview.mjs; `npm run test:ui`
// builds it first).
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { bounded, startPreview } from "./snapshot-preview.mjs";

const UPDATE = process.env.UPDATE_GOLDEN === "1";
const GOLDEN = new URL("./fixtures/ui.golden.json", import.meta.url);
const BASELINE_DIR = "test-results/ui-golden";
const OUT_DIR = "test-results/ui";
const server = await startPreview(4190);
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
let exitCode = 1;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Seeded randomness from the first script on, and the fixture save (if any).
  await page.addInitScript(() => {
    let seed = 12345;
    const rng = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // The game's random streams seed themselves from this once, as the page
    // loads; frame effects draw from their own stream, so no reseeding is
    // needed before a step that rolls a new run.
    Math.random = rng;
  // The random streams' start-up seeds, pinned by name, so they never depend
  // on which module (or the dev server's client) drew from Math.random first.
  globalThis.__pinnedSeeds = { game: 3513001552, defend: 2079646450 };
  // The hand would keep stepping inside a run; snapshots need the board still.
  globalThis.__handStartsPaused = true;
    crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(rng() * 2 ** 32); return arr; };
    const fixture = sessionStorage.getItem("__uiFixture");
    if (fixture) localStorage.setItem("towerdelve.v1", fixture);
  });

  /** Waits for the page's HTML and the HUD (filled in as the app starts), not
   * the load event, which also waits on every image. */
  const ready = () => page.locator("#hp").waitFor();

  // --- Fixture saves, built in the page from the real defaults ---
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await ready();
  const FIXTURES = await page.evaluate(async () => {
    const { defaults } = await import("/snapshot/save.js");
    const { Game } = await import("/snapshot/state.js");
    const make = (edit) => {
      const s = defaults();
      edit?.(s);
      return { save: JSON.stringify(s), targets: [] };
    };
    /** A save with a Tower run inside the tower at `rooms` floors up, built by
     * the real game so the run is valid. */
    const inside = (edit, rooms = 0) => {
      const s = defaults();
      edit?.(s);
      const g = new Game(s);
      g.switchMode("tower");
      g.newRun();
      for (let i = 0; i < rooms; i++) g.advanceTowerRoom();
      // One tile of every kind on this floor, so the inspect panel shows each.
      const targets = {};
      for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) {
        const t = g.world.tile(x, y), kind = t.kind === "door" ? `door-${t.color ?? t.door?.type}` : t.kind === "key" ? `key-${t.color}` : t.kind;
        targets[kind] ??= [x, y];
      }
      return { save: JSON.stringify(g.save), targets: Object.values(targets) };
    };
    const quiet = (s) => {
      s.settings.transition = "instant";
      s.settings.reduceMotion = true;
      s.settings.weatherSound = false;
    };
    const rich = (s) => {
      quiet(s);
      Object.assign(s.upgrades, { delve: 1, moveSpeed: 1, legacy: 1, revive: 1, combatStance: 1, buildout: 1, largerHand: 1, cardHeal: 1, focus: 1, archives: 1, inspirationUndos: 1, greaterHeal: 1, recovery: 1, findPotion: 1, shroud: 1, undos: 1, extraKey: 1, gear: 1, trainers: 1, cardBlueKey: 1, pathfinder: 1 });
      s.delve.courage = 37;
      s.tower.inspiration = 21;
      s.gold = 480;
      s.gems = 260;
      s.xp = 900;
      for (const k of Object.keys(s.materials)) s.materials[k] = 120;
      s.tower.reached = 41;
      s.tower.best = 41;
      s.delve.reached = 57;
      s.delve.best = 57;
      s.goals.mastered = { 1: [10, 30] };
      s.goals.cleared = { 1: [10, 20] };
      s.provisions.heal = 2;
    };
    /** A Tower run whose hero, down to 1 HP, has just fallen to the first
     * enemy on the floor, the defeat dialog waiting. */
    const fallen = (edit) => {
      const s = defaults();
      quiet(s);
      edit?.(s);
      const g = new Game(s);
      g.switchMode("tower");
      g.newRun({ seed: 7 });
      const p = g.run.player;
      const beside = [];
      for (let y = 1; y < 16 && !beside.length; y++) for (let x = 1; x < 16 && !beside.length; x++)
        if (g.world.tile(x, y).kind === "enemy" && g.world.tile(x, y - 1).kind === "floor") beside.push(x, y - 1);
      Object.assign(p, { x: beside[0], y: beside[1], hp: 1 });
      g.move(0, 1, true);
      return { save: JSON.stringify(g.save), targets: [] };
    };
    /** A save waiting in the forest outside the Tower, built by the real game. */
    const forest = (edit) => {
      const s = defaults();
      edit?.(s);
      const g = new Game(s);
      g.switchMode("tower");
      g.newRun({ outside: true });
      return { save: JSON.stringify(g.save), targets: [] };
    };
    return {
      fresh: make(quiet),
      towerFloor: inside(quiet, 3),
      rich: inside(rich, 12),
      devStatus: inside((s) => {
        rich(s);
        s.settings.devMode = true;
        s.settings.infoDisplay = "status";
        s.settings.showArrows = true;
      }, 25),
      // Built last, so the fixtures above keep their run seeds.
      fallenUndo: fallen((s) => { s.upgrades.inspirationUndos = 1; }),
      fallenBare: fallen(),
      // In the forest with Badges: a few owned, two on cards.
      badges: forest((s) => {
        rich(s);
        s.upgrades.cardBadges = 1;
        Object.assign(s.tutorials, { deck: true, removeCard: true, addCard: true, upgrades: true });
        s.badges = { owned: { hp: { copies: 4, pick: 0 }, xp: { copies: 1, pick: 0 }, hpGate: { copies: 3, pick: 1 }, charge: { copies: 2, pick: 0 } }, cards: { stairs: "hp", monster: "charge" }, rng: 99 };
      }),
    };
  });

  // --- Snapshot helpers ---
  /** `#app` HTML, with crafted items' random UUIDs replaced by a placeholder. */
  const snapshot = () => page.evaluate(() =>
    document.querySelector("#app").outerHTML.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>"));
  /** After two animation frames have run (a busy machine can delay one, and
   * HTML the next frame would change, like a canvas it sizes, must not count
   * as settled): whether nothing is still moving. That is no route being
   * walked or fight playing out (`boardBusy`, from the app's debug hooks), no
   * finite CSS animation or transition running (endless ones, like the tile
   * glow's pulse, never finish), and no tile highlight fading out (its class
   * goes as the fade's timer hides it). */
  const quiet = () => page.evaluate(async () => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const animating = document.getAnimations().some((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity);
    return !window.boardBusy?.() && !animating && !document.querySelector(".fade-out");
  });
  /** Waits until nothing is moving and the HTML is the same on two checks in
   * a row, rather than a fixed time after every step. */
  async function settled() {
    let previous = null;
    for (let i = 0; i < 300; i++) {
      if (!(await quiet())) {
        previous = null;
        continue;
      }
      const html = await snapshot();
      if (html === previous) return html;
      previous = html;
    }
    throw Error("UI never settled");
  }
  const shots = {};
  async function shot(name) {
    if (shots[name]) throw Error(`Duplicate snapshot ${name}`);
    shots[name] = await settled();
  }
  async function load(name) {
    await page.evaluate((f) => sessionStorage.setItem("__uiFixture", f), FIXTURES[name].save);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    await page.evaluate(() => document.fonts.ready);
  }
  const click = (selector) => page.locator(selector).first().click();
  const tab = (id) => click(`[data-tab="${id}"]`);
  /** Taps Tower tile (x, y): the Tower view is fixed on the 17 × 17 room. */
  async function tapTile(x, y) {
    const box = await page.locator("#world").boundingBox(), s = box.width / 17;
    await page.mouse.click(box.x + (x + 0.5) * s, box.y + (16 - y + 0.5) * s);
  }
  /** Ends the current run and returns to the forest, where the tabs show. */
  async function leaveRun() {
    await click("#end-run");
    await click("#confirm");
  }
  async function closeModal() {
    await page.evaluate(() => document.querySelector("#modal").open && document.querySelector("#modal").close());
  }

  // --- Scripted walks ---
  /** Taps round the Tower board a fixture loads onto. */
  async function boardTour(prefix, fixture) {
    await shot(`${prefix}.tower`);
    const tiles = [[8, 1], [8, 3], [3, 8], [13, 8], [8, 13], [1, 1], [15, 15], ...FIXTURES[fixture].targets];
    for (const [x, y] of tiles) {
      if (shots[`${prefix}.tap.${x}.${y}`]) continue;
      await tapTile(x, y);
      await shot(`${prefix}.tap.${x}.${y}`);
    }
    // Tap the same tile twice: the first previews, the second walks (inside
    // a run only in Dev mode; otherwise it says the hand moves the hero).
    await tapTile(8, 2);
    await tapTile(8, 2);
    await shot(`${prefix}.walked`);
    if (await page.locator("#undo:not([disabled])").count()) {
      await click("#undo");
      await shot(`${prefix}.undone`);
    }
  }
  /** Drags the hand's card in slot `from` onto slot `to` on the Deck page. */
  async function dragCard(from, to) {
    const a = await page.locator(`.deck-card[data-slot="${from}"]`).boundingBox();
    const b = await page.locator(".deck-slot").nth(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  /** Drags deck card `id` onto hand slot `to`. */
  async function dragFromDeck(id, to) {
    const a = await page.locator(`.deck-add[data-add="${id}"]`).boundingBox();
    const b = await page.locator(".deck-slot").nth(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  /** The Deck's first visit teaches the drag, then taking a card out and
   * adding one; then the hand reorders and changes freely. */
  async function deckTour(prefix) {
    await tab("deck");
    await shot(`${prefix}.deck.tutorial`);
    await dragCard(0, 3);
    await shot(`${prefix}.deck.praise`);
    await click("#deck-praise-ok");
    await shot(`${prefix}.deck.remove`);
    await click('[data-remove="monster"]');
    await shot(`${prefix}.deck.removePraise`);
    await click("#modal h2");
    await shot(`${prefix}.deck.addNote`);
    await click("#deck-add-note");
    await shot(`${prefix}.deck`);
    await dragCard(2, 0);
    await shot(`${prefix}.deck.reordered`);
    await click('[data-return="door"]');
    await shot(`${prefix}.deck.returned`);
    await click('[data-add="heal"]');
    await shot(`${prefix}.deck.added`);
    // A deck card dragged onto a slot goes there, the cards after it sliding on.
    await dragFromDeck("door", 1);
    await shot(`${prefix}.deck.placed`);
    // Larger Hand sells the next slot for Gems.
    await click(".deck-buy-slot");
    await shot(`${prefix}.deck.buySlot`);
    await click("#confirm");
    await shot(`${prefix}.deck.slotBought`);
  }
  /** Badges on the Deck page: a token's details (a gate's slider),
   * one dragged onto a card and one taken off, then one draw and ten. */
  async function badgesTour(prefix) {
    await tab("deck");
    await shot(`${prefix}.deck`);
    await click('.badge-pick[data-badge="hpGate"]');
    await shot(`${prefix}.detail`);
    await click("#badge-detail-ok");
    // The page draws again once the dialog's close event has fired.
    await settled();
    const a = await page.locator('.badge-pick[data-badge="xp"]').boundingBox();
    const b = await page.locator('.deck-entry[data-badge-card="door"]').boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await shot(`${prefix}.attached`);
    await click('[data-detach="charge"]');
    await shot(`${prefix}.detached`);
    await click('[data-draw="1"]');
    await shot(`${prefix}.drawn`);
    await click(".badge-reveal-go");
    await click('[data-draw="10"]');
    await shot(`${prefix}.ten`);
    await click(".badge-reveal-skip");
    await shot(`${prefix}.ten.summary`);
    await click(".badge-reveal-go");
    await shot(`${prefix}.afterDraws`);
    // A hand card dragged onto the deck goes back to it.
    const card = await page.locator('.deck-slot[data-badge-card="monster"] .deck-card').boundingBox();
    const deck = await page.locator(".deck-reserve.open").boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(deck.x + deck.width / 2, deck.y + deck.height / 2, { steps: 8 });
    await shot(`${prefix}.overDeck`);
    await page.mouse.up();
    await shot(`${prefix}.returned`);
  }
  /** Buying a card's skill raises the card over the screen until pressed. */
  async function cardRevealTour(prefix) {
    await tab("upgrades");
    await click('[data-tree="inspiration"]');
    await click('[data-skill="cardAtkUp"]');
    await click('[data-skill="cardAtkUp"]');
    await shot(`${prefix}.cardReveal`);
    await click("#card-reveal-card");
    await shot(`${prefix}.cardRevealed`);
  }
  async function dialogsTour(prefix) {
    // Inside a run the ad's Gems stand where Goals is in the forest.
    await click("#gem-ad");
    await shot(`${prefix}.adGems`);
    await click("#auto-settings");
    await shot(`${prefix}.autoSettings`);
    await click("#settings-back");
    // The Shop, from the HUD; nothing claimed, so no countdown reads the clock.
    await click("#shop-open");
    await shot(`${prefix}.shop`);
    await click('[data-detail="coins3"]');
    await shot(`${prefix}.shop.details`);
    await closeModal();
    await click("#shop-back");
    await click("#end-run");
    await shot(`${prefix}.endRun`);
    await click("#cancel");
    await shot(`${prefix}.endRun.cancelled`);
  }
  async function upgradesTour(prefix) {
    await tab("upgrades");
    await shot(`${prefix}.upgrades`);
    for (const tree of await page.locator("[data-tree]").evaluateAll((bs) => bs.map((b) => b.dataset.tree))) {
      await click(`[data-tree="${tree}"]`);
      await shot(`${prefix}.tree.${tree}`);
      // The Inspiration and Courage trees explain how their currency is earned.
      if (await page.locator("#tree-help").count()) {
        await click("#tree-help");
        await shot(`${prefix}.tree.${tree}.help`);
        await click("#tree-help-ok");
      }
      if (tree === "training") {
        // Train each stat the points still cover.
        for (const stat of await page.locator("[data-train]:not([disabled])").evaluateAll((bs) => bs.map((b) => b.dataset.train))) {
          // Training one stat can spend the last point another needed.
          if (!(await page.locator(`[data-train="${stat}"]:not([disabled])`).count())) continue;
          await click(`[data-train="${stat}"]:not([disabled])`);
          await shot(`${prefix}.tree.training.${stat}`);
        }
        // A trained stat resets for Gems, asking first.
        if (await page.locator("[data-reset]:not([disabled])").count()) {
          await click("[data-reset]:not([disabled])");
          await shot(`${prefix}.tree.training.resetAsk`);
          await click("#confirm");
          await shot(`${prefix}.tree.training.reset`);
        }
        continue;
      }
      if (tree === "archives") {
        // Idle archivists, so nothing shown depends on the clock; the
        // research costs more Gold than the save holds.
        await page.fill("#research-search", "no such research");
        await shot(`${prefix}.tree.archives.search`);
        await page.fill("#research-search", "");
        await click("#research-history-open");
        await shot(`${prefix}.tree.archives.history`);
        await click("#research-history-close");
        continue;
      }
      const skills = await page.locator("[data-skill]").evaluateAll((bs) => bs.map((b) => b.dataset.skill));
      for (const skill of skills.slice(0, 3)) {
        await click(`[data-skill="${skill}"]`);
        await shot(`${prefix}.tree.${tree}.${skill}`);
      }
      // Second tap on the selected node buys it when affordable.
      await click(`[data-skill="${skills[skills.length > 2 ? 2 : 0]}"]`);
      await shot(`${prefix}.tree.${tree}.buy`);
    }
  }
  /** The Gear page opens on Provisions, its other tabs closed for now;
   * opening it clears the dot the Gear skill put on its button. */
  async function gearTour(prefix) {
    await shot(`${prefix}.gear.waiting`);
    await tab("gear");
    await shot(`${prefix}.gear`);
    if (await page.locator("[data-gold]:not([disabled])").count()) {
      await click("[data-gold]:not([disabled])");
      await shot(`${prefix}.gear.provisions.bought`);
    }
  }
  /** Settings from inside a run: opened from the HUD, left by its Back button. */
  async function settingsTour(prefix) {
    await click("#auto-settings");
    await shot(`${prefix}.settings`);
    await page.locator("#info-display").selectOption("status");
    await click("#settings-back");
    await tapTile(8, 3);
    await shot(`${prefix}.statusInfo`);
    await click("#auto-settings");
    await page.locator("#info-display").selectOption("popup");
    await page.locator("#arrows").setChecked(true);
    await click("#settings-back");
    await shot(`${prefix}.popupArrows`);
    await click("#auto-settings");
    await page.locator("#dev-mode").setChecked(true);
    await shot(`${prefix}.settings.dev`);
    await click("#retire");
    await shot(`${prefix}.retire.confirm`);
    await click("#confirm");
    await shot(`${prefix}.retired`);
  }

  await load("fresh");
  await shot("fresh.start");
  // Inside a run the button plays and pauses the hand.
  await click("#auto");
  await shot("fresh.handToggled");
  await click("#auto-settings");
  await shot("fresh.settings");
  await click("#settings-back");
  await leaveRun();
  await shot("fresh.forest");
  await tab("upgrades");
  await shot("fresh.upgrades");
  // A skill short of its price says how much more it needs.
  await click('[data-skill="combatStance"]');
  await shot("fresh.tree.short");
  await tab("tower");
  // In the forest it is Enter, going straight in.
  await click("#auto");
  await shot("fresh.entered");

  // A fallen hero: the defeat dialog, with an undo or without.
  await load("fallenUndo");
  await shot("fallen.undo");
  await click("#defeat-undo");
  await shot("fallen.undo.undone");
  await load("fallenBare");
  await shot("fallen.bare");
  await click("#defeat-accept");
  await shot("fallen.accepted");

  await load("towerFloor");
  await boardTour("floor", "towerFloor");
  await dialogsTour("floor");

  await load("rich");
  await boardTour("rich", "rich");
  await dialogsTour("rich");
  // Focus: a card with no target flashes red for free; one with a target takes the lead.
  for (const card of ["door", "yellowKey", "monster"]) {
    await click(`#hand .hand-card[data-card="${card}"]`);
    await shot(`rich.focus.${card}`);
  }
  await leaveRun();
  // In the forest, Goals shows the Tower's checkpoints: claiming an unlock
  // (Damage Prediction, then Warp) explains it, a premium reward offers the
  // pass, a mastered checkpoint asks to warp there, and one completed but
  // not mastered says what warping takes.
  await click("#section-pick");
  await shot("rich.goals");
  await click('[data-goal="1:10:0"]');
  await shot("rich.goals.predictionUnlocked");
  await click("#unlock-ok");
  await click('[data-goal="1:40:0"]');
  await shot("rich.goals.warpUnlocked");
  await click("#unlock-ok");
  await shot("rich.goals.claimed");
  await click('[data-goal="1:20:1"]');
  await shot("rich.goals.pass");
  await closeModal();
  await click('[data-warp="1:20"]');
  await shot("rich.goals.unmastered");
  await click('[data-warp="1:30"]');
  await shot("rich.goals.warp");
  await click("#cancel");
  await click("#goals-back");
  await deckTour("rich");
  await cardRevealTour("rich");
  await tab("defend");
  await shot("rich.defend");
  await upgradesTour("rich");
  await gearTour("rich");
  await tab("delve");
  await shot("rich.delve");
  await settingsTour("rich");

  await load("devStatus");
  await boardTour("dev", "devStatus");
  await leaveRun();
  await tab("gear");
  await shot("dev.gear");
  await tab("upgrades");
  await shot("dev.upgrades");
  // The Shop button atop the Upgrades, Deck and Gear pages opens the Shop,
  // whose Back returns to the page it was opened from.
  await click("#page-shop");
  await shot("dev.upgrades.shop");
  await click("#shop-back");
  await shot("dev.upgrades.shopBack");
  await tab("gear");
  await click("#page-shop");
  await click("#shop-back");
  await shot("dev.gear.shopBack");

  await load("badges");
  await badgesTour("badges");

  // --- Compare ---
  const hashes = Object.fromEntries(Object.entries(shots).map(([k, html]) => [k, createHash("sha256").update(html).digest("hex").slice(0, 16)]));
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [k, html] of Object.entries(shots)) writeFileSync(`${OUT_DIR}/${k}.html`, html);
  let failed = false;
  if (UPDATE || !existsSync(GOLDEN)) {
    mkdirSync(BASELINE_DIR, { recursive: true });
    for (const [k, html] of Object.entries(shots)) writeFileSync(`${BASELINE_DIR}/${k}.html`, html);
    writeFileSync(GOLDEN, JSON.stringify(hashes, null, 2) + "\n");
    console.log(`Wrote ${Object.keys(hashes).length} UI snapshot hashes to the golden file.`);
  } else {
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    const changed = Object.keys({ ...golden, ...hashes }).filter((k) => golden[k] !== hashes[k]);
    for (const k of changed) {
      const base = `${BASELINE_DIR}/${k}.html`;
      let detail = "no local baseline HTML to compare";
      if (existsSync(base) && shots[k]) {
        const a = readFileSync(base, "utf8"), b = shots[k];
        let i = 0;
        while (i < a.length && a[i] === b[i]) i++;
        detail = `first difference at char ${i}:\n  was: ${a.slice(Math.max(0, i - 80), i + 120)}\n  now: ${b.slice(Math.max(0, i - 80), i + 120)}`;
      }
      console.error(`${k}: ${golden[k] ?? "missing"} -> ${hashes[k] ?? "missing"} (${detail})`);
    }
    if (changed.length) {
      failed = true;
      console.error(`${changed.length} UI snapshots changed; see ${OUT_DIR}/ vs ${BASELINE_DIR}/`);
    } else {
      console.log(`All ${Object.keys(hashes).length} UI snapshots match the golden hashes (${createHash("sha256").update(JSON.stringify(hashes)).digest("hex").slice(0, 8)}).`);
    }
  }
  if (errors.length) throw Error(errors.join("\n"));
  exitCode = failed ? 1 : 0;
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  // Always shut down, so a run never hangs waiting on the browser or server.
  await bounded(browser.close());
  await bounded(server.close());
}
process.exit(exitCode);
