import { defineConfig } from "@playwright/test";

const PORT = 5180;

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: `http://localhost:${PORT}/`, locale: "fr-FR", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-1920", use: { browserName: "chromium", viewport: { width: 1920, height: 1080 } } },
    { name: "mobile-390", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: `npm run dev -- --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: !process.env.CI },
});
