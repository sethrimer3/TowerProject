# Proving Grounds

The gold square two columns right of the Tower forest's path on row 4 opens **Proving Grounds Trials** when entered.
`OutsideWorld.isProvingGrounds` identifies it, `Game.land` stops the route and asks for its menu, and `ProvingGroundsDialog` owns the shared modal, controls, persistence and frame lifecycle.
The trial is a separate encounter: `save.provingGrounds` stores its attempt, while the ordinary Tower and Delve runs, equipment, currencies and supplies remain untouched.
The player's current max HP, ATK and DEF are copied into the attempt, which starts at full HP; other normal-run combat systems do not apply to this tactical trial.
Leaving or cancelling the modal discards the attempt and returns to the same forest square, and a reload resumes the saved attempt.

`src/proving-grounds/trial.ts` is the pure turn model: a 9×9 staging room leads through stairs to a 50×50 board whose walkable floor is a hexagon approximated with tiles.
The stationary Light Elemental occupies (25,25); stepping into it strikes it, with a smaller return hit from its radiance.
Every accepted move, strike or wait counts as one turn; blocked moves cost none.
Every tenth arena turn fires two rays along the next axis: north–south, northeast–southwest, east–west, southeast–northwest, then repeat.
Rays stop on the first wall and mark its surface as well as every floor tile crossed; a hit costs 25% of max HP, while each wall-side potion restores 35% once.
Cracks persist for the attempt, their glow fading over 30 turns; victory prevents further attacks, and defeat offers a fresh attempt or a safe exit.
Boss HP is at least 240 and otherwise 24 times the copied ATK, so the trial leaves room for several beam cycles.

`render.ts` reuses the Classic stone, hero, potion and torch art, adds a pixel Light Elemental, and draws a camera following the player over 17×17 tiles.
The arena has no ambient floor light: only torches, the elemental, smoldering cracks and the hero's small foothold light reveal it.
Beam flashes last 900 ms, while visible cracks and their step-based glow survive reloads.
`tests/proving-grounds.test.ts` covers topology, entry, turn timing, collision, pickups, combat, save decoding and separation from the ordinary run.
`npm run test:proving` exercises the UI with the dev server running, and the render goldens include staging, elemental, beam, glow and wall-scar frames.
