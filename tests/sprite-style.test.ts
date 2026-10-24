import assert from "node:assert/strict";
import test from "node:test";
import { defaults } from "../src/save/save.ts";
import { usesGameSprites, usesUiSprites } from "../src/sprites/style.ts";
import { THEME_IDS } from "../src/theme-collection.ts";
import { SETTINGS } from "../src/save/settings.ts";

test("the shared sprite kit is the default for new saves", () => {
  const save = defaults();
  assert.equal(usesUiSprites(save), true);
  assert.equal(usesGameSprites(save), true);
});

test("every non-default owned theme overrides sprites in its own area", () => {
  const save = defaults();
  save.themes = [...THEME_IDS];
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
});
