# Sound

The game's sound effects, the ambience under them, their recordings, settings and tests.

## Recordings

The recordings live in `public/assets/sounds/` as Ogg Vorbis, sorted into `ui/`, `pickups/`, `doors/`, `events/`, `battle/` and `ambience/`; `SOURCES.md` lists each file's original.
`src/sound-files.ts` names them: `ONE_SHOTS` (short clips, each with its variants) and `BEDS` (long loops), fetched and decoded on first use and handed out as buffers once ready (null while loading, or for good if a file fails).
A bed is baked once into a seamless loop (`crossfadeLoop`: its end cross-faded into its start, `LOOP_FADE` seconds).
Each logical sound has its own one-shot and file, even where two share a recording for now (`cardLevelUp` and `badgeDraw`), so replacing one file changes only that sound.
The originals in `assets/UNSORTED SFX/` are kept as they were dropped in; the game never loads that folder.
To add a recording: convert it to Ogg Vorbis (`ffmpeg -i in -ac 1 -af volume=… -c:a libvorbis -q:a 4 out.ogg` for a one-shot, peak-normalized to -1 dBFS; stereo and `loudnorm=I=-20` for a loop), put it in its folder, list it in `ONE_SHOTS` or `BEDS` and in `SOURCES.md`.

**Themes.** Every UI theme hears the same recordings.
`STYLE_SOUNDS` (empty for now) lets a UI theme swap any one-shot for its own paths (`shotPaths`); `sound.ts` asks for the theme worn (`soundStyleBy`, from `main.ts`: `battery` under Battery saver, else `uiLook`).

## Cues

`src/sound.ts`'s `play(cue)` plays a cue now, unless sound is off (`soundEnabledBy`: the **Sound effects** setting, `settings.sound`), the browser has no audio, the player hasn't pressed anything yet, or the same cue played in the last 60 ms.
The audio graph (voices → dry out and a generated stone-hall echo → a gentle compressor) is built on the first press (`unlockAudio`, bound by `bindFeedback` to `pointerdown` and `keydown`), which preloads every one-shot; `runningAudio` hands the running context to the ambience and the thunder, never building one.
Most cues play a recording (`SAMPLED`: its one-shot, gain, hall send and pitch wander); `knock`, `error`, `stone`, `coin`, `chime`, `unlock` and `trained` are made in code, and `knock` plays its recording once loaded.
At most `MAX_VOICES` recordings ring at once.

`ui/medieval.ts`'s `bindFeedback` plays a press's sound under every theme: `stone` on the tab row, `confirm` on a dialog's `#confirm` button, `knock` on any other button or checkbox; its sparks stay the Medieval theme's.

Where each cue plays from:
- The board's events go through `render/board-sounds.ts` (`BoardSounds`, kept by the `Renderer`, presentation only), which plays them as they land: each fight strike a `punch` (a `bodyFall` once it fells the enemy), each volley shot an `arrowHit` at `landsAt` (a `bodyFall` when it fells its target), each moment in `fights.struckDown` a `bodyFall`, each new `fights.sparkedAt` a `phoenixSpark`, each new `game.bombed` a `blast`, and a new `game.familiarFx` with a Slime burst a `slimeImpact`.
- The game's own events ask for theirs with `Game.cue` (`GameCue`, in `shown.ts`), queued with their time in `game.cues`, which the renderer hands to `BoardSounds` each frame: each plays once however many asked at once, and one older than `CUE_STALE_MS` (it happened while the board wasn't showing) never plays.
  `Game.land` cues a pickup, chest or door (`pickupCue`: an ATK or DEF shard, a potion, a key, a chest or area chest's `chestCreak`, and a door's `door1`, `door2` or `door3` by the keys an all-keys door takes; any other door is `door1`); `GemFinder.pay` a Gem by its kind; `useProvision` the Traveler's elixir's `elixir` and any other provision's `provision`; `addXp` the hero's `heroLevelUp`; `enterFromOutside` `enterTower` or `enterDelve` by mode (a Warp swaps it for `warp`); `markStuck` `runStuck` as the hand becomes stuck; `enterPortal` `warp` through a Divine Portal; and `openDivineChest` `chestCreak` and `divineRelic`.
  Whatever is already on the board as it first shows stays quiet.
- The pages play theirs directly: the Equipment screen opening (`ui/gear-page.ts`), a card's level-up (`ui/card-level-up.ts`) `cardLevelUp`, badges drawn (`ui/badge-reveal.ts`) `badgeDraw` (the same recording for now, in its own file), the story beginning (`ui/board-lesson.ts`, silent on a first visit until a press starts sound), a Tournament prize claimed (`ui/tournament-page.ts`), the Gem bank filling with its chime setting on (`ui/hud.ts`), the infinity loop (`ui/death-loop.ts`), skill-tree ranks, Training's coins, a finished Training rank (`main.ts`) and a full hand refusing a card (`ui/deck-page.ts`).

## Ambience

`src/ambience.ts` plays the beds under everything (`ambience`, one for the page).
Each part of the game says what it wants with `set(who, levels)` (a level from 0 to 1 per bed): the board as `board` every frame (nothing under Battery saver, and nothing from `Renderer.hush` while the board isn't showing), and the voyage with the fisherman (`ui/trial-voyage.ts`) as `voyage` while it shows.
Each bed plays at the loudest level any of them wants (`mixLevels`), at `BED_GAIN` times it, fading over `BED_FADE` seconds, so a bed both want (the lake's music, boarding the boat) carries on unbroken; all of it fades out while sound is off or the page is hidden.
`surroundingLevels` says what the board wants where the hero stands (`Renderer.surroundings`): outside (the clearing and the lake), the forest wind while **Weather sounds** is on, and its wind chimes on a cloudy or stormy day; in the clearing, the Blacksmith's forge once it stands, louder nearer it and silent past `BLACKSMITH_REACH` tiles; at the lake, the meditative music and the dock's water, louder nearer the fisherman (`DOCK_FLOOR` at its quietest, full beside him, over `DOCK_REACH` tiles); in the builders' room on floor 999999 (`place: "divine"`, docs/agents/divine.md), only the `divineRelic` bed, louder nearer its chest (`RELIC_FLOOR` at its quietest, over `RELIC_REACH` tiles); inside, nothing.
`render/weather.ts` keeps only the thunder's rumble, made in code on the same context.

## Tests

`tests/sounds.test.ts` checks every listed recording (and any theme's) has its Ogg file and every file is listed and Ogg, the loop blend, `BoardSounds` (blows, shots, falls, Bombs, sparks, the Slime, the game's cues fresh and stale), `pickupCue`, `surroundingLevels` and `mixLevels`.
`tests/outdoor-art.test.ts` pins the thunder's timing and rumble calls.
