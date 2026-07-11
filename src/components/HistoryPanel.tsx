import { Clock, Download, Star, Trash2 } from "lucide-react";
import type { QueryRecord } from "../lib/types";

interface HistoryPanelProps {
  history: QueryRecord[];
  onSelect: (record: QueryRecord) => void;
  onToggleFavorite: (record: QueryRecord) => void;
  onDelete: (recordId: string) => void;
  onClear: () => void;
  onExport: () => void;
}

export function HistoryPanel({
  history,
  onSelect,
  onToggleFavorite,
  onDelete,
  onClear,
  onExport
}: HistoryPanelProps) {
  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <div>
          <h2>历史记录</h2>
          <span className="panel-subtitle">{history.length} 条</span>
        </div>
        <div className="history-actions">
          <button type="button" className="ghost-button tiny" onClick={onExport} disabled={history.length === 0}>
            <Download size={14} />
            导出
          </button>
          <button type="button" className="ghost-button tiny" onClick={onClear} disabled={history.length === 0}>
            <Trash2 size={14} />
            清空
          </button>
        </div>
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
              <div className="history-item-actions">
                <button
                  type="button"
                  className={record.isFavorite ? "icon-button active" : "icon-button"}
                  onClick={() => onToggleFavorite(record)}
                  aria-label="收藏"
                  title="收藏"
                >
                  <Star size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onDelete(record.id)}
                  aria-label="删除"
                  title="删除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
