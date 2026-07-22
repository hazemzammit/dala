# Dala — _"La base de tout chantier."_

Multi-tenant construction-site management SaaS for Tunisia's BTP sector.
Mobile (Expo/React Native) + Web (Next.js, full contractor parity) + Admin
(Next.js, separate deployment), one Supabase backend.

## Start here

If you're new to this repo, read in this order:

1. **`docs/spec/`** — the full product specification (six documents). Read
   `00` → `01` → `02`, then whichever of `03`/`04` matches what you're
   building. This is the source of truth for _what_ to build.
2. **`docs/SETUP_GUIDE.md`** — one-time environment setup, from zero to your
   first `pnpm dev` running locally. Do this before writing any code.
3. **`docs/ARCHITECTURE.md`** — how the pieces fit together (monorepo layout,
   shared packages, RLS pattern, why things are structured this way).
4. **`docs/CONTRIBUTING.md`** — day-to-day conventions: branching, commits,
   the PR checklist, and specific recurring mistakes to avoid.

## Repo layout

```
dala/
├── apps/
│   ├── mobile/       Expo/React Native — contractor + worker
│   ├── web/          Next.js — full contractor parity
│   └── admin/        Next.js — Platform Admin (separate deployment)
├── packages/
│   ├── shared-types/    Hand-written TS types mirroring the DB schema
│   ├── validation/      Shared Zod schemas (mobile + web + edge functions)
│   ├── design-tokens/   Colors, type scale, spacing, radius, motion
│   └── config/          Shared Tailwind preset, lint/tsconfig bases
├── supabase/
│   ├── migrations/   Every schema change, in order, numbered
│   ├── functions/     Edge Functions (Deno)
│   ├── seed.sql       Local dev seed data
│   └── config.toml    Local Supabase CLI config
└── docs/
    ├── spec/          The six product spec documents (00–05)
    ├── SETUP_GUIDE.md
    ├── ARCHITECTURE.md
    └── CONTRIBUTING.md
```

## Quick start (already set up)

```bash
pnpm install
supabase start          # local Postgres + Auth + Storage
pnpm db:reset           # applies every migration + seed.sql
pnpm dev:web            # http://localhost:3000
pnpm dev:admin          # http://localhost:3001
pnpm dev:mobile         # Expo Go / simulator
```

First time setting up? Go to `docs/SETUP_GUIDE.md` — it starts from an empty
machine, not from this point.
