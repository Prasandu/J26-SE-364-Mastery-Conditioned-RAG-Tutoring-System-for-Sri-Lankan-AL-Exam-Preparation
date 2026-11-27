/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The integrated web app for all four components (J26-SE-364).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // "@/..." means "src/...", so imports do not turn into ../../..
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // 5173 is the origin every backend's CORS_ORIGINS allows. strictPort: fail loudly
  // instead of drifting to another port, which would break CORS.
  server: {
    port: 5173,
    strictPort: true,
    // shared/contracts/topics.json lives outside this folder.
    fs: { allow: [".."] },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
