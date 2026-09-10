# Dala — Cahier des Charges v4.0

## Document 04 — Screen-by-Screen Breakdown: Web App

> Two entirely separate applications live in this document: the
> **Contractor Web App** (`app.dala.tn`, §4.1–4.2 — full parity
> with mobile per Doc 00 §0.4) and **Platform Admin** (`admin.dala.tn`,
> §4.3 — a third, unrelated application). They share no navigation, no
> layout shell, and no auth session type.
>
> For contractor screens, this document does **not** re-derive field-by-
> field validation already specified in Doc 03 — Zod schemas are shared
> (Doc 01 §1.1), so re-listing every rule here would drift from Doc 03
> the moment either document is edited. Instead, each contractor screen
> below states what's **the same as mobile** (usually: everything
> functional) and what's **different because it's a desktop browser**
> (layout, input method, bulk actions, keyboard behavior). Auth screens
> get full treatment since the web form layout genuinely differs from
> mobile's.

---

# 4.1 Authentication & Onboarding (Web)

## 4.1.1 Sign Up (web)

**Purpose**: identical account+org creation as Doc 03 §3.3, laid out
for a desktop viewport.

**Layout differences from mobile**: two-column centered card (max-width
480px) on a full-height teal-gradient background rather than mobile's
edge-to-edge scroll form; all fields visible without scrolling on a
standard 1366×768 viewport; password strength meter renders as a
horizontal segmented bar next to the field rather than beneath it, to
use the extra horizontal space.

**Fields & validation**: identical to Doc 03 §3.3's table — Nom
complet, Email, Téléphone, Mot de passe, Confirmer le mot de passe, Nom
de l'entreprise, Type d'activité, CGU checkbox. Same rules, same error
copy, enforced by the same shared Zod schema.

**Web-specific behavior**:

- Tab order follows visual top-to-bottom field order; Enter key submits from the last field.
- Autofill/password-manager attributes (`autoComplete="new-password"` etc.) set correctly so browser password managers offer to save the credential — a convenience mobile handles via the OS keychain automatically but web must declare explicitly.
- "Créer mon compte" button shows a loading spinner inline (no full-page transition) to avoid layout jump.

**Primary actions / states / edge cases**: identical to Doc 03 §3.3.

---

## 4.1.2 Check your email (web)

Same content and logic as Doc 03 §3.4. Layout: centered card, same
resend/continue/edit-email actions. One addition: a "J'ai déjà cliqué
sur le lien, actualiser" button, since a web user is more likely to
have the verification email open in another browser tab and just needs
the app tab to notice — this polls session state on click rather than
only on window focus (mobile's foreground-based polling doesn't map
cleanly to how browser tabs behave).

---

## 4.1.3 Log In (web)

Same fields and logic as Doc 03 §3.5. **Layout differences**: centered
card, no biometric option (no equivalent on desktop browsers — this
row is simply absent, not shown-and-disabled). "Se souvenir de moi"
checkbox added (web-only), which extends the refresh-token cookie
lifetime rather than the default session-only cookie — still capped at
the same 30-day maximum from Doc 01 §1.3.9, this only affects whether
the browser retains the session past a tab/browser close.

**Web-parity follow-on**: the "same logic as §3.5" line above now literally
includes §3.5's post-login org-completion redirect too — implemented on
`apps/web/src/app/(auth)/login/page.tsx` with the identical 5-field
completion calc and `org_checklist_dismissed_at` gate. Web has no
existing `next`-param destination this could clobber (checked, unlike
mobile's accept-org-invite return flow), so it always applies when
incomplete and not dismissed.

---

## 4.1.4 Forgot Password / Reset Password (web)

Same logic and copy as Doc 03 §3.6–3.7, centered-card layout. No
functional differences — this flow is inherently a "click a link in an
email" flow that behaves identically regardless of originating device.

---

## 4.1.5 Worker invite acceptance

**Not present on web.** Per Doc 00 §0.4, workers have no web surface.
If a worker's invite link is opened in a desktop browser (e.g. someone
forwards it, or WhatsApp Web is used), the link resolves to a static
redirect page: "Cette invitation s'ouvre dans l'application mobile
Dala" with app-store badges, not a functional web form.

---

# 4.2 Contractor Core App (Web) — full parity with mobile

