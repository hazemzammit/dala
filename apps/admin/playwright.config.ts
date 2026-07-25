import { defineConfig, devices } from '@playwright/test';

/**
 * apps/admin/playwright.config.ts
 *
 * Doc 02 §2.11 — "Admin: Playwright, separate suite. Runs against the
 * isolated Admin deployment only." Deliberately its own config, not
 * shared with any suite apps/web might add later — different auth model
 * (2-step TOTP login, no session in common with the contractor app), so
 * there's no reason to share a test harness.
 *
 * Requires a running local Supabase instance (`supabase start` from the
 * repo root) and `ADMIN_IP_ALLOWLIST` either unset or including 127.0.0.1
 * in apps/admin/.env.local — otherwise every test hits the access-denied
 * page before the login form even renders.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // impersonation tests mutate shared admin_sessions state — safer serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: require.resolve('./tests/global-setup.ts'),
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
