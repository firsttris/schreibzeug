//! The app's windows: new windows from a page, downloads, links that leave the app, and the
//! address each window shows.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use crate::{downloads, on_menu, CHOOSE_FOLDER, CHOOSE_SERVER, MAIN_WINDOW, WORK_LOCALLY};

/// Where the web app sends the window for a command of the app ("Ordner wählen …"): never a real
/// page (.invalid is reserved), caught before it loads. A plain navigation needs no native calls,
/// which the server's pages do not get.
const ACTION_HOST: &str = "desktop.schreibzeug.invalid";

/// Tells the web app it runs in the desktop app, so it offers the commands of the menu.
const DESKTOP_SCRIPT: &str = "window.schreibzeugDesktop = true;";

/// The command a navigation asks for, or None for a page to load.
fn desktop_action(url: &Url) -> Option<&str> {
    if url.scheme() != "https" || url.host_str() != Some(ACTION_HOST) {
        return None;
    }
    match url.path().trim_start_matches('/') {
        action @ (WORK_LOCALLY | CHOOSE_FOLDER | CHOOSE_SERVER) => Some(action),
        _ => None,
    }
}

/// Only web and mail addresses leave the app, for the system to open.
fn is_openable(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

fn open_outside(app: &AppHandle, url: &Url) {
    if is_openable(url) {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

/// A page of the same server: the app opens it in a window of its own, where the session holds.
fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

/// The download folder; on Linux without a configured one (XDG user dirs) "Downloads" at home.
fn download_folder(app: &AppHandle) -> Option<PathBuf> {
    let paths = app.path();
    let folder = paths
        .download_dir()
        .or_else(|_| paths.home_dir().map(|home| home.join("Downloads")))
        .ok()?;
    std::fs::create_dir_all(&folder).ok()?;
    Some(folder)
}

fn save_download(app: &AppHandle, event: DownloadEvent<'_>) -> bool {
    if let DownloadEvent::Requested { url, destination } = event {
        let Some(folder) = download_folder(app) else {
            return true;
        };
        let suggested = destination
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_owned);
        let name = downloads::file_name(suggested.as_deref(), url.path());
        *destination = downloads::free_path(&folder, &name, |path| path.exists());
    }
    true
}

static WINDOWS: AtomicUsize = AtomicUsize::new(0);

/// The start page's address, as the main window first loaded it. Asked for right after the window
/// is built, CEF has no URL yet (no page loaded), so it is taken from the first page load instead.
static START: OnceLock<Url> = OnceLock::new();

/// The page each window shows, by label, kept from its page loads. on_new_window reads this instead
/// of the window's url(): a blocking webview getter in that callback can deadlock CEF's UI thread
/// (tauri-runtime-cef, NewWindowOpener::source_url).
static PAGES: OnceLock<Mutex<HashMap<String, Url>>> = OnceLock::new();

fn pages() -> &'static Mutex<HashMap<String, Url>> {
    PAGES.get_or_init(Default::default)
}

/// A window of the app, with its handling of new windows and downloads.
pub fn open_window(app: &AppHandle, label: &str, url: WebviewUrl) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let downloads = app.clone();
    let commands = app.clone();
    let opener = label.to_owned();
    WebviewWindowBuilder::new(app, label, url)
        .title("Schreibzeug")
        .inner_size(1280.0, 860.0)
        .min_inner_size(800.0, 560.0)
        .initialization_script(DESKTOP_SCRIPT)
        .on_navigation(move |url| match desktop_action(url) {
            Some(action) => {
                // Not from inside the callback: the command may navigate this very window.
                let (app, action) = (commands.clone(), action.to_owned());
                tauri::async_runtime::spawn(async move { on_menu(&app, &action) });
                false
            }
            None => true,
        })
        .on_new_window(move |url, _features| {
            let here = pages()
                .lock()
                .ok()
                .and_then(|pages| pages.get(&opener).cloned());
            if here.is_some_and(|here| same_origin(&here, &url)) {
                let app = handle.clone();
                // Not from inside the callback: building a window there can deadlock (Windows).
                tauri::async_runtime::spawn(async move {
                    let label = format!("window-{}", WINDOWS.fetch_add(1, Ordering::Relaxed));
                    let _ = open_window(&app, &label, WebviewUrl::External(url));
                });
            } else {
                open_outside(&handle, &url);
            }
            NewWindowResponse::Deny
        })
        .on_download(move |_webview, event| save_download(&downloads, event))
        .on_page_load(move |window, payload| {
            let url = payload.url().clone();
            if window.label() == MAIN_WINDOW {
                let _ = START.set(url.clone());
            }
            if let Ok(mut pages) = pages().lock() {
                pages.insert(window.label().to_owned(), url);
            }
        })
        .build()
}

/// The start page's address, once the main window has loaded it.
pub fn start_page() -> Option<&'static Url> {
    START.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catches_the_commands_of_the_app_and_nothing_else() {
        let url = |text: &str| Url::parse(text).unwrap();
        assert_eq!(
            desktop_action(&url("https://desktop.schreibzeug.invalid/choose-folder")),
            Some(CHOOSE_FOLDER)
        );
        assert_eq!(
            desktop_action(&url("https://desktop.schreibzeug.invalid/work-locally")),
            Some(WORK_LOCALLY)
        );
        assert_eq!(
            desktop_action(&url("https://desktop.schreibzeug.invalid/other")),
            None
        );
        assert_eq!(
            desktop_action(&url("http://desktop.schreibzeug.invalid/choose-server")),
            None
        );
        assert_eq!(
            desktop_action(&url("https://example.org/choose-folder")),
            None
        );
    }

    #[test]
    fn opens_pages_of_the_same_server_in_the_app() {
        let here = Url::parse("http://127.0.0.1:4100/folders/x").unwrap();
        assert!(same_origin(
            &here,
            &Url::parse("http://127.0.0.1:4100/edit/y").unwrap()
        ));
        assert!(!same_origin(
            &here,
            &Url::parse("http://127.0.0.1:4101/edit/y").unwrap()
        ));
        assert!(!same_origin(
            &here,
            &Url::parse("https://example.org/").unwrap()
        ));
    }
}
