import { Clipboard, MousePointer2, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FloatingResult } from "./components/FloatingResult";
import { HistoryPanel } from "./components/HistoryPanel";
import { ModeTabs } from "./components/ModeTabs";
import { SettingsPanel } from "./components/SettingsPanel";
import { streamOpenAiCompatible } from "./lib/llm";
import { buildMessages, detectMode, normalizeText, PROMPT_VERSION } from "./lib/prompts";
import { openResultWindow, publishResultWindow } from "./lib/resultWindow";
import {
  buildCacheKey,
  loadCache,
  loadHistory,
  loadSettings,
  saveCache,
  saveHistory,
  saveSettings
} from "./lib/storage";
import { explainSelectionNative, isTauriRuntime, listenNativeShortcuts, startCaptureNative } from "./lib/tauri";
import type { AppSettings, PromptMode, QueryRecord, QueryState } from "./lib/types";

const emptyQuery: QueryState = {
  queryId: "idle",
  sourceText: "",
  mode: "general",
  stage: "idle",
  result: "",
  fromCache: false
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function compactOcrText(text: string) {
  return text.replace(/[\s\u200b\u200c\u200d\ufeff]+/g, "");
}

export default function App() {
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState<PromptMode>("auto");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [history, setHistory] = useState<QueryRecord[]>(() => loadHistory());
  const [query, setQuery] = useState<QueryState>(emptyQuery);
  const [activeView, setActiveView] = useState<"workbench" | "settings">("workbench");
  const abortRef = useRef<AbortController | null>(null);
  const captureRunningRef = useRef(false);
  const shortcutHandlersRef = useRef({
    selection: (_text?: string, _error?: string) => {},
    capture: () => {}
  });

  useEffect(() => {
    setMode(settings.defaultMode);
  }, [settings.defaultMode]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenNativeShortcuts((payload) => {
      if (payload.action === "selection") shortcutHandlersRef.current.selection(payload.text, payload.error);
      if (payload.action === "capture") shortcutHandlersRef.current.capture();
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const cache = useMemo(() => loadCache(), [history]);

  async function publishPopupResult(nextQuery: QueryState, sourceText: string, enabled: boolean) {
    if (!enabled) return;
    await publishResultWindow({
      query: nextQuery,
      sourceText,
      updatedAt: new Date().toISOString()
    });
  }

  async function runQuery(rawText: string, sourceType: QueryRecord["sourceType"], forceRefresh = false) {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const queryId = crypto.randomUUID();
    const resolvedMode = detectMode(trimmed, mode);
    const normalizedText = normalizeText(trimmed);
    const cacheKey = buildCacheKey({
      normalizedText,
      mode: resolvedMode,
      promptVersion: PROMPT_VERSION,
      providerId: settings.activeProviderId,
      model: settings.model
    });
    const shouldUseResultWindow = sourceType === "ocr" || sourceType === "selection";

    const initialQuery: QueryState = {
      queryId,
      sourceText: trimmed,
      mode: resolvedMode,
      stage: "streaming",
      result: "",
      fromCache: false
    };
    setQuery(initialQuery);
    await publishPopupResult(initialQuery, trimmed, shouldUseResultWindow);
    if (shouldUseResultWindow) {
      await openResultWindow();
    }

    if (!forceRefresh && cache[cacheKey]) {
      const cachedQuery: QueryState = {
        queryId,
        sourceText: trimmed,
        mode: resolvedMode,
        stage: "cache-hit",
        result: cache[cacheKey].response,
        fromCache: true
      };
      setQuery(cachedQuery);
      await publishPopupResult(cachedQuery, trimmed, shouldUseResultWindow);
      return;
    }

    try {
      const messages = buildMessages(trimmed, resolvedMode, settings);
      let streamed = "";
      const response = await streamOpenAiCompatible(settings, messages, {
        signal: controller.signal,
        onToken: (token) => {
          streamed += token;
          const streamingQuery: QueryState = {
            queryId,
            sourceText: trimmed,
            mode: resolvedMode,
            stage: "streaming",
            result: streamed,
            fromCache: false
          };
          setQuery((current) => (current.queryId === queryId ? streamingQuery : current));
          void publishPopupResult(streamingQuery, trimmed, shouldUseResultWindow);
        }
      });

      const record: QueryRecord = {
        id: queryId,
        rawText: trimmed,
        normalizedText,
        sourceType,
        recognizedText: sourceType === "ocr" ? trimmed : "",
        mode: resolvedMode,
        response,
        model: settings.model,
        providerId: settings.activeProviderId,
        promptVersion: PROMPT_VERSION,
        createdAt: new Date().toISOString(),
        isFavorite: false
      };

      const nextCache = { ...loadCache(), [cacheKey]: record };
      const nextHistory = [record, ...loadHistory()].slice(0, 100);
      saveCache(nextCache);
      saveHistory(nextHistory);
      setHistory(nextHistory);

      const completedQuery: QueryState = {
        queryId,
        sourceText: trimmed,
        mode: resolvedMode,
        stage: "completed",
        result: response,
        fromCache: false
      };
      setQuery((current) => (current.queryId === queryId ? completedQuery : current));
      await publishPopupResult(completedQuery, trimmed, shouldUseResultWindow);
    } catch (error) {
      if (controller.signal.aborted) {
        const cancelledQuery: QueryState = {
          queryId,
          sourceText: trimmed,
          mode: resolvedMode,
          stage: "cancelled",
          result: "",
          fromCache: false
        };
        setQuery((current) => (current.queryId === queryId ? cancelledQuery : current));
        await publishPopupResult(cancelledQuery, trimmed, shouldUseResultWindow);
        return;
      }

      const failedQuery: QueryState = {
        queryId,
        sourceText: trimmed,
        mode: resolvedMode,
        stage: "error",
        result: "",
        error: errorMessage(error, "解释失败，请稍后重试。"),
        fromCache: false
      };
      setQuery((current) => (current.queryId === queryId ? failedQuery : current));
      await publishPopupResult(failedQuery, trimmed, shouldUseResultWindow);
    }
  }

  async function handleSelection(shortcutText?: string, shortcutError?: string) {
    if (isTauriRuntime) {
      setQuery({ ...emptyQuery, queryId: crypto.randomUUID(), stage: "reading-selection" });
      try {
        if (shortcutError) {
          throw new Error(shortcutError);
        }
        const selectedText = shortcutText ?? (await explainSelectionNative());
        setInputText(selectedText);
        await runQuery(selectedText, "selection");
      } catch (error) {
        setQuery({
          ...emptyQuery,
          queryId: crypto.randomUUID(),
          stage: "error",
          error: errorMessage(error, "未读取到选中文本。")
        });
      }
      return;
    }

    await runQuery(inputText, "manual");
  }

  async function handleCapture() {
    if (captureRunningRef.current) return;
    if (isTauriRuntime) {
      captureRunningRef.current = true;
      setQuery({ ...emptyQuery, queryId: crypto.randomUUID(), stage: "ocr-running" });
      let compactText = "";
      try {
        const recognizedText = await startCaptureNative();
        compactText = compactOcrText(recognizedText);
        if (!compactText) {
          throw new Error("OCR 未识别到可发送的文字。");
        }
        setInputText(compactText);
      } catch (error) {
        setQuery({
          ...emptyQuery,
          queryId: crypto.randomUUID(),
          stage: "error",
          error: errorMessage(error, "框选 OCR 失败。")
        });
        captureRunningRef.current = false;
        return;
      }

      try {
        await runQuery(compactText, "ocr");
      } catch (error) {
        setQuery({
          ...emptyQuery,
          queryId: crypto.randomUUID(),
          sourceText: compactText,
          stage: "error",
          error: errorMessage(error, "OCR 文字发送给模型失败。")
        });
      } finally {
        captureRunningRef.current = false;
      }
      return;
    }
    setQuery({
      ...emptyQuery,
      queryId: crypto.randomUUID(),
      stage: "error",
      error: "浏览器预览中无法调用系统 OCR。请在 Tauri 桌面端使用框选功能。"
    });
  }

  shortcutHandlersRef.current = {
    selection: (text?: string, error?: string) => {
      void handleSelection(text, error);
    },
    capture: () => {
      void handleCapture();
    }
  };

  function persistSettings() {
    saveSettings(settings);
  }

  function cancelCurrent() {
    abortRef.current?.abort();
    setQuery((current) => ({ ...current, stage: "cancelled" }));
  }

  function loadRecord(record: QueryRecord) {
    setInputText(record.rawText);
    setMode(record.mode);
    setQuery({
      queryId: record.id,
      sourceText: record.rawText,
      mode: record.mode,
      stage: "completed",
      result: record.response,
      fromCache: true
    });
  }

  function toggleFavorite(record: QueryRecord) {
    const next = history.map((item) =>
      item.id === record.id ? { ...item, isFavorite: !item.isFavorite } : item
    );
    setHistory(next);
    saveHistory(next);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>知选</span>
          <small>划一下，框一下，马上解释。</small>
        </div>
        <nav>
          <button className={activeView === "workbench" ? "active" : ""} onClick={() => setActiveView("workbench")}>
            工作台
          </button>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")}>
            设置
          </button>
        </nav>
        <div className="hotkeys">
          <span>划词 {settings.hotkeySelection}</span>
          <span>框选 {settings.hotkeyCapture}</span>
        </div>
      </aside>

      {activeView === "workbench" ? (
        <section className="workspace">
          <section className="panel composer">
            <div className="panel-title">
              <h1>解释工作台</h1>
              <ModeTabs value={mode} onChange={setMode} />
            </div>
            <textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder="输入或粘贴股票术语、英文短语、句子，也可以在桌面端使用划词和框选。"
            />
            <div className="toolbar">
              <button type="button" className="primary-button" onClick={() => runQuery(inputText, "manual")}>
                <Send size={16} />
                解释
              </button>
              <button type="button" className="secondary-button" onClick={() => handleSelection()}>
                <Clipboard size={16} />
                划词解释
              </button>
              <button type="button" className="secondary-button" onClick={handleCapture}>
                <MousePointer2 size={16} />
                框选 OCR
              </button>
            </div>
          </section>

          <FloatingResult
            query={query}
            onRegenerate={() => runQuery(query.sourceText || inputText, query.sourceText ? "manual" : "manual", true)}
            onCancel={cancelCurrent}
          />
          <HistoryPanel history={history} onSelect={loadRecord} onToggleFavorite={toggleFavorite} />
        </section>
      ) : (
        <section className="workspace single">
          <SettingsPanel settings={settings} onChange={setSettings} onSave={persistSettings} />
        </section>
      )}
    </main>
  );
}
