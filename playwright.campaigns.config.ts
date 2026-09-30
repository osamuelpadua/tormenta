import { defineConfig, devices } from "@playwright/test";
// Accounts and campaigns against the in-browser demo server (VITE_BACKEND=demo),
// built separately so the regular build stays local-only.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "campaigns.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 12000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command:
      "npx vite build --outDir .cache/demo-dist --emptyOutDir && npx vite preview --outDir .cache/demo-dist --port 4174 --host 127.0.0.1",
    url: "http://127.0.0.1:4174",
    env: { VITE_BACKEND: "demo" },
    reuseExistingServer: false,
    timeout: 240000,
  },
});
