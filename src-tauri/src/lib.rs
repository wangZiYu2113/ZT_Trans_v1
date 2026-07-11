mod lifecycle;
mod ocr;
mod selection;

use lifecycle::QueryManager;
use selection::read_selected_text_impl;
use serde::{Deserialize, Serialize};
use tauri::utils::config::Color;
use std::sync::{mpsc, Mutex};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

#[derive(Default)]
struct AppState {
    query_manager: Mutex<QueryManager>,
    capture_sender: Mutex<Option<mpsc::Sender<Result<String, String>>>>,
    capture_window_label: Mutex<Option<String>>,
}

#[derive(Clone, Serialize)]
struct ShortcutPayload {
    action: &'static str,
    text: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureSelection {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale_factor: f64,
}

#[tauri::command]
async fn read_selected_text(app: tauri::AppHandle) -> Result<String, String> {
    read_selected_text_impl(app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn start_capture_ocr(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let mut manager = state
        .query_manager
        .lock()
        .map_err(|_| "Query state is busy, please try again later.".to_string())?;
    manager.start_new_query("ocr");

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let capture_label = format!("capture-{}", uuid::Uuid::new_v4());
    {
        let mut sender = state
            .capture_sender
            .lock()
            .map_err(|_| "Capture state is busy, please try again later.".to_string())?;
        if sender.is_some() {
            return Err("Capture is already running.".to_string());
        }
        *sender = Some(tx);

        let mut label = state
            .capture_window_label
            .lock()
            .map_err(|_| "Capture state is busy, please try again later.".to_string())?;
        *label = Some(capture_label.clone());
    }

    WebviewWindowBuilder::new(&app, &capture_label, WebviewUrl::App("index.html?view=capture".into()))
        .title("Capture")
        .fullscreen(true)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .skip_taskbar(true)
        .devtools(false)
        .build()
        .map_err(|error| {
            clear_capture_state(&state);
            error.to_string()
        })?;

    rx.recv()
        .map_err(|_| "Capture was cancelled before OCR started.".to_string())?
}

#[tauri::command]
async fn complete_capture_selection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    selection: CaptureSelection,
) -> Result<String, String> {
    if selection.width < 8.0 || selection.height < 8.0 {
        return cancel_capture_selection(app, state).await;
    }

    hide_capture_window(&app, &state);

    let result = ocr::recognize_selection(&selection);
    close_capture_window(&app, &state);
    if let Some(sender) = state
        .capture_sender
        .lock()
        .map_err(|_| "Capture state is busy, please try again later.".to_string())?
        .take()
    {
        let _ = sender.send(result.clone());
    }

    result
}

#[tauri::command]
async fn cancel_capture_selection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    close_capture_window(&app, &state);

    if let Some(sender) = state
        .capture_sender
        .lock()
        .map_err(|_| "Capture state is busy, please try again later.".to_string())?
        .take()
    {
        let _ = sender.send(Err("Capture cancelled.".to_string()));
    }

    Err("Capture cancelled.".to_string())
}

fn current_capture_label(state: &State<'_, AppState>) -> Option<String> {
    state
        .capture_window_label
        .lock()
        .ok()
        .and_then(|label| label.clone())
}

fn hide_capture_window(app: &tauri::AppHandle, state: &State<'_, AppState>) {
    if let Some(label) = current_capture_label(state) {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.hide();
        }
    }
}

fn close_capture_window(app: &tauri::AppHandle, state: &State<'_, AppState>) {
    if let Some(label) = current_capture_label(state) {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }
    if let Ok(mut label) = state.capture_window_label.lock() {
        *label = None;
    }
}

fn clear_capture_state(state: &State<'_, AppState>) {
    if let Ok(mut sender) = state.capture_sender.lock() {
        *sender = None;
    }
    if let Ok(mut label) = state.capture_window_label.lock() {
        *label = None;
    }
}

#[tauri::command]
async fn cancel_active_query(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state
        .query_manager
        .lock()
        .map_err(|_| "Query state is busy, please try again later.".to_string())?;
    manager.cancel_active_query();
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["Ctrl+Shift+E", "Ctrl+Shift+S"])
                .expect("failed to parse default global shortcuts")
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyE) {
                        let payload = match selection::read_selected_text_now() {
                            Ok(text) => ShortcutPayload {
                                action: "selection",
                                text: Some(text),
                                error: None,
                            },
                            Err(error) => ShortcutPayload {
                                action: "selection",
                                text: None,
                                error: Some(error.to_string()),
                            },
                        };
                        let _ = app.emit("zy-trans://shortcut", payload);
                    } else if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyS) {
                        let _ = app.emit(
                            "zy-trans://shortcut",
                            ShortcutPayload {
                                action: "capture",
                                text: None,
                                error: None,
                            },
                        );
                    }
                })
                .build(),
        )
        .manage(AppState::default())
        .setup(|app| {
            let main_window = app
                .get_webview_window("main")
                .ok_or_else(|| "Main window was not created".to_string())?;
            main_window.show()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_selected_text,
            start_capture_ocr,
            complete_capture_selection,
            cancel_capture_selection,
            cancel_active_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running zy-trans");
}
