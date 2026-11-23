# Prototype boundaries

What the prototype leaves simple or out on purpose.

Room variety and balancing are introductory.
Locked passages gate both ascent routes and reward branches; enemies inside chambers are often avoidable.
Fights play out unless Animate fights is turned off.
Automation prioritizes nearby upgrades and safe ascent, rather than globally optimal inventory planning.
The Tower only climbs: a floor left behind can't be revisited in the run.
Unsupported save-format versions reset safely.
Layout-version migration retains progression, stats, and inventory, clears old map edits, and relocates the player to their current section entrance.
Text uses only the fonts bundled in `assets/fonts/`; no remote font service is used.
Sound is Ogg recordings in `public/assets/sounds/`, under every UI theme.
The Archives' research is the only progression that runs while the game is closed; there is no cloud save or installable PWA.
