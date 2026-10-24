import assert from "node:assert/strict";
import test from "node:test";
import { defaults } from "../src/save/save.ts";
import { usesGameSprites, usesUiSprites } from "../src/sprite-style.ts";
import { THEME_IDS } from "../src/theme-collection.ts";
import { SETTINGS } from "../src/save/settings.ts";

test("the shared sprite kit stays off by default", () => {
  const save = defaults();
  assert.equal(usesUiSprites(save), false);
  assert.equal(usesGameSprites(save), false);
});

test("every non-default owned theme overrides sprites in its own area", () => {
  const save = defaults();
  save.themes = [...THEME_IDS];
  save.settings.uiSprites = true;
  for (const [look] of SETTINGS.uiTheme.choices) {
    save.settings.uiTheme = look;
    assert.equal(usesUiSprites(save), look === "classic" || look === "medieval", look);
    assert.equal(usesGameSprites(save), true, "a UI theme does not change the board");
  }
  save.settings.uiTheme = "medieval";
  for (const [look] of SETTINGS.gameTheme.choices) {
    save.settings.gameTheme = look;
    assert.equal(usesGameSprites(save), look === "classic", look);
    assert.equal(usesUiSprites(save), true, "a Game theme does not change UI art");
  }
  assert.equal(save.settings.uiSprites, true, "theme changes preserve the preference");
  save.settings.gameTheme = "classic";
  save.settings.spritesOff = true;
  assert.equal(usesGameSprites(save), false);
  assert.equal(usesUiSprites(save), true);
});
