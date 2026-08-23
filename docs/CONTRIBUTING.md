# Contributing

Day-to-day conventions for working in this repo as a two-person team. Read
this once before your first PR.

## Branching model

- `main` — always deployable. Protected: no direct pushes, PR + 1 approval
  - passing CI required.
- `develop` (if you set it up per `docs/SETUP_GUIDE.md` §2.3) — integration
  branch, merges to `main` in batches.
- Feature branches: `feat/<short-name>`, `fix/<short-name>`,
  `db/<short-name>` for migration-only changes, e.g. `feat/dispatch-board-web`.

## Commit messages

Conventional commits, enforced by commitlint (`.husky/commit-msg`):

```
feat: add dispatch board drag-and-drop (web)
fix: attendance record not preserved on dispatch check-in overwrite
db: add project_expenses table
docs: update setup guide for EAS build
```

Allowed types: `feat fix docs style refactor perf test chore db ci`.

## Before writing any code

1. Find the exact spec section for what you're building (`docs/spec/`).
   The screen docs (03/04) reference the data/feature docs (01/02) by
   section number — follow those references rather than guessing.
2. Check `docs/spec/00-*.md` §0.4's platform scope matrix if you're at all
   unsure whether a feature is mobile-only, web-only, or both. It's the
   single authoritative answer — if a screen doc seems to disagree with
   it, the matrix wins.

## Before extending a shared file — read it first, every time

This project has already hit real bugs from assuming a shared file's shape
instead of checking it. Before extending or writing code against any of:

- `packages/shared-types/src/index.ts`
- `packages/validation/src/*.ts`
- `packages/design-tokens/src/index.ts`
- `apps/web/src/lib/theme.ts` / `apps/mobile/src/lib/tamagui.config.ts`
- any hook you're extending rather than writing fresh

**Open the actual current file and read it.** Don't rely on what you
remember it looking like, or what a similar file in another project looked
like. This is slower for thirty seconds and saves real debugging time.

## Database changes

- New table/column → new migration file in `supabase/migrations/`, numbered
  sequentially after the last one.
- Every new table: enable RLS, add at least one policy using
  `is_org_member()` / `org_role_of()` / `is_project_member()`
  (`0005_rls_helper_functions.sql` has the pattern). No exceptions, no
  "I'll add RLS later."
- Run `pnpm db:reset` locally to confirm the migration applies cleanly
  before opening a PR.
- Never edit an already-merged migration file. If you need to change
  something a merged migration did, write a new migration that alters it —
  migrations are an append-only log, same principle as Doc 01 §1.8's
  additive-only schema rule.

## Mobile + web parity

Per Doc 00 §0.4, a contractor module isn't "done" until it ships on both
mobile and web (workers remain mobile-only by design — that's not drift,
it's the spec). If you're picking up a module solo, either:

- build both platforms in your PR, or
- build one platform and open a tracking issue (use
  `.github/ISSUE_TEMPLATE/module.md`) for the other platform before merging,
  so it doesn't silently fall behind.

## Pull requests

- Use the PR template (auto-populated) — it has a checklist specific to
  this project (RLS pattern, additive migrations, parity, secrets).
  Actually check the boxes; don't merge with unchecked items you didn't
  actually verify.
- One module/screen per PR where reasonably possible. A PR touching both a
  migration and three unrelated screens is hard to review and hard to
  revert if something's wrong.
- Tag the other person as reviewer. Don't self-merge, even though branch
  protection technically allows it if you're an admin — the point of
  requiring a PR is a second pair of eyes on RLS/schema changes especially.

## Secrets

- `.env`, `.env.local` files are git-ignored. If you ever accidentally
  commit one, don't just delete it in a follow-up commit — the secret is
  still in git history. Rotate the actual key in the provider's dashboard
  immediately, then scrub history if needed.
- Never paste a real Supabase service-role key, Resend key, Konnect key,
  `RESEND_WEBHOOK_SECRET`, or `ADMIN_ALERT_WEBHOOK_URL` (Slack incoming
  webhook — apps/admin's proactive alerting, `supabase/functions/
ping-service-health`) into a GitHub issue, PR description, or chat,
  even in a private repo.

## Testing expectations

See `docs/spec/02-*.md` §2.11 for the full testing matrix. At minimum
before opening a PR:

```powershell
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm test` runs every package's own test task via Turborepo. For most
packages that's a fast, stateless unit-test run. `apps/admin` is the one
exception: its `test` script is a Playwright e2e suite that needs a real
local Supabase stack (migrations applied, a TOTP Vault key bootstrapped,
seeded fixtures) — running it standalone with `pnpm test` from the repo
root will just fail with no DB behind it. To run admin's suite locally:

```powershell
supabase start
supabase db reset
pnpm generate-totp-vault-key --filter admin   # one-time per environment
pnpm --filter admin exec playwright install --with-deps chromium
pnpm --filter admin test
```

CI reflects this split (`.github/workflows/ci.yml`): the
`lint-typecheck-test` job runs `pnpm lint` / `pnpm typecheck` /
`turbo run test --filter='!admin'` (no Supabase needed); a separate
`admin-e2e` job stands up the Supabase stack above and runs admin's suite
on its own. Both must pass — a red check on either blocks merge (once
branch protection is fully configured per the setup guide).
