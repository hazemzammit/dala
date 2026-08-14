# Dala — Cahier des Charges v4.0

## Document 01 — Data Model, Security & Architecture

---

## 1.1 Technology stack

Principle: $0/month until there's revenue. Every service below runs on
a free tier sufficient for 0–500 users.

| Layer                       | Choice                                                       | Notes                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile                      | React Native + Expo                                          | iOS & Android from one codebase                                                                                                                                                                                                       |
| Offline store (mobile only) | WatermelonDB                                                 | Local-first sync engine. **Web does not need this** — web is an always-online client, so web screens hit Supabase directly through TanStack Query with standard cache invalidation, no local sync engine.                             |
| Web                         | Next.js 14 (App Router)                                      | **Full contractor-parity client**, not a reporting-only surface (superseded from v3.1).                                                                                                                                               |
| Admin                       | Next.js 14, separate app/deployment                          | Platform Admin only. Deployed independently from the contractor web app — different domain, different env vars, different CI pipeline, so an Admin deploy can never accidentally ship to the contractor surface or vice versa.        |
| UI kit                      | Tamagui (mobile), Tailwind CSS + shadcn/ui (web)             | Shared design tokens (Doc 00 §0.6) so the two feel like one product.                                                                                                                                                                  |
| Validation                  | Zod                                                          | **Single shared schema package** (`packages/validation` in the monorepo) imported by mobile, web, and edge functions — this is the concrete mechanism that keeps the two clients from drifting on what's a valid input (Doc 00 §0.7). |
| Data fetching               | TanStack Query                                               | Mobile + web. Web has no offline cache, so `staleTime`/`refetchOnWindowFocus` are tuned more aggressively than mobile's WatermelonDB-backed queries.                                                                                  |
| Backend                     | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) | One backend serving all three clients (mobile, web, admin).                                                                                                                                                                           |
| Auth provider               | Supabase Auth — **email/password provider only**             | Magic link and OTP providers are disabled at the Supabase project level for regular users (§1.3).                                                                                                                                     |
| Payments                    | Konnect (MVP only)                                           | Tunisian payment gateway.                                                                                                                                                                                                             |
| Error tracking              | Sentry (free tier, 5,000 errors/month)                       | Separate DSN per client (mobile / web / admin) so an admin bug doesn't blow the contractor app's error budget.                                                                                                                        |
| Push notifications          | Expo Push                                                    | Mobile only — web uses in-app + email notifications (Doc 00 §0.4 table).                                                                                                                                                              |
| Email                       | Resend (free tier)                                           | Verification emails, password reset, invitations, digests.                                                                                                                                                                            |
| Analytics                   | PostHog (free tier, 1M events/month)                         | Shared across mobile + web with a `platform` property on every event so funnels can be split.                                                                                                                                         |

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
_which Supabase Auth providers are enabled_ (§1.3), not the shape of
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
  -- subscription_status, billing_cycle_start, seat_price_millimes added
  -- by migration 0043 — see §1.20 for the full seat-billing schema and
  -- free-tier downgrade mechanics, not duplicated here.
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

| Action                        | Limit                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login attempts                | 5 failed attempts/hour/account → account locked for 1 hour, with an in-app explanation and a "reset your password" shortcut (a lockout is exactly when a user most needs the reset path surfaced, not hidden). |
| Password reset requests       | 3/hour/email                                                                                                                                                                                                   |
| Sign-up attempts (same email) | 3/hour/IP                                                                                                                                                                                                      |
| General API                   | 100 req/min/org                                                                                                                                                                                                |
| Photo upload                  | 50/hour/org                                                                                                                                                                                                    |

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

