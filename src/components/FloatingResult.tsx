import { Copy, RefreshCw, Square } from "lucide-react";
import { FormattedAnswer } from "./FormattedAnswer";
import type { QueryState } from "../lib/types";

interface FloatingResultProps {
  query: QueryState;
  onRegenerate: () => void;
  onCancel: () => void;
}

export function FloatingResult({ query, onRegenerate, onCancel }: FloatingResultProps) {
  const isBusy = query.stage === "streaming" || query.stage === "ocr-running" || query.stage === "reading-selection";

  return (
    <section className="result-shell" aria-live="polite">
      <header className="result-header">
        <div>
          <strong>解释结果</strong>
          <span>{query.fromCache ? "缓存命中" : stageLabel(query.stage)}</span>
        </div>
        <div className="result-actions">
          {isBusy ? (
            <button type="button" className="icon-button" onClick={onCancel} aria-label="取消请求" title="取消请求">
              <Square size={16} />
            </button>
          ) : (
            <button type="button" className="icon-button" onClick={onRegenerate} aria-label="重新生成" title="重新生成">
              <RefreshCw size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            onClick={() => navigator.clipboard.writeText(query.result)}
            aria-label="复制结果"
            title="复制结果"
            disabled={!query.result}
          >
            <Copy size={16} />
          </button>
        </div>
      </header>

      <div className="source-text">
        <span>识别文本</span>
        <p>{query.sourceText || "等待输入文本"}</p>
      </div>

      <div className="result-stream">
        {query.error ? <p className="error-text">{query.error}</p> : null}
        {query.result ? <FormattedAnswer text={query.result} /> : <p className="muted">触发解释后将在这里流式显示。</p>}
      </div>

      <footer className="status-bar">
        <span>query_id: {query.queryId}</span>
        <span>mode: {query.mode}</span>
      </footer>
    </section>
  );
}

function stageLabel(stage: QueryState["stage"]) {
  const labels: Record<QueryState["stage"], string> = {
    idle: "空闲",
    "reading-selection": "读取划词",
    "ocr-running": "OCR 识别",
    "cache-hit": "缓存命中",
    streaming: "生成中",
    completed: "完成",
    error: "出错",
    cancelled: "已取消"
  };
  return labels[stage];
}
