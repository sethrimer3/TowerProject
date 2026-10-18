import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { paintRoofSprite, CITY_ROOFS } from "../src/defend/city-sprites.ts";
import { paintCityLayer } from "../src/defend/city-layer.ts";
import { paintIcon, paintStructureArt, structureSprite } from "../src/defend/structure-art.ts";
import { defaultLayout, fitLayout, placeCityTile } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { cityLights } from "../src/defend/lighting.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { UPGRADES, STRUCTURES, type StructureKind } from "../src/defend/catalog.ts";

type Draw = { id: string; args: number[] };
function canvas() {
  const draws: Draw[] = [];
  const c = new Proxy({ canvas: { width: 504, height: 728 }, imageSmoothingEnabled: true,
    drawImage(image: { src: string }, ...args: number[]) { draws.push({ id: image.src.split("/").at(-1)!, args }); },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get(target, key) { return Reflect.get(target, key) ?? (() => {}); } }) as unknown as CanvasRenderingContext2D;
  return { c, draws };
}

test("Defend city PNGs keep roof pixels square and replace live dressing only when enabled", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const images: string[] = [];
  class ReadyImage {
    complete = true; naturalWidth = 24; private path = "";
    set src(value: string) { this.path = value; images.push(value); }
    get src() { return this.path; }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  try {
    let layout = defaultLayout();
    const { tx, ty } = layout.keep;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]])
      layout = placeCityTile(layout, tx + dx, ty + dy)!;
    const map = generateCity(fitLayout(layout), 3), lights = cityLights(map);
    const { c, draws } = canvas();
    paintCityLayer(c, 8, { map, lights, stones: [], sim: null });
    assert.equal(images.length, 0, "disabled art never requests kit images");
    const original = draws.slice();
    paintCityLayer(c, 8, { map, lights, stones: [], sim: null, styledSprites: true });
    for (const id of [...CITY_ROOFS, "city-wall-cap", "city-wall-face", "city-lantern"])
      assert.ok(draws.some(d => d.id === `${id}.png`), id);
    assert.ok(draws.some(d => /city-(oak|pine)\.png/.test(d.id)));
    const sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as never, 7);
    const house = map.buildings.find(b => b.kind === "house" && b.cells.length > 1)!;
    sim.damageBuilding(house.id, sim.maxHp[house.id]);
    sim.rebuildCell(house.cells[0]);
    paintCityLayer(c, 8, { map, lights, stones: [], sim, styledSprites: true });
    for (const id of ["city-rubble", "city-scaffold"]) assert.ok(draws.some(d => d.id === `${id}.png`));
    draws.length = 0;
    paintCityLayer(c, 8, { map, lights, stones: [], sim: null, styledSprites: false });
    assert.deepEqual(draws, original, "toggling off restores exactly the original draw calls");
    paintIcon({ width: 48, getContext: () => c } as unknown as HTMLCanvasElement, "cityTile", true);
    assert.equal(draws.at(-1)?.id, "city-tile.png");
    const manifest = JSON.parse(readFileSync(new URL("../public/assets/style/manifest.json", import.meta.url), "utf8"));
    for (const [kind, def] of Object.entries(STRUCTURES)) {
      const id = structureSprite(kind as StructureKind), asset = manifest.assets[id];
      assert.equal(asset.width / def.w, 12, "structures share the city's twelve pixels per cell");
      assert.equal(asset.height / def.h, 12);
      paintIcon({ width: 48, getContext: () => c } as unknown as HTMLCanvasElement, kind as StructureKind, true);
      const call = draws.at(-1)!;
      assert.equal(call.id, `${id}.png`);
      assert.ok(Math.abs(call.args[2] / call.args[3] - def.w / def.h) < 0.00001, "palette retains the building's aspect ratio");
    }
    assert.equal(manifest.assets["defend-barracks-wide"].width, 48);
    assert.equal(manifest.assets["defend-barracks-wide"].height, 36);
    paintStructureArt(c, "barracks", { x: 0, y: 0, w: 48, h: 36, px: 12 }, true);
    assert.equal(draws.at(-1)?.id, "defend-barracks-wide.png");
    for (const [w, h] of [[12, 12], [24, 36], [48, 24], [36, 36]]) {
      draws.length = 0;
      assert.equal(paintRoofSprite(c, 0, { x: 3, y: 5, w, h }, 12), true);
      let area = 0;
      for (const d of draws) {
        const [sx, sy, sw, sh, x, y, dw, dh] = d.args;
        assert.ok(sx >= 0 && sy >= 0 && sx + sw <= 24.0001 && sy + sh <= 24.0001);
        assert.equal(sw, dw); assert.equal(sh, dh);
        assert.ok(x >= 3 && y >= 5 && x + dw <= 3 + w + 0.0001 && y + dh <= 5 + h + 0.0001);
        area += dw * dh;
      }
      assert.equal(area, w * h, "roof covers its footprint without gaps or overlaps");
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "Image", previous);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});
