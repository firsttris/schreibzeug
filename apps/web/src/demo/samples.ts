import offer from "../../../../test-files/angebot.docx?url";
import form from "../../../../test-files/formular.pdf?url";
import notes from "../../../../test-files/notiz.md?url";
import prices from "../../../../test-files/preise.xlsx?url";
import talk from "../../../../test-files/vortrag.pptx?url";
import type { Folder } from "./folder";

/**
 * The files the demo starts with: the test files the screenshots show (test-files/README.md, ours,
 * AGPL-3.0), one of each kind the editors open. Vite ships them beside the app.
 */
export const SAMPLES: readonly { name: string; url: string }[] = [
  { name: "Angebot.docx", url: offer },
  { name: "Preise.xlsx", url: prices },
  { name: "Vortrag.pptx", url: talk },
  { name: "Projektnotizen.md", url: notes },
  { name: "Formular.pdf", url: form },
];

/** Puts the samples into the folder's top level; `fetch` reaches the network, not the demo's API. */
export const seed = async (
  folder: Folder,
  fetch: (url: string) => Promise<Response>,
  samples = SAMPLES,
): Promise<void> => {
  const files = await Promise.all(
    samples.map(async ({ name, url }) => {
      const reply = await fetch(url);
      if (!reply.ok) throw new Error(`demo sample ${url}: ${reply.status}`);
      return { name, bytes: new Uint8Array(await reply.arrayBuffer()) };
    }),
  );
  for (const { name, bytes } of files) await folder.createFile(null, name, bytes);
};
