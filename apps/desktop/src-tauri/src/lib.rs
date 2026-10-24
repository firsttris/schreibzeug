//! The Schreibzeug desktop app: a window that works on files on this computer (through the local server,
//! local.rs) or shows a Schreibzeug server's own web app. Downloads go to the download folder, a page of
//! the same app that opens a new window gets one of the app's own, other links go to the system's
//! browser, and the menu switches between this computer and a server.

mod downloads;
mod local;
mod settings;

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAIN_WINDOW: &str = "main";
const WORK_LOCALLY: &str = "work-locally";
const CHOOSE_FOLDER: &str = "choose-folder";
const CHOOSE_SERVER: &str = "choose-server";

/// The local server, once started, and the key it was given.
struct LocalState {
    token: String,
    running: Mutex<Option<local::Running>>,
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

/// A window of the app, with its handling of new windows and downloads.
fn open_window(app: &AppHandle, label: &str, url: WebviewUrl) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let downloads = app.clone();
    let opener = label.to_owned();
    WebviewWindowBuilder::new(app, label, url)
        .title("Schreibzeug")
        .inner_size(1280.0, 860.0)
        .min_inner_size(800.0, 560.0)
        .on_new_window(move |url, _features| {
            let here = handle
                .get_webview_window(&opener)
                .and_then(|window| window.url().ok());
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
        .build()
}

/// The system's documents folder; at home "Documents" where none is configured, else home itself.
fn documents_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let paths = app.path();
    if let Ok(documents) = paths.document_dir() {
        return Ok(documents);
    }
    let home = paths.home_dir().map_err(|error| error.to_string())?;
    let documents = home.join("Documents");
    Ok(if documents.is_dir() { documents } else { home })
}

fn settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(folder.join("settings.json"))
}

/// The folder the local server shows, as the settings say.
fn local_folder_path(app: &AppHandle) -> Result<PathBuf, String> {
    let documents = documents_folder(app)?;
    Ok(settings::folder_to_show(
        &settings::read(&settings_file(app)?),
        &documents,
    ))
}

fn local_config(app: &AppHandle, token: &str) -> Result<local::Config, String> {
    let documents = documents_folder(app)?;
    let root = local_folder_path(app)?;
    let paths = app.path();
    let binary = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .with_file_name(format!("schreibzeug-local{}", std::env::consts::EXE_SUFFIX));
    Ok(local::Config {
        binary,
        root_name: settings::folder_name(&root, &documents),
        root,
        web_dir: paths
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("web"),
        cache_dir: paths
            .app_cache_dir()
            .map_err(|error| error.to_string())?
            .join("media"),
        token: token.to_owned(),
    })
}

/// The local server's address, started first if it is not running or shows another folder.
fn ensure_local(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<LocalState>();
    let config = local_config(app, &state.token)?;
    let mut running = state.running.lock().map_err(|error| error.to_string())?;
    if let Some(mut current) = running.take() {
        if current.is_alive() && current.root == config.root {
            let url = current.url.clone();
            *running = Some(current);
            return Ok(url);
        }
        current.stop();
        close_other_windows(app);
    }
    let started = local::start(&config)?;
    let url = started.url.clone();
    *running = Some(started);
    Ok(url)
}

/// Windows on a server that was stopped show nothing any more; only the main window stays.
fn close_other_windows(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label != MAIN_WINDOW {
            let _ = window.close();
        }
    }
}

fn local_start_url(app: &AppHandle) -> Result<String, String> {
    let base = ensure_local(app)?;
    Ok(local::unlock_url(&base, &app.state::<LocalState>().token))
}

/// Asks for the folder to show and keeps it; None when the dialog was closed.
fn pick_folder(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let current = local_folder_path(app)?;
    let picked = app
        .dialog()
        .file()
        .set_title("Ordner für deine Dateien")
        .set_directory(&current)
        .blocking_pick_folder();
    let Some(folder) = picked.and_then(|path| path.into_path().ok()) else {
        return Ok(None);
    };
    let settings = settings::Settings {
        folder: Some(folder.clone()),
    };
    settings::write(&settings_file(app)?, &settings).map_err(|error| error.to_string())?;
    Ok(Some(folder))
}

