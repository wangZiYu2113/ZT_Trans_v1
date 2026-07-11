import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { QueryState } from "./types";
import { isTauriRuntime } from "./tauri";

export const RESULT_WINDOW_LABEL = "result";
export const RESULT_WINDOW_EVENT = "zy-trans://result-update";
export const RESULT_WINDOW_SNAPSHOT_KEY = "zy-trans:result-window";

export interface ResultWindowPayload {
  query: QueryState;
  sourceText: string;
  updatedAt: string;
}

export function saveResultSnapshot(payload: ResultWindowPayload) {
  localStorage.setItem(RESULT_WINDOW_SNAPSHOT_KEY, JSON.stringify(payload));
}

export function loadResultSnapshot(): ResultWindowPayload | null {
  try {
    const raw = localStorage.getItem(RESULT_WINDOW_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as ResultWindowPayload) : null;
  } catch {
    return null;
  }
}

export async function openResultWindow() {
  if (!isTauriRuntime) return;

  const existing = await WebviewWindow.getByLabel(RESULT_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const resultWindow = new WebviewWindow(RESULT_WINDOW_LABEL, {
    url: "index.html?view=result",
    title: "知选结果",
    width: 420,
    height: 520,
    minWidth: 360,
    minHeight: 320,
    resizable: true,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    visible: true
  });

  await new Promise<void>((resolve) => {
    const timeout = globalThis.setTimeout(resolve, 800);
    const done = () => {
      globalThis.clearTimeout(timeout);
      resolve();
    };
    void resultWindow.once("tauri://created", done);
    void resultWindow.once("tauri://error", done);
    resultWindow.setFocus().catch(() => undefined);
  });
}

export async function publishResultWindow(payload: ResultWindowPayload) {
  saveResultSnapshot(payload);
  if (!isTauriRuntime) return;
  await emitTo(RESULT_WINDOW_LABEL, RESULT_WINDOW_EVENT, payload).catch(() => undefined);
}