- **Changing email**: uses Supabase Auth's built-in secure email-change flow — a confirmation link is sent to _both_ the old and new address. The change only takes effect once the new address confirms; the old address's confirmation link exists purely as an "was this you?" tripwire — clicking it cancels the pending change rather than confirming it. `email_verified_at` is not reset by this (the account was already verified; changing the address doesn't reopen the original soft-gate from §1.3.3), but a changed, unconfirmed email does temporarily revert login to require the _old_ email until the new one is confirmed.
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
TVA/tax-handling decision (Doc 00 §0.5 item 9): the _exact_ validation
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

| Field                                                | Owner | Manager | Viewer |
| ---------------------------------------------------- | :---: | :-----: | :----: |
| Name, logo, trade type, address, contact phone/email |   ✓   |    ✓    |   —    |
| Matricule fiscal, RC number                          |   ✓   |    —    |   —    |
| Delete organization                                  |   ✓   |    —    |   —    |

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
nothing on Org B; the switcher changes which org's data the _client_
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

| Action                    | Owner | Manager | Viewer |          Worker           |
| ------------------------- | :---: | :-----: | :----: | :-----------------------: |
| Invite/remove org members |   ✓   |    —    |   —    |             —             |
| Delete organization       |   ✓   |    —    |   —    |             —             |
| Manage billing            |   ✓   |    —    |   —    |             —             |
| Create/edit projects      |   ✓   |    ✓    |   —    |             —             |
| Approve advances          |   ✓   |    ✓    |   —    |             —             |
| View reports              |   ✓   |    ✓    |   ✓    |             —             |
| Own dispatch assignment   |   —   |    —    |   —    | ✓ (read-only, own record) |

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
- An owner demotes a manager to viewer (e.g. after an internal dispute) and that permission change needs to be enforced on the manager's _next request_, not whenever their token happens to refresh.
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
- Supabase's auto-generated REST API means there's no separate API-versioning layer to maintain (Doc 01 §1.6) — the schema _is_ the API contract, so this migration discipline **is** the versioning strategy, not a supplement to one.

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

| Resource                                                                                                         | Free tier limit                    | This app's usage pattern                                                                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent Realtime connections                                                                                  | 200                                | Naively, every logged-in contractor session (mobile _and_ web, since both now subscribe per Doc 00 §0.4) opens a Realtime channel — this hits 200 fast once there are more than ~100 simultaneously active users across both platforms. | **Scoped, not global, subscriptions**: a client only opens a Realtime channel for the screen currently in view (e.g. the dispatch board for _today's_ date range, the site-log timeline for the currently-open project) — never one org-wide channel per session. **Role-based downgrade**: Viewer-role sessions and any backgrounded/inactive tab use polling (TanStack Query, 30s interval) instead of Realtime; only an actively-viewed Owner/Manager screen holds a live channel. This keeps concurrent connections proportional to "screens currently being actively watched," not "users logged in." |
| Realtime messages/month                                                                                          | 2,000,000                          | Each dispatch-board or site-log write broadcasts to subscribers — at MVP scale (tens of orgs) this is nowhere close to the ceiling; flagged here so it's checked, not assumed, once usage grows past a few hundred orgs.                | Monitored in Platform Admin's Services Health (Doc 04 §4.3.9); no action needed until usage data says otherwise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Edge Function invocations/month                                                                                  | 500,000                            | Reserved for genuinely server-side logic only (report PDFs, Konnect webhooks, scheduled jobs, Doc 01 §1.6) — never used for simple reads, which go through the auto-generated REST API directly.                                        | Keeping Edge Functions off the read path is the entire mitigation — at that usage shape, 500K/month comfortably covers hundreds of active orgs.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Project auto-pause after 7 days of inactivity                                                                    | N/A (operational, not usage-based) | A quiet week (e.g. a holiday) with zero API requests would pause the _entire_ production project — unacceptable for a live product, even at zero users.                                                                                 | A scheduled GitHub Actions workflow (free on public or low-usage private repos) pings a lightweight `SELECT 1` health-check RPC every 24 hours, resetting the inactivity timer — this is infrastructure housekeeping, not a feature, but it's a documented, deliberate line item rather than a surprise.                                                                                                                                                                                                                                                                                                   |
| PostgREST Data API explicit-grants requirement (rolling out to existing free projects from **October 30, 2026**) | N/A                                | Supabase is changing how tables are exposed through the auto-generated REST API — existing free projects need explicit Postgres `GRANT`s added for tables queried through the Data API, or those queries start failing.                 | Tracked as a pre-October-2026 action item: audit every table the app queries via the REST API and add the required grants as part of a scheduled migration, well before the deadline — not discovered in production when queries start failing.                                                                                                                                                                                                                                                                                                                                                            |

