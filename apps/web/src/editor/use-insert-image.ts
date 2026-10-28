import { messageOf } from "../api/client";
import { m } from "../paraglide/messages";

/** What an Office file takes as a picture; the server checks the bytes again (src/files/media.ts). */
const IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/bmp";

/** Opens the browser's file dialog; null when it was closed without a choice. */
const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });

type ImageSource = { insertImage: ((bytes: Uint8Array) => Promise<void>) | null };

/**
 * "Bild …": an image from the computer, put in at the cursor. Null where the editor cannot take
 * one or the person may only look.
 */
export const useInsertImage = (
  editor: ImageSource | null,
  readOnly: boolean,
  notify: (message: string) => void,
): (() => void) | null => {
  const insertImage = editor?.insertImage;
  if (!insertImage || readOnly) return null;
  return () =>
    void pickFile(IMAGE_TYPES).then(async (file) => {
      if (!file) return;
      try {
        await insertImage(new Uint8Array(await file.arrayBuffer()));
      } catch (error) {
        notify(m.use_insert_image_failed({ reason: messageOf(error) }));
      }
    });
};
