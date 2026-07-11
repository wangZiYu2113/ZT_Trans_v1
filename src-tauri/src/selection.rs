use std::{thread, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Debug, thiserror::Error)]
pub enum SelectionError {
    #[error("未读取到选中文本，请确认目标应用允许复制。")]
    Empty,
    #[error("剪贴板读取失败：{0}")]
    Clipboard(String),
}

pub async fn read_selected_text_impl(app: AppHandle) -> Result<String, SelectionError> {
    let clipboard = app.clipboard();
    let previous = clipboard.read_text().ok();

    send_copy_shortcut();
    thread::sleep(Duration::from_millis(80));

    let selected = clipboard
        .read_text()
        .map_err(|error| SelectionError::Clipboard(error.to_string()))?
        .trim()
        .to_string();

    if let Some(previous_text) = previous {
        let _ = clipboard.write_text(previous_text);
    }

    if selected.is_empty() {
        return Err(SelectionError::Empty);
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(selected)
}

#[cfg(windows)]
fn send_copy_shortcut() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYBD_EVENT_FLAGS, VK_CONTROL, VK_C,
    };

    unsafe {
        keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_C.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_C.0 as u8, 0, KEYBD_EVENT_FLAGS(2), 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(2), 0);
    }
}

#[cfg(not(windows))]
fn send_copy_shortcut() {}
