import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CaptureOverlay } from "./CaptureOverlay";
import { ResultPopup } from "./ResultPopup";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/capture.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {renderView()}
  </React.StrictMode>
);

function renderView() {
  const view = new URLSearchParams(window.location.search).get("view");
  if (view === "capture") return <CaptureOverlay />;
  if (view === "result") return <ResultPopup />;
  return <App />;
}
