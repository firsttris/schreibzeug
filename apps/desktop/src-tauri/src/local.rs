//! The local server (apps/local) beside the window, for files on this computer. It is a program of
//! its own, compiled with `bun build --compile` and shipped next to the app (Tauri's externalBin).
//! The app starts it when the user first works locally, gives it a random key, reads the address it
//! prints, and stops it with the app: it also ends itself when its stdin closes, so it never
//! outlives a crashed app.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

/// What the server prints once it listens (apps/local/src/main.ts).
const READY: &str = "STAPEL_LOCAL_READY ";
const START_TIMEOUT: Duration = Duration::from_secs(30);

pub struct Config {
    pub binary: PathBuf,
    pub root: PathBuf,
    pub root_name: String,
    pub web_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub token: String,
}

pub struct Running {
    child: Child,
    /// Held so the server's stdin stays open; dropping it tells the server to end.
    _stdin: Option<ChildStdin>,
    pub url: String,
    pub root: PathBuf,
}

impl Running {
    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn stop(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// The address in the server's ready line.
pub fn ready_url(line: &str) -> Option<&str> {
    line.trim_end()
        .strip_prefix(READY)
        .filter(|url| url.starts_with("http://127.0.0.1:"))
}

/// The address the window opens: it leaves the key's cookie and goes on to the app (gate.ts).
pub fn unlock_url(base: &str, token: &str) -> String {
    format!("{base}/api/local/unlock?token={token}")
}

/// A key nobody can guess: 24 random bytes as hex.
pub fn new_token() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn command(config: &Config) -> Command {
    let mut command = Command::new(&config.binary);
    command
        .env("STAPEL_LOCAL_ROOT", &config.root)
        .env("STAPEL_LOCAL_ROOT_NAME", &config.root_name)
        .env("STAPEL_LOCAL_TOKEN", &config.token)
        .env("STAPEL_WEB_DIR", &config.web_dir)
        .env("STAPEL_LOCAL_CACHE", &config.cache_dir)
        .env("STAPEL_LOCAL_EXIT_WITH_STDIN", "1")
        .env("PORT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window next to the app.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Starts the server and waits until it listens.
pub fn start(config: &Config) -> Result<Running, String> {
    let mut child = command(config)
        .spawn()
        .map_err(|error| format!("{}: {error}", config.binary.display()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("no output from the local server")?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut sent = false;
        // Reads to the end, so the server never blocks on a full pipe.
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if !sent {
                if let Some(url) = ready_url(&line) {
                    let _ = sender.send(url.to_owned());
                    sent = true;
                }
            }
        }
    });
    match receiver.recv_timeout(START_TIMEOUT) {
        Ok(url) => Ok(Running {
            _stdin: child.stdin.take(),
            child,
            url,
            root: config.root.clone(),
        }),
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            Err("Der lokale Server ist nicht gestartet.".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_address_from_the_ready_line() {
        assert_eq!(
            ready_url("STAPEL_LOCAL_READY http://127.0.0.1:41234\n"),
            Some("http://127.0.0.1:41234")
        );
        assert_eq!(ready_url("Open http://127.0.0.1:1/api/local/unlock"), None);
        assert_eq!(ready_url("STAPEL_LOCAL_READY https://example.org"), None);
    }

    #[test]
    fn unlocks_with_the_key() {
        assert_eq!(
            unlock_url("http://127.0.0.1:5", "ab12"),
            "http://127.0.0.1:5/api/local/unlock?token=ab12"
        );
    }

    #[test]
    fn makes_a_different_long_key_each_time() {
        let (a, b) = (new_token().unwrap(), new_token().unwrap());
        assert_eq!(a.len(), 48);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }
}
