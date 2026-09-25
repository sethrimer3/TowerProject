import type { Game } from "../state.ts";
import type { Renderer } from "../rendering.ts";

/** Every page tab. Tower and Delve both show the board. */
export type Tab = "tower" | "delve" | "defend" | "gear" | "upgrades" | "settings";
export const isBoard = (id: string): id is "tower" | "delve" => id === "tower" || id === "delve";

/** What pages and dialogs need from the app around them. */
export interface AppContext {
  readonly game: Game;
  readonly renderer: Renderer;
  /** The one shared dialog element. */
  readonly modal: HTMLDialogElement;
  /** Persists the save, reporting unavailable storage in the status line. */
  save(): void;
  /** Refreshes the HUD from game state (and saves, and shows any run summary). */
  update(): void;
  /** Re-renders the current page. */
  renderPage(): void;
  navigate(tab: string): void;
  /** Shows a confirm dialog that runs `action` if the player confirms. */
  confirm(title: string, body: string, label: string, action: () => void): void;
}
