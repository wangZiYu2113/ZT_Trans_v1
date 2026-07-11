import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Copy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { FormattedAnswer } from "./components/FormattedAnswer";
import {
  loadResultSnapshot,
  RESULT_WINDOW_EVENT,
  type ResultWindowPayload
} from "./lib/resultWindow";

export function ResultPopup() {
  const [snapshot, setSnapshot] = useState<ResultWindowPayload | null>(() => loadResultSnapshot());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ResultWindowPayload>(RESULT_WINDOW_EVENT, (event) => {
      setSnapshot(event.payload);
    }).then((dispose) => {
      unlisten = dispose;
      setSnapshot(loadResultSnapshot());
    });

    return () => unlisten?.();
  }, []);

  const query = snapshot?.query;
  const isBusy = query?.stage === "streaming" || query?.stage === "ocr-running";

  return (
    <main className="result-popup">
      <header className="result-popup-header" data-tauri-drag-region>
        <div data-tauri-drag-region>
          <strong data-tauri-drag-region>知选</strong>
          <span data-tauri-drag-region>{query ? popupStageLabel(query.stage) : "等待结果"}</span>
        </div>
        <div className="result-popup-actions">
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
            onClick={() => getCurrentWebviewWindow().close()}
            aria-label="关闭"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <section className="result-popup-source">
        <span>识别文本</span>
        <p>{query?.sourceText || snapshot?.sourceText || "等待 OCR 识别结果"}</p>
      </section>

      <section className="result-popup-body" aria-live="polite">
        {query?.error ? <p className="error-text">{query.error}</p> : null}
        {query?.result ? <FormattedAnswer text={query.result} /> : null}
        {!query?.result && !query?.error ? (
          <p className="muted">{isBusy ? "模型正在生成回答..." : "框选后将在这里显示模型回答。"}</p>
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
