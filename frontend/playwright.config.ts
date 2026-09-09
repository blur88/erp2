import { defineConfig, devices } from '@playwright/test'

/**
 * Print/PDF gate (#1214). Runs ONLY via `npm run test:print`, never as part of
 * the Vitest suite — `e2e/**` is excluded in vite.config.ts.
 */
export default defineConfig({
  testDir: './e2e',
  // Fixture creation is globalSetup, NOT beforeAll: Playwright re-runs
  // beforeAll after a worker restart, which would double the aggregate
  // balances the Balance Sheet assertions depend on.
  globalSetup: './e2e/fixtures/print-fixture.ts',
  globalTeardown: './e2e/fixtures/print-gate-teardown.ts',
  // One shared fixture per run means the tests must not run concurrently.
  workers: 1,
  fullyParallel: false,
  // A print-clamp failure is deterministic; a retry could only turn a real
  // defect into an intermittent one.
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-results/print-gate.json' }]],
  use: {
    baseURL: process.env.PRINT_GATE_BASE_URL ?? 'http://localhost:3000',
    ...devices['Desktop Chrome'],
  },
})
