# Patches for the Tauri CLI (temporary)

On Linux, `scripts/tauri.ts` builds the Tauri CLI from Tauri's sources at the version in
`package.json` (tag `tauri-cli-v<version>`) with these patches applied, and uses it instead of the
published CLI. Windows and macOS use the published CLI.

## tauri-cli-cef-angle-optional.patch

The bundler copies `libEGL.so` and `libGLESv2.so` from the CEF distribution into every Linux package
(`crates/tauri-bundler/src/bundle/linux/debian.rs`, `rpm.rs`, `appimage/sharun_cef.rs`). CEF 154
no longer ships them on Linux (`cef_binary_154.0.34 linux64_minimal`: `libcef.so`,
`libvk_swiftshader.so`, `libvulkan.so.1`), so the .deb, the .rpm and the AppImage fail. The patch
skips the two when CEF has none; Chromium then uses the system's `libEGL.so.1` and
`libGLESv2.so.2`. Everything else CEF needs stays required.

## Settings for the AppImage

`scripts/tauri.ts` also sets two variables for quick-sharun, which the bundler runs to make the
AppImage (a value already set wins):

- `STRACE_BINARY=schreibzeug-desktop`: quick-sharun starts every binary for a few seconds to find
  the libraries it loads, and cannot stop them without a terminal, so the local server
  (`schreibzeug-local`), which keeps running, hangs the build.
- `ANYLINUX_LIB=0`: its `anylinux.c` was removed from pkgforge-dev/Anylinux-AppImages, so its
  download fails; the library is an optional compatibility helper.

Remove each once Tauri's quick-sharun no longer needs it.

## Remove it again

Once a Tauri release copies the two only when they exist (issue
[#12](https://github.com/firsttris/schreibzeug/issues/12)):

- delete this folder and `scripts/tauri.ts`;
- in `package.json`, call `tauri` directly again;
- in `.github/workflows/desktop.yml`, remove the cache step for the patched CLI and set
  `tauriScript` back to `bunx tauri`;
- remove the section "Patched Tauri CLI" from `docs/desktop.md`.

`scripts/tauri.ts` stops with a pointer here when a patch no longer applies to a new CLI version,
which is the usual sign that Tauri changed or fixed that code.