fn navigate_main(app: &AppHandle, url: &str) {
    if let (Some(window), Ok(url)) = (app.get_webview_window(MAIN_WINDOW), Url::parse(url)) {
        let _ = window.navigate(url);
        let _ = window.set_focus();
    }
}

/// From the start page: the address to open for working on this computer.
#[tauri::command]
async fn open_local(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || local_start_url(&app))
        .await
        .map_err(|error| error.to_string())?
}

/// From the start page: the folder shown when working on this computer.
#[tauri::command]
fn local_folder(app: AppHandle) -> Result<String, String> {
    Ok(local_folder_path(&app)?.display().to_string())
}

/// From the start page: another folder; the new one, or None when the dialog was closed.
#[tauri::command]
async fn choose_folder(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || pick_folder(&app))
        .await
        .map_err(|error| error.to_string())?
        .map(|folder| folder.map(|folder| folder.display().to_string()))
}

fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let locally = MenuItem::with_id(app, WORK_LOCALLY, "Auf diesem Computer", true, None::<&str>)?;
    let folder = MenuItem::with_id(app, CHOOSE_FOLDER, "Ordner wählen …", true, None::<&str>)?;
    let server = MenuItem::with_id(
        app,
        CHOOSE_SERVER,
        "Mit Server verbinden …",
        true,
        None::<&str>,
    )?;
    let file = Submenu::with_items(
        app,
        "Schreibzeug",
        true,
        &[
            &locally,
            &folder,
            &server,
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

/// The start page showing the choice instead of going on by itself, with what went wrong if anything.
fn start_page(start: &Url, error: Option<&str>) -> String {
    let mut url = start.clone();
    url.set_query(None);
    url.query_pairs_mut().append_pair("choose", "");
    if let Some(error) = error {
        url.query_pairs_mut().append_pair("error", error);
    }
    url.to_string()
}

fn on_menu(app: &AppHandle, id: &str, start: &Url) {
    let app = app.clone();
    match id {
        CHOOSE_SERVER => navigate_main(&app, &start_page(start, None)),
        // Starting the server and the folder dialog wait; the menu does not.
        WORK_LOCALLY => {
            let start = start.clone();
            std::thread::spawn(move || match local_start_url(&app) {
                Ok(url) => navigate_main(&app, &url),
                Err(error) => navigate_main(&app, &start_page(&start, Some(&error))),
            });
        }
        CHOOSE_FOLDER => {
            std::thread::spawn(move || {
                if let Ok(Some(_)) = pick_folder(&app) {
                    if let Ok(url) = local_start_url(&app) {
                        navigate_main(&app, &url);
                    }
                }
            });
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = local::new_token().expect("no random numbers for the local server's key");
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(LocalState {
            token,
            running: Mutex::new(None),
        })
        .menu(menu)
        .invoke_handler(tauri::generate_handler![
            open_local,
            local_folder,
            choose_folder
        ])
        .setup(|app| {
            let window = open_window(
                app.handle(),
                MAIN_WINDOW,
                WebviewUrl::App("index.html".into()),
            )?;
            let start = window.url()?;
            app.on_menu_event(move |app, event| on_menu(app, event.id().as_ref(), &start));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the Schreibzeug desktop app could not start");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            let state = app.state::<LocalState>();
            if let Some(running) = state
                .running
                .lock()
                .ok()
                .and_then(|mut running| running.take())
            {
                running.stop();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn goes_back_to_the_choice_with_the_error() {
        let start = Url::parse("tauri://localhost/index.html?choose").unwrap();
        assert_eq!(
            start_page(&start, None),
            "tauri://localhost/index.html?choose="
        );
        assert_eq!(
            start_page(&start, Some("kein Server")),
            "tauri://localhost/index.html?choose=&error=kein+Server"
        );
    }
}
