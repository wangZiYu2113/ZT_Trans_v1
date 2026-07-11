import { useEffect, useMemo, useState } from "react";
import { cancelCaptureSelection, completeCaptureSelection } from "./lib/tauri";

interface Point {
  x: number;
  y: number;
}

export function CaptureOverlay() {
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [error, setError] = useState("");

  const rect = useMemo(() => {
    if (!start || !current) return null;
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    return { x, y, width, height };
  }, [current, start]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void cancelCaptureSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function finishSelection() {
    if (!rect || rect.width < 8 || rect.height < 8) {
      await cancelCaptureSelection();
      return;
    }

    try {
      await completeCaptureSelection({
        ...rect,
        scaleFactor: window.devicePixelRatio || 1
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed.");
    }
  }

  return (
    <main
      className="capture-overlay"
      onMouseDown={(event) => {
        const point = { x: event.clientX, y: event.clientY };
        setStart(point);
        setCurrent(point);
      }}
      onMouseMove={(event) => {
        if (!start) return;
        setCurrent({ x: event.clientX, y: event.clientY });
      }}
      onMouseUp={() => {
        void finishSelection();
      }}
    >
      <div className="capture-hint">
        <strong>框选文字区域</strong>
        <span>拖拽选择，Esc 取消</span>
      </div>
      {rect ? (
        <div
          className="capture-rect"
          style={{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
          }}
        />
      ) : null}
      {error ? <div className="capture-error">{error}</div> : null}
    </main>
  );
}
