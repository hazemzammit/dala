# Dala — Cahier des Charges v4.0
### *"La base de tout chantier."*
## Document 00 — Foundations, Vision & Resolved Decisions

> Supersedes the v3.1 document set (00–06). This rebuild reflects two
> product-owner decisions made 2026-07-12: (1) authentication moves from
> magic-link/OTP to full email + password, and (2) the web app becomes a
> **full-parity contractor client**, not a secondary reporting surface.
> Every downstream document has been rewritten, not patched, to reflect
> these changes consistently.

---

## 0.1 Purpose of this document set

This is a five-document set. Each document is long and dense by design —
consolidated so a single reader (you, or a new hire) can hold one file
open per concern instead of jumping across seven.

| # | File | Covers |
|---|------|--------|
| 00 | This document | Vision, platform scope matrix, resolved decisions, design system, risk register |
| 01 | `01-data-model-security-and-architecture.md` | Full schema, RLS, auth/security architecture, tech stack, APIs, ops |
| 02 | `02-features-field-ops-multi-org-and-roadmap.md` | Every functional module in depth, multi-org collaboration, AI tiers, build roadmap, testing |
| 03 | `03-screens-mobile-contractor-and-worker.md` | Screen-by-screen spec for the mobile app — both contractor and worker roles |
| 04 | `04-screens-web-contractor-and-admin.md` | Screen-by-screen spec for the web app — full contractor parity + Platform Admin |

Read order for a new contributor: 00 → 01 → 02, then whichever of 03/04
matches what you're building.

---

## 0.2 Product vision

A multi-tenant, mobile-first **and now web-equal**, SaaS platform for
Tunisia's construction sector. One platform — projects, money, workers,
materials, and client communication — usable identically whether the
contractor is standing on-site with a phone or sitting at a desk with a
browser.

Name: **Dala**. Slogan: **"La base de tout chantier."** Domain:
**dala.tn**. Both are now final — use `dala.tn` directly rather than a
template token; `dala.tn` in this document set should be
resolved to `dala.tn` everywhere (e.g. `app.dala.tn`, `admin.dala.tn`).

**What changed from v3.1**: the previous vision described web as a
"secondary surface" for reporting and office use, with contractors
expected to do real field work only on mobile. That's gone. A contractor
now gets the same capability set regardless of which device is in front
of them. The distinction that remains is role-based (contractor vs.
worker), not device-based.

---

## 0.3 System layers

| Layer | Technology | Role |
|---|---|---|
| Mobile client | React Native + Expo | iOS & Android. Offline-first. Full contractor functionality + the only surface where workers operate. |
| Web client | Next.js 14 | Full contractor functionality (parity with mobile, online-first — no offline requirement on web) + the Platform Admin surface. |
| API gateway | Supabase REST + Realtime | Auth, REST endpoints, RLS enforced at DB level. Identical for both clients — there is one backend, not two. |
| Business logic | Supabase Edge Functions (Deno) | Reports, payments, webhooks, scheduled jobs. |
| Database | PostgreSQL (Supabase) | Structured relational data. RLS on every table. |
| File storage | Supabase Storage + CDN | Photos, documents, exports. |

---

## 0.4 Platform scope matrix — the authoritative source of truth

This table is the single place that answers "does X exist on platform
Y?" Every screen-breakdown document (03, 04) must match this matrix
exactly. If a future feature request conflicts with this table, the
table wins until this document is explicitly revised.

### Contractor-facing modules

| Module | Mobile (Contractor) | Web (Contractor) | Notes |
|---|:---:|:---:|---|
| Sign up / Log in / Password reset | ✅ | ✅ | Same email+password flow, same validation, same backend. |
| Organization setup & settings | ✅ | ✅ | |
| Dashboard / home | ✅ | ✅ | Web adds a denser multi-widget layout; mobile stays single-column. |
| Projects (list, detail, create, edit) | ✅ | ✅ | |
| Dispatch board & assignments | ✅ | ✅ | Web adds drag-and-drop; mobile keeps tap-to-assign. |
| Vehicle management | ✅ | ✅ | |
| Worker roster & invitations | ✅ | ✅ | |
| Advances & payroll | ✅ | ✅ | |
| Materials & requests (approval side) | ✅ | ✅ | |
| Site logs / photo timeline | ✅ | ✅ | Camera capture is mobile-native; web supports upload from disk. |
| Safety incident log | ✅ | ✅ | |
| Insurance tracker | ✅ | ✅ | |
| Client portal management | ✅ | ✅ | |
| Multi-org collaboration (invite/accept trade orgs) | ✅ | ✅ | |
| Reports & exports | ✅ | ✅ | Web is the more comfortable surface for long PDF/Excel review but both work. |
| Billing & subscription | ✅ | ✅ | |
| Notifications | ✅ | ✅ | Push on mobile, in-app + email digest on web. |
| Account & security settings | ✅ | ✅ | |

