//! Where a download from the window goes: the user's download folder, under the name the page
//! gave it, without overwriting a file that is already there ("Angebot (1).pdf").

use std::path::{Path, PathBuf};

/// The file name a download is saved under: the one the page suggests, else the last part of its
/// address, reduced to a plain name so it cannot leave the folder.
pub fn file_name(suggested: Option<&str>, url_path: &str) -> String {
    let candidate = suggested
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| url_path.rsplit('/').next().unwrap_or_default());
    let plain: String = candidate
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = plain.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Download".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// A path in `folder` for `name` that does not exist yet, numbering the name as file managers do.
pub fn free_path(folder: &Path, name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = folder.join(name);
    if !exists(&first) {
        return first;
    }
    let (stem, extension) = match name.rfind('.') {
        Some(dot) if dot > 0 => (&name[..dot], &name[dot..]),
        _ => (name, ""),
    };
    (1..)
        .map(|n| folder.join(format!("{stem} ({n}){extension}")))
        .find(|path| !exists(path))
        .expect("an unused number exists")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_the_suggested_name_or_the_address() {
        assert_eq!(file_name(Some("Angebot.pdf"), "/blob"), "Angebot.pdf");
        assert_eq!(file_name(None, "/files/Preise.xlsx"), "Preise.xlsx");
        assert_eq!(file_name(Some("  "), "/"), "Download");
    }

    #[test]
    fn keeps_the_name_inside_the_folder() {
        assert_eq!(file_name(Some("../../etc/passwd"), "/"), "_.._etc_passwd");
        assert_eq!(file_name(Some("a:b?.docx"), "/"), "a_b_.docx");
    }

    #[test]
    fn numbers_a_name_that_is_taken() {
        let folder = Path::new("/home/anna/Downloads");
        let taken = [folder.join("Angebot.pdf"), folder.join("Angebot (1).pdf")];
        let path = free_path(folder, "Angebot.pdf", |candidate| {
            taken.iter().any(|t| t == candidate)
        });
        assert_eq!(path, folder.join("Angebot (2).pdf"));
        assert_eq!(free_path(folder, "Notiz", |_| false), folder.join("Notiz"));
    }
}
