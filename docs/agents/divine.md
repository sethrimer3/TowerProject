# The Divine Portal and Divine Relics

The first climb's Divine Portal, the builders' room on floor 999999, the Chrono Anchor, the End Climb lock, and the Divine Relics' place on the Relics page.
Player rules are in `docs/gameplay/first-steps.md` (The Divine Portal).

**Modules.**
`src/divine.ts` holds the rules as plain data and functions: `DIVINE_RELICS` (each Divine Relic's name, text and sprite id; `DivineRelicId`), `decodeDivineRelics`, `hasAnchor`, `portalOpen` (no Chrono Anchor and no Tower climb ended yet, `tutorials.chamber`), `endLocked`, `portalSpot`, `DIVINE_FLOOR` (999,999), `PORTAL_HEIGHT` (`run.height` 1, floor 2) and `PORTAL_FADE_MS`.
`src/tower/divine-room.ts` is the builders' room, `DivineRoom`, a `Board` that is not generated: a 17x17 room walled round its edge, a lit torch in each corner (`breakTorchAt` never puts one out), and a gold area chest's tile (`reward`, `tier: "gold"`) at `DIVINE_CHEST`, read through the run's changes once opened; `DIVINE_ARRIVAL` (the middle of its lowest row) and `DIVINE_RETURN` (the middle of its top row) are where the hero arrives and the portal back stands.
It has no `cells` or `room`, so `decorSourceFor` gives it no decor.
`render/effects/divine.ts` draws the portal (Voidwell's `paintVortex` in a gold `VortexPalette`, with a glow and motes swirling in), the chest's sparkles and the warp's fade, all from `Renderer.drawOverlays`.

**The run.**
A Tower run in the room carries `divine: true` (`TowerRun.divine`, kept by `decodeTowerRun` only on an inside Tower I run); its `height` stays floor 2's, so records, milestones and Goals never see floor 999999, and the HUD shows `DIVINE_FLOOR` while `Game.inDivineRoom`.
`MODES.tower.board` builds a `DivineRoom` for such a run, so a reload stands the hero in the room.
`Game.divinePortal` is the portal standing: on floor 2 of a tier-1 run while `portalOpen`, at `portalSpot` over the floor's generated cells (open floor only, about four steps from the way in, never the way in, the tile just inside or a torch's tile), worked out once a run seed; in the room, `DIVINE_RETURN` once the Chrono Anchor is held and its celebration dismissed.
Only a tap takes the hero through it: `walkTo` lets a tap on the portal walk even without Dev mode (and anywhere in the room), marking the route `portalBound`, and `land` enters the portal only on such a route (or in the room); walked over by Dev mode's steps or anything else, the tile is plain floor.
`enterPortal` cues `warp` and starts `Game.portalWarp`; the frame loop calls `portalWarpFrame`, which waits `PORTAL_FADE_MS` (none with Reduce motion or Instant transitions) before `completePortalWarp` drops the run's changes and moves the hero into the room, or back to floor 2's start with the floor as generated and the hand playing on.
`portalWarp`, `portalArrived` (the fade back in) and `divineReveal` are never saved.
Landing on the room's chest (`openDivineChest`) cues `chestCreak` and `divineRelic`, adds the Chrono Anchor to `save.divineRelics` and sets `Game.divineReveal`, which `main.ts` shows with `showDivineRelic` (`ui/relic-pop.ts`: rising into the middle in golden rays, its name, text and *Tap anywhere to dismiss.*); dismissing it calls `Game.dismissDivineReveal`, which opens the portal back.
In the room the hand never plays (`playHand`, `toggleAuto`) and no lesson shows.

**The End Climb lock.**
`Game.endLocked` (`endLocked` in divine.ts) holds while no Tower climb has ended and the Chrono Anchor isn't held, or the hero stands in the room: `renderRunMenu` hides both End Climb buttons, `boardLesson` holds back `stuck` and `enemy`, and a stuck hand's line points at the portal instead.
`Game.finish` itself is not locked, so code and tests may still end a run.
A save whose first climb has ended (`tutorials.chamber`) decodes holding the Chrono Anchor, since that player has looped already.

**Elsewhere.**
`save.divineRelics` sits in the profile file's `upgrades` section.
The Relics page (`ui/relics-page.ts`) lists them after the rarities in its gold Divine section (every one with Access to Everything), and the forest's Relics button shows once one is owned.
The Codex's Story category (docs/agents/codex.md) opens with the Intro once the first climb has ended.
The ambience plays the `divineRelic` bed in the room, louder nearer the chest (docs/agents/sound.md).
The sprite `relic-divine-chrono-anchor` is drawn by `tools/prepare-divine-relic-sprites.mjs` (`--preview` writes an 8x copy to `test-results/divine-relics/`), then `npm run sprites:atlas`.

**Tests.**
`tests/divine.test.ts` covers the portal's place on floor 2 across seeds, `portalSpot`, that only a tap enters it, the round trip through the room (the lock, the chest, the reload, the portal back), decoding and the Chrono Anchor for looped saves, the Story's Intro and the room's ambience.
`tests/game-commands.test.ts` checks the first stuck lesson waits for the Chrono Anchor.
A fresh save's floor 2 shows the portal, so render scenes on it (`towerClimb`, `decorCrates`) draw it.
