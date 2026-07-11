mod app_log;
mod lifecycle;
mod ocr;
mod selection;

use app_log::AppLogger;
use lifecycle::QueryManager;
use selection::read_selected_text_impl;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{mpsc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::utils::config::Color;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

const TRAY_SHOW_ID: &str = "show_main";
const TRAY_EXIT_ID: &str = "exit_app";

struct AppState {
    query_manager: Mutex<QueryManager>,
    capture_sender: Mutex<Option<mpsc::Sender<Result<String, String>>>>,
    capture_window_label: Mutex<Option<String>>,
    shortcuts: Mutex<HashSet<String>>,
    is_exiting: Mutex<bool>,
    close_behavior: Mutex<CloseBehavior>,
    logger: AppLogger,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            query_manager: Mutex::new(QueryManager::default()),
            capture_sender: Mutex::new(None),
            capture_window_label: Mutex::new(None),
            shortcuts: Mutex::new(HashSet::new()),
            is_exiting: Mutex::new(false),
            close_behavior: Mutex::new(CloseBehavior::Hide),
            logger: AppLogger::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CloseBehavior {
    Hide,
    Exit,
}

#[derive(Clone, Serialize)]
struct ShortcutPayload {
    action: String,
    text: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutConfig {
    selection: String,
    capture: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloseBehaviorConfig {
    behavior: String,
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
fn configure_shortcuts(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ShortcutConfig,
) -> Result<(), String> {
    register_shortcuts(&app, &state, config)
}

#[tauri::command]
fn set_close_behavior(
    state: State<'_, AppState>,
    config: CloseBehaviorConfig,
) -> Result<(), String> {
    let behavior = match config.behavior.as_str() {
        "hide" => CloseBehavior::Hide,
        "exit" => CloseBehavior::Exit,
        _ => return Err("关闭行为只能设置为 hide 或 exit。".to_string()),
    };
    let mut close_behavior = state
        .close_behavior
        .lock()
        .map_err(|_| "Close behavior state is busy, please try again later.".to_string())?;
    *close_behavior = behavior;
    state
        .logger
        .write("window", &format!("close behavior set to {}", config.behavior));
    Ok(())
}

#[tauri::command]
fn write_app_log(state: State<'_, AppState>, scope: String, message: String) -> Result<(), String> {
    state.logger.write(&scope, &message);
    Ok(())
}

#[tauri::command]
fn get_log_path(state: State<'_, AppState>) -> Result<String, String> {
    state
        .logger
        .path()
        .map(|path| path.display().to_string())
        .ok_or_else(|| "Log file is not initialized.".to_string())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle, _state: State<'_, AppState>) -> Result<(), String> {
    request_exit(&app);
    Ok(())
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
        *sender = Some(tx);

        let mut label = state
            .capture_window_label
            .lock()
            .map_err(|_| "Capture state is busy, please try again later.".to_string())?;
        *label = Some(capture_label.clone());
    }
    close_all_capture_windows(&app, Some(&capture_label));

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

fn close_all_capture_windows(app: &tauri::AppHandle, except_label: Option<&str>) {
    for (label, window) in app.webview_windows() {
        let is_capture = label == "capture" || label.starts_with("capture-");
        let is_except = except_label.is_some_and(|except| label == except);
        if is_capture && !is_except {
            let _ = window.close();
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

fn register_shortcuts(
    app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    config: ShortcutConfig,
) -> Result<(), String> {
    let selection = config.selection.trim();
    let capture = config.capture.trim();
    if selection.is_empty() || capture.is_empty() {
        return Err("快捷键不能为空。".to_string());
    }
    if selection.eq_ignore_ascii_case(capture) {
        return Err("划词快捷键和框选快捷键不能相同。".to_string());
    }

    let selection_shortcut = parse_shortcut(selection)?;
    let capture_shortcut = parse_shortcut(capture)?;

    let existing = state
        .shortcuts
        .lock()
        .map_err(|_| "Shortcut state is busy, please try again later.".to_string())?
        .clone();
    for shortcut in existing {
        let _ = app.global_shortcut().unregister(shortcut.as_str());
    }

    app.global_shortcut()
        .on_shortcut(selection_shortcut, |app, _shortcut, event| {
            handle_selection_shortcut(app, event);
        })
        .map_err(|error| format!("注册划词快捷键失败：{error}"))?;

    if let Err(error) = app.global_shortcut().on_shortcut(capture_shortcut, |app, _shortcut, event| {
        handle_capture_shortcut(app, event);
    }) {
        let _ = app.global_shortcut().unregister(selection);
        return Err(format!("注册框选快捷键失败：{error}"));
    }

    let mut next = HashSet::new();
    next.insert(selection.to_string());
    next.insert(capture.to_string());
    {
        let mut shortcuts = state
            .shortcuts
            .lock()
            .map_err(|_| "Shortcut state is busy, please try again later.".to_string())?;
        *shortcuts = next;
    }
    state.logger.write(
        "shortcut",
        &format!("registered selection={} capture={}", selection, capture),
    );
    Ok(())
}

fn parse_shortcut(shortcut: &str) -> Result<Shortcut, String> {
    shortcut
        .parse::<Shortcut>()
        .map_err(|error| format!("快捷键格式无效：{shortcut} ({error})"))
}

fn handle_selection_shortcut(app: &tauri::AppHandle, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        app.state::<AppState>()
            .logger
            .write("shortcut", "selection triggered");
        let payload = match selection::read_selected_text_now() {
            Ok(text) => ShortcutPayload {
                action: "selection".to_string(),
                text: Some(text),
                error: None,
            },
            Err(error) => ShortcutPayload {
                action: "selection".to_string(),
                text: None,
                error: Some(error.to_string()),
            },
        };
        let _ = app.emit_to("main", "zy-trans://shortcut", payload);
    });
}

fn handle_capture_shortcut(app: &tauri::AppHandle, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    app.state::<AppState>()
        .logger
        .write("shortcut", "capture triggered");
    let _ = app.emit_to(
        "main",
        "zy-trans://shortcut",
        ShortcutPayload {
            action: "capture".to_string(),
            text: None,
            error: None,
        },
    );
}

fn request_exit(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(mut exiting) = state.is_exiting.lock() {
        *exiting = true;
    }
    state.logger.write("app", "exit requested");
    app.exit(0);
}

fn show_main(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        state.logger.write("window", "main shown from tray");
    }
}

fn setup_tray(app: &tauri::App) -> Result<(), String> {
    let show_item = MenuItemBuilder::with_id(TRAY_SHOW_ID, "显示主窗口")
        .build(app)
        .map_err(|error| error.to_string())?;
    let exit_item = MenuItemBuilder::with_id(TRAY_EXIT_ID, "退出应用")
        .build(app)
        .map_err(|error| error.to_string())?;
    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&exit_item)
        .build()
        .map_err(|error| error.to_string())?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "Tray icon is not available.".to_string())?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("知译正在后台运行")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW_ID => show_main(app),
            TRAY_EXIT_ID => request_exit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            let should_show = matches!(
                event,
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } | TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            );
            if should_show {
                show_main(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;

    app.state::<AppState>().logger.write("tray", "tray initialized");
    Ok(())
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::default())
        .setup(|app| {
            let main_window = app
                .get_webview_window("main")
                .ok_or_else(|| "Main window was not created".to_string())?;
            let log_path = app.state::<AppState>().logger.init(&app.handle())?;
            app.state::<AppState>()
                .logger
                .write("app", &format!("log file: {}", log_path.display()));
            setup_tray(app)?;
            main_window.show()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let should_exit = state.is_exiting.lock().map(|flag| *flag).unwrap_or(false);
                if should_exit {
                    return;
                }

                let behavior = state
                    .close_behavior
                    .lock()
                    .map(|behavior| *behavior)
                    .unwrap_or(CloseBehavior::Hide);
                if behavior == CloseBehavior::Exit {
                    if let Ok(mut exiting) = state.is_exiting.lock() {
                        *exiting = true;
                    }
                    state.logger.write("window", "main close exits app");
                    window.app_handle().exit(0);
                } else {
                    api.prevent_close();
                    let _ = window.hide();
                    state.logger.write("window", "main hidden on close request");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_selected_text,
            configure_shortcuts,
            set_close_behavior,
            write_app_log,
            get_log_path,
            show_main_window,
            exit_app,
            start_capture_ocr,
            complete_capture_selection,
            cancel_capture_selection,
            cancel_active_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running zy-trans");
}
