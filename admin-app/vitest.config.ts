import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  base: "/admin-dist/",
  define: {
    "import.meta.env.BASE_URL": JSON.stringify("/admin-dist/"),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(repositoryRoot, "admin-app/src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(repositoryRoot, "admin-app/src/test/setup.ts")],
    include: ["admin-app/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/*.test.js", "admin-app/tests/**", "node_modules/**", "admin-dist/**"],
  },
});