**Overall approach**: none of this requires paying for Supabase Pro to
stay functional at MVP scale — it requires being deliberate about
_when_ a Realtime channel opens versus falling back to polling, and
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
   - **Found, same `request_hash`**: this is a retry (double-tap, timeout-retry, offline-sync replay) — return the cached `response_body`/`response_status` _without re-executing the write_.
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
founder already checks). Two consecutive failures of the _same_ job
escalate the message severity rather than just repeating it, so a
transient blip and a genuinely broken job read differently at a
glance. Surfaced in Platform Admin's Services Health screen (Doc 04
§4.3.9), backed directly by this table — not a separate hand-maintained
status indicator that can drift from reality.

---

> **Phase 7 note**: §1.14–§1.19 below did not exist in this document
> before Phase 7, despite Doc 02 and Doc 03 citing them by number
> (including sub-sections like §1.14.2 and §1.17.1–3) since Phase 4/5.
> Each section is written from what was actually built for the feature
> it covers — attendance/expenses (Phase 1), 2FA (investigated fresh
> this phase, see §1.15), Trash (Phase 5), cross-org rollup (Phase 4),
> Tier 0 (Phase 5), digest scheduling (Phases 5–6) — not invented to
> fill a section number. Where a citing document's sub-numbering
> doesn't map cleanly onto what exists, that's called out inline
> rather than smoothed over.

## 1.14 Attendance and project-expense mechanics

### 1.14.1 Attendance as its own ledger, not a projects sub-table

`attendance_records` (Doc 02 §2.2a "Pointage") is append-only, one row
per worker per day per check-in/departure event — never an `UPDATE` of
a prior day's row, for the same offline-conflict reason every
append-only table in §1.9.1 is modeled this way. A day's attendance
status (Présent / Absent / Demi-journée, Doc 03 §3.12's
`SegmentedControl`) is derived by reading the latest row for that
worker+date, not stored as a separate mutable field anywhere.

### 1.14.2 Advances are excluded from the project budget-consumed calculation

`project_expenses` (migration 0006) and `advances` (migration 0007) are
deliberately separate tables feeding two different, non-overlapping
figures:

- **Budget-consumed % on a project card/detail** (Doc 03 §3.10.1,
  §3.10.3a) sums `project_expenses.amount` only.
