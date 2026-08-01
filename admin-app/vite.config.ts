import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const adminRoot = fileURLToPath(new URL(".", import.meta.url));
const previewSpaRoutes = /^\/(?:admin(?:\/.*)?|admin-next(?:\/.*)?|stats\/?)(?:\?.*)?$/;

export default defineConfig({
  root: adminRoot,
  base: "/admin-dist/",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "admin-preview-spa-fallback",
      configurePreviewServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url && previewSpaRoutes.test(request.url)) request.url = "/admin-dist/";
          next();
        });
      },
    },
  ],
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