### Worker-facing modules — mobile only, by design

| Module | Mobile (Worker) | Web (Worker) |
|---|:---:|:---:|
| Worker login | ✅ | ❌ — workers have no web account surface |
| Today's mission / check-in-out | ✅ | ❌ |
| Update chantier (photo/voice/note) | ✅ | ❌ |
| Material request | ✅ | ❌ |
| Advance request | ✅ | ❌ |
| Salary view | ✅ | ❌ |
| Worker profile & settings | ✅ | ❌ |

**Why workers stay mobile-only**: workers are in the field, not at a
desk — a web account would be a surface nobody uses and one more RLS
policy to maintain for zero benefit. If this changes later (e.g. a
worker-facing web pay-stub portal), it's a new decision, not an oversight.

### Platform Admin — a third, entirely separate application

| Module | Admin Web (`admin.dala.tn`) |
|---|:---:|
| Platform metrics | ✅ |
| Organizations management | ✅ |
| Users management | ✅ |
| Database Explorer | ✅ |
| Audit Log | ✅ |
| Subscriptions & Billing (platform-level) | ✅ |
| Storage Monitor | ✅ |
| Services Health | ✅ |
| Announcements | ✅ |
| Admin User Management | ✅ |

Platform Admin is not "the web app's admin section" — it's a fully
separate Next.js app (or a route group with entirely separate auth
guards, layout, and zero shared navigation) at a different subdomain,
different auth requirements (TOTP + IP allowlist), and different session
lifetime. A contractor account can never reach it, and a platform admin
account is never a member of any tenant organization. See Doc 04 §4 for
its screen breakdown.

---

## 0.5 Resolved decisions

