import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Electron macOS: hiddenInset title bar — pad chrome + drag regions via CSS.
if (window.desktop?.platform === "darwin") {
  document.documentElement.classList.add("desktop-mac");
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
