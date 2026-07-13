# Dala — Cahier des Charges v4.0
## Document 01 — Data Model, Security & Architecture

---

## 1.1 Technology stack

Principle: $0/month until there's revenue. Every service below runs on
a free tier sufficient for 0–500 users.

| Layer | Choice | Notes |
|---|---|---|
| Mobile | React Native + Expo | iOS & Android from one codebase |
| Offline store (mobile only) | WatermelonDB | Local-first sync engine. **Web does not need this** — web is an always-online client, so web screens hit Supabase directly through TanStack Query with standard cache invalidation, no local sync engine. |
| Web | Next.js 14 (App Router) | **Full contractor-parity client**, not a reporting-only surface (superseded from v3.1). |
| Admin | Next.js 14, separate app/deployment | Platform Admin only. Deployed independently from the contractor web app — different domain, different env vars, different CI pipeline, so an Admin deploy can never accidentally ship to the contractor surface or vice versa. |
| UI kit | Tamagui (mobile), Tailwind CSS + shadcn/ui (web) | Shared design tokens (Doc 00 §0.6) so the two feel like one product. |
| Validation | Zod | **Single shared schema package** (`packages/validation` in the monorepo) imported by mobile, web, and edge functions — this is the concrete mechanism that keeps the two clients from drifting on what's a valid input (Doc 00 §0.7). |
| Data fetching | TanStack Query | Mobile + web. Web has no offline cache, so `staleTime`/`refetchOnWindowFocus` are tuned more aggressively than mobile's WatermelonDB-backed queries. |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) | One backend serving all three clients (mobile, web, admin). |
| Auth provider | Supabase Auth — **email/password provider only** | Magic link and OTP providers are disabled at the Supabase project level for regular users (§1.3). |
| Payments | Konnect (MVP only) | Tunisian payment gateway. |
| Error tracking | Sentry (free tier, 5,000 errors/month) | Separate DSN per client (mobile / web / admin) so an admin bug doesn't blow the contractor app's error budget. |
| Push notifications | Expo Push | Mobile only — web uses in-app + email notifications (Doc 00 §0.4 table). |
| Email | Resend (free tier) | Verification emails, password reset, invitations, digests. |
| Analytics | PostHog (free tier, 1M events/month) | Shared across mobile + web with a `platform` property on every event so funnels can be split. |

---

## 1.2 Core data model

Only tables that changed meaningfully from prior drafts, or that are
central to the auth rework, are shown in full. Unchanged operational
tables (materials, site_logs, safety_incidents, org_insurances) keep
their prior shape and are summarized at the end of this section.

### `profiles` — one row per human, mirrors `auth.users`

```sql
CREATE TABLE profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name         text NOT NULL,
  phone             text UNIQUE,
  email_verified_at timestamptz,           -- NULL until verification link/code confirmed
  preferred_locale  text NOT NULL DEFAULT 'fr',  -- 'fr' | 'ar' | 'en'
  avatar_url        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  last_login_platform text CHECK (last_login_platform IN ('mobile','web'))
);
```

**Auth model note**: Supabase Auth's own `auth.users` table stores the
password hash (bcrypt, managed entirely by Supabase — the application
never touches, sees, or logs a raw or hashed password). `profiles` is
purely our application-level extension, joined 1:1 on `id`. This is
unchanged in structure from the pre-rework spec — what changed is
*which Supabase Auth providers are enabled* (§1.3), not the shape of
this table, except for the new `email_verified_at` and
`last_login_platform` columns, which didn't need to exist under the old
magic-link flow (magic link clicks are inherently verification) but are
now required to track password-flow-specific state.

### `password_reset_audit` — new table, required by the password flow

```sql
CREATE TABLE password_reset_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  ip_address   inet,
  platform     text CHECK (platform IN ('mobile','web')),
  UNIQUE (user_id, requested_at)
);
```

Didn't exist under magic-link auth (where "reset" meant "request a new
link," with no separate audit need beyond Supabase's own logs). Under
password auth, reset events are security-relevant enough to audit
independently — repeated resets on one account are a fraud/account-
takeover signal worth being able to query directly, not buried in
Supabase's internal auth logs.

### `organizations`, `organization_members` — unchanged from prior spec

```sql
CREATE TABLE organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  trade_type        text,                 -- 'plomberie' | 'électricité' | 'vacuum_central' | ...
  logo_url          text,
  address           text,
  contact_phone     text,
  contact_email     text,
  matricule_fiscal  text,                 -- Tunisian tax ID — nullable, collected post-signup (§1.3.12)
  rc_number         text,                 -- Registre de Commerce number — nullable, same as above
  plan              text NOT NULL DEFAULT 'free',
  created_by        uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','manager','viewer')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
```

