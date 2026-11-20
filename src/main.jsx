import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { preventZoom } from "./noZoom";
import { storage } from "./utils/storage";
import "./styles/global.css";
import "./styles/halo.css";
import "./styles/halo-motion.css";
import "./styles/auth.css";
import "./styles/dock.css";
import "./styles/filters.css";
import "./styles/focus.css";
import "./styles/nx.css";
import "./styles/features.css";
import "./styles/watch.css";
import "./styles/search.css";
import "./styles/apple.css";

// Behave like an installed app on phones: no pinch / double-tap / input zoom
preventZoom();

// One-time switch: VidSrc 2 becomes everyone's starting source. A source the
// viewer picks by hand after this is remembered as before.
if (!storage.get("sourceDefaultV2")) {
  storage.remove("playerSource");
  storage.set("sourceDefaultV2", true);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
