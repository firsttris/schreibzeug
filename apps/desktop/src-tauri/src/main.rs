// No console window next to the app on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// CEF starts this same executable again for its renderer, GPU and utility processes; the macro
// runs those and returns before the app is built (tauri-runtime-cef, examples/cef/src-tauri/src/main.rs).
#[cfg_attr(target_os = "linux", tauri_runtime_cef::cef_entry_point)]
fn main() {
    schreibzeug_desktop_lib::run()
}
