import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initGoogleAnalytics } from "./lib/analytics.js";
import "./index.css";
import "leaflet/dist/leaflet.css";

initGoogleAnalytics();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
