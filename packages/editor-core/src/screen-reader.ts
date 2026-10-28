/**
 * The engine's screen reader support (common/workerspeech.js). On, it writes where the cursor went
 * and what got selected into an aria-live region beside its hidden input (div#area_id_screen_reader):
 * the character, word or line passed in a text, a cell's value and address, a slide's number, a
 * picture's alternative text. Off, it listens to nothing (EditorActionSpeaker.run and .stop register
 * and remove its callbacks), so it costs nothing for those who do not need it. web-apps offers it as
 * a setting; Strg+Alt+Z switches it in the engine itself (word/Editor/Shortcuts.js SpeechWorker).
 */
import type { CommonEventArgs, EngineApiBase, EngineWindow } from "./engine-types";

/**
 * The words it says around the text, looked up in the API's `translate` map by their English key
 * (workerspeech.js `translateManager.getValue`); without them a German document is read out with
 * English words in between.
 */
export const SPEECH_TEXTS: Record<string, string> = {
  space: "Leerzeichen",
  select: "ausgewählt",
  unselected: "Auswahl aufgehoben",
  selected: "ausgewählt",
  slide: "Folie",
  "slides added to selection": "Folien ausgewählt",
  "slides unselected": "Folien nicht mehr ausgewählt",
  "drawing select": "Objekt ausgewählt",
  "empty cell": "leere Zelle",
  empty: "leer",
  "selected range select": "Bereich ausgewählt",
  "unselected range select": "Bereich nicht mehr ausgewählt",
  areas: "Bereiche",
  "empty sheet": "leeres Tabellenblatt",
  "end of sheet": "Ende des Tabellenblatts",
  cells: "Zellen",
  objects: "Objekte",
};

export type ScreenReaderEvent = { type: "screenReader"; value: boolean };

/**
 * Names the engine's hidden input, which a screen reader announces when the document takes the
 * focus, and gives it a valid autocomplete: the engine sets "extremely_off" in Chrome against its
 * autofill (common/text_input2.js), which is no autocomplete value; a textarea is not autofilled.
 */
export const labelEngineInput = (input: HTMLElement, label: string): void => {
  input.setAttribute("aria-label", label);
  input.setAttribute("autocomplete", "off");
};

const isRunning = (win: EngineWindow): boolean => win.AscCommon.EditorActionSpeaker?.isLanched === true;

/**
 * Switches the support on or off, from the start or later, and tells the store when Strg+Alt+Z
 * switched it in the engine. Returns what stops following the keys.
 */
export const followScreenReader = (
  win: EngineWindow,
  api: Pick<EngineApiBase<CommonEventArgs>, "setSpeechEnabled">,
  on: boolean,
  dispatch: (event: ScreenReaderEvent) => void,
) => {
  api.setSpeechEnabled(on);
  dispatch({ type: "screenReader", value: on });
  // The engine switches on keydown (Strg+Alt+Z, on a Mac also Strg+Umschalt+Z); by keyup it has.
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "KeyZ") dispatch({ type: "screenReader", value: isRunning(win) });
  };
  win.addEventListener("keyup", onKeyUp, true);
  return {
    set: (next: boolean) => {
      api.setSpeechEnabled(next);
      dispatch({ type: "screenReader", value: next });
    },
    stop: () => win.removeEventListener("keyup", onKeyUp, true),
  };
};