| # | Decision | Resolution | Where |
|---|---|---|---|
| 1 | App/domain name | **"Dala"**, slogan **"La base de tout chantier."** Domain: **dala.tn**. Both name and domain are final. | Everywhere |
| 2 | Unified client report branding on multi-org projects | Lead org's branding is primary (logo, header, contact block); each contributing trade org gets a secondary attribution line, opt-out available per project membership. | Doc 02 §2.8 |
| 3 | Budget rollup visibility on multi-org projects | Opt-in, per trade org, per project. Off by default. When on, lead sees an aggregate consumed-% only — never itemized expenses. | Doc 02 §2.8 |
| 4 | Authentication mechanism | **SUPERSEDES the previous magic-link/OTP decision.** Full email + password authentication with mandatory email verification. Standard sign-up form collecting name, email, password, phone, and (for the org creator) organization name. No passwordless flow ships in MVP. | Doc 01 §1.3, Doc 03 §3.1, Doc 04 §4.1 |
| 5 | Web application scope | **NEW.** Web ships full contractor feature parity with mobile — everything an Owner/Manager/Viewer can do on the phone, they can do in the browser, using the same backend, same validation, same permissions. Workers remain mobile-only. Platform Admin remains a fully separate web application. | Doc 00 §0.4 |
| 6 | Role & permission model | Two independent role systems: org role (`owner / manager / viewer`, gates org-internal actions) and project membership role (`lead / trade / client`, gates cross-org shared-project actions). Composed, never merged. | Doc 01 §1.4 |
| 7 | Storage overage policy | Graduated: 80% banner, 95% queued-uploads warning, 100% new-upload lock (existing data untouched), 30 days at 100% triggers oldest-photo archival (never logs/financial records). | Doc 01 §1.6 |
| 8 | CIN (national ID) encryption | Application-layer AES-256-GCM on top of Postgres encryption-at-rest, key stored in Supabase Vault, rotated every 90 days with a background re-encryption job. | Doc 01 §1.2 |
| 9 | TVA / tax handling on invoices | **Not resolved.** Requires a Tunisian accountant or lawyer review before Doc 02's Phase 3 (client-facing invoicing) ships. Flagged, not solved — do not guess at tax logic. | Doc 02 §2.10 |
| 10 | Worker email availability | **Confirmed by product owner (2026-07-13): every worker has an email address.** The earlier hedge about phone-only authentication for workers is removed — email + password is the single auth path for every account type, contractor and worker alike, no dual-provider complexity needed. | Doc 01 §1.3.4, Doc 03 §3.8 |
| 11 | Multi-org authorization pattern | **Table-lookup RLS only, JWT custom claims never used for authorization, anywhere.** Removes the two-competing-patterns ambiguity carried over from earlier drafts. | Doc 01 §1.5 |
| 12 | Mobile/API version compatibility | Minimum-supported-version gate checked at app launch; additive-only schema migrations; breaking changes go through a deprecation window. | Doc 01 §1.8 |
| 13 | Offline write-conflict policy | Append-only pattern for money/attendance events (no conflict possible), optimistic-concurrency version column for editable records (dispatch, projects). | Doc 01 §1.9 |
| 14 | Free-tier resource budgeting (Realtime, Edge Functions, project pausing) | Scoped subscriptions + polling fallback + keep-alive ping, documented against actual 2026 Supabase free-tier numbers. | Doc 01 §1.10 |
| 15 | Idempotency on money-moving actions | Client-supplied idempotency keys on every mutating financial endpoint. | Doc 01 §1.11 |
| 16 | Photo upload size | Mandatory client-side resize/compress before upload, on both mobile and web. | Doc 02 §2.5 |
| 17 | Search implementation | Postgres native full-text search (`tsvector`/GIN), no third-party search service. | Doc 01 §1.12 |
| 18 | Admin impersonation mechanics | Fully specified: scoped session, mandatory reason, audit trail, auto-expiry, owner notification. | Doc 04 §4.3.3 |
| 19 | Scheduled-job failure alerting | `scheduled_job_runs` table + Sentry alert + webhook, surfaced in Services Health. | Doc 01 §1.13 |
| 20 | User & org profile: initial setup vs. later updates | Sign-up stays minimal (name/email/password/phone for users; name/trade type for orgs). Everything else (avatar, org logo, address, tax IDs) is deferred to a dismissible post-signup checklist and edited later on dedicated Profile/Organization settings screens. Email and phone changes go through re-verification, not inline edit. | Doc 01 §1.3.12–1.3.13, Doc 03 §3.22 |
| 21 | Multi-org ownership | **REVISED (2026-07-13) — supersedes the earlier single-org constraint.** One account can create and own multiple organizations, and switches between them via the same org switcher already used for cross-org membership. No artificial cap on how many an account can own. | Doc 01 §1.3.13, Doc 03 §3.9/§3.22.2a, Doc 04 §4.2.1 |

---

## 0.6 Design system

**Brand color**: teal, primary accent across both mobile and web — this
was already decided and doesn't change with the web-parity decision. The
web app is not a "different-looking admin tool"; it uses the same
Tamagui/Tailwind design tokens so a contractor recognizes it as the same
product.

**Typography**: Display font **Sora** for app name, screen titles, and
numbers-that-matter (Doc 03/04 §"Numbers over words" principle). Body
font is the system default per platform (SF Pro / Roboto on mobile,
Inter on web) for native rendering performance and familiarity.

**Icons**: Phosphor Icons, consistent icon set across mobile and web —
another reason web/mobile parity is realistic without a second design
language.

**Layout principles**:
- Clarity — the most important number on any screen is the biggest thing on the screen.
- Numbers over words — every screen leads with a number the user needs (balance owed, days present, budget consumed), not a paragraph explaining it.
- Bottom nav on mobile (not top), FAB for the most common action per screen. Web uses a persistent left sidebar (desktop convention) with the equivalent primary action surfaced as a top-right button, not hidden in a menu.
- Reachability — the most common actions (dispatch, mark attendance, log an advance) reachable in 3 taps/clicks from home, on either platform.

**Localization**: French-default, with Arabic and English support.
The app name "Dala" is used directly (not translated) in all locales;
all other UI copy in Docs 03/04 is written in French (the default
locale) since that's what ships first, and English and Arabic strings
are translations of the same keys, not separately authored copy.

