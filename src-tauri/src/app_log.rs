use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Default)]
pub struct AppLogger {
    path: Mutex<Option<PathBuf>>,
}

impl AppLogger {
    pub fn init(&self, app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let base_dir = app
            .path()
            .app_log_dir()
            .or_else(|_| app.path().app_data_dir())
            .map_err(|error| format!("Failed to resolve log directory: {error}"))?;
        create_dir_all(&base_dir).map_err(|error| format!("Failed to create log directory: {error}"))?;
        let path = base_dir.join("zy-trans.log");
        let mut guard = self
            .path
            .lock()
            .map_err(|_| "Log state is busy, please try again later.".to_string())?;
        *guard = Some(path.clone());
        drop(guard);
        self.write("app", "logger initialized");
        Ok(path)
    }

    pub fn write(&self, scope: &str, message: &str) {
        let Some(path) = self.path.lock().ok().and_then(|guard| guard.clone()) else {
            return;
        };
        let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
            return;
        };
        let _ = writeln!(file, "{} [{}] {}", timestamp_ms(), scope, sanitize_line(message));
    }

    pub fn path(&self) -> Option<PathBuf> {
        self.path.lock().ok().and_then(|guard| guard.clone())
    }
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn sanitize_line(message: &str) -> String {
    message.replace(['\r', '\n'], " ")
}
