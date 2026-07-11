use crate::CaptureSelection;
use image::{DynamicImage, ImageBuffer, Rgba};
use std::borrow::Cow;
use std::path::PathBuf;

struct CapturePaths {
    original: PathBuf,
    ocr: PathBuf,
}

pub fn recognize_selection(selection: &CaptureSelection) -> Result<String, String> {
    let paths = capture_selection_to_png(selection)?;
    let enhanced_text = recognize_text_from_png(&paths.ocr).map(|text| normalize_ocr_text(&text));
    let original_text =
        recognize_text_from_png(&paths.original).map(|text| normalize_ocr_text(&text));
    if let (Err(enhanced_error), Err(original_error)) = (&enhanced_text, &original_text) {
        return Err(format!(
            "Windows OCR failed. Enhanced image: {enhanced_error}; original image: {original_error}"
        ));
    }

    let text = choose_better_ocr_text(enhanced_text, original_text);
    if text.is_empty() {
        return Err(format!(
            "OCR did not detect text in the selected area. The screenshot was copied to the clipboard and saved to {}.",
            paths.original.display()
        ));
    }

    Ok(text)
}

#[cfg(windows)]
fn capture_selection_to_png(selection: &CaptureSelection) -> Result<CapturePaths, String> {
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

        let original_path = std::env::temp_dir().join("zy-trans-last-capture.png");
        image
            .save(&original_path)
            .map_err(|error| format!("Failed to save capture image: {error}"))?;

        let ocr_image = preprocess_capture_for_ocr(image);
        let ocr_path = std::env::temp_dir().join("zy-trans-last-capture-ocr.png");
        ocr_image
            .save(&ocr_path)
            .map_err(|error| format!("Failed to save OCR image: {error}"))?;

        Ok(CapturePaths {
            original: original_path,
            ocr: ocr_path,
        })
    }
}

fn preprocess_capture_for_ocr(
    image: ImageBuffer<Rgba<u8>, Vec<u8>>,
) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
    let width = image.width();
    let height = image.height();
    let dynamic = DynamicImage::ImageRgba8(image);

    let should_upscale = width < 1100 || height < 700;
    let processed = if should_upscale {
        dynamic.resize(
            width.saturating_mul(2).max(1),
            height.saturating_mul(2).max(1),
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        dynamic
    };

    processed
        .grayscale()
        .adjust_contrast(18.0)
        .brighten(6)
        .to_rgba8()
}

fn normalize_ocr_text(text: &str) -> String {
    text.chars()
        .filter(|ch| !ch.is_whitespace() && !ch.is_control() && !is_zero_width(*ch))
        .collect()
}

fn choose_better_ocr_text(
    primary: Result<String, String>,
    fallback: Result<String, String>,
) -> String {
    let primary = primary.unwrap_or_default();
    let fallback = fallback.unwrap_or_default();
    if ocr_score(&fallback) > ocr_score(&primary) {
        fallback
    } else {
        primary
    }
}

fn ocr_score(text: &str) -> usize {
    text.chars()
        .filter(|ch| ch.is_alphanumeric() || matches!(ch, '\u{4e00}'..='\u{9fff}'))
        .count()
}

fn is_zero_width(ch: char) -> bool {
    matches!(ch, '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{feff}')
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
fn capture_selection_to_png(_selection: &CaptureSelection) -> Result<CapturePaths, String> {
    Err("Capture OCR is only supported on Windows.".to_string())
}

#[cfg(not(windows))]
fn recognize_text_from_png(_path: &std::path::Path) -> Result<String, String> {
    Err("Capture OCR is only supported on Windows.".to_string())
}
