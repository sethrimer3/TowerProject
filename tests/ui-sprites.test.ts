import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaults } from "../src/save/save.ts";
import { applyUiTheme } from "../src/ui/medieval.ts";

test("UI sprites follow the selected theme and are restored by reset", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const classes = new Set<string>();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { classList: {
      toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
    } } },
  });
  try {
    const save = defaults();
    applyUiTheme(save);
    assert.ok(classes.has("medieval"));
    assert.ok(classes.has("ui-sprites"));
    save.settings.reduceMotion = true;
    applyUiTheme(save);
    assert.ok(classes.has("ui-sprites"));
    assert.ok(classes.has("medieval"));
    assert.ok(classes.has("reduce-motion"));
    save.themes.push("neonUi");
    save.settings.uiTheme = "neon";
    applyUiTheme(save);
    assert.ok(!classes.has("ui-sprites"));
    assert.ok(classes.has("neon"));
    applyUiTheme(save);
    applyUiTheme(defaults());
    assert.ok(classes.has("ui-sprites"), "reset restores the default pixel art");
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("the deployed UI kit contains real PNGs at the declared native sizes", () => {
  const root = new URL("../public/assets/ui/frames/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
  for (const asset of Object.values(manifest.assets) as { file: string; width: number; height: number }[]) {
    const png = readFileSync(new URL(asset.file, root));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", asset.file);
    assert.equal(png.readUInt32BE(16), asset.width, asset.file);
    assert.equal(png.readUInt32BE(20), asset.height, asset.file);
  }
});
