//! The Stapel desktop app: one window that asks for a Stapel server and then shows the server's own
//! web app. Downloads go to the download folder, links that open a new window go to the system's
//! browser, and the menu leads back to the server choice.

mod downloads;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{App, AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const MAIN_WINDOW: &str = "main";
const CHOOSE_SERVER: &str = "choose-server";

/// Only web and mail addresses leave the app, for the system to open.
fn is_openable(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

fn open_outside(app: &AppHandle, url: &Url) {
    if is_openable(url) {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

/// The download folder; on Linux without a configured one (XDG user dirs) "Downloads" at home.
fn download_folder(app: &AppHandle) -> Option<std::path::PathBuf> {
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

fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let choose = MenuItem::with_id(app, CHOOSE_SERVER, "Server wechseln …", true, None::<&str>)?;
    let file = Submenu::with_items(
        app,
        "Stapel",
        true,
        &[
            &choose,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Beenden"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Bearbeiten",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Rückgängig"))?,
            &PredefinedMenuItem::redo(app, Some("Wiederholen"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Ausschneiden"))?,
            &PredefinedMenuItem::copy(app, Some("Kopieren"))?,
            &PredefinedMenuItem::paste(app, Some("Einfügen"))?,
            &PredefinedMenuItem::select_all(app, Some("Alles auswählen"))?,
        ],
    )?;
    Menu::with_items(app, &[&file, &edit])
}

fn open_main_window(app: &App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    let downloads = app.handle().clone();
    let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
        .title("Stapel")
        .inner_size(1280.0, 860.0)
        .min_inner_size(800.0, 560.0)
        .on_new_window(move |url, _features| {
            open_outside(&handle, &url);
            NewWindowResponse::Deny
        })
        .on_download(move |_webview, event| save_download(&downloads, event))
        .build()?;
    let start = window.url()?;
    app.on_menu_event(move |app, event| {
        if event.id() == CHOOSE_SERVER {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let mut choose = start.clone();
                choose.set_query(Some("choose"));
                let _ = window.navigate(choose);
            }
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .menu(menu)
        .setup(|app| {
            open_main_window(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the Stapel desktop app could not start");
}
