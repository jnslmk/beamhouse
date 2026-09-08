import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // ponytail: single-viewport LAN-served bundle (three.js dominates); warn only past 1 MB.
  build: { chunkSizeWarningLimit: 1000 },
  worker: { format: "iife" },
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:7070",
        ws: true,
      },
    },
  },
});
