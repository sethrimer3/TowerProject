# UI sprite kit

Settings → **Sprites** opts into the PNG interface kit and defaults to off, including saves from before this option existed.
The separate **Turn off board sprites** option controls the existing dungeon artwork.
UI themes and Game themes retain their saved selections.

## Art contract

Use the [source atlas](../../assets/ui-sprites/source-atlas.png) as the visual reference for additional components.
Keep the shared [27-color palette](../../assets/ui-sprites/palette.ppm), upper-left light, charcoal outlines, stepped corners, restrained brass trim and quiet slate interiors.
Frames are 48 × 24 native pixels with six-pixel edge slices displayed at 2×.
Keep typography and values as live DOM text; never bake labels into an asset.
The native grid is enforced during export with nearest-neighbor sampling, binary alpha, palette remapping and no dithering.
Do not use SVG replacements, gradients, glow, blur or fine texture in this kit.

The runtime components live in `public/assets/ui/frames/`, with sizes and slice widths in `manifest.json`.
There are six button states, panel and dialog frames, an inset field, a progress track, three colored progress fills, a tiling surface, a title banner and a card slot.
`src/ui-sprites.css` applies these components only under `html.ui-sprites`; buttons, dialogs, settings controls, HUD bars and page panels retain their existing interactions.
Card faces, map markers and skill-node buttons keep their specialized artwork.

## Prompt template

> Create a production sprite atlas for Tower Delve, a medieval dungeon RPG.
> Draw reusable UI backgrounds and control pieces, isolated on transparency, without lettering, icons, scenery or perspective.
> Match the attached source atlas: restrained 1990s dungeon RPG pixel art, consistent coarse pixel grid, one-pixel charcoal outlines, two-pixel bevels, upper-left light and bottom-right shadows.
> Use the attached slate-and-brass palette, with wine red for destructive controls, blue for XP and green for progress.
> Keep centers quiet and flat behind live text; use small brass corner fittings, straight edges and crisp stepped corners.
> No gradients, antialiasing, blur, glow, dithering, noise or painterly detail.
> Produce [specified pieces and states] with identical geometry, aligned in [specified atlas layout] with transparent gutters.

The initial source used a four-column, four-row layout.
Row one contains normal, hover, pressed and selected buttons.
Row two contains disabled and danger buttons, a panel and a dialog.
Row three contains a field, a progress track, a blue fill and a red fill.
Row four contains a green fill, a surface, a banner and a slot.
Image generation establishes the design; measured extraction and palette normalization establish the production pixel grid.

## Export

With ImageMagick installed, run `node tools/prepare-ui-sprites.mjs` from the repository root.
An optional first argument selects a replacement source atlas, but a different layout requires updating the measured crop rectangles.
Source art remains outside `public/` so it is not deployed.
The game needs no image-processing dependency.

Before accepting a replacement, inspect the native-size pieces and compare normal, hover, selected, pressed and disabled states together.
Check phone and desktop layouts, keyboard focus, save/reload, toggling off, erase-progress reset, and short-of-Gems controls remaining actionable.
