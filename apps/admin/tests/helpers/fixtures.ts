/**
 * apps/admin/tests/helpers/fixtures.ts
 *
 * Reads the JSON file global-setup.ts wrote (Playwright's globalSetup runs
 * in its own process, so passing data to test files via an in-memory
 * variable doesn't work — a file on disk is the standard way).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../.e2e-fixtures.json');

export interface E2eFixtures {
  adminA: { email: string; password: string; role: string; totpSecret: string; id: string };
  adminB: { email: string; password: string; role: string; totpSecret: string; id: string };
  adminSupport: { email: string; password: string; role: string; totpSecret: string; id: string };
  adminSuper: { email: string; password: string; role: string; totpSecret: string; id: string };
  adminResetTarget: {
    email: string;
    password: string;
    role: string;
    totpSecret: string;
    id: string;
  };
  orgOwner: { email: string; password: string };
  targetWorker: { email: string; password: string };
  orgName: string;
  orgId: string;
  targetUserId: string;
}

export function loadFixtures(): E2eFixtures {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(
      `${FIXTURES_PATH} not found — global-setup.ts should have created it. ` +
        'Did globalSetup run (check playwright.config.ts) and did local Supabase respond?',
    );
  }
  return JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
}
