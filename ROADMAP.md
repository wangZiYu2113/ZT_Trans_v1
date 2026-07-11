# Roadmap

## Priority 1: Stability And Diagnostics

- Add an in-app log viewer.
- Add one-click diagnostic export.
- Improve lifecycle handling for repeated capture, cancelled model requests, and shortcut conflicts.
- Add basic smoke tests for core frontend workflows.

## Priority 2: OCR Quality

- Add optional API OCR fallback for low-quality screenshots.
- Add OCR language selection.
- Add editable OCR confirmation before sending in strict mode.
- Improve table, number, and mixed Chinese-English recognition handling.

## Priority 3: Desktop Experience

- Add tray menu item to pause/resume global shortcuts.
- Add configurable result popup size and position.
- Add start-on-login option.
- Add installer icon refinement and code signing.

## Priority 4: Data And History

- Add history search and filters.
- Add Markdown export.
- Consider SQLite storage if localStorage becomes limiting.
- Add manual cache cleanup controls.

## Priority 5: Release Engineering

- Add GitHub Actions build pipeline.
- Add automatic release packaging.
- Add automatic update support after signing and release process stabilizes.
