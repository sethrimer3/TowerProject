"""Draws the Lore Fragment currency icon: a small clay tablet scored with
wedge-shaped writing, on the shared 24-pixel canvas in the UI palette.

Run from the repository root: python3 tools/prepare-lore-sprite.py, then npm run sprites:atlas.
"""
from PIL import Image

OUTLINE = (12, 16, 22, 255)
SHADOW = (128, 96, 61, 255)
CLAY = (178, 138, 82, 255)
LIGHT = (225, 187, 120, 255)
GLINT = (238, 224, 183, 255)
INK = (73, 58, 44, 255)

# The tablet's rows: '#' outline, 'c' clay, 'l' light edge, 's' shadow edge,
# 'w' a scored wedge, 'g' a glint, '.' clear. Its top right corner is broken off.
ROWS = [
    "........................",
    "........................",
    "........................",
    ".......#########........",
    "......#glllllll#........",
    ".....#lllcccccl##.......",
    ".....#lcwwcwwcccl#......",
    ".....#lcwccwcwccss#.....",
    ".....#lccccccccccs#.....",
    ".....#lcwwcwwwcwcs#.....",
    ".....#lcwccwccwccs#.....",
    ".....#lccccccccccs#.....",
    ".....#lcwcwwcwwccs#.....",
    ".....#lcwcwccwcccs#.....",
    ".....#lccccccccccs#.....",
    ".....#lcwwcwcwwccs#.....",
    ".....#lcwccwcwcccs#.....",
    ".....#lccccccccccs#.....",
    ".....#lcwwwcwwcccs#.....",
    ".....#lccccccccccs#.....",
    ".....#lsssssssssss#.....",
    "......############......",
    "........................",
    "........................",
]
COLORS = {"#": OUTLINE, "c": CLAY, "l": LIGHT, "s": SHADOW, "w": INK, "g": GLINT}

image = Image.new("RGBA", (24, 24), (12, 16, 22, 0))
for y, row in enumerate(ROWS):
    assert len(row) == 24, (y, len(row))
    for x, ch in enumerate(row):
        if ch in COLORS:
            image.putpixel((x, y), COLORS[ch])
        elif ch == ".":
            pass
        else:
            raise ValueError(ch)
image.save("public/assets/style/cell.png")
print("Prepared the Lore Fragment clay tablet sprite.")
