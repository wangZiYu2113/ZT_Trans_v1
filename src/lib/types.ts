export type PromptMode = "auto" | "finance" | "english" | "translate" | "general";

export type QueryStage =
  | "idle"
  | "reading-selection"
  | "ocr-running"
  | "cache-hit"
  | "streaming"
  | "completed"
  | "error"
  | "cancelled";

export interface AppSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  activeProviderId: string;
  hotkeySelection: string;
  hotkeyCapture: string;
  closeBehavior: "hide" | "exit";
  defaultMode: PromptMode;
  theme: "light" | "dark";
  requestTimeoutMs: number;
  customPrompts: Partial<Record<Exclude<PromptMode, "auto">, string>>;
}

export interface QueryRecord {
  id: string;
  rawText: string;
  normalizedText: string;
  sourceType: "manual" | "selection" | "ocr";
  recognizedText: string;
  mode: Exclude<PromptMode, "auto">;
  response: string;
  model: string;
  providerId: string;
  promptVersion: string;
  createdAt: string;
  isFavorite: boolean;
}

export interface QueryState {
  queryId: string;
  sourceText: string;
  mode: Exclude<PromptMode, "auto">;
  stage: QueryStage;
  result: string;
  error?: string;
  fromCache: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