Every module below implements the **same functional capability, same
data, same permissions** as its Doc 03 counterpart. Only the
desktop-specific layout and interaction differences are documented
here; treat Doc 03's field tables, copy, and edge cases as authoritative
unless explicitly overridden below.

## 4.2.1 Shell & navigation

**Layout**: persistent left sidebar (org switcher at top, nav items:
Tableau de bord, Chantiers, Dispatch, Véhicules, Équipe, Avances,
Matériaux, Journal, Sécurité, Portail client, Collaboration, Rapports,
Facturation, Paramètres), top bar with search, notification bell, and
account menu. No bottom nav, no FAB — the sidebar's active item and a
top-right "primary action" button (contextual per screen, e.g. "Nouveau
chantier" on the Projects screen) replace mobile's FAB pattern.

**Org switcher**: same grouped list and "Create organization" flow as
Doc 03 §3.22.2a, rendered as a dropdown from the sidebar's top org
name/logo instead of a bottom sheet — same "Mes entreprises" / "Autres
organisations" grouping, same create-org form, same `active_org_id`
persistence (Doc 01 §1.3.13). **Web-parity follow-on**: this cross-reference
is now literally true, not just aspirational — `apps/web/src/app/
create-organization/page.tsx` was rebuilt into the same 4-step wizard
mobile ships (same schema, same 3 RPCs, same save-as-you-go persistence),
adapted to plain Tailwind/HTML instead of Tamagui (no native image
picker — a plain `<input type="file">` uploaded directly via the browser
Supabase client, since no reusable Storage-upload helper existed anywhere
on web before this).

**Global search (top bar, Doc 01 §1.12)**: backed by Postgres native
full-text search — no external search service. Typing in the top bar
queries a single RPC across projects, workers, vehicles, and clients
(scoped to the current org and whatever other orgs the user has
project-membership visibility into, same RLS as everywhere else),
returns grouped, ranked results in a dropdown ("Chantiers," "Équipe,"
"Véhicules" sections), debounced at 250ms. This same search is
available on mobile too — the search bar shown on the mobile Projects
list (Doc 03 §3.10.1) hits the identical RPC, just scoped to that one
list rather than global.

**Unverified-email banner**: persistent top banner across every screen
until verified, matching Doc 03's soft-gate — same blocked-write
behavior, triggered on the same `email_verified_at` check.

## 4.2.2 Dashboard

Same cards as Doc 03 §3.9 (dispatch summary, weekly cash snapshot,
active projects, activity feed), arranged as a responsive grid (up to
4 columns on wide viewports) instead of mobile's vertical stack — same
underlying queries, same tap-targets-become-click-targets mapping.

## 4.2.3 Projects

Same list/detail/create-edit screens as Doc 03 §3.10. **Web addition**:
list view offers a table/grid toggle (table view sortable by any
column — name, progress, budget-consumed, client) in addition to the
mobile-style card grid, since a desktop user reviewing 30+ projects
benefits from a dense sortable table in a way a phone screen can't
support well. The underlying "Nouveau chantier" form is field-for-field
identical to Doc 03 §3.10.3.

## 4.2.4 Dispatch board

Same weekly grid and conflict-detection logic as Doc 03 §3.11.
**Web addition**: drag-and-drop reassignment — dragging a worker chip
from one vehicle/day cell to another triggers the same conflict-
detection check as the tap-based mobile flow before committing the
move; a rejected drag animates back to its origin cell with the
conflict reason shown as a toast. "Copier semaine précédente" behaves
identically on both platforms.

## 4.2.5 Vehicles, Worker roster & invitations

Same CRUD and same invite flow as Doc 03 §3.12–3.13, table-based list
views instead of card lists. Invitation channel selection (App /
WhatsApp / SMS) is unchanged — a contractor on web can still invite a
worker whose onboarding happens entirely on mobile, since the worker
side of that flow (Doc 03 §3.8) is mobile-only regardless of which
platform the contractor used to send the invite.

## 4.2.6 Advances & payroll

Same per-worker weekly cards, running total, and quick-advance flow as
Doc 03 §3.14. **Web addition**: a bulk "Marquer tout comme payé" action
for the full weekly cycle, gated behind a confirmation modal listing
every affected worker and amount — deliberately not offered on mobile,
where reviewing a bulk action on a small screen is a worse safety
margin for a money-moving action.

## 4.2.7 Materials

Same request/approval flow as Doc 03 §3.15. **Web addition**: bulk-
approve for multiple pending requests via checkbox multi-select,
matching the reasoning in Doc 02 §2.4.

## 4.2.8 Site logs

Same timeline as Doc 03 §3.16. **Web addition**: drag-and-drop file
upload from disk (in addition to viewing worker-submitted entries) —
this is the one place web has an input capability mobile's spec
doesn't (mobile's equivalent is native camera capture, which has no
useful web analog worth building). The same client-side compression
pipeline as mobile (Doc 02 §2.5 — resize to a 1920px longest edge,
JPEG ~80%, EXIF stripped) runs in-browser via Canvas before upload, so
a desktop user dragging in a batch of full-resolution DSLR photos
doesn't blow through the org's storage quota any faster than a phone
upload would.

