import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const adminRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: adminRoot,
  base: "/admin-dist/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(adminRoot, "src"),
    },
  },
  build: {
    outDir: path.resolve(adminRoot, "../admin-dist"),
    emptyOutDir: true,
  },
});
