import { kitIcon } from "../sprite-kit.ts";
import { researched } from "../archives.ts";
import { KEY_NAMES } from "../doors.ts";
import type { Mode } from "../entities.ts";
import type { Run } from "../runs.ts";
import type { Save } from "../save-shape.ts";
import { EQUIP_MATERIALS, type EquipMaterialId } from "../equipment/catalog.ts";
import { materialDef, type MaterialId } from "../materials.ts";
import { MODES } from "../modes.ts";
import { defaultFinds, newNotes } from "../run-notes.ts";
import { keyCount, whole } from "../whole.ts";
import type { AppContext } from "./app.ts";
import { capitalized, displayedProgress } from "./dom.ts";

/** One group of the notes: its heading, then its lines, label and value. */
export type NotesSection = { title: string; rows: [string, string][] };

/** Whether the run's notes can be read: Note Taking researched. */
export const notesResearched = (save: Pick<Save, "archives">) => researched(save.archives, "runNotes") > 0;

const amount = (n: number) => whole(n).toLocaleString("en-US");
/** A length of time as "1h 02m 05s" (minutes and seconds alone under an hour). */
export function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}h ${pad(m)}m ${pad(s % 60)}s` : `${m}m ${pad(s % 60)}s`;
}
const materialName = (id: string) =>
  id in EQUIP_MATERIALS ? EQUIP_MATERIALS[id as EquipMaterialId].name : materialDef(id as MaterialId).name;
/** A group's lines, or a single "None" when it has none. */
const orNone = (rows: [string, string][]): [string, string][] => (rows.length ? rows : [["None", "—"]]);

/** The run's notes at `now` (wall clock, ms), grouped: where the run
 * stands, its exploring, fighting, keys and doors, and what it found. */
export function notesSections(save: Save, mode: Mode, run: Run, now: number): NotesSection[] {
  const words = MODES[mode].words, slice = save[mode];
  const notes = run.notes ?? newNotes(0), finds = run.outside ? defaultFinds() : slice.runFinds;
  const progress = capitalized(words.progress);
  return [
    { title: "Run", rows: [
      [words.tierName, String(run.tier ?? 1)],
      [`${progress} reached`, String(displayedProgress(run.maxHeight ?? run.height, !!run.outside))],
      [`Current ${words.progress}`, String(displayedProgress(run.height, !!run.outside))],
      ["Real time", notes.startedAt ? elapsed(now - notes.startedAt) : "—"],
    ] },
    { title: "Exploration", rows: [["Steps taken", amount(notes.steps)], ["Chests opened", amount(run.treasures)]] },
    { title: "Combat", rows: [["Enemies defeated", amount(run.kills)], ["XP earned", amount(run.xp ?? 0)]] },
    { title: "Keys obtained", rows: (["yellow", "blue", "red"] as const).map((c): [string, string] => [`${KEY_NAMES[c]} keys`, keyCount(notes.keys[c] ?? 0)]) },
    { title: "Doors opened", rows: orNone(Object.entries(notes.doors).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, n]): [string, string] => [name, amount(n)])) },
    { title: "Currency", rows: [
      ["Gold", amount(run.outside ? 0 : slice.runGold)],
      ["Silver", amount(notes.silver)],
      [words.currency, amount(run.outside ? 0 : slice.runCurrency)],
    ] },
    { title: "Materials", rows: orNone(Object.entries(finds.materials).map(([id, n]): [string, string] => [materialName(id), amount(n)])) },
    { title: "Other loot", rows: [
      ["Potions", amount(notes.potions)],
      ["ATK shards", amount(notes.attackShards)],
      ["DEF shards", amount(notes.defenseShards)],
      ["Gems", amount(finds.gems)],
      ["Cells", amount(finds.cells)],
      ["Equipment", amount(finds.equipment)],
    ] },
  ];
}

/** The sections as plain text, to paste elsewhere: a heading line for each
 * group, then its lines. */
export function notesText(title: string, sections: NotesSection[]) {
  return [title, ...sections.flatMap((s) => ["", s.title.toUpperCase(), ...s.rows.map(([label, value]) => `${label}: ${value}`)])].join("\n");
}

/** Two sheets, one over the other: the copy button's icon. */
export const COPY_ICON = kitIcon("ui-copy", `<svg class="copy-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v6.5A1.5 1.5 0 0 0 4 11h.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`, "copy-icon");
/** The copy button, its id `id`. */
export const copyButton = (id: string) => `<button id="${id}" class="copy-button" aria-label="Copy to clipboard" title="Copy to clipboard">${COPY_ICON}</button>`;

