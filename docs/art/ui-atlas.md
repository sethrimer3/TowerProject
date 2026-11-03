# Experimental UI atlas

Visual settings offers **Experimental Atlas feature**, off by default.
Changing it saves the preference and reloads the game so the chosen image path applies before loading begins.
All original sprites remain in their original locations and are still shipped.
Turning the feature off restores the individual-image path.

`npm run sprites:atlas` refreshes the sprite inventory and runs both `tools/build-ui-atlas.mjs` and `tools/build-world-atlas.mjs`, also run by the production prebuild.
The packer reads existing native RGB, indexed and RGBA PNGs, sorts by dimensions and path, and packs shelf rows with two transparent pixels of padding.
It copies RGBA bytes exactly, without trimming, rotation, resizing or palette changes.
`tools/ui-atlas-png.mjs` supplies lossless PNG decoding/encoding using Node's built-in zlib; ImageMagick is not required to build the atlas.
PostCSS produces matching CSS image-source overrides from the project's stylesheets.

The output is `public/assets/atlases/ui.png`, its readable `ui.json` coordinate map, and generated runtime metadata/CSS in `src/sprites/ui-atlas-data.ts` and `src/sprites/ui-atlas.css`.
The atlas currently includes 416 UI and shared small sprites: icons, Equipment, card faces, controls, interface frames, ornaments and theme components.
A second atlas, `public/assets/atlases/world.png`, packs all 159 remaining startup images into 2048 × 4096 pixels, including terrain sheets, actor animation strips and theme previews.
`tools/build-world-atlas.mjs` generates its `world.json` and `src/sprites/world-atlas-data.ts` from the startup inventory minus UI atlas entries.
The two atlases cover every startup sprite exactly once and use the same checkbox.
An image-content revision in the atlas URL prevents new coordinate maps from using a stale cached atlas.

`ui-atlas.ts` reads the saved preference before UI modules build their markup.
An early inline script applies the atlas class before CSS can request original UI backgrounds.
With the experiment enabled, preload skips every packed image and decodes both atlases once each.
DOM icons use CSS regions of the atlas, and `drawKit` draws source rectangles directly from it.
Canvas consumers that need a standalone source receive a memoized canvas crop, not a fetched original image.
CSS nine-slice and repeating backgrounds receive in-memory blob surfaces cropped from the decoded UI atlas; no original frame file is requested.
The interface-loading scan also skips packed original URLs, including development `/public/` paths.

A failed atlas stays behind the existing loading barrier and Retry behavior instead of silently downloading the packed originals.
The error screen additionally offers **Turn off experimental Atlas**, preserving the rest of the save and reloading through the original image path.
Profile import or progress reset reloads if it changes the active atlas preference.

`tests/ui-atlas.test.ts` verifies exact source pixels, transparent gutters, non-overlap, retained originals and setting persistence.
`node tests/ui-atlas.mjs` exercises the real checkbox/reload, checks that both atlases load without original image requests before and after navigation, compares an icon and terrain/animation sheets against original browser pixels, verifies reverting to original images and exercises second-atlas failure recovery.
After `npm run build`, `node --experimental-transform-types tests/ui-atlas-production.mjs` verifies atlas loading under the production `/TowerProject/` path.
