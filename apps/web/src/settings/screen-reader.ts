/**
 * Whether the editor reads the document out to a screen reader (editor-core screen-reader.ts): a
 * setting of this browser, off unless switched on, as web-apps keeps it ("app-settings-screen-reader"
 * in localStorage, documenteditor main Main.js).
 */
import { browserSetting } from "./browser-setting";

const setting = browserSetting("schreibzeug.screenreader", false);

export const readScreenReader = setting.read;
export const writeScreenReader = setting.write;
