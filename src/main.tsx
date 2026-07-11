import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CaptureOverlay } from "./CaptureOverlay";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/capture.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("view") === "capture" ? <CaptureOverlay /> : <App />}
  </React.StrictMode>
);
