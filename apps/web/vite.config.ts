import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server proxies /api/* to the HTTP API (@nowlez/server, default :3000).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
