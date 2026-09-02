import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
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
