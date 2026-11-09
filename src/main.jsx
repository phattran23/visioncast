import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { preventZoom } from "./noZoom";
import "./styles/global.css";
import "./styles/halo.css";
import "./styles/halo-motion.css";
import "./styles/auth.css";
import "./styles/dock.css";
import "./styles/filters.css";
import "./styles/focus.css";
import "./styles/nx.css";
import "./styles/features.css";

// Behave like an installed app on phones: no pinch / double-tap / input zoom
preventZoom();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
