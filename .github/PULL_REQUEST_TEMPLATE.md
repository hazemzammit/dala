## What this PR does

<!-- One or two sentences. Link the issue/roadmap item it closes. -->

## Which spec doc(s) this implements

<!-- e.g. Doc 03 §3.11 Dispatch board — reference the exact section -->

## Type of change

- [ ] New feature (module/screen)
- [ ] Bug fix
- [ ] Database migration
- [ ] Refactor / chore
- [ ] Docs

## Checklist before requesting review

- [ ] I read the relevant section of the spec doc(s) in `docs/spec/` before writing code
- [ ] If I touched `lib/theme.ts`, `packages/shared-types`, or a shared hook, I re-read the **current** file contents first (see `docs/CONTRIBUTING.md` — this is a documented recurring mistake to avoid)
- [ ] If this touches a table with RLS, I used `is_org_member()` / `org_role_of()` / `is_project_member()` — never a hand-rolled check, never a JWT claim
- [ ] If this is a schema change, it's additive-only (no dropped/renamed columns an existing client reads) per Doc 01 §1.8, and a migration file was added under `supabase/migrations/`
- [ ] If this touches mobile AND web, both were updated in this PR (or a linked follow-up PR is referenced) — no silent feature drift
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally
- [ ] I did not commit `.env`, keys, or secrets

## Screenshots / recording (UI changes)

<!-- Mobile + web side by side if both changed -->
