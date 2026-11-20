import { canWear, type GameLook, type ThemeKind, type UiLook } from "../theme-collection.ts";
import type { DeskHost } from "./desk.ts";

/** The Themes page's command: wearing a theme (they are bought in events'
 * Stores, game/event-desk.ts). */
export class ThemeDesk {
  constructor(private readonly host: DeskHost) {}

  /** Equips an owned theme's look (any, with Access to Everything), or
   * Classic; false while it can't be worn. */
  wear(kind: ThemeKind, look: string) {
    const save = this.host.save;
    if (!canWear(save, kind, look)) return false;
    if (kind === "ui") save.settings.uiTheme = look as UiLook;
    else save.settings.gameTheme = look as GameLook;
    return true;
  }
}
