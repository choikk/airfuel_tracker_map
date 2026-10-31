import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

const displayVersion = `v${String(pkg.version).replace(/^v/i, "")}`;

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(displayVersion),
  },
});
