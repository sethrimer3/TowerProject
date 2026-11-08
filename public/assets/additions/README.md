# Tower Delve additions art

128 individual transparent 24 × 24 PNGs, packed losslessly into atlas.png (512 × 256).
Read atlas.json for named regions; coordinates start at the top left, exclude the two-pixel transparent padding, and use pixels.
Use nearest-neighbor sampling at integer scales.

100 relics are an art library, numbered in source reading order; no names, rarities, bonuses or ownership rules are assigned.
The remaining art comprises Trial Points, 12 skill symbols, five event pennants, and ten Standard equipment pieces.
Event pennants are reusable themes, not scheduled events.
These files are not wired to gameplay yet and do not replace existing art.

Regenerate with node tools/prepare-additions-sprites.mjs.
The retained generated sources live in assets/game-sprites/additions-sources/.
