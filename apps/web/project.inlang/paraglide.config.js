// The compiler options for the Vite plugin (vite.config.ts) and `bun run i18n` alike, which runs in
// apps/web: a language chosen in the settings first, then the browser's, then German. The .d.ts
// files let TypeScript check the message calls without allowJs.
export default {
  outdir: "./src/paraglide",
  strategy: ["localStorage", "preferredLanguage", "baseLocale"],
  localStorageKey: "schreibzeug.locale",
  emitTsDeclarations: true,
};
