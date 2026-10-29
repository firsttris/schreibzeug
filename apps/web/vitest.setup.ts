import { overwriteGetLocale } from "./src/paraglide/runtime";

// The unit tests read the German texts, whatever language the test browser reports.
overwriteGetLocale(() => "de");
