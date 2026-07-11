import { Clipboard, MousePointer2, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FloatingResult } from "./components/FloatingResult";
import { HistoryPanel } from "./components/HistoryPanel";
import { ModeTabs } from "./components/ModeTabs";
import { SettingsPanel } from "./components/SettingsPanel";
import { polishAnswer } from "./lib/answerQuality";
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
import {
  configureShortcutsNative,
  exitAppNative,
  explainSelectionNative,
  getLogPathNative,
  isTauriRuntime,
  listenNativeShortcuts,
  setCloseBehaviorNative,
  startCaptureNative,
  writeAppLogNative
} from "./lib/tauri";
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

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState<PromptMode>("auto");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [history, setHistory] = useState<QueryRecord[]>(() => loadHistory());
  const [query, setQuery] = useState<QueryState>(emptyQuery);
  const [activeView, setActiveView] = useState<"workbench" | "settings">("workbench");
  const [logPath, setLogPath] = useState("");
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
    if (!isTauriRuntime) return;

    void syncNativeSettings(settings, "startup").catch((error) => {
      const message = errorMessage(error, "快捷键初始化失败。");
      setQuery({
        ...emptyQuery,
        queryId: crypto.randomUUID(),
        stage: "error",
        error: message
      });
      void logEvent("settings", `startup failed: ${message}`);
    });
    void getLogPathNative()
      .then(setLogPath)
      .catch(() => undefined);
  }, []);

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

  async function logEvent(scope: string, message: string) {
    try {
      await writeAppLogNative(scope, message);
    } catch {
      // Logging must never interrupt the translation flow.
    }
  }

  async function syncNativeSettings(nextSettings: AppSettings, reason: string) {
    if (!isTauriRuntime) return;
    await configureShortcutsNative(nextSettings.hotkeySelection, nextSettings.hotkeyCapture);
    await setCloseBehaviorNative(nextSettings.closeBehavior);
    await logEvent(
      "settings",
      `${reason}: selection=${nextSettings.hotkeySelection} capture=${nextSettings.hotkeyCapture} close=${nextSettings.closeBehavior}`
    );
  }

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
    await logEvent("query", `start source=${sourceType} mode=${resolvedMode}`);

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
      await logEvent("query", `cache hit source=${sourceType}`);
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
      const polishedResponse = polishAnswer(response);

      const record: QueryRecord = {
        id: queryId,
        rawText: trimmed,
        normalizedText,
        sourceType,
        recognizedText: sourceType === "ocr" ? trimmed : "",
        mode: resolvedMode,
        response: polishedResponse,
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
        result: polishedResponse,
        fromCache: false
      };
      setQuery((current) => (current.queryId === queryId ? completedQuery : current));
      await publishPopupResult(completedQuery, trimmed, shouldUseResultWindow);
      await logEvent("query", `completed source=${sourceType}`);
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
        await logEvent("query", `cancelled source=${sourceType}`);
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
      await logEvent("query", `failed source=${sourceType}: ${failedQuery.error ?? "unknown"}`);
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
        if (!selectedText.trim()) {
          throw new Error("未读取到选中文本。");
        }
        setInputText(selectedText);
        await runQuery(selectedText, "selection");
      } catch (error) {
        const message = errorMessage(error, "未读取到选中文本。");
        setQuery({
          ...emptyQuery,
          queryId: crypto.randomUUID(),
          stage: "error",
          error: message
        });
        await logEvent("selection", `failed: ${message}`);
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
        await logEvent("ocr", `recognized length=${compactText.length}`);
      } catch (error) {
        const message = errorMessage(error, "框选 OCR 失败。");
        setQuery({
          ...emptyQuery,
          queryId: crypto.randomUUID(),
          stage: "error",
          error: message
        });
        await logEvent("ocr", `failed: ${message}`);
        captureRunningRef.current = false;
        return;
      }

      try {
        await runQuery(compactText, "ocr");
      } catch (error) {
        const message = errorMessage(error, "OCR 文字发送给模型失败。");
        setQuery({
          ...emptyQuery,
          queryId: crypto.randomUUID(),
          sourceText: compactText,
          stage: "error",
          error: message
        });
        await logEvent("ocr", `send failed: ${message}`);
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

  async function persistSettings() {
    saveSettings(settings);
    try {
      await syncNativeSettings(settings, "save");
      await getLogPathNative().then(setLogPath).catch(() => undefined);
      setQuery({ ...emptyQuery, queryId: crypto.randomUUID(), stage: "completed", result: "设置已保存。", fromCache: false });
    } catch (error) {
      setQuery({
        ...emptyQuery,
        queryId: crypto.randomUUID(),
        stage: "error",
        error: errorMessage(error, "设置保存失败。")
      });
    }
  }

  function cancelCurrent() {
    abortRef.current?.abort();
    setQuery((current) => ({ ...current, stage: "cancelled" }));
    void logEvent("query", "cancel requested");
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

  function deleteRecord(recordId: string) {
    const next = history.filter((item) => item.id !== recordId);
    setHistory(next);
    saveHistory(next);
    void logEvent("history", `deleted id=${recordId}`);
  }

  function clearHistory() {
    if (!window.confirm("确认清空全部历史记录？")) return;
    setHistory([]);
    saveHistory([]);
    saveCache({});
    void logEvent("history", "cleared");
  }

  function exportHistory() {
    const content = history
      .map(
        (record) => `[${formatTimestamp(record.createdAt)}]
问题：
${record.rawText}

回答：
${record.response}

---`
      )
      .join("\n\n");
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    downloadTextFile(`zy-trans-history-${stamp}.txt`, content);
    void logEvent("history", `exported count=${history.length}`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>知译</span>
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
            onRegenerate={() => runQuery(query.sourceText || inputText, "manual", true)}
            onCancel={cancelCurrent}
          />
          <HistoryPanel
            history={history}
            onSelect={loadRecord}
            onToggleFavorite={toggleFavorite}
            onDelete={deleteRecord}
            onClear={clearHistory}
            onExport={exportHistory}
          />
        </section>
      ) : (
        <section className="workspace single">
          <SettingsPanel
            settings={settings}
            logPath={logPath}
            onChange={setSettings}
            onSave={() => void persistSettings()}
            onExitApp={isTauriRuntime ? () => void exitAppNative() : undefined}
          />
        </section>
      )}
    </main>
  );
}
