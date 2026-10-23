# Tower Pixel

Original square-pixel lettering for Tower Delve's optional sprite kit.
Capitals, distinct lowercase, tabular digits and the game's common mathematical symbols are drawn from editable pixel matrices in `tools/prepare-pixel-font.py`.
The font uses one consistent stroke for all text weights and keeps text selectable, searchable and accessible to screen readers.
Other fonts' outlines and glyph data are not used.

Regenerate with `python tools/prepare-pixel-font.py` using FontTools with WOFF2 support (`fonttools[woff]`).
Only the bundled WOFF2 is needed by the game; no remote font service or runtime dependency is used.

Permission is granted to use, copy, modify and distribute this original font and its source without restriction.
