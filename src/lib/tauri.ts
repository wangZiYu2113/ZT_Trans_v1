import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export const isTauriRuntime = "__TAURI_INTERNALS__" in window;

export interface NativeShortcutPayload {
  action: "selection" | "capture";
}

export interface CaptureSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export async function explainSelectionNative(): Promise<string> {
  return invoke<string>("read_selected_text");
}

export async function startCaptureNative(): Promise<string> {
  return invoke<string>("start_capture_ocr");
}

export async function completeCaptureSelection(selection: CaptureSelection): Promise<string> {
  return invoke<string>("complete_capture_selection", { selection });
}

export async function cancelCaptureSelection(): Promise<void> {
  return invoke<void>("cancel_capture_selection");
}

export async function listenNativeShortcuts(
  handler: (payload: NativeShortcutPayload) => void
): Promise<UnlistenFn | undefined> {
  if (!isTauriRuntime) return undefined;
  return listen<NativeShortcutPayload>("zy-trans://shortcut", (event) => handler(event.payload));
}
