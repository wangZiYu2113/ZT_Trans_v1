import { Clock, Star } from "lucide-react";
import type { QueryRecord } from "../lib/types";

interface HistoryPanelProps {
  history: QueryRecord[];
  onSelect: (record: QueryRecord) => void;
  onToggleFavorite: (record: QueryRecord) => void;
}

export function HistoryPanel({ history, onSelect, onToggleFavorite }: HistoryPanelProps) {
  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <h2>历史记录</h2>
        <span>{history.length} 条</span>
      </div>
      <div className="history-list">
        {history.length === 0 ? (
          <p className="muted">完成一次解释后会自动记录。</p>
        ) : (
          history.map((record) => (
            <article key={record.id} className="history-item">
              <button type="button" className="history-main" onClick={() => onSelect(record)}>
                <span>{record.rawText}</span>
                <small>
                  <Clock size={13} />
                  {new Date(record.createdAt).toLocaleString()}
                </small>
              </button>
              <button
                type="button"
                className={record.isFavorite ? "icon-button active" : "icon-button"}
                onClick={() => onToggleFavorite(record)}
                aria-label="收藏"
                title="收藏"
              >
                <Star size={15} />
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
