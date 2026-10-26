import { isArchiveTooLarge, MAX_UNZIPPED_BYTES } from "@schreibzeug/ooxml";
import { failure, type Outcome, success } from "./api";

const MEGABYTES = Math.round(MAX_UNZIPPED_BYTES / (1024 * 1024));

/** Why a stored file could not be unpacked, for the model: too large or broken. */
export const unreadable = (fileName: string, kind: string, error: unknown): string =>
  isArchiveTooLarge(error)
    ? `„${fileName}“ ist entpackt größer als ${MEGABYTES} MB; das liest dieses Werkzeug nicht. Öffne die Datei in Schreibzeug.`
    : `„${fileName}“ lässt sich nicht lesen: Die Datei ist beschädigt oder kein ${kind}.`;

/**
 * Runs what unpacks an Office file (the readers of @schreibzeug/ooxml throw on a broken or too
 * large archive), turning a throw into a failure the tool can answer with.
 */
export const unpacking = <T>(fileName: string, kind: string, run: () => T): Outcome<T> => {
  try {
    return success(run());
  } catch (error) {
    return failure(unreadable(fileName, kind, error));
  }
};