## 4.2.9 Safety & insurance, Client portal management, Multi-org collaboration, Reports & exports, Billing & subscription

Field-for-field identical to Doc 03 §3.17–3.21. No web-specific
behavior beyond the standard table/desktop-form layout conventions
already described above — listed here for completeness of the parity
claim in Doc 00 §0.4, not because they diverge.

## 4.2.10 Settings & account

Same sections as Doc 03 §3.22–3.23, field-for-field — including the
Profile screen's email dual-confirmation and SMS phone re-verification
flows (§1.3.12) and the Organization screen's owner-only legal/tax
field lock (§1.3.13). **Web additions**: the logo/avatar crop tool
uses a drag-to-position + scroll-to-zoom cropper (vs. mobile's
pinch-to-zoom) over the same underlying resize/EXIF-strip pipeline; an
"Appareils connectés" table (superset of mobile's "active sessions"
list) showing platform (mobile/web), browser/OS, last-active time, and
location (city-level, from IP) per session — web's larger screen
accommodates the extra columns mobile's compact list omits, though the
underlying session data and per-session "Déconnecter" action are
identical.

---

# 4.3 Platform Admin (`admin.dala.tn`)

A super-user surface, entirely separate from the contractor app —
different domain, different auth (mandatory TOTP + IP allowlist +
2-hour session expiry vs. 30 days for regular users, Doc 01 §1.3.10),
zero UI overlap. Regular users are governed by RLS; platform admins
bypass RLS entirely via a secured internal tool, never via the public
API surface.

**Admin roles**: Super Admin (full access including managing other
admins, raw SQL, org deletion), Admin (everything except managing
admins, raw SQL, or deleting orgs), Support (read-only + impersonation,
password resets, no data or billing changes).

## 4.3.1 Admin Login

**Fields**: Email, Mot de passe, then a mandatory second step: 6-digit
TOTP code from an authenticator app. **IP allowlist check** happens
server-side before the login form is even rendered meaningfully — a
request from a non-allowlisted IP gets a generic "Accès refusé" page
with no login form at all, not a login-then-reject flow (avoids
confirming the credential-check step exists to an unauthorized network
location).

**Edge cases**: TOTP drift tolerance ±1 time-step (30s); no SMS/backup-
code fallback in MVP — a locked-out admin needs a Super Admin to
re-provision their TOTP from the Admin User Management screen (§4.3.10).

## 4.3.2 Platform metrics

**Purpose**: top-level health dashboard.
**Layout**: KPI card row (orgs, DAU/MAU, projects, site logs, expenses
logged, photos/storage used, MRR, churn, invite acceptance rate), time-
range selector (7d/30d/90d/custom), trend charts beneath the KPI row,
plan-distribution donut chart.

## 4.3.3 Organizations

**Purpose**: full cross-tenant org management.
**Layout**: sortable/filterable table (name, plan, member count,
storage used, created date, status), row actions menu.
**Per-org actions**: View (read-only detail drawer), **Impersonate**
(full mechanics below), Change plan, Suspend (soft — blocks login,
doesn't delete data), Soft-delete (30-day recovery window before hard
delete), Export as JSON (data portability).
**Validation on destructive actions**: Suspend/Soft-delete require
typing the org's exact name into a confirm field, plus a mandatory
reason text field logged to `audit_log`.

### 4.3.3a Impersonation — full flow specification

