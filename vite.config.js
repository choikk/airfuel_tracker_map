import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// appVersion is the date of the latest change (YYMM.DD); version stays valid semver for npm.
const displayVersion = `v${String(pkg.appVersion || pkg.version).replace(/^v/i, "")}`;

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(displayVersion),
  },
});
