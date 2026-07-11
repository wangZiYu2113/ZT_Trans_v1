use tauri::AppHandle;

#[derive(Debug, thiserror::Error)]
pub enum SelectionError {
    #[error("未读取到选中文本。请确认目标应用支持 Windows 文本选择接口，或改用框选 OCR。")]
    Empty,
    #[error("读取选中文本失败：{0}")]
    Read(String),
}

pub async fn read_selected_text_impl(_app: AppHandle) -> Result<String, SelectionError> {
    read_selected_text_impl_platform()
}

#[cfg(windows)]
fn read_selected_text_impl_platform() -> Result<String, SelectionError> {
    use windows::Win32::Foundation::{RPC_E_CHANGED_MODE, S_FALSE, S_OK};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
    };

    unsafe {
        let init_result = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let should_uninitialize = init_result == S_OK || init_result == S_FALSE;
        if init_result.is_err() && init_result != RPC_E_CHANGED_MODE {
            return Err(SelectionError::Read(format!(
                "COM 初始化失败：{}",
                init_result.message()
            )));
        }

        let result = (|| {
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| SelectionError::Read(format!("UI Automation 初始化失败：{error}")))?;
            let focused = automation
                .GetFocusedElement()
                .map_err(|error| SelectionError::Read(format!("无法读取当前焦点元素：{error}")))?;
            let pattern: IUIAutomationTextPattern = focused
                .GetCurrentPatternAs(UIA_TextPatternId)
                .map_err(|error| SelectionError::Read(format!("当前元素不支持文本选择读取：{error}")))?;
            let ranges = pattern
                .GetSelection()
                .map_err(|error| SelectionError::Read(format!("无法读取选区：{error}")))?;
            let count = ranges
                .Length()
                .map_err(|error| SelectionError::Read(format!("无法读取选区数量：{error}")))?;

            let mut parts = Vec::new();
            for index in 0..count {
                let range = ranges
                    .GetElement(index)
                    .map_err(|error| SelectionError::Read(format!("无法读取选区内容：{error}")))?;
                let text = range
                    .GetText(-1)
                    .map_err(|error| SelectionError::Read(format!("无法读取选中文本：{error}")))?
                    .to_string();
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    parts.push(trimmed.to_string());
                }
            }

            let selected = parts.join("\n").trim().to_string();
            if selected.is_empty() {
                return Err(SelectionError::Empty);
            }

            Ok(selected)
        })();

        if should_uninitialize {
            CoUninitialize();
        }

        result
    }
}

#[cfg(not(windows))]
fn read_selected_text_impl_platform() -> Result<String, SelectionError> {
    Err(SelectionError::Read(
        "划词读取当前仅支持 Windows 桌面端。".to_string(),
    ))
}
