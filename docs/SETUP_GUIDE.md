# Setup Guide — from zero to "you and your collaborator can both code"

This assumes: Windows, Docker Desktop installed, a GitHub account, VS Code
installed. Follow it in order — later steps assume earlier ones are done.
Total time the first time: roughly 1–2 hours, mostly waiting on installers.

---

## 0. Before you start — decisions to make now

These are cheap to change later but annoying to change after your
collaborator has cloned the repo, so lock them in first:

- **GitHub org or personal account?** A free GitHub organization (e.g.
  `dala-tn`) is worth it even for a 2-person team — it makes adding/removing
  collaborators and managing repo permissions cleaner than a personal-account
  repo, and costs nothing on the free tier.
- **Repo name**: this guide assumes `dala`. Rename freely.
- **Package scope**: this guide uses `@dala/*` for internal packages
  (`@dala/validation`, etc.). If you rename the repo, you don't have to
  rename this — it's just an internal npm scope, invisible to users.
- **Node package manager**: **pnpm** (already chosen in this scaffold —
  Turborepo + pnpm workspaces is what Doc 01 §1.7 specifies). Don't mix in
  npm or yarn lockfiles; pick one and only one.

---

## 1. Install local tooling (Windows)

Open PowerShell **as Administrator** for the winget commands.

### 1.1 Node.js (version-pinned via nvm, not a raw installer)

Installing Node directly makes it hard to match versions with your
collaborator. Use `nvm-windows` instead:

```powershell
winget install CoreyButler.NVMforWindows
```

Restart your terminal, then:

```powershell
nvm install 20.17.0
nvm use 20.17.0
node -v      # should print v20.17.0
```

Your collaborator does the exact same thing — the repo's `.nvmrc` file
means either of you can also just run `nvm use` from inside the repo folder
and it'll pick the right version automatically.

### 1.2 pnpm

```powershell
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm -v      # should print 9.12.0
```

### 1.3 Git

If `git --version` doesn't already work:

```powershell
winget install Git.Git
```

Configure your identity once:

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 1.4 Supabase CLI

```powershell
winget install Supabase.CLI
supabase --version
```

### 1.5 Expo / EAS CLI (for mobile)

```powershell
pnpm add -g eas-cli
```

You don't need Android Studio or Xcode to start — Expo Go on your phone
(install it from the Play Store) is enough for the first weeks of
development. Set up a full native build environment only once you need
custom native modules Expo Go doesn't support.

### 1.6 VS Code extensions

Open VS Code, open the repo folder once you have it (step 3), and VS Code
will prompt you to install the recommended extensions from
`.vscode/extensions.json` — click "Install All". Your collaborator gets the
same prompt automatically when they open the repo, so you don't need to
walk them through picking extensions manually.

---

## 2. Create the GitHub repo

1. Go to github.com → **New repository**.
2. Name: `dala`. Visibility: **Private** (this is a commercial product, not
   an open-source project — keep it private at least until you decide
   otherwise).
3. **Do not** initialize with a README/.gitignore/license — you already have
   all of that in the scaffold you're about to push; letting GitHub create
   its own would just create a merge conflict on the first push.
4. Create the repo, copy its URL (`https://github.com/<you>/dala.git`).

### 2.1 Push the scaffold

From inside the unzipped project folder on your machine:

```powershell
cd path\to\dala
git init
git branch -M main
git add .
git commit -m "chore: initial monorepo scaffold"
git remote add origin https://github.com/<you>/dala.git
git push -u origin main
```

### 2.2 Branch protection (do this before inviting your collaborator)

GitHub repo → **Settings → Branches → Add branch protection rule**:
- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require approvals (1)
- ✅ Require status checks to pass before merging → select the `ci` check
  once it's run at least once (you'll come back to tick this box after
  step 6's first PR)
- ✅ Do not allow bypassing the above settings

This means neither of you can push straight to `main` by accident — every
change goes through a PR, which is what makes shared ownership of a
database-backed app survivable.

### 2.3 Create a `develop` branch (optional but recommended)

If you want a staging integration branch separate from `main`
(production), create `develop` from `main` now and repeat the protection
rule for it. See `docs/CONTRIBUTING.md` for the branching model this
scaffold assumes.

### 2.4 Invite your collaborator

Repo → **Settings → Collaborators and teams → Add people** → their GitHub
username. They'll get an email invite.

Also update `.github/CODEOWNERS` with both your real GitHub usernames
before or right after this (currently has placeholder names) — commit that
change in your first PR.

---

## 3. Clone and install

```powershell
git clone https://github.com/<you>/dala.git
cd dala
nvm use
pnpm install
```

If `pnpm install` fails on a native module, it's almost always because
Node version drifted — re-run `nvm use` and confirm `node -v` matches
`.nvmrc` exactly.

---

## 4. Supabase — local development database

You already have Docker Desktop, which is what `supabase start` uses under
the hood to run Postgres/Auth/Storage locally.

```powershell
supabase start
```

