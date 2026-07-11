# ZY Trans

ZY Trans is a lightweight Windows desktop assistant for explaining selected text and OCR text with an OpenAI-compatible chat model.

It is built for quick desktop use: select text, press a global hotkey, or capture a screen region, then get a concise explanation in a small floating result window.

## Features

- Global hotkey for selected-text explanation.
- Screen region capture with local Windows OCR.
- OCR image is copied to the clipboard before recognition.
- Floating result window for selection and OCR answers.
- Streaming OpenAI-compatible Chat Completions API.
- Prompt modes: auto, finance, English, translation, and general explanation.
- Configurable API base URL, API key, model, prompts, and global shortcuts.
- Local history with favorite, delete, clear, and export.
- Local cache for repeated requests.
- Local log file for lifecycle events and troubleshooting.
- Close-to-background behavior with system tray restore and exit menu.

## Download

The Windows installer is published in GitHub Releases.

Latest build output from this repository:

```text
src-tauri/target/release/bundle/nsis/知译_0.1.0_x64-setup.exe
```

Development mode uses a local Vite server, but the packaged installer does not require a local service port.

## Requirements

For normal use:

- Windows 10 or Windows 11
- An OpenAI-compatible API key and model

For development:

- Node.js and npm
- Rust toolchain
- Visual Studio Build Tools with C++ desktop workload
- Windows SDK

## API Configuration

Open Settings in the app and configure:

- `API Base URL`, for example `https://api.openai.com/v1`
- `API Key`
- `Model`, for example an OpenAI-compatible model name
- Global shortcuts for selected text and OCR capture

The app stores settings locally. Do not commit real API keys.

## Development

Install dependencies:

```powershell
npm install
```

Run web frontend only:

```powershell
npm run dev
```

Run desktop development mode:

```powershell
npm run desktop:dev
```

Build frontend:

```powershell
npm run build
```

Check Rust:

```powershell
cd src-tauri
cargo check
```

Build desktop installer:

```powershell
npm run desktop:build
```

## Project Structure

```text
src/
  App.tsx                 Main app workflow
  CaptureOverlay.tsx      Fullscreen capture overlay
  ResultPopup.tsx         Floating result popup
  components/             React UI components
  lib/                    LLM, prompts, storage, Tauri bridge
  styles/                 UI styles
src-tauri/
  src/lib.rs              Tauri commands, tray, shortcuts, windows
  src/ocr.rs              Screenshot and Windows OCR
  src/selection.rs        Windows selected-text reading
  src/app_log.rs          Local logging
```

More details are documented in [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md).

## Release Notes And Roadmap

- [CHANGELOG.md](CHANGELOG.md)
- [ROADMAP.md](ROADMAP.md)
- [README_zh.md](README_zh.md)

## License

MIT, as declared in `src-tauri/Cargo.toml`.
