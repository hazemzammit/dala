# AGENTS.md — Dala Admin UI Overhaul

Standing rules for any agent working in this repo during the admin UI overhaul.
Full plan: `docs/audits/dala-admin-ui-overhaul-plan.md`. Read it before starting
any phase. These rules apply on top of it, every session, no exceptions.

## Scope boundaries (hard rules)

- Only touch `apps/admin/**`, `packages/ui-web/**`, and `packages/design-tokens/**`.
- Never open or edit anything under `apps/mobile/**`.
- Never open or edit anything under `apps/web/src/app/**` (its pages). You may
  edit `packages/ui-web`/`packages/design-tokens`, which `apps/web` also
  consumes — that's expected and approved, but its own page code is off-limits.
- Every change to `packages/ui-web/**` or `packages/design-tokens/**` must be
  additive: new optional props, new exported components, new token keys.
  Never rename or remove an existing export, prop, or token key.
- Never change an API route's request/response shape except the one explicitly
  approved addition in the plan (`logo_signed_url`). No renamed/removed fields,
  no changed status codes, anywhere else.

## Test-safety (hard rule)

- Every accessible name / visible text string listed in the plan's "test
  contract" table must still resolve exactly the same way after your change.
  When converting a text button/link to an icon button, the old text becomes
  the new `aria-label`, verbatim.
- Default states never change on a fresh load: sidebar starts expanded, every
  list view starts as "table" (not "card").

## Working discipline

- Work one phase of the plan at a time, in the order given. Do not start the
  next phase in the same task/session unless explicitly told to.
- Before writing any code for a phase, state in the chat which files you're
  about to touch and confirm they match the phase's scope in the plan.
- After finishing a phase: run `pnpm --filter admin typecheck`,
  `pnpm --filter admin lint`, `pnpm --filter @dala/ui-web typecheck`,
  `pnpm --filter web typecheck`, and the specific `*.spec.ts` file(s) the plan
  names for that phase. Report the results before asking to proceed.
- If anything in the plan is ambiguous, or a file's real contents don't match
  what the plan assumes, stop and ask rather than guessing or improvising a
  fix outside the plan's scope.
- Never use `git push --force`, never delete a branch, never modify CI config,
  never touch `.env*` files.