**Arabic / RTL requirement (explicit, deferred implementation)**:
Arabic ships as a locale, and Arabic is a right-to-left language — this
has a layout consequence that has to be a day-one engineering
convention, not a Phase-6 retrofit. Concretely: every screen in Docs
03/04 must be built using **logical properties**, not physical ones —
`marginStart`/`marginEnd` instead of `marginLeft`/`marginRight` in
Tamagui, Tailwind's `ms-*`/`me-*` instead of `ml-*`/`mr-*` on web, and
React Native's `I18nManager.forceRTL()` wired up (even if unused) from
the first screen built. The Arabic translation strings themselves and
RTL QA pass are deferred to whichever phase actually ships the Arabic
locale (Doc 02 §2.10) — but the *layout code* being RTL-safe is not
deferred, because retrofitting logical properties across ~40 already-
built screens is materially more expensive than writing them that way
from the start.

---

## 0.7 Risk register — carried forward and updated

| Risk | Status |
|---|---|
| Cross-org RLS isolation bug | Mitigated via the single `is_org_member()`/`org_role_of()` RLS predicate pattern (Doc 01 §1.5). Must still be executed against Doc 02's test matrix before multi-org ships to any user. |
| Free-tier ceiling | Mitigated via the storage-overage policy (§0.5 item 7). Requires monitoring dashboards (Doc 01 §1.7). |
| WhatsApp deep-link fragility | Unchanged — no official WhatsApp Business API, by design, to stay at $0/month. SMS remains the documented fallback wherever the WhatsApp share sheet is used. |
| Custom ML roadmap slips | De-risked by the Tier 0/1/2 split (Doc 02 §2.9) — Tier 0 has zero ML dependency and ships with MVP. |
| TVA/tax handling on invoices | **Not resolved.** Needs professional (accountant/lawyer) review, not a spec fix. |
| Password-based auth friction | Every account holder, including workers, has a confirmed email (§0.5 item 10), which removes the "does this person even have an email" version of this risk. What remains is ordinary password-memorability friction, mitigated by: a strength meter with plain-language guidance rather than a rejection wall, "show password" toggle always visible, biometric unlock immediately after first login so the password is rarely re-typed, and a low-friction reset-by-email flow (Doc 01 §1.3). Still worth field-testing with real users before wide rollout, but no longer an open architectural question. |
| Web/mobile feature drift | Mitigated structurally: one backend, one shared Zod validation package (Doc 01 §1.1), one RLS layer (Doc 01 §1.5) enforcing identical rules regardless of client. The build roadmap (Doc 02 §2.10) schedules mobile and web screens for the same module in the same phase. Drift can only happen in UI polish, never in what's actually permitted. |
| **Multi-org RLS pattern ambiguity (RESOLVED)** | Table-lookup pattern only; JWT custom claims explicitly forbidden for authorization. Full rationale and implementation in Doc 01 §1.5. |
| **Mobile client/backend version drift (RESOLVED)** | Minimum-supported-version gate + additive-only migrations. Doc 01 §1.8. |
| **Offline write conflicts (RESOLVED)** | Append-only writes for money/attendance, optimistic-concurrency version column for editable records. Doc 01 §1.9. |
| **Free-tier resource ceilings under real usage (RESOLVED, monitored)** | Scoped Realtime subscriptions, polling fallback, keep-alive ping against Supabase's 7-day project-pause policy. Numbers and thresholds in Doc 01 §1.10 — this is "resolved" as an architecture, but usage against these ceilings should be checked against Supabase's current published limits periodically, since free-tier terms change. |
| **Double-processed financial actions (RESOLVED)** | Idempotency keys on every money-moving mutation. Doc 01 §1.11. |
| **Uncompressed photo uploads exhausting storage quota (RESOLVED)** | Mandatory client-side compression before upload. Doc 02 §2.5. |

---

## 0.8 Glossary

- **Org** — an independent trade business (plumbing, electrical, etc.) registered as a tenant. Root of RLS isolation.
- **Project** — a "chantier" (construction site/job). Owned by one org (the lead), can have other orgs invited onto it (Doc 02 §2.8).
- **Lead org** — the org that owns a project.
- **Trade org** — an org invited onto someone else's project.
- **Worker** — a field employee of an org, with a mobile-only account distinct from a contractor account.
- **Contractor** — any user with an org role (owner/manager/viewer), regardless of which client (mobile or web) they use.
- **Platform admin** — an internal Anthropic-style super-user account, not a member of any org, operating the separate Admin surface.
