use crate::CaptureSelection;
use image::{ImageBuffer, Rgba};
use std::borrow::Cow;
use std::path::PathBuf;

pub fn recognize_selection(selection: &CaptureSelection) -> Result<String, String> {
    let path = capture_selection_to_png(selection)?;
    let text = recognize_text_from_png(&path)?;
    if text.trim().is_empty() {
        return Err(format!(
            "OCR did not detect text in the selected area. The screenshot was copied to the clipboard and saved to {}.",
            path.display()
        ));
    }

    Ok(text)
}

#[cfg(windows)]
fn capture_selection_to_png(selection: &CaptureSelection) -> Result<PathBuf, String> {
    use std::ffi::c_void;
    use std::mem::size_of;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, GetDC, GetDIBits, ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
    };

    let x = (selection.x * selection.scale_factor).round() as i32;
    let y = (selection.y * selection.scale_factor).round() as i32;
    let width = (selection.width * selection.scale_factor).round().max(1.0) as i32;
    let height = (selection.height * selection.scale_factor).round().max(1.0) as i32;

    unsafe {
        let desktop_window = HWND(std::ptr::null_mut());
        let screen_dc = GetDC(desktop_window);
        if screen_dc.0.is_null() {
            return Err("Failed to get screen device context.".to_string());
        }

        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.0.is_null() {
            let _ = ReleaseDC(desktop_window, screen_dc);
            return Err("Failed to create compatible device context.".to_string());
        }

        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.0.is_null() {
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(desktop_window, screen_dc);
            return Err("Failed to create capture bitmap.".to_string());
        }

        let old_object = SelectObject(memory_dc, HGDIOBJ(bitmap.0));
        let bitblt_result = BitBlt(memory_dc, 0, 0, width, height, screen_dc, x, y, SRCCOPY);
        if bitblt_result.is_err() {
            cleanup_gdi(screen_dc, memory_dc, bitmap, old_object);
            return Err("Failed to copy screen pixels.".to_string());
        }

        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let copied = GetDIBits(
            memory_dc,
            bitmap,
            0,
            height as u32,
            Some(bgra.as_mut_ptr() as *mut c_void),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        );

        cleanup_gdi(screen_dc, memory_dc, bitmap, old_object);

        if copied == 0 {
            return Err("Failed to read captured pixels.".to_string());
        }

        for pixel in bgra.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        let _ = write_capture_to_clipboard(width as usize, height as usize, bgra.clone());

        let image = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, bgra)
            .ok_or_else(|| "Failed to build image buffer from captured pixels.".to_string())?;

        let path = std::env::temp_dir().join("zy-trans-last-capture.png");
        image
            .save(&path)
            .map_err(|error| format!("Failed to save capture image: {error}"))?;

        Ok(path)
    }
}

#[cfg(windows)]
fn write_capture_to_clipboard(width: usize, height: usize, rgba: Vec<u8>) -> Result<(), String> {
    let image = arboard::ImageData {
        width,
        height,
        bytes: Cow::Owned(rgba),
    };
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| format!("Failed to open clipboard for image: {error}"))?;
    clipboard
        .set_image(image)
        .map_err(|error| format!("Failed to write screenshot to clipboard: {error}"))
}

#[cfg(windows)]
fn recognize_text_from_png(path: &std::path::Path) -> Result<String, String> {
    use windows::core::HSTRING;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::FileAccessMode;
    use windows::Storage::Streams::FileRandomAccessStream;

    let path_text = path
        .to_str()
        .ok_or_else(|| "Capture path contains invalid UTF-8.".to_string())?;
    let path_hstring = HSTRING::from(path_text);

    let stream = FileRandomAccessStream::OpenAsync(&path_hstring, FileAccessMode::Read)
        .map_err(|error| format!("Failed to open capture image for OCR: {error}"))?
        .get()
        .map_err(|error| format!("Failed to read capture image for OCR: {error}"))?;
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|error| format!("Failed to create OCR image decoder: {error}"))?
        .get()
        .map_err(|error| format!("Failed to decode capture image: {error}"))?;
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|error| format!("Failed to prepare capture image for OCR: {error}"))?
        .get()
        .map_err(|error| format!("Failed to load capture bitmap for OCR: {error}"))?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|error| format!("Failed to initialize Windows OCR engine: {error}"))?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|error| format!("Failed to start Windows OCR: {error}"))?
        .get()
        .map_err(|error| format!("Windows OCR failed: {error}"))?;

    result
        .Text()
        .map(|text| text.to_string())
        .map_err(|error| format!("Failed to read Windows OCR result: {error}"))
}

#[cfg(windows)]
unsafe fn cleanup_gdi(
    screen_dc: windows::Win32::Graphics::Gdi::HDC,
    memory_dc: windows::Win32::Graphics::Gdi::HDC,
    bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
    old_object: windows::Win32::Graphics::Gdi::HGDIOBJ,
) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{DeleteDC, DeleteObject, ReleaseDC, SelectObject, HGDIOBJ};

    if !old_object.0.is_null() {
        let _ = SelectObject(memory_dc, old_object);
    }
    let _ = DeleteObject(HGDIOBJ(bitmap.0));
    let _ = DeleteDC(memory_dc);
    let _ = ReleaseDC(HWND(std::ptr::null_mut()), screen_dc);
}

#[cfg(not(windows))]
fn capture_selection_to_png(_selection: &CaptureSelection) -> Result<PathBuf, String> {
    Err("Capture OCR is only supported on Windows.".to_string())
}

#[cfg(not(windows))]
fn recognize_text_from_png(_path: &std::path::Path) -> Result<String, String> {
    Err("Capture OCR is only supported on Windows.".to_string())
}
