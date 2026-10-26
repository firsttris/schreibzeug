/**
 * Code a document carries never runs. The engine frame is same-origin, and sdkjs evaluates such
 * code in closures that hide `window` and `document` but not `parent`, `top`, `fetch` or
 * `location` (common/macros.js `_safe_eval_closure`, pdf/src/forms/formActions.js `EvalScript`):
 * a shared file could act with the signed-in user's session. Schreibzeug has no macro editor and
 * no plugins, so nothing is lost but the scripts themselves. Three ways in, three switches:
 *
 * - JS macros (word, cell, slide): `asc_CDocInfo.put_IsEnabledMacroses(false)` in `createDocInfo`
 *   (document.ts), which `asc_runMacros` and `asc_runAutostartMacroses` check
 *   (common/apiBase.js).
 * - Custom functions of a spreadsheet: cell/model/Serialize.js `PostLoadPrepare` keeps those of
 *   the file, and `_openDocumentEndCallback` (cell/api.js) evaluates them through
 *   `registerCustomFunctionsLibrary` (cell/api_plugins.js) on open, without asking the macro flag;
 *   a co-editor's change can set new ones (`SetCustomFunctions`). See `withoutCustomFunctions`.
 * - JavaScript actions of a PDF (field formats, calculations, link actions): `CActionRunScript`
 *   runs them on focus, keystroke or click, with no switch at all. See `silencePdfScripts`.
 */

/** cell/api_plugins.js: evaluates a custom-functions library (the file's and the browser's). */
type CustomFunctionsHost = { registerCustomFunctionsLibrary?: (...args: unknown[]) => void };

/** The spreadsheet API, with its custom-functions library never evaluated. */
export const withoutCustomFunctions = <Api extends object>(api: Api): Api => {
  // An own property, so it also holds once sdk-all.js has added the prototype's method later.
  (api as CustomFunctionsHost).registerCustomFunctionsLibrary = () => {};
  return api;
};

/** pdf/src/forms/formActions.js `CActionRunScript`: one JavaScript action of a field or link. */
export type PdfScriptAction = {
  script: string;
  Do: (...args: unknown[]) => unknown;
  RunScript: (...args: unknown[]) => unknown;
};
export type PdfScriptWindow = { AscPDF?: { CActionRunScript?: { prototype: PdfScriptAction } } };

/**
 * The action as it was, but with an empty script while it runs: the engine's action queue, its
 * events and their result go on as before, and the script stays in the file when it is saved
 * (`WriteToBinary` writes `this.script`).
 */
const withoutScript = (run: PdfScriptAction["Do"]) =>
  function (this: PdfScriptAction, ...args: unknown[]) {
    const script = this.script;
    this.script = "";
    try {
      return run.apply(this, args);
    } finally {
      this.script = script;
    }
  };

const silenced = new WeakSet<object>();

/** Every PDF JavaScript action of this frame runs as an empty script. */
export const silencePdfScripts = (win: PdfScriptWindow): void => {
  const action = win.AscPDF?.CActionRunScript?.prototype;
  if (!action || silenced.has(action)) return;
  action.Do = withoutScript(action.Do);
  action.RunScript = withoutScript(action.RunScript);
  silenced.add(action);
};

type Opening = { openDocument?: (file: unknown) => unknown };

/**
 * Runs `prepare` right before the engine reads the document. The PDF code is part of sdk-all.js,
 * which sdk-all-min.js loads only after the API exists (common/editorscommon.js `loadSdk`); by
 * `openDocument` (common/apiBase.js `onEndLoadFile`) it is there. The method is looked up on the
 * prototype when called, because it may not exist yet when this runs.
 */
export const beforeOpening = <Api extends object>(api: Api, prepare: () => void): Api => {
  (api as Opening).openDocument = function (this: Opening, file: unknown) {
    prepare();
    return (Object.getPrototypeOf(this) as Opening).openDocument?.call(this, file);
  };
  return api;
};