### `workers`, `worker_invitations` — unchanged shape, auth path changed

```sql
CREATE TABLE workers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  phone       text,
  trade       text,
  daily_rate  numeric(10,2),
  user_id     uuid REFERENCES profiles(id),   -- set once a worker accepts an invite and creates a password-based account
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  channel      text NOT NULL CHECK (channel IN ('app','whatsapp','sms')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at  timestamptz
);
```

Worker's effective invite state is always read via the join to this
table — never duplicated onto `workers` directly. **What changed**:
under magic-link auth, "accepting an invite" meant tapping a link that
logged the worker straight in. Under password auth, accepting an
invite now means the worker lands on a **set-your-password** screen
(Doc 03 §3.2) pre-filled with their invited email/phone — one extra
step, unavoidable, called out honestly in Doc 00's risk register rather
than glossed over.

### `platform_admins` — unchanged

```sql
CREATE TABLE platform_admins (
  id            uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name     text NOT NULL,
  totp_enabled  boolean NOT NULL DEFAULT false,
  allowed_ips   text[],
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

Deliberately not a role inside `organization_members` — a platform
admin is not a member of any tenant org and is never grantable through
the same invite flow a business owner uses. Admin auth remains
password + mandatory TOTP + IP allowlist (§1.3) — this was already
stricter than regular-user auth before the rework, and stays that way.

### Unchanged operational tables (shape only, summarized)

- `projects`, `project_memberships` — see Doc 02 §2.8 for the multi-org visibility model built on top of these.
- `vehicles`, `dispatch_assignments` — Doc 02 §2.2.
- `advances` — Doc 02 §2.3.
- `materials` — Doc 02 §2.4.
- `site_logs` — Doc 02 §2.5.
- `safety_incidents`, `org_insurances` — Doc 02 §2.6.
- `audit_log` — platform-wide action log, read by the Admin surface (Doc 04 §4.5).

---

## 1.3 Authentication & security architecture — full rewrite

### 1.3.1 What changed and why it's a full rewrite, not a patch

The prior spec's entire authentication section assumed passwordless
entry (magic link / 6-digit email OTP). Every downstream assumption —
no password-reset flow, no password-strength requirements, invite
acceptance being a single tap — depended on that. Swapping the primary
mechanism to email + password touches sign-up, login, invite
acceptance, session security, and rate limiting simultaneously, so this
section is written from scratch rather than diffed.

### 1.3.2 Supabase Auth configuration

- **Enabled provider**: Email + Password only.
- **Disabled providers**: Magic Link, Email OTP, all social providers. Disabling them at the Supabase project config level (not just hiding the UI) prevents a stray API call from ever creating a passwordless session.
- **Email confirmation**: required (`mailer_autoconfirm = false`). A newly created `auth.users` row is unusable for anything beyond the verification screen until confirmed.

### 1.3.3 Sign-up flow (contractor, creating a new organization)

1. User submits full name, email, password, phone, and organization name (Doc 03 §3.1 / Doc 04 §4.1 for the exact screen).
2. Server-side: `supabase.auth.signUp({ email, password })` creates the `auth.users` row (password hashed by Supabase with bcrypt, cost factor 10 — Anthropic/Supabase-managed, not application code).
3. On success, a transaction creates: `profiles` row, `organizations` row, and an `organization_members` row with `role = 'owner'`.
4. A verification email is sent (Resend) with a signed, time-limited (24h) confirmation link.
5. User is dropped on an **"check your email"** interstitial (Doc 03 §3.1.2), not directly into the app — full contractor functionality is gated behind `email_verified_at IS NOT NULL`.
6. Until verified, the account can view its own dashboard in a **read-only, banner-nagged** state (per Doc 00's honest risk framing — locking a brand-new user out entirely is worse for onboarding conversion than a soft gate).

### 1.3.4 Sign-up flow (worker or invited team member, joining an existing org)

1. Worker receives an invite (Doc 01 §1.2 `worker_invitations`) via app push (if they somehow already have the app), WhatsApp deep link, or SMS — channel choice unchanged from prior spec, still governed by the "no WhatsApp Business API" constraint (Doc 00 §0.7).
2. Link opens a **set-your-password** screen (Doc 03 §3.2), pre-filled with the invited phone/email, editable only for password.
3. On submit: `auth.users` + `profiles` created, `workers.user_id` is set, `worker_invitations.status = 'accepted'`.
4. No separate email-verification gate for invited workers — the invite itself, sent to a channel the org owner already had for them, is treated as sufficient identity proof. (Contractors signing up fresh, with no prior relationship to the platform, are held to the stricter verify-by-email standard in §1.3.3.)

### 1.3.5 Login flow

1. Email + password submitted.
2. Supabase Auth validates against the bcrypt hash.
3. On success: short-lived access token (1 hour), 30-day refresh token with rotation on every use, revocable server-side.
4. `profiles.last_login_at` and `last_login_platform` updated.
5. Max 3 concurrent sessions per user; a 4th login prompts "log out oldest session?" rather than silently evicting it.
6. New-device login triggers an email notification ("New sign-in to your account from [device/platform] — wasn't you? Reset your password.").
7. Mobile only: biometric app-lock re-engages after 5 minutes backgrounded (unchanged from prior spec — this was never dependent on the auth mechanism).

### 1.3.6 Password policy

- Minimum 10 characters. No arbitrary complexity theater (no forced special-character requirement) — length matters more than composition, per current guidance.
- Client-side strength meter (zxcvbn) with plain-language feedback ("This password would take a computer about 3 hours to guess — try adding a word"), not a pass/fail wall, so the requirement doesn't read as hostile to first-time sign-ups.
- "Show password" eye-icon toggle always available — a deliberate mitigation for the friction risk logged in Doc 00 §0.7.
- No password expiry / forced rotation (expiry policies are known to push users toward weaker, more predictable passwords — not applied here).

### 1.3.7 Forgot-password / reset flow

1. User submits email on the "Forgot password" screen (Doc 03 §3.4 / Doc 04 §4.1).
2. Always show the same confirmation regardless of whether the email exists ("If an account exists for this email, we've sent a reset link") — prevents account enumeration.
3. If the account exists: a `password_reset_audit` row is created, Resend sends a signed link, 1-hour expiry.
4. Link opens a "choose a new password" screen; same strength meter as sign-up.
5. On successful reset: all existing sessions for that user are revoked (forces re-login everywhere), `password_reset_audit.completed_at` set.
6. Rate limit: 3 reset requests per hour per email address, independent of the login rate limit below.

### 1.3.8 Rate limiting & lockout

| Action | Limit |
|---|---|
| Login attempts | 5 failed attempts/hour/account → account locked for 1 hour, with an in-app explanation and a "reset your password" shortcut (a lockout is exactly when a user most needs the reset path surfaced, not hidden). |
| Password reset requests | 3/hour/email |
| Sign-up attempts (same email) | 3/hour/IP |
| General API | 100 req/min/org |
| Photo upload | 50/hour/org |

### 1.3.9 Session & token security (unchanged from prior spec)

Short-lived access tokens (1 hour), 30-day refresh tokens with rotation
on every use, revocable server-side. TLS 1.3 everywhere, certificate
pinning in the mobile app.

### 1.3.10 Platform Admin authentication (unchanged, already stricter)

Magic link + mandatory TOTP + IP allowlist, 2-hour session expiry.
**Not affected by this rework** — the regular-user auth mechanism
change doesn't extend to Admin, which was already using a
stronger, separate scheme by design (Doc 00 §0.4).

### 1.3.11 Data protection (unchanged)

CIN (national ID) encrypted at the application layer (AES-256-GCM),
key in Supabase Vault, rotated every 90 days (Doc 00 §0.5 item 8).
Photo GPS/EXIF stripped client-side before upload. Photos never public
— 1-hour signed URLs; report PDFs use 7-day signed URLs. Daily
automated backups, point-in-time recovery on the Pro plan.

### 1.3.12 User profile: initial configuration vs. later updates

**Initial configuration is deliberately minimal.** Sign-up (§1.3.3)
collects only what's needed to create a working account: full name,
email, password, phone. It does **not** collect an avatar, a bio, or
notification preferences — adding fields to the sign-up form is exactly
the kind of friction Doc 00 §0.7's password-friction risk is trying to
minimize, so anything not required to create the account is deferred.

**What happens instead**: once past the "check your email" gate
(§1.3.3), Home (Doc 03 §3.9 / Doc 04 §4.2.2) shows a small, dismissible
"Complétez votre profil" checklist card — avatar, notification
preferences, locale confirmation — entirely optional, never blocking
any feature, and permanently dismissible (state stored on `profiles`,
not re-shown once dismissed even if incomplete).

**Later updates happen on a dedicated Profile screen** (full
field-by-field spec in Doc 03 §3.22.1 / Doc 04 §4.2.10), with two
fields requiring more than a plain inline edit:

- **Changing email**: uses Supabase Auth's built-in secure email-change flow — a confirmation link is sent to *both* the old and new address. The change only takes effect once the new address confirms; the old address's confirmation link exists purely as an "was this you?" tripwire — clicking it cancels the pending change rather than confirming it. `email_verified_at` is not reset by this (the account was already verified; changing the address doesn't reopen the original soft-gate from §1.3.3), but a changed, unconfirmed email does temporarily revert login to require the *old* email until the new one is confirmed.
- **Changing phone**: since phone is the channel workers/contractors actually get dispatch and invite notifications on, a change triggers a 6-digit SMS re-verification code before the new number is saved — this isn't an auth mechanism (§1.3.2 still only recognizes email+password), just a delivery-channel integrity check.
- **Avatar**: client-side crop to a square, resized to 512×512 max, uploaded to Storage, EXIF stripped (same pipeline discipline as site-log photos, Doc 02 §2.5, just smaller dimensions).

### 1.3.13 Organization profile: initial configuration vs. later updates

**Same principle as the user profile — sign-up collects only `name`
and `trade_type`** (§1.3.3). Everything else on the expanded
`organizations` table above (`logo_url`, `address`, `contact_phone`,
`contact_email`, `matricule_fiscal`, `rc_number`) is nullable precisely
because it's deliberately deferred, not because it's optional forever.

**Why it can't stay empty forever**: `matricule_fiscal` (Tunisian tax
ID) and `rc_number` are what turn a generic PDF report into a real,
legally usable invoice — and report branding (Doc 02 §2.8) already
depends on `logo_url` being set for a lead org's exports to look
professional on a multi-org project. This is the same open item as the
TVA/tax-handling decision (Doc 00 §0.5 item 9): the *exact* validation
format for `matricule_fiscal` needs the same accountant/lawyer review
before it ships, so this field is modeled now (nullable, loosely
validated as non-empty alphanumeric in the interim) but its real
format-validation regex is intentionally left unspecified rather than
guessed at.

**What happens instead**: the same dismissible checklist pattern as
§1.3.12 applies at the org level — a "Complétez le profil de votre
entreprise" card, dismissible, **except** it re-appears (non-dismissible
this time) the first time an owner attempts to generate a client-facing
invoice or an official report while `matricule_fiscal` or `logo_url`
is still null — that's the one point where incompleteness actually
blocks an action, because the output would otherwise be a legally
incomplete document, not a UX inconvenience.

**Who can edit what** (RBAC, composing with Doc 01 §1.4's role table):

| Field | Owner | Manager | Viewer |
|---|:---:|:---:|:---:|
| Name, logo, trade type, address, contact phone/email | ✓ | ✓ | — |
| Matricule fiscal, RC number | ✓ | — | — |
| Delete organization | ✓ | — | — |

Legal/tax identity fields are owner-only even though a manager can edit
everyday org details — the same split already applied to billing (Doc
01 §1.4's existing table).

**Multi-org ownership, revised (2026-07-13)**: an account is not
limited to the organization created at sign-up. A user can create and
own additional organizations at any time, and switches between all
orgs they belong to — owned or joined — via one unified org switcher.
This didn't require a data-model change: `organization_members` was
already a many-to-many join table (§1.2), so nothing about the schema
assumed one org per user — the earlier constraint was purely a
product/UI decision (no "create another org" entry point existed),
now reversed. What this section specifies is that missing entry point
and the switcher mechanics.

**"Create organization" flow** (new, for an already-logged-in user):

1. Entry point: org switcher's "+ Créer une nouvelle entreprise" row (bottom of the switcher list, Doc 03 §3.9/§3.22.2a).
2. Form: identical fields to sign-up's org-creation step (§1.3.3) — Nom de l'entreprise, Type d'activité. No new account/email/password step, since this reuses the already-authenticated session.
3. On submit: creates a new `organizations` row and an `organization_members` row for the current user with `role = 'owner'` — the same transaction shape as §1.3.3's sign-up flow, just without the `auth.users`/`profiles` half of it.
4. The new org becomes the active org immediately (switcher auto-selects it, every screen re-scopes).
5. No limit on how many organizations one account can own — deliberately no artificial cap, since the real-world case motivating this (one person running two related trade businesses — e.g. plumbing and a separate central-vacuum installation business) is exactly this pattern, not an edge case.

**Active-org tracking**: `profiles` gains one column to remember which
org a session should default into:

```sql
ALTER TABLE profiles ADD COLUMN active_org_id uuid REFERENCES organizations(id);
```

Set on every switcher selection, read on login/app-open to restore the
last-used org rather than defaulting to whichever org happens to sort
first. If `active_org_id` points to an org the user has since lost
access to (removed as a member, org deleted), the app falls back to
the first org in their `organization_members` list, or the "create
your first organization" empty state if they have none — this can only
happen to an owner via account recovery edge cases, since an owner
can't remove themselves as the sole owner of an org (§1.4's role rules
already prevent an org from having zero owners).

**RBAC across owned orgs**: owning multiple orgs doesn't blur their
data — each org is still fully isolated by the same table-lookup RLS
pattern as any other org (§1.5). Being the owner of Org A grants
nothing on Org B; the switcher changes which org's data the *client*
requests, but every request is still independently authorized against
`organization_members` for whichever org is currently active. There's
no "super-owner across all my orgs" concept — deliberately, since
that would be exactly the kind of implicit cross-tenant assumption
§1.5.2 already warned against for a different reason.

---

## 1.4 Roles & permissions

Two role systems apply, and they compose without overlapping — **and
this composition is now identical regardless of which client (mobile
or web) makes the request**, since RLS is enforced at the database
layer, not the client layer:

- **Org role** (`owner / manager / viewer`, `organization_members`) — gates what a person can do inside their own organization's data: billing, worker management, deleting the org, editing another member's role.
- **Project membership role** (`lead / trade / client`, `project_memberships`) — gates what an organization can do on a specific shared project.

| Action | Owner | Manager | Viewer | Worker |
|---|:---:|:---:|:---:|:---:|
| Invite/remove org members | ✓ | — | — | — |
| Delete organization | ✓ | — | — | — |
| Manage billing | ✓ | — | — | — |
| Create/edit projects | ✓ | ✓ | — | — |
| Approve advances | ✓ | ✓ | — | — |
| View reports | ✓ | ✓ | ✓ | — |
| Own dispatch assignment | — | — | — | ✓ (read-only, own record) |

A Manager inside a Trade org can create/edit that org's own expenses on
a shared project (org role grants that), but can never read the Lead
org's payroll (project membership never grants cross-org access — the
Private visibility layer, Doc 02 §2.8, is absolute). The two systems
are checked independently in every RLS policy that touches a
shared-layer table.

---

## 1.5 RLS pattern — table-lookup only, JWT claims never used for authorization

### 1.5.1 The decision, stated unambiguously

**Every authorization check in this system goes through a live table
lookup against `organization_members` / `project_memberships` at query
time. JWT custom claims (e.g. an `org_id` baked into the access token
at login) are never read by any RLS policy, anywhere, for any purpose.**
This closes out the two-competing-patterns ambiguity carried over from
earlier drafts — there is now exactly one pattern, and using the
claims-based one is a bug if it ever shows up in a future PR.

### 1.5.2 Why JWT claims are actively wrong for this product, not just "the other option"

A JWT claim is fixed at token-issue time and only refreshes when the
access token itself refreshes — up to **1 hour** later under this
system's token lifetime (§1.3.9). Multi-org collaboration (Doc 02 §2.8)
means membership changes constantly and needs to take effect
immediately:

- A trade org accepts a project invite and should see that project's shared data on their very next request — not up to an hour later.
- An owner demotes a manager to viewer (e.g. after an internal dispute) and that permission change needs to be enforced on the manager's *next request*, not whenever their token happens to refresh.
- A platform admin suspends an org mid-session — a stale claim would let that org's members keep working against cached authorization for up to an hour after suspension.

A claims-based check would silently permit all of the above for up to
an hour after the underlying permission changed. That's not an edge
case for this product — multi-org membership churn is a core, frequent
event, not a rare one. Table-lookup RLS reads current state on every
single request, so there's no staleness window at all.

### 1.5.3 The pattern

```sql
CREATE OR REPLACE FUNCTION is_org_member(target_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = target_org AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION org_role_of(target_org uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT role FROM organization_members
  WHERE org_id = target_org AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_project_member(target_project uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_memberships pm
    JOIN organization_members om ON om.org_id = pm.org_id
    WHERE pm.project_id = target_project AND om.user_id = auth.uid()
  );
$$;
```

Every `CREATE TABLE`, every RLS policy uses one of these three
predicates — never a hand-rolled equivalent, never a JWT claim read.

### 1.5.4 Making the "always hits the table" approach fast enough

The honest trade-off of table-lookup RLS is query cost — every request
now runs an extra lookup. Three concrete mitigations, all already
implementable on the free tier:

1. **`STABLE` marking** (already in the function definitions above) lets Postgres's query planner cache the function's result within a single statement, so a query touching 50 rows in one table doesn't re-run the membership lookup 50 times — once per statement, not once per row.
2. **Composite indexes** on the exact lookup shape: `organization_members` already has `(org_id, user_id)` as its primary key (Doc 01 §1.2), which covers the `is_org_member`/`org_role_of` lookup directly. Add `CREATE INDEX ON organization_members (user_id);` for the reverse direction (a user's own org list — used on every login and org-switcher render) and `CREATE INDEX ON project_memberships (project_id, org_id);` for `is_project_member`.
3. **No caching layer for authorization** (deliberately) — a Redis-cached permission check reintroduces exactly the staleness problem §1.5.2 rules out, just with a shorter window. If query load ever genuinely becomes the bottleneck (unlikely at this scale — Doc 01 §1.10's usage numbers are far below what these indexed lookups can handle), the fix is read replicas or connection pooling, not caching authorization state.

This pattern is what makes web/mobile parity safe to ship: the client
never decides who can see what — the database does, identically and
immediately, no matter which app issued the request.

---

## 1.6 API & storage architecture

- Supabase REST auto-generated endpoints + Realtime subscriptions for live dispatch-board updates (both mobile and web subscribe to the same Realtime channel).
- Edge Functions (Deno) for anything needing server-side business logic: report generation, Konnect webhooks, scheduled jobs (`expire_invitations`, `send_payment_reminders`, `weekly_salary_summaries`, `cleanup_orphaned_files`).
- Shared Zod schema package validates every mutation identically on mobile, web, and edge functions — one schema, three consumers.
- Storage quota: 1GB free tier per org. Overage policy per Doc 00 §0.5 item 7.

## 1.7 Ops

- Environments: local, staging, production — same three-environment setup for all three client apps (mobile, web, admin), each with its own env var set (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, etc.).
- Monorepo: pnpm + Turborepo. `pnpm --filter web dev` for the contractor web app, `pnpm --filter admin dev` for Platform Admin, `pnpm --filter mobile start` for Expo.
- Error tracking: Sentry, separate DSN per app.

---

## 1.8 Mobile app-version compatibility

### 1.8.1 The problem this solves

Mobile app updates go through App Store/Play Store review (days, not
minutes) and some users never update at all. A backend or schema
change that assumes every client is on the latest build will break
for anyone on an older one — silently, from the user's perspective,
since there's no App Store mechanism that forces an update.

### 1.8.2 `app_versions` table (source of truth, editable from Platform Admin)

```sql
CREATE TABLE app_versions (
  platform             text PRIMARY KEY CHECK (platform IN ('ios','android')),
  latest_version        text NOT NULL,
  min_supported_version text NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

Checked by the mobile app once per cold start (Doc 03 §3.1), via a
lightweight unauthenticated RPC (no need to wait for login) —
`GET /app-version-check?platform=ios&build=142`. If `build <
min_supported_version`, the app routes straight to the Forced Update
screen (Doc 03 §3.1a) before any session logic runs. Editable from a
new row in Platform Admin's Services Health screen (Doc 04 §4.3.9) so
a bad release can be walked back (raise `min_supported_version`) without
an emergency app-store submission.

### 1.8.3 Backend compatibility rule — additive-only migrations

To make "some users are on an old build" survivable rather than just
detectable, schema changes follow one rule: **never remove or rename a
column/endpoint an already-shipped client depends on without a
deprecation window.**
- Adding a column/table: always safe, no version bump needed.
- Renaming/removing a column an old client reads: add the new column alongside the old one, backfill, keep both live for at least one full min-supported-version cycle, then drop the old one only after bumping `min_supported_version` past every build that still read it.
- Changing a field's meaning (not just its name): treated as a breaking change requiring the same deprecation window, even though no SQL migration looks "breaking" on its face.
- Supabase's auto-generated REST API means there's no separate API-versioning layer to maintain (Doc 01 §1.6) — the schema *is* the API contract, so this migration discipline **is** the versioning strategy, not a supplement to one.

---

## 1.9 Offline write-conflict resolution

### 1.9.1 Two different conflict shapes, two different fixes

Not every table has the same conflict risk, so this isn't a single
blanket policy — it's two policies applied by table category.

**Append-only tables (advances, attendance/check-in events, site log
entries, material requests)**: an offline write is always an `INSERT`
of a new row, never an `UPDATE` of an existing one. Two offline writes
from two different devices simply become two rows — there is no
conflict to resolve, by construction. This is why these tables were
already modeled as append-only in Doc 01 §1.2/Doc 02 — it wasn't just
a data-integrity choice, it's the offline-conflict strategy for this
whole category of write.

**Editable-record tables (dispatch_assignments, projects, vehicles,
worker profile fields)**: these genuinely can be edited by two people
(or the same person on two devices) between syncs, so they need real
conflict detection — optimistic concurrency via a version column:

```sql
ALTER TABLE dispatch_assignments ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE vehicles ADD COLUMN version integer NOT NULL DEFAULT 1;
```

Every `UPDATE` from a client must include the `version` it last read
and increments it: `UPDATE dispatch_assignments SET ..., version =
version + 1 WHERE id = $1 AND version = $2`. If zero rows are affected,
the client's `version` was stale — someone else wrote to that row
first — and the client receives a `409 Conflict` rather than the write
silently succeeding over someone else's change.

### 1.9.2 What the client does with a 409

- **Dispatch board** (the highest-contention screen — Doc 03 §3.11): surfaced explicitly to the contractor as a side-by-side "keep mine / use theirs" choice (Doc 03 §3.11's conflict-handling addition). Never auto-merged — a wrong automatic guess here sends the wrong person to the wrong site.
- **Projects, vehicles** (lower contention, edited by one owner/manager at a time in practice): auto-refetch the server's current version and re-apply the local diff if the changed fields don't overlap; if they do overlap, fall back to the same explicit choice as dispatch.
- WatermelonDB's own sync protocol (`pullChanges`/`pushChanges`) is the transport for all of this — the version column is what WatermelonDB's push step checks against, not a separate mechanism bolted on top.

---

## 1.10 Free-tier resource budgeting (Realtime, Edge Functions, project activity)

Numbers below reflect Supabase's published free tier as of mid-2026 —
worth re-checking against `supabase.com/pricing` periodically, since
free-tier terms shift.

| Resource | Free tier limit | This app's usage pattern | Mitigation |
|---|---|---|---|
| Concurrent Realtime connections | 200 | Naively, every logged-in contractor session (mobile *and* web, since both now subscribe per Doc 00 §0.4) opens a Realtime channel — this hits 200 fast once there are more than ~100 simultaneously active users across both platforms. | **Scoped, not global, subscriptions**: a client only opens a Realtime channel for the screen currently in view (e.g. the dispatch board for *today's* date range, the site-log timeline for the currently-open project) — never one org-wide channel per session. **Role-based downgrade**: Viewer-role sessions and any backgrounded/inactive tab use polling (TanStack Query, 30s interval) instead of Realtime; only an actively-viewed Owner/Manager screen holds a live channel. This keeps concurrent connections proportional to "screens currently being actively watched," not "users logged in." |
| Realtime messages/month | 2,000,000 | Each dispatch-board or site-log write broadcasts to subscribers — at MVP scale (tens of orgs) this is nowhere close to the ceiling; flagged here so it's checked, not assumed, once usage grows past a few hundred orgs. | Monitored in Platform Admin's Services Health (Doc 04 §4.3.9); no action needed until usage data says otherwise. |
| Edge Function invocations/month | 500,000 | Reserved for genuinely server-side logic only (report PDFs, Konnect webhooks, scheduled jobs, Doc 01 §1.6) — never used for simple reads, which go through the auto-generated REST API directly. | Keeping Edge Functions off the read path is the entire mitigation — at that usage shape, 500K/month comfortably covers hundreds of active orgs. |
| Project auto-pause after 7 days of inactivity | N/A (operational, not usage-based) | A quiet week (e.g. a holiday) with zero API requests would pause the *entire* production project — unacceptable for a live product, even at zero users. | A scheduled GitHub Actions workflow (free on public or low-usage private repos) pings a lightweight `SELECT 1` health-check RPC every 24 hours, resetting the inactivity timer — this is infrastructure housekeeping, not a feature, but it's a documented, deliberate line item rather than a surprise. |
| PostgREST Data API explicit-grants requirement (rolling out to existing free projects from **October 30, 2026**) | N/A | Supabase is changing how tables are exposed through the auto-generated REST API — existing free projects need explicit Postgres `GRANT`s added for tables queried through the Data API, or those queries start failing. | Tracked as a pre-October-2026 action item: audit every table the app queries via the REST API and add the required grants as part of a scheduled migration, well before the deadline — not discovered in production when queries start failing. |

**Overall approach**: none of this requires paying for Supabase Pro to
stay functional at MVP scale — it requires being deliberate about
*when* a Realtime channel opens versus falling back to polling, and
treating the two operational quirks (7-day pause, the October 2026
grants change) as scheduled work rather than surprises.

---

## 1.11 Idempotency on money-moving actions

### 1.11.1 `idempotency_keys` table

```sql
CREATE TABLE idempotency_keys (
  key             uuid PRIMARY KEY,          -- client-generated
  org_id          uuid NOT NULL REFERENCES organizations(id),
  endpoint        text NOT NULL,
  request_hash    text NOT NULL,              -- hash of the request payload, to detect a reused key with different data
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### 1.11.2 The flow

1. The client generates a UUID the moment a money-moving button is tapped (advance creation, "mark cycle as paid," material-request approval that triggers a budget write, invoice/payment actions) and disables the button immediately (Doc 03 §3.14's addition).
2. The request carries that UUID as an `Idempotency-Key` header.
3. Server-side, before processing: check `idempotency_keys` for that key.
   - **Not found**: process normally, then insert a row with the result.
   - **Found, same `request_hash`**: this is a retry (double-tap, timeout-retry, offline-sync replay) — return the cached `response_body`/`response_status` *without re-executing the write*.
   - **Found, different `request_hash`**: reject with a 409 — a client reusing a key for a genuinely different request is a bug, not a legitimate retry, and should fail loudly rather than silently process the wrong data under an old key.
4. Keys are retained 24 hours (covers any realistic retry window, including offline-sync delays) then purged by a scheduled job.

### 1.11.3 Which endpoints require this

Mandatory: advance creation/approval, salary-cycle "mark as paid,"
Konnect payment-initiation, invoice generation. Not required (and
adds unnecessary overhead) on read-only or naturally-idempotent
endpoints like project edits already covered by §1.9's version-column
check.

---

## 1.12 Search

Postgres native full-text search — no external service (Algolia,
Elasticsearch, Meilisearch), which would be both an unnecessary cost
and an unnecessary piece of infrastructure at this data scale (hundreds
to low thousands of rows per org, not millions).

```sql
ALTER TABLE projects ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('french', coalesce(name,'') || ' ' || coalesce(client_name,'') || ' ' || coalesce(address,''))) STORED;
CREATE INDEX projects_search_idx ON projects USING GIN (search_vector);
-- same pattern applied to workers (name, trade) and vehicles (name, plate)
```

A single RPC (`search_all(query text, org_id uuid)`) queries across
projects/workers/vehicles, ranks results with `ts_rank`, and returns
grouped results — this is the endpoint both the web top bar (Doc 04
§4.2.1) and the mobile Projects-list search bar (Doc 03 §3.10.1) call,
so search behavior is identical on both platforms by construction, not
by coincidence. `to_tsvector('french', ...)` is used since the default
locale is French (Doc 00 §0.6); Arabic-locale search is deferred to
whenever the Arabic locale itself ships (Doc 00's RTL note), since
Postgres FTS needs a matching text-search configuration for meaningful
stemming in Arabic.

---

## 1.13 Scheduled-job failure alerting

```sql
CREATE TABLE scheduled_job_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name      text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  error_message text,
  retry_count   integer NOT NULL DEFAULT 0
);
```

Every scheduled job (`expire_invitations`, `send_payment_reminders`,
`weekly_salary_summaries`, `cleanup_orphaned_files`, the §1.10
keep-alive ping) wraps its execution in a try/catch that writes a row
here on start and updates it on completion or failure — no job is
allowed to fail silently with nothing but a log line no one is
watching.

**Alerting**: a failure fires a Sentry error immediately (existing
free-tier error tracking, Doc 01 §1.1 — no new service needed) and
posts to a free webhook target (Slack/Discord/email — whichever the
founder already checks). Two consecutive failures of the *same* job
escalate the message severity rather than just repeating it, so a
transient blip and a genuinely broken job read differently at a
glance. Surfaced in Platform Admin's Services Health screen (Doc 04
§4.3.9), backed directly by this table — not a separate hand-maintained
status indicator that can drift from reality.