/** Puts `text` in the clipboard, and says so on `button` for a moment. */
export function copyText(button: HTMLButtonElement, text: string) {
  const done = (ok: boolean) => {
    button.classList.toggle("copied", ok);
    button.title = ok ? "Copied" : "Copy failed";
    setTimeout(() => ((button.title = "Copy to clipboard"), button.classList.remove("copied")), 1500);
  };
  const write = navigator.clipboard?.writeText(text);
  if (write) write.then(() => done(true), () => done(fallbackCopy(text)));
  else done(fallbackCopy(text));
}
/** Copies through a hidden text area, where the Clipboard API is missing
 * (an insecure context). */
function fallbackCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  return ok;
}

/** The run's notes (Note Taking): a dialog of its own, not the shared
 * modal, so opened from the floor number it leaves the run playing (the
 * frame loop pauses only for the modal), refreshed with the HUD while it
 * is open, and closed by the X at its top right. Opened from the run's
 * summary it stands over that dialog. */
export class RunNotesDialog {
  /** Made the first time the notes open, beside the shared modal in the app. */
  private made: HTMLDialogElement | null = null;
  /** The notes last shown, so a refresh that changes nothing leaves the page alone. */
  private shown = "";

  constructor(private ctx: AppContext) {}

  private get dialog() {
    if (this.made) return this.made;
    const dialog = (this.made = document.createElement("dialog"));
    dialog.id = "run-notes";
    dialog.className = "run-notes";
    dialog.setAttribute("aria-labelledby", "run-notes-title");
    this.ctx.modal.after(dialog);
    dialog.addEventListener("close", () => (this.shown = ""));
    return dialog;
  }

  get open() {
    return !!this.made?.open;
  }

  /** Opens the notes, over the shared modal when it is open (the run's
   * summary), else beside the board, which plays on. */
  show() {
    if (!notesResearched(this.ctx.game.save) || this.ctx.game.run.outside) return;
    this.refresh();
    if (this.dialog.open) return;
    if (this.ctx.modal.open) this.dialog.showModal();
    else this.dialog.show();
  }

  /** Redraws the notes while open (only the tables, and only when a
   * value changed, so the copy button and scroll stay put), and closes
   * them once the run has ended (its hero back in the forest). */
  refresh() {
    const { game } = this.ctx;
    if (game.run.outside) return this.made?.close();
    const title = `${capitalized(MODES[game.mode].words.run)} Notes`;
    const sections = notesSections(game.save, game.mode, game.run, game.clock()), key = JSON.stringify([title, sections]);
    if (key === this.shown) return;
    if (!this.shown) this.frame();
    this.shown = key;
    this.dialog.querySelector("#run-notes-title")!.textContent = title;
    this.dialog.querySelector(".notes-body")!.innerHTML = sections.map((s) =>
      `<table class="stats-table notes-table"><caption>${s.title}</caption><tbody>${s.rows.map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("")}</tbody></table>`).join("");
  }

  /** The dialog's frame: the X, the copy button, the heading, and the body the tables fill. */
  private frame() {
    const { game } = this.ctx;
    this.dialog.innerHTML = `<button id="run-notes-close" class="dialog-x" aria-label="Close" title="Close">✕</button>${copyButton("run-notes-copy")}<small>NOTE TAKING</small><h2 id="run-notes-title"></h2><div class="notes-body"></div>`;
    this.dialog.querySelector<HTMLButtonElement>("#run-notes-close")!.onclick = () => this.dialog.close();
    const copy = this.dialog.querySelector<HTMLButtonElement>("#run-notes-copy")!;
    copy.onclick = () => copyText(copy, notesText(this.dialog.querySelector("#run-notes-title")!.textContent ?? "", notesSections(game.save, game.mode, game.run, game.clock())));
  }
}
