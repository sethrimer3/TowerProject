import type { Game } from "../state.ts";
import type { ConfirmPrompt } from "./dialogs.ts";

/** Every page tab. Tower and Delve both show the board. */
export type Tab = "tower" | "delve" | "deck" | "defend" | "gear" | "upgrades" | "settings" | "shop" | "goals";
export const isBoard = (id: string): id is "tower" | "delve" => id === "tower" || id === "delve";

/** The game as pages see it: its state to read (a page may change a setting
 * or a purchase in the save, never swap the save, run or mode), and the
 * commands that change the rest. */
export type PageGame = Readonly<Pick<Game, "mode" | "run" | "save" | "fallen" | "handStuck" | "stepRules" | "free" | "maxSpeed" | "stepsPerSecond">> &
  Pick<
    Game,
    | "undo" | "acceptDefeat" | "eraseAll" | "finish" | "setDevMode"
    | "claimGoal" | "warp"
    | "buy" | "train" | "trainWithGold" | "trainingLeft" | "claimTrainingBoost" | "cancelTraining" | "finishTraining" | "buyTrainer" | "resetTraining" | "buyHandSlot" | "arrangeHand" | "addToHand" | "placeInHand" | "removeFromHand" | "buyGold" | "craftEquipment" | "craftConsumable" | "salvageEquipment"
    | "equipItem" | "unequipSlot" | "useConsumable"
    | "clock" | "buyOffer" | "startResearch" | "cancelResearch" | "setAutoContinue" | "hireArchivist" | "finishResearchNow"
  >;

/** What pages and dialogs need from the app around them. */
export interface AppContext {
  readonly game: PageGame;
  /** The one shared dialog element. */
  readonly modal: HTMLDialogElement;
  /** Persists the save, reporting unavailable storage in the status line. */
  save(): void;
  /** Refreshes the HUD from game state (and saves, and shows the defeat dialog while the hero lies fallen). */
  update(): void;
  /** Re-renders the current page. */
  renderPage(): void;
  navigate(tab: string): void;
  /** Shows a confirm dialog that runs `action` if the player confirms. */
  confirm(prompt: ConfirmPrompt, action: () => void): void;
}
