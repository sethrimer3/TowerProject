# Tower Delve bestiary

126 distinct creatures: six strengths × seven appearances × three stat profiles.
The seven appearances are ordinary, Fast, Ranged, Shielded, Flying, Armored and Aggroed.
Attack-heavy creatures emphasize claws, fangs and weapons; balanced creatures are dungeon dwellers; defense-heavy creatures have shells, stone and armor.

Every creature has an individual transparent 24 × 24 PNG in `../style/`, named by its ID in `atlas.json`.
`atlas.png` is a lossless 512 × 256 review atlas with two pixels of transparent padding around each region.
`atlas.json` gives each name, strength, trait, profile, individual file and region in pixels measured from the top left.
`preview.html` is a standalone labeled gallery with its artwork embedded, shown at 4× native size.
Use nearest-neighbor sampling and integer scales.

The production build also includes these sprites in `../atlases/ui.png`, with coordinates in `../atlases/ui.json`.
The new roster is the default; Settings → Legacy Enemies restores the previous ordinary Tower/Delve art and names.
Trial bosses retain their dedicated designs; other Game themes retain their own drawing styles.
Combat, generation and saved-map identities are unchanged.
Multi-trait bodies use precedence Aggroed, Flying, Shielded, Armored, Ranged, Fast, ordinary; all mechanics and other trait markers remain active.
Some combinations, such as Fast bosses, are available artwork but are not introduced into the spawn schedule.

Regenerate the individual PNGs and review atlas from the retained source sheets with `node --experimental-transform-types tools/prepare-enemy-sprites.mjs` from the repository root.
Rebuild the runtime atlas with `npm run sprites:atlas`.
