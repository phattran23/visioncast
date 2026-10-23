import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import "./styles/halo.css";
import "./styles/halo-motion.css";
import "./styles/auth.css";
import "./styles/dock.css";
import "./styles/filters.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
