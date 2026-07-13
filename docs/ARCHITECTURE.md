# Architecture

This is the "why is it structured this way" companion to `docs/spec/`. The
spec describes the product; this describes the code layout that implements
it. Full detail always lives in the spec — this is a map, not a duplicate.

## Monorepo shape

pnpm workspaces + Turborepo. Three deployable apps, four shared packages:

```
apps/mobile   → Expo/React Native, contractor + worker
apps/web      → Next.js 14, full contractor parity (Doc 00 §0.4)
apps/admin    → Next.js 14, separate deployment, Platform Admin only
packages/shared-types   → TS interfaces mirroring the DB schema
packages/validation     → Zod schemas — single source of truth for valid input
packages/design-tokens  → colors/type/spacing/motion — single source of truth for visuals
packages/config         → shared Tailwind preset, lint/tsconfig bases
```

**Why `admin` is a separate app, not a route group inside `web`**: Doc 01
§1.1 requires it to be a different deployment, different domain, different
env vars, different CI pipeline — "so an Admin deploy can never accidentally
ship to the contractor surface or vice versa." A route group inside one
Next.js app can't give you that isolation; a separate app in the same
Turborepo can, while still sharing every package.

**Why mobile and web don't share UI components directly**: Tamagui (mobile)
and Tailwind/shadcn (web) are different rendering targets. What's shared
instead is everything *behind* the UI — the design tokens both consume, the
validation both run, the types both use, and the RLS-enforced backend both
call. Doc 00's whole "one product, two surfaces" claim rests on that shared
layer, not on shared JSX.

## The one authorization pattern

Every table with sensitive data has RLS enabled, and every policy is built
from exactly three SQL functions defined once in
`supabase/migrations/0005_rls_helper_functions.sql`:

- `is_org_member(org_id)`
- `org_role_of(org_id)`
- `is_project_member(project_id)`

**There is no other way to check permissions in this codebase.** Not a JWT
claim, not a hand-rolled `EXISTS` query, not a client-side check that
happens to look right. Doc 01 §1.5 explains why in detail — the short
version: JWT claims go stale for up to an hour (the access-token lifetime),
and this product's multi-org membership churns constantly (invites
accepted, roles changed, orgs suspended) — a stale claim would silently
permit actions that should already be blocked.

If you're writing a new migration and reach for anything other than these
three functions, stop and re-read Doc 01 §1.5 first.

## Migrations are the schema's only history

`supabase/migrations/` is numbered and sequential. Nobody hand-edits the
schema in Supabase Studio for anything meant to persist past a local
experiment. New tables/columns get a new migration file; `supabase db push`
(cloud) or `pnpm db:reset` (local) applies them in order. This is what lets
two people's local databases, staging, and production all agree on exactly
the same schema history instead of drifting.

Migrations are also **additive-only** once something ships (Doc 01 §1.8):
never drop or rename a column a shipped mobile client still reads without a
deprecation window, since mobile updates go through app-store review and
some users never update at all.

## Shared packages are the drift-prevention mechanism

Doc 00 §0.7 names "web/mobile feature drift" as a real risk and names the
mitigation structurally: one backend, one validation package, one RLS
layer. Concretely:

- Before writing a new form, check `packages/validation/src/*.ts` for an
  existing schema. A near-duplicate schema written directly in a screen
  file is exactly the drift this package exists to prevent.
- Before hand-typing a table's shape, check `packages/shared-types/src/index.ts`.
- Before hardcoding a hex/px value, check `packages/design-tokens/src/index.ts`.

## Money-moving actions are idempotent by construction

`packages/validation/src/money.ts`'s schemas all require an
`idempotency_key` (client-generated UUID). The server-side handler checks
`idempotency_keys` (migration `0010`) before processing — a retried request
returns the cached result instead of double-processing a payment. This is
mandatory for: advance creation/approval, "mark cycle as paid," Konnect
payment-initiation, invoice generation (Doc 01 §1.11.3).

## Where to look for what

| Question | Look here |
|---|---|
| "What should this screen do?" | `docs/spec/03-*.md` (mobile) or `04-*.md` (web/admin) |
| "What does the data model look like?" | `docs/spec/01-*.md` §1.2, then the actual migration files |
| "What color/spacing/font do I use?" | `packages/design-tokens/src/index.ts` |
| "How do I validate this form?" | `packages/validation/src/*.ts` |
| "What TS type does this row have?" | `packages/shared-types/src/index.ts` |
| "Is this feature mobile-only, web-only, or both?" | `docs/spec/00-*.md` §0.4's platform scope matrix — the single authoritative source |
| "What phase does this belong to?" | `docs/spec/02-*.md` §2.10 |
