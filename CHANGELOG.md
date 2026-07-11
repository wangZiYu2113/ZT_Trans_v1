# Changelog

## v0.1.0 - 2026-07-11

Initial usable Windows desktop release.

### Added

- Tauri 2 desktop shell with React and TypeScript frontend.
- OpenAI-compatible streaming chat completion support.
- Manual explanation workflow.
- Global selected-text explanation shortcut.
- Fullscreen capture overlay and local Windows OCR workflow.
- Clipboard image write for captured OCR regions.
- Floating result popup shared by OCR and selected-text workflows.
- Result popup controls: drag, close, minimize, pin, and copy.
- Configurable shortcuts, API settings, model, default mode, and prompts.
- Local history with favorite, delete, clear, and export.
- Local answer cache keyed by provider, model, prompt version, mode, and normalized text.
- Local lifecycle log file.
- Close-to-background behavior and system tray controls.
- Project architecture documentation.

### Changed

- Prompt templates now enforce concise structured answers.
- OCR text is compacted before sending to the model.
- Product name and window title are set to `知译`.

### Verified

- `npm run build`
- `cargo check`
- `npm run desktop:build`

### Known Limitations

- OCR accuracy depends on Windows OCR and screenshot quality.
- No API OCR fallback yet.
- No automatic updater yet.
- No signed installer yet.
