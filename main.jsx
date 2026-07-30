import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./css/app.css";
import "./css/multiplayer.css";
import "./css/wiki.css";
import "./css/SuccessOverlay.css";
import "./css/group.css";
import "./css/groupSpectator.css";
import "./css/recovery.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
