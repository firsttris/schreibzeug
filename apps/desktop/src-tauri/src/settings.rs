//! The app's own settings, in settings.json in the app's config folder. For now only the folder the
//! local server shows; without one it is the system's documents folder.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<PathBuf>,
}

/// The settings in the file, or the defaults when there is none or it cannot be read.
pub fn read(file: &Path) -> Settings {
    std::fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn write(file: &Path, settings: &Settings) -> std::io::Result<()> {
    if let Some(folder) = file.parent() {
        std::fs::create_dir_all(folder)?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)?;
    std::fs::write(file, text)
}

/// The folder to show: the chosen one while it exists, else the documents folder.
pub fn folder_to_show(settings: &Settings, documents: &Path) -> PathBuf {
    settings
        .folder
        .as_ref()
        .filter(|folder| folder.is_dir())
        .cloned()
        .unwrap_or_else(|| documents.to_path_buf())
}

/// What the app calls the folder: "Dokumente" for the documents folder, which Windows and macOS
/// show under that name while it is called "Documents" on disk; else its own name.
pub fn folder_name(folder: &Path, documents: &Path) -> String {
    if folder == documents {
        return "Dokumente".into();
    }
    folder
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| folder.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("stapel-settings-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn keeps_the_chosen_folder() {
        let folder = temporary("keep");
        let file = folder.join("config").join("settings.json");
        assert_eq!(read(&file), Settings::default());
        let settings = Settings {
            folder: Some(folder.clone()),
        };
        write(&file, &settings).unwrap();
        assert_eq!(read(&file), settings);
        std::fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn falls_back_to_the_documents_folder() {
        let documents = temporary("documents");
        let gone = Settings {
            folder: Some(documents.join("gone")),
        };
        assert_eq!(folder_to_show(&gone, &documents), documents);
        assert_eq!(folder_to_show(&Settings::default(), &documents), documents);
        std::fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn names_the_documents_folder_in_german() {
        let documents = Path::new("/home/a/Documents");
        assert_eq!(folder_name(documents, documents), "Dokumente");
        assert_eq!(
            folder_name(Path::new("/home/a/Projekte"), documents),
            "Projekte"
        );
    }
}
