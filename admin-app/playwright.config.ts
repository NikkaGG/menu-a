import os from "node:os";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const widths = [320, 390, 768, 1024, 1440] as const;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  outputDir: path.join(os.tmpdir(), "menu-qrcode-admin-playwright"),
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    locale: "ru-RU",
    colorScheme: "light",
    reducedMotion: "reduce",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: widths.map((width) => ({
    name: `${width}px`,
    use: { viewport: { width, height: width <= 390 ? 844 : 900 } },
  })),
  webServer: {
    command: "npm --prefix .. run build && node ../node_modules/vite/bin/vite.js preview --config vite.config.ts --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/admin",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
