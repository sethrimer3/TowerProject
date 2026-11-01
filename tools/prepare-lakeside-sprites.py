"""Original native pixel art for the lake, using Tower Delve's shared palette.

Run with Python + Pillow. No generated or downloaded source art is needed.
"""
from pathlib import Path
import json
import random
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/style"
INK = "#10151c"
WOOD = ["#493a2c", "#80603d", "#b28a52", "#e1bb78"]
GREEN = ["#283b2c", "#3c5837", "#668348", "#a7bd75"]
WATER = ["#16303d", "#315363", "#54879a", "#88c5db"]
manifest_path = OUT / "manifest.json"
manifest = json.loads(manifest_path.read_text())


def save(name, image, tile=False):
    image.save(OUT / f"{name}.png", optimize=True)
    manifest["assets"][name] = {"file": f"{name}.png", "width": image.width, "height": image.height}
    if tile:
        manifest["assets"][name]["tile"] = True


# A connected 4 by 4 tile water panel: quiet broad bands and sparse glints.
rng = random.Random(406)
im = Image.new("RGBA", (96, 96), WATER[0])
d = ImageDraw.Draw(im)
for _ in range(85):
    x, y = rng.randrange(96), rng.randrange(96)
    length = rng.randrange(3, 13)
    d.line((x, y, min(95, x + length), y), fill=rng.choice([WATER[1], WATER[0], WATER[0]]))
for x, y in [(11, 17), (54, 41), (25, 74), (80, 84), (68, 10)]:
    d.line((x, y, x + 5, y), fill=WATER[2])
    d.point((x + 2, y - 1), fill=WATER[2])
save("lake-water", im, True)

im = Image.new("RGBA", (24, 24), GREEN[0])
d = ImageDraw.Draw(im)
for y in range(24):
    edge = [8, 8, 7, 7, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9, 8, 8, 7, 7, 6, 6, 7, 7, 8, 8][y]
    d.line((0, y, edge, y), fill=WATER[0])
    d.point((edge, y), fill=WATER[1])
    d.line((edge + 1, y, edge + 3, y), fill=WOOD[0])
    d.line((edge + 4, y, edge + 7, y), fill=WOOD[1])
    d.point((edge + 4, y), fill=WOOD[2])
for x, y in [(18, 3), (20, 8), (17, 14), (21, 20), (15, 22)]:
    d.line((x, y, x + 1, y - 2), fill=GREEN[1])
save("lake-shore", im, True)

im = Image.new("RGBA", (24, 24), WOOD[0])
d = ImageDraw.Draw(im)
for x in range(0, 24, 6):
    d.rectangle((x + 1, 0, x + 5, 23), fill=WOOD[1])
    d.line((x + 1, 0, x + 1, 23), fill=WOOD[2])
    d.line((x + 4, 4, x + 4, 11), fill=WOOD[0])
    d.line((x + 3, 17, x + 3, 22), fill=WOOD[2])
    for y in [2, 21]:
        d.point((x + 3, y), fill=INK)
        d.point((x + 2, y), fill="#63717b")
save("lake-dock", im, True)

im = Image.new("RGBA", (24, 36))
d = ImageDraw.Draw(im)
for x, tip, lean in [(5, 8, -2), (10, 2, 1), (15, 5, -1), (19, 12, 2)]:
    d.line((x, 34, x + lean, tip), fill=GREEN[0], width=2)
    d.line((x, 33, x + lean, tip + 1), fill=GREEN[2])
    d.line((x, 27, x - 5, 18), fill=GREEN[1], width=2)
    d.line((x, 30, x + 4, 22), fill=GREEN[2])
    d.rectangle((x + lean - 1, tip, x + lean + 1, tip + 7), fill=WOOD[0])
    d.line((x + lean - 1, tip + 1, x + lean - 1, tip + 5), fill=WOOD[2])
save("lake-reeds", im)

# Seated, bearded fisherman facing the lake, with a long rod and line.
im = Image.new("RGBA", (48, 40))
d = ImageDraw.Draw(im)
d.ellipse((24, 34, 46, 39), fill=INK)
# Stool and boots.
d.rectangle((31, 29, 42, 32), fill=WOOD[0])
d.rectangle((32, 31, 34, 38), fill=WOOD[1])
d.rectangle((40, 31, 42, 38), fill=WOOD[1])
d.rectangle((26, 29, 32, 36), fill="#293543")
d.rectangle((28, 32, 36, 37), fill=INK)
d.rectangle((25, 35, 31, 37), fill=WOOD[0])
# Coat, vest, scarf and the reaching sleeve.
d.rectangle((29, 15, 40, 29), fill=INK)
d.rectangle((30, 16, 39, 28), fill=GREEN[1])
d.rectangle((35, 17, 39, 27), fill=WOOD[1])
d.line((38, 18, 38, 25), fill=WOOD[2])
d.rectangle((26, 20, 32, 24), fill=GREEN[2])
d.rectangle((23, 21, 27, 23), fill="#e1bb78")
d.rectangle((29, 15, 35, 18), fill="#693239")
# Face, nose and a silver beard below a broad moss-green hat.
d.rectangle((29, 7, 37, 15), fill=INK)
d.rectangle((29, 8, 36, 13), fill="#e1bb78")
d.rectangle((27, 10, 30, 12), fill="#e1bb78")
d.point((29, 9), fill=INK)
d.rectangle((30, 13, 36, 16), fill="#b8c2bb")
d.rectangle((31, 16, 35, 18), fill="#8b9a9d")
d.line((30, 13, 33, 13), fill="#eee0b7")
d.rectangle((29, 3, 37, 7), fill=INK)
d.rectangle((30, 3, 36, 6), fill=GREEN[1])
d.line((30, 3, 35, 3), fill=GREEN[2])
d.rectangle((25, 7, 40, 8), fill=GREEN[0])
d.line((26, 7, 39, 7), fill=GREEN[2])
# Bucket with metal rim, and the curved rod extending over the water.
d.rectangle((42, 28, 47, 36), fill=INK)
d.rectangle((43, 29, 46, 35), fill="#63717b")
d.line((42, 28, 47, 28), fill="#b8c2bb")
d.line([(25, 22), (21, 16), (16, 10), (10, 7), (4, 6)], fill=WOOD[2], width=1)
d.line([(4, 6), (3, 16), (2, 28), (2, 34)], fill="#8b9a9d")
d.rectangle((1, 33, 3, 35), fill="#a6544e")
d.point((2, 32), fill="#eee0b7")
save("lake-fisherman", im)

manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
print("Prepared five original lakeside PNG sprites.")
