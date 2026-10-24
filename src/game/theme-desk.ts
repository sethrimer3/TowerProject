import { buyTheme, canWear, grantAllThemes, type GameLook, type ThemeId, type ThemeKind, type UiLook } from "../theme-collection.ts";
import type { DeskHost } from "./desk.ts";

/** The Themes page's commands: themes claimed in Dev mode, bought, and worn. */
export class ThemeDesk {
  constructor(private readonly host: DeskHost) {}

  /** In Dev mode, gives every theme not owned yet and returns them, for
   * the player to hear about; otherwise none. */
  claim(): ThemeId[] {
    return this.host.save.settings.devMode ? grantAllThemes(this.host.save) : [];
  }
  /** Buys a theme not owned yet (`THEME_PRICE`); false when it can't. */
  buy(id: ThemeId) {
    return buyTheme(this.host.save, id);
  }
  /** Equips an owned theme's look, or Classic; false while it isn't owned. */
  wear(kind: ThemeKind, look: string) {
    const save = this.host.save;
    if (!canWear(save, kind, look)) return false;
    if (kind === "ui") save.settings.uiTheme = look as UiLook;
    else save.settings.gameTheme = look as GameLook;
    return true;
  }
}