1. **Trigger**: from an org's or user's row menu, "Impersonate" opens a modal requiring a mandatory reason field (min 10 chars — free-text, e.g. "Debugging dispatch board bug reported in ticket #142") and, separately, an "Urgent — c'est un incident en cours" checkbox (affects notification behavior in step 6, not logging — every impersonation is logged regardless).
2. **Scope**: the impersonation session is generated as a token scoped to **exactly the target user's own permissions** — org role, project memberships, everything — never the admin's elevated permissions. An impersonating admin cannot do anything the impersonated user themselves couldn't do; RLS applies identically to an impersonated session as to that user's own login.
3. **Nesting**: forbidden. An admin already in an impersonation session cannot start a second one — the "Impersonate" action is disabled/hidden while one is active.
4. **Visible banner**: a persistent, non-dismissable top banner across every screen during the session: "Vous êtes en mode impersonation en tant que {{user name}} ({{org name}}) — {{admin name}}" with a single "Quitter l'impersonation" button that immediately ends the session and returns to the admin's own dashboard.
5. **Expiry**: auto-expires after 15 minutes of inactivity within the impersonation session, hard-capped at 2 hours total per session regardless of activity — a task needing longer requires starting a fresh, freshly-logged impersonation.
6. **Owner notification**: by default, the org owner receives an email after the impersonation session ends: "Un membre de l'équipe Dala a accédé à votre compte le {{date}} pour la raison suivante : {{reason}}." If the admin checked "Urgent — incident en cours" in step 1, this notification is delayed 24 hours rather than suppressed entirely — transparency is preserved even for live-incident debugging, just not in a way that could alarm a customer mid-incident.
7. **Audit trail**: every single action taken during an impersonation session is written to `audit_log` tagged with **both** `admin_id` and `impersonated_user_id`, plus the session's stated reason — indistinguishable in the data from a normal user action except for that tag, so impersonated actions can always be traced back to the admin who performed them.

## 4.3.4 Users

**Purpose**: cross-org user management (not org-scoped).
**Layout**: sortable/filterable table (name, email, org(s), role,
last login, status).
**Per-user actions**: Reset password (sends the same Doc 01 §1.3.7
reset email — admins never set a password directly, preserving the
"we never see a password" guarantee), Revoke sessions, Suspend, Delete
(GDPR/on-request — hard delete with a confirmation requiring the
admin to type the user's email), Move to a different org (edge-case
support tool).

## 4.3.5 Database Explorer

