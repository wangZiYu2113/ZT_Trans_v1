import type { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  activeProviderId: "openai-compatible",
  hotkeySelection: "Ctrl+Shift+E",
  hotkeyCapture: "Ctrl+Shift+S",
  defaultMode: "auto",
  theme: "light",
  requestTimeoutMs: 30000,
  customPrompts: {}
};