First run pulls several Docker images — takes a few minutes. When it
finishes, it prints local URLs and keys, including:
- API URL: `http://localhost:54321`
- anon key
- service_role key
- Studio URL: `http://localhost:54323` (a local dashboard — open it in a
  browser, this is genuinely useful for poking at data by hand)

### 4.1 Apply every migration + seed data

```powershell
pnpm db:reset
```

This runs every file in `supabase/migrations/` in order, then `seed.sql`.
If it succeeds, open Studio (`http://localhost:54323`) and confirm you see
tables like `organizations`, `projects`, `dispatch_assignments`, etc.

### 4.2 Copy the local keys into your env files

```powershell
copy .env.example .env
```

Fill in the `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` fields with the
**local** values `supabase start` printed (all four should point at
`localhost:54321` and the same anon key for local dev — there's only one
local project, shared by all three clients).

Then also create the app-specific env files Next.js/Expo actually read:

```powershell
copy .env apps\web\.env.local
copy .env apps\admin\.env.local
copy .env apps\mobile\.env
```

(Yes, this duplicates values across four files for now — that's fine for
local dev. `.env` files are all git-ignored already.)

---

## 5. Create the real (cloud) Supabase project

Local Supabase is for development only. You need a real hosted project for
staging/production.

1. Go to supabase.com → **New project**. Free tier is fine to start
   (Doc 01 §1.1's entire tech stack is chosen to fit inside free tiers).
2. Pick a strong database password and **save it in a password manager** —
   you won't be shown it again.
3. Once created: **Project Settings → API** → copy the Project URL and
   `anon` `public` key. These go into whichever `.env.local`/`.env` files
   correspond to staging/production (keep local dev pointed at your local
   `supabase start` instance — don't develop against the shared cloud
   project day to day, or you and your collaborator will step on each
   other's test data).
4. **Project Settings → Auth → Providers**: disable everything except
   **Email**. Under Email settings, turn **OFF** "Confirm email" only if
   you want to test signup without clicking a verification link locally —
   for the real staging/production project, leave email confirmation
   **ON** (Doc 01 §1.3.2 requires it).
5. Link your local repo to this project so migrations can be pushed to it:

   ```powershell
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

   The project ref is in the URL of your Supabase dashboard
   (`supabase.com/dashboard/project/<this-part>`).

6. Push the schema:

   ```powershell
   supabase db push
   ```

   This applies every migration in `supabase/migrations/` to the real
   cloud project, in order. From now on, **never** hand-edit the schema in
   Supabase Studio for anything meant to persist — always add a new
   migration file and `db push`, so your collaborator's local/staging
   database can replay the exact same history.

7. Give your collaborator access: Supabase dashboard → **Project Settings
   → Team** → invite by email.

---

## 6. First successful run

```powershell
pnpm dev:web
```

Open `http://localhost:3000` — you should be redirected to `/login`
(the root page checks auth state and redirects, see
`apps/web/src/app/page.tsx`).

```powershell
pnpm dev:admin
```

`http://localhost:3001` — Admin placeholder page.

```powershell
pnpm dev:mobile
```

Scan the QR code with Expo Go on your phone (same Wi-Fi network as your
computer), or press `a`/`i` in the terminal for an Android/iOS simulator if
you have one set up.

If all three come up without errors, commit this as your first real PR
(even though nothing changed) — this confirms the CI workflow in
`.github/workflows/ci.yml` actually runs and passes, which is what lets you
tick the "require status checks" box from step 2.2.

---

## 7. What to hand your collaborator

Once everything above works on your machine:

1. GitHub invite (step 2.4) — done.
2. Supabase project invite (step 5.7) — done.
3. This repo, cloned — they follow **section 3 onward** of this same guide
   (they don't need to repeat GitHub repo creation or Supabase project
   creation — those already exist; they're joining, not founding).
4. Point them at `docs/CONTRIBUTING.md` before their first PR.
5. Agree on who's picking up which module from Doc 02 §2.10's roadmap
   phases — the `.github/ISSUE_TEMPLATE/module.md` template exists for
   exactly this, so create one issue per module you're about to start and
   assign it.

---

## 8. Ongoing environment upkeep (don't skip, per the spec's own risk register)

- **Every 24h automatically**: `.github/workflows/supabase-keep-alive.yml`
  pings the project so a quiet week doesn't auto-pause it (Doc 01 §1.10).
  For this to work against your real project, add two **repository**
  secrets (Settings → Secrets and variables → Actions): `SUPABASE_URL` and
  `SUPABASE_ANON_KEY`, using your cloud project's values from step 5.3.
- **Before October 30, 2026**: Doc 01 §1.10 flags a Supabase platform
  change requiring explicit `GRANT`s for PostgREST access on existing free
  projects. Put a reminder somewhere you'll actually see it.
- **Whenever you add a table**: it needs RLS enabled and at least one
  policy using `is_org_member()` / `org_role_of()` / `is_project_member()`
  — see `supabase/migrations/0005_rls_helper_functions.sql` for the pattern
  every later migration follows.
