import { defineConfig, devices } from "@playwright/test";

// Runs against a production build served with an isolated in-memory Postgres (PGlite),
// so tests never touch real data. `npm run test:e2e` builds first.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1, // one shared database
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    reducedMotion: "reduce", // disables the slide animation so tests are deterministic
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3100/login",
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