**Purpose**: read-only SQL browser by default.
**Layout**: query editor pane, results table pane, saved-query
sidebar.
**Write path**: any `INSERT`/`UPDATE`/`DELETE` requires an explicit
"danger zone" confirmation toggle, a mandatory reason field logged to
`audit_log`, and — if the team has 2+ admins — a second admin's
approval before execution (approval request appears as a pending item
on the second admin's own dashboard).

## 4.3.6 Audit Log

**Purpose**: every platform action, filterable.
**Layout**: table (timestamp, admin, action, target org/user/table,
IP), filters by user/org/action/table/date/IP.
**Retention**: 90 days for regular events, 1 year for security events
(login, impersonation, plan changes, deletions) — enforced by a
scheduled cleanup job, with security-event rows exempt from the
90-day purge.

## 4.3.7 Subscriptions & Billing

**Purpose**: platform-level billing oversight (distinct from the
contractor-facing billing screen in §4.2.9, which shows one org its
own invoices — this screen sees every org).
**Layout**: MRR summary card row, subscriptions table, MRR/churn/plan-
distribution charts.
**Per-subscription actions**: Extend expiry, Manual discount, Mark
paid outside Konnect (for edge-case manual payments), Cancel.

## 4.3.8 Storage Monitor

**Purpose**: visualizes and helps enforce Doc 01 §1.6/Doc 00 §0.5's
storage-overage policy.
**Layout**: platform-wide usage summary, per-org breakdown table
sortable by usage %, overage-flag column (color-coded at the 80/95/100%
thresholds), orphaned-file cleanup action (runs the
`cleanup_orphaned_files` scheduled job on demand).

## 4.3.9 Services Health

**Purpose**: live infrastructure status.
**Layout**: status grid (Supabase API/Auth/Storage/Realtime, Edge
Functions, Konnect, Resend, Expo Push), each with a green/yellow/red
indicator, edge-function invocation log table, scheduled-job status
table showing last-run time and success/failure.

**Scheduled-job monitoring (Doc 01 §1.13)**: this table is not a vague
status label — it's backed directly by the `scheduled_job_runs` table
(job_name, started_at, completed_at, status, error_message, retry_count),
one row per execution of `expire_invitations`, `send_payment_reminders`,
`weekly_salary_summaries`, `cleanup_orphaned_files`, and the Realtime/
Edge-Function usage-budget check (Doc 01 §1.10). A red row here means
a real failed run, not an assumption. Two consecutive failures of the
same job auto-escalate: a Sentry error fires and a webhook posts to a
free Slack/Discord/email channel the founder monitors — so a silent
3am failure surfaces the same day, not whenever someone happens to
check this screen.

## 4.3.10 Announcements

**Purpose**: broadcast messaging to contractor/worker users.
**Fields**: Message (rich text, required), Canal (in-app banner /
email / push — multi-select), Cible (Tous les utilisateurs / Propriétaires
uniquement / par plan / par type d'activité / Inactifs 30+ jours),
Date de programmation (immediate or scheduled).
**Primary action**: "Publier" or "Programmer" — a preview panel shows
the estimated recipient count before sending, to catch an overly broad
targeting mistake before it goes out.

## 4.3.11 Admin User Management

**Purpose**: who has admin access, at what role.
**Layout**: table (name, email, role, TOTP status, last login),
Super-Admin-only actions: invite new admin (email-based, admin
completes their own TOTP setup on first login), change role, revoke
access, re-provision a locked-out admin's TOTP (§4.3.1's edge case).

---

## Post-v4.0 Admin Remediation Additions

_Added retroactively — from the apps/admin audit and remediation plan
(`dala-admin-remediation-plan.md`) carried out against this document's
§4.3 sections. Only items confirmed shipped in code are listed; items
still pending are called out explicitly rather than omitted._

**Shipped:**

- **Services Health** (§4.3.9) gained a fourth check, Supabase Realtime,
  alongside the existing Auth/Storage/Resend/Expo-push checks — Realtime's
  websocket layer can fail independently of the REST/Auth path the other
  checks exercise.
- **Edge function invocation log** — a new `edge_function_invocations`
  table backs a log view that this document's §4.3.9 spec described but
  that was never actually built until this remediation pass.
- **Org restore** — `restore_organization()` (an RPC that already existed,
  migration 0021) now has an admin UI action; previously the org detail
  page showed "Supprimée (récupérable)" with no way to actually invoke it.
- **Admin login/logout audit rows** — `audit_log` now records
  `admin.login`/`admin.logout` actions; previously only
  `platform_admins.last_login_at`/`admin_sessions` tracked this, and no
  audit trail existed for it at all.
- **Per-org/per-user internal notes** (`admin_notes`) — a lightweight
  CRM-style note field on organization and user detail pages.
- **Second-admin-approval requirement** for Database Explorer mutations
  (`admin_approval_requests`, §4.3.5) — this table existed since migration
  0021 but is confirmed here as now enforced, not merely modeled.
- **TOTP key-rotation automation** (`totp_encryption_key_state`,
  `totp_key_rotation_log`) — encrypts admin TOTP secrets behind a
  rotatable key rather than the original plaintext-secret column.
- **Daily platform metrics** (`platform_metrics_daily`) — a scheduled
  snapshot (org/user/project counts, MRR, storage) feeding whatever
  dashboard trend charts get built on top of it.

**Confirmed still NOT built, as of the last review** (do not assume these
exist just because their supporting table does):

- Announcement **email** delivery channel — `announcements.channels` has
  allowed `'email'` as a value since migration 0022, but only the push
  channel actually sends; no email delivery path exists yet.
- The **in-app announcement banner** itself — `get_active_in_app_announcements()`
  (migration 0030) has no consumer anywhere in `apps/web` or `apps/mobile`,
  so an `'in_app'`-channel announcement is silently never seen by anyone.
- **Konnect billing integration** — still a stub that throws in
  `paymentProvider.ts` despite the `billing_cycles` schema (migration 0043) existing and being fully seedable/testable at the data layer.
- **Dashboard trend charts, DAU/MAU, invite-acceptance rate, churn rate,
  plan-distribution donut** — no charting library is installed and no
  event/time-series aggregation beyond `platform_metrics_daily`'s raw
  daily snapshot exists.
- **CI pipeline** — none exists anywhere in the repo.
- A **Playwright spec for the Dashboard/Metrics and Audit Log** admin
  pages — the other 10 admin areas each have one; these two don't.
