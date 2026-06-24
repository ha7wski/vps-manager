import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build with a relative base so the bundle works when loaded from a file://
// origin inside Electron in production.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
