import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Copy, Minus, Pin, PinOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { FormattedAnswer } from "./components/FormattedAnswer";
import {
  loadResultSnapshot,
  RESULT_WINDOW_EVENT,
  type ResultWindowPayload
} from "./lib/resultWindow";

export function ResultPopup() {
  const [snapshot, setSnapshot] = useState<ResultWindowPayload | null>(() => loadResultSnapshot());
  const [alwaysOnTop, setAlwaysOnTopState] = useState(true);
  const appWindow = getCurrentWebviewWindow();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ResultWindowPayload>(RESULT_WINDOW_EVENT, (event) => {
      setSnapshot(event.payload);
    }).then((dispose) => {
      unlisten = dispose;
      setSnapshot(loadResultSnapshot());
    });

    appWindow.isAlwaysOnTop().then(setAlwaysOnTopState).catch(() => undefined);

    return () => unlisten?.();
  }, [appWindow]);

  const query = snapshot?.query;
  const isBusy = query?.stage === "streaming" || query?.stage === "ocr-running";

  async function toggleAlwaysOnTop() {
    const next = !alwaysOnTop;
    await appWindow.setAlwaysOnTop(next);
    setAlwaysOnTopState(next);
  }

  return (
    <main className="result-popup">
      <header
        className="result-popup-header"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          void appWindow.startDragging();
        }}
      >
        <div className="result-popup-title">
          <strong>知选</strong>
          <span>{query ? popupStageLabel(query.stage) : "等待结果"}</span>
        </div>
        <div className="result-popup-actions" onMouseDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={alwaysOnTop ? "icon-button active" : "icon-button"}
            onClick={toggleAlwaysOnTop}
            aria-label={alwaysOnTop ? "取消置顶" : "置顶窗口"}
            title={alwaysOnTop ? "取消置顶" : "置顶窗口"}
          >
            {alwaysOnTop ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => appWindow.minimize()}
            aria-label="最小化"
            title="最小化"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => navigator.clipboard.writeText(query?.result || "")}
            disabled={!query?.result}
            aria-label="复制结果"
            title="复制结果"
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => appWindow.close()}
            aria-label="关闭"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <section className="result-popup-source">
        <span>识别文本</span>
        <p>{query?.sourceText || snapshot?.sourceText || "等待文本识别结果"}</p>
      </section>

      <section className="result-popup-body" aria-live="polite">
        {query?.error ? <p className="error-text">{query.error}</p> : null}
        {query?.result ? <FormattedAnswer text={query.result} /> : null}
        {!query?.result && !query?.error ? (
          <p className="muted">{isBusy ? "模型正在生成回答..." : "划词或框选后将在这里显示模型回答。"}</p>
        ) : null}
      </section>
    </main>
  );
}

function popupStageLabel(stage: NonNullable<ResultWindowPayload["query"]>["stage"]) {
  const labels: Record<NonNullable<ResultWindowPayload["query"]>["stage"], string> = {
    idle: "空闲",
    "reading-selection": "读取划词",
    "ocr-running": "OCR 识别",
    "cache-hit": "缓存结果",
    streaming: "生成中",
    completed: "完成",
    error: "出错",
    cancelled: "已取消"
  };
  return labels[stage];
}