- **Payroll due** (Doc 02's advances/salary-cycle flows) sums
  `advances.amount` only.

A worker's cash advance is compensation the org owes that worker — it
consumes payroll budget, not project material/subcontractor budget.
Summing both into one "budget consumed" figure would double-count the
same money against two different mental models a contractor uses (`is
this chantier still profitable` vs. `who do I owe payroll to`) and
would make the number swing every time payroll happens on a day
otherwise unrelated to material spend. `expenses.tsx` (Phase 6) only
ever queries `project_expenses` for exactly this reason.

### 1.14.3 Manual Pointage entries take precedence over dispatch check-ins

A worker can be marked present two ways: an automatic check-in
generated when a dispatch assignment starts (Doc 02 §2.1), or a manual
entry a contractor makes directly in Pointage (Doc 03 §3.12). These are
both rows in `attendance_records`, distinguished by a `source` column
(`'dispatch_checkin'` | `'manual_pointage'` — corrected Phase 13; this
section previously said `'dispatch'` | `'manual'`, a doc-prose-vs-schema
mismatch against migration 0007's actual `check` constraint that had
gone uncaught since the section was written). When both exist for the
same worker+date, the `'manual_pointage'` row is what the UI displays
and what payroll reads — never silently overwritten by a later-arriving
dispatch check-in sync. Rationale: a contractor correcting attendance by
hand (a worker who showed up despite no dispatch record, or left early
despite one) is asserting ground truth over an automated inference, and
Doc 01 §1.9's offline-sync model must never let a stale automated write
clobber that correction after the fact.

**Implementation, Phase 13 (decision #25):** this preference is resolved
by a Postgres view, `attendance_effective` (migration 0036) —
`distinct on (worker_id, record_date)` ordered to prefer
`manual_pointage`, else the latest row. `attendance_records` itself
stays exactly as described above (append-only, no unique constraint,
no update/delete policy) — the view is a read-side addition only. Every
screen or Edge Function report that computes a day-count or day-status
from attendance reads this view, not the raw table; see migration
0036's own header for the full list of what that turned out to include.

---

## 1.15 Optional two-factor authentication (per organization account)

**Status as of Phase 8: built**, using **Supabase Auth's own native TOTP
MFA** (`auth.mfa.enroll`/`challenge`/`verify`/`unenroll` — GoTrue-managed;
`auth.mfa_factors`/`auth.mfa_challenges` need no migration of this
schema's own to create) — deliberately **not** a custom `totp_secret`
column on `profiles` mirroring Platform Admin's existing approach.

**Why native MFA over mirroring Platform Admin's pattern**:
`platform_admins.totp_secret` (migrations 0009, 0021, 0023) is real,
working TOTP, but stored in **plain text** — migration 0021's own
comment already flags this as needing Vault hardening before
production, not a decision to repeat here. More fundamentally: any
custom post-login TOTP check can only ever be a client-side gate,
because Supabase issues a fully-valid session at `signInWithPassword`
regardless of what factors are enrolled — a modified client (or a
captured token) could skip a custom check entirely. Native MFA's
session instead carries a real `aal` (authenticator assurance level)
claim that GoTrue itself controls, so a check against
`auth.jwt() ->> 'aal'` is enforcing something the server actually
knows, not something the client promised it checked. Platform Admin's
TOTP is left as-is — a separate, legacy mechanism — migrating it to
native MFA too is a bigger, cross-cutting change than a mobile-only
phase's scope.

**What's built** (migration 0029, `supabase/functions/mfa-recover/`,
and the mobile screens listed in delivery notes):

- **Enrollment**: `auth.mfa.enroll({ factorType: 'totp' })` returns a
  ready-to-render SVG QR code plus the manual-entry secret — both
  Supabase-generated and Supabase-held, nothing this schema stores
  itself. A 6-digit confirmation via `auth.mfa.challenge`/`verify`
  completes enrollment, which elevates the session to `aal2`.
- **Recovery codes**: the one thing native MFA doesn't provide —
  `mfa_recovery_codes` table + `generate_mfa_recovery_codes()` RPC (10
  single-use codes, bcrypt-hashed, shown once, regenerable) closes that
  gap. `generate_mfa_recovery_codes()` requires the calling session to
  already be `aal2` — it only makes sense right after enrollment
  verification or a later re-verified login.
- **Login-flow verification**: after `signInWithPassword` succeeds,
  the client checks `getAuthenticatorAssuranceLevel()`; a pending
  `aal2` requirement routes to a TOTP-challenge screen before the app
  is reachable.
- **Lost-authenticator recovery**: a correct recovery code does not
  fake an `aal2` session (there is no supported way to do that outside
  a real verified challenge) — it verifies password + code, then
  **disables 2FA entirely** via the admin API and returns a normal
  `aal1` session, with a clear message to re-enroll if desired. A real,
  disclosed trade-off: a recovery code turns 2FA off, it doesn't grant
  one-time entry while leaving it on.
- Doc 02 §2.11's test-matrix line ("enroll → logout → login-with-TOTP")
  targets this flow, now built — see delivery notes for what test
  coverage actually exists versus what that section still expects.

---

## 1.16 Trash / soft-delete

### 1.16.1 What's soft-deletable, and the recovery window

Two entity types, as shipped in Phase 5 (workers) and earlier (projects,
migration 0013): `projects.deleted_at` and `workers.deleted_at`. A
non-null `deleted_at` removes the row from every normal `select` a
screen makes (RLS policies filter `deleted_at is null` on the read
side) without physically deleting it, for a 30-day window.

```sql
-- 0013 (projects), extended by 0025 (workers) — same shape both times.
CREATE OR REPLACE FUNCTION soft_delete_project(p_project_id uuid) ...
CREATE OR REPLACE FUNCTION restore_project(p_project_id uuid) ...
CREATE OR REPLACE FUNCTION soft_delete_worker(p_worker_id uuid) ...
```

`trash.tsx` (Doc 02 §2.10) is the one screen listing and restoring both
entity types together, computing "days remaining" client-side from
`deleted_at` — it does not own the 30-day number itself.

### 1.16.2 Purge

```sql
CREATE OR REPLACE FUNCTION purge_soft_deleted_records() ...
```

A scheduled job (same `pg_cron` mechanism as §1.19's digest, tracked in
`scheduled_job_runs` per §1.13) runs daily and hard-deletes any row
whose `deleted_at` is more than 30 days old, across both entity types —
0025 extended what was originally a projects-only purge (0013) to also
sweep `workers`, rather than adding a second, parallel purge job.
Purge is genuinely irreversible; nothing about Trash's UI hints
otherwise past the "supprimé définitivement dans N jours" copy Doc 03
§3.22's Trash prose already commits to.

### 1.16.3 Entry points, as they actually exist

Restoring an already-deleted project or worker works from `trash.tsx`
regardless of how it got there. _Creating_ a soft-deleted project from
mobile only got an entry point in Phase 7 (`projects.tsx`'s delete
action, see delivery notes) — before that, a project could only be
soft-deleted via web, Platform Admin, or seed data, a gap `trash.tsx`'s
own Phase 5 header comment already flagged honestly rather than
silently working around.

---

## 1.17 Cross-org rollup mechanics

**Corrected, Phase 14.** This section previously described two distinct
rollup surfaces — `portfolio.tsx` framed as _cross-organization_ and
`project-rollup.tsx` as _single-organization_ — as a deliberate design
split. That framing was checked against the actual code while
consolidating the two screens (Doc 00 §0.5 #27) and found to be wrong,
not just outdated: `portfolio.tsx` never aggregated across
organizations at all. It has only ever called `getActiveOrgId()` and
filtered `projects` by `.eq('lead_org_id', orgId)` — the exact same
single-active-org scope `project-rollup.tsx` used. There was no
cross-org variant anywhere in the mobile app; the _actual_ cross-org
rollup is `vue-ensemble.tsx` (Doc 02 §2.8a / Doc 03 §3.9a), which this
section's own text never mentions. This confirms the two screens were
genuine functional duplicates, not merely two names for a documented
distinction — and that this section was itself the stale artifact, not
just the two code files.

`portfolio.tsx` and `project-rollup.tsx` are now one screen
(`portfolio.tsx`) — see Doc 00 §0.5 #27 for the consolidation decision
and `apps/mobile/src/app/(contractor)/portfolio.tsx`'s own header for
the current scope (budget-consumed %, worker-days this month, workers
dispatched today, pending materials — one query set per project the
active org leads, no cross-org aggregation).

**Note, Phase 15**: `project-rollup.tsx` as a _file_ was still present
in the repo despite the above having said "deleted" since Phase 14 — a
zip delivery adds/modifies files but can't delete them on its own, and
that manual step was missed. Actually removed this phase (Doc 00 §0.5
#31); this section's own text was accurate the whole time; only the
repo's file tree had lagged behind it.

### 1.17.1 Owned-projects-only exclusion

`portfolio.tsx` sums only projects where the active org is
`lead_org_id` — projects this org is merely a trade participant on
(via `project_memberships`) are excluded from its budget/progress
aggregates, even though they're visible elsewhere (collaboration.tsx,
the project's own detail). Rationale: a trade participant only ever
sees the shared/Private-layer subset of another org's project data
(Doc 02 §2.8's visibility model) — aggregating a partial view of
someone else's project budget into this org's own rollup total would
produce a number that looks precise but is actually not comparable to
its own fully-visible projects.

### 1.17.2 Client-side sum, not a cross-tenant query

Per-project numbers are fetched through the normal per-org RLS-scoped
queries (one query per project the active org leads) and summed
client-side — there is no single SQL query that reaches across
`organizations` rows the way a naive "rollup view" might. This is a
direct consequence of Doc 01 §1.5's RLS model: a predicate function
like `is_org_member()` is evaluated per-row against the _current_ org
context, so a genuine cross-tenant aggregate query would need a
different, weaker RLS posture than the rest of this schema uses.
Client-side summation keeps every underlying read exactly as
tenant-isolated as any other screen. (Genuine cross-org aggregation —
across every organization the account belongs to, not just the active
one — is `vue-ensemble.tsx`'s job, Doc 02 §2.8a; that screen is
unaffected by this section's correction.)

---

## 1.18 Tier 0 pattern surfacing

"Tier 0" (Doc 02 §2.2's own naming, distinguished from the still-blocked
Tier 1 AI in the roadmap) is live computation over existing data, not a
model and not a stored prediction — a distinction worth restating here
since Doc 01 previously had no section to anchor either term to.

Computed on-demand when a contractor opens a worker's detail screen:
average lateness in minutes, grouped by day-of-week, over that worker's
`dispatch_assignments`/`attendance_records` for a trailing window (Doc
02 §2.2's own example: "Ahmed est en retard de 22 minutes en moyenne le
lundi"). No new table stores this — it is a query against data that
already exists for other reasons (dispatch, attendance), run fresh
every time the screen opens. Because it is not persisted, there is
nothing here for `purge_soft_deleted_records()` (§1.16.2) or any
retention policy to ever act on.

## 1.19 Digest scheduling and delivery mechanics

`profiles.notification_prefs.digest_frequency` (migration 0025:
`'off' | 'daily' | 'weekly'`) is the only per-user setting; there is no
per-org digest configuration.

```sql
-- 0027 — pg_cron + pg_net, not a Deno-side setInterval or a manually
-- triggered function. Runs once daily at 05:00 UTC regardless of
-- frequency; the send-digest-notifications function itself decides,
-- per recipient, whether "daily" recipients get today's content and
-- whether "weekly" recipients are due (their weekly anchor day).
SELECT cron.schedule(
  'send-digest-notifications',
  '0 5 * * *',
  $$ SELECT net.http_post(...) $$
);
```

Content is assembled by a dedicated RPC (Phase 5) reading each
recipient's own org(s) — new dispatch assignments, pending advance
requests, safety incidents, Tier 0 patterns worth surfacing (§1.18) —
and delivered via Resend (Doc 01 §1.1's existing email provider, no
separate transactional-email service). Every run is wrapped in
`scheduled_job_runs` (§1.13), so a misconfigured or missing
`project_url`/`service_role_key` Vault secret shows up as a _failed_
row with a clear error, not as digests that simply never arrive with no
diagnosable trail.

## 1.20 Seat-based billing & free-tier downgrade (migrations 0043, 0044)

Product decisions made explicitly (not inferred): a **seat** is an
`organization_members` row with `role IN ('owner', 'manager')` — field
workers are never seats, so worker-heavy orgs aren't penalized for crew
size. §2.10's long-standing "seat-based pricing" roadmap line is
resolved by this section; see that section for the roadmap-status
update.

Note the name collision with §1.10 ("Free-tier resource budgeting"):
that section is about _this app's own Supabase infrastructure costs_,
unrelated to the concept below, which is about _what a paying
customer's org degrades to_ when a bill goes unpaid. Same words,
different axis — §1.10 is an ops concern, this section is a product/
billing concern.

**Schema** (`organizations`, extended):

```sql
ALTER TABLE organizations
  ADD COLUMN subscription_status  text NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing','active','past_due','canceled')),
  ADD COLUMN billing_cycle_start  date NOT NULL DEFAULT current_date,
  ADD COLUMN seat_price_millimes  integer NOT NULL DEFAULT 15000; -- PLACEHOLDER, see 0043's header
```

`billing_cycles` — one row per generated charge attempt (service-role
write-only; owner/manager read-only via RLS):

```sql
CREATE TABLE billing_cycles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_start       date NOT NULL,
  cycle_end         date NOT NULL,
  seat_count        integer NOT NULL,
  amount_millimes   integer NOT NULL,
  payment_provider  text NOT NULL,
  external_ref      text,
  payment_url       text,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','failed','expired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz
);
```

`get_org_seat_count(p_org_id uuid)` — counts seats live off
`organization_members` rather than a synced counter column, so
promoting/demoting a member is automatically correct with no
reconciliation step.

**Payment-provider abstraction, and why it exists.** Konnect (the
intended production processor for Tunisian dinar payments) requires a
merchant KYC application before issuing even a sandbox API key — not
available to build/test against as of this write-up. Rather than block
on that, `supabase/functions/_shared/paymentProvider.ts` defines the
boundary (`createPaymentRequest` / `parseWebhookEvent`) with Stripe test
mode fully implemented behind it — free, zero-KYC test keys, same
"create a request → get a ref + hosted URL → webhook confirms" shape
Konnect's own API uses. Switching to Konnect once a merchant account
clears means implementing that file's `konnect` branch and flipping
`PAYMENT_PROVIDER`, not touching the cron job, the webhook handler, or
this schema.

`generate-subscription-charges` (daily cron, same pg_cron/pg_net/Vault
wiring 0026/0027 established for `send-digest-notifications`) finds
orgs whose cycle elapsed, computes seat count, creates the
`billing_cycles` row + payment request, advances `billing_cycle_start`.
`payment-webhook` is the callback target; idempotent re-processing of an
already-`paid` cycle is a safe no-op.

**Past-due enforcement — decision made explicitly**: a `past_due` org
downgrades to a capped free tier rather than being locked out entirely
or only shown a reminder banner. Caps, as decided:

- Max 3 active projects, max 3 workers on the roster — enforced as
  `RESTRICTIVE` RLS policies (`projects_free_tier_cap`,
  `workers_free_tier_cap`) via two named predicate functions
  (`has_active_project_capacity`, `has_active_worker_capacity`),
  following this codebase's own convention (§1.5) of a table-lookup
  predicate function rather than an inline correlated subquery. This is
  the first use of a `RESTRICTIVE` policy in this codebase — every
  prior RLS policy has been `PERMISSIVE` (the Postgres default); a
  restrictive policy ANDs with whatever permissive policy already
  allows the write, rather than adding another way in.
- No multi-org collaboration, no reports/export, no Tier 0 lateness
  insights — enforced at the RPC layer (`invite_org_to_project`,
  `get_worker_lateness_pattern`, both raising
  `feature_requires_active_subscription`) and inside the two
  report/export Edge Functions (`export-org-data`, `generate-report`),
  gated right after each one's existing owner/manager check.

**Scope decision, stated rather than silently picked**: none of the
above retroactively touches an org that already exceeds a cap (e.g. 7
active projects) at the moment it goes `past_due` — enforcement only
blocks _new_ creation past the limit. A hard retroactive cap would mean
a billing hiccup silently disrupts already-running site operations and
worker records; that's a materially bigger call than "block new
growth" and wasn't made here.

**Worker-invite delivery**: decided to stay email-only (existing Resend
integration) for now — SMS/WhatsApp explicitly not pursued at this
time, no provider selected.

**Still deferred, not part of this section**: Tier 1 AI (blocked on
real accumulated usage data existing, not a decision that can be made
yet) and legal contract templates (needs an actual lawyer, not a
product/engineering decision).
