# Dala — Improvement Plan (Gaps & Fixes)

_Every item below is a confirmed, currently-open gap, verified against the actual codebase. Nothing already resolved is discussed. Each item follows the same structure: **Gap** → **Why it matters** → **Fix** → **Size** (Quick / Medium / Big). Section 6 turns all of it into one ordered execution roadmap._

---

## 0. Guardrails — read before implementing anything below

These are the patterns already established and working in the codebase. Every fix in this document is written to extend them, not replace them.

- **Append-only attendance.** `attendance_records` has no unique constraint on worker+date, by design — corrections are new rows, never overwrites. Any pointage work must preserve this.
- **Soft-delete pattern.** `deleted_at`-style columns are the established shape for anything deletable — follow it for new deletable entities rather than hard deletes.
- **Reuse the existing photo pipeline.** `processPhoto` / `uploadOrgFile` / `getSignedUrl`, already proven in journal/safety/org-logo, is the correct path for every new photo field below. Signed URLs need re-minting per screen focus.
- **`Avatar.tsx` already accepts an `imageUrl` prop** with initials fallback. Every "add a photo" task below is about feeding that prop real data, not building a new avatar component.
- **`DatePicker.tsx` and `SwipeableRow.tsx` already exist and are proven in production screens** — reuse their patterns for any new date-picking or swipe-interaction work rather than building from scratch.
- **`Chart.tsx`** (`BarChart`/`LineChart`/`DonutChart`) already exists, built on `react-native-svg` — reuse it for all new charting rather than adding a third-party library.
- **RLS three-policy shape and sequential migration numbering** — any new table follows the same shape as the existing 68 migrations, numbered next in sequence.
- **French UI language, full-file overwrites, read-before-write** — existing conventions, unchanged.
- **`export-org-data` and `generate-report` are different features** — the former is raw data portability (stays CSV/JSON on purpose), the latter is curated reports (gets PDF treatment). Don't conflate them.

---

## 1. Core feature gaps

### 1.1 Pointage (attendance) — **Big**

**Gap:** the date is hardcoded to today (`date = todayISO()`) — no way to open a past date. There is no attendance history view anywhere (`attendance_records` is only read by the lateness RPC and the reports export, never rendered as a log). There is no correction flow for a past date. There is no absence-reason field (Absent carries no context).

**Why it matters:** a contractor who needs to check or fix last week's attendance, or explain an absence to a worker, currently has no way to do either inside the app.

**Fix:**

1. Add a date picker to Pointage (backward-only, capped at today), using the existing `DatePicker.tsx` — reuses the current append-only insert logic unchanged. **[Quick]**
2. Build a real attendance history view — calendar-month grid or reverse-chronological per-worker list, showing `source` (`manual_pointage` vs. `dispatch_checkin`) and who recorded it. **[Big]**
3. Build an explicit correction flow — opening a past date shows the same toggle UI, clearly labeled as adding a correction (a new row), not editing history. **[Big]**
4. Add an optional absence-reason field (Maladie / Congé autorisé / Absence non justifiée / Autre) once the pick-or-specify component from §3 exists. **[Medium]**
5. Fix the save flow so a background sync failure is visible to the user, not just logged — see §5.1. **[Medium]**

### 1.2 Journal de chantier — **Medium**

**Gap:** only workers can create entries, and only through a same-day dispatch assignment — the contractor's `journal.tsx` has no add-entry path at all. No edit or delete on any entry. No search or filter (by date, author, or type). No date-grouped sections — every entry runs together in one long scroll. Voice notes play with no progress bar, no duration, no scrub.

**Why it matters:** the contractor is a spectator on their own project journal, unable to log anything themselves or clean up mistakes, and the timeline becomes unusable to navigate once a project has months of history.

**Fix:**

1. Let the contractor add entries — reuse `update-chantier.tsx`'s form as a shared component, add a FAB matching the pattern already used in `vehicles.tsx`/`materials.tsx`. **[Medium]**
2. Add date-grouped sections (Aujourd'hui / Hier / Cette semaine). **[Quick]**
3. Add a filter row — by author, by entry type, by date range. **[Quick]**
4. Add edit-caption / soft-delete for the contractor. **[Medium]**
5. Add a progress bar + duration to voice playback (`expo-audio`'s `useAudioPlayer` already exposes position/duration). **[Quick]**
6. Add a grid/gallery view toggle for photo-heavy projects. **[Medium]**

### 1.3 Vehicles — **Medium** for photos, **Big** for maintenance/docs

**Gap:** `vehicles` has no `photo_url` column and nothing for documents, insurance, or maintenance history — this is a schema gap, not a UI one. There's no assignment-history view per vehicle (data already exists in `dispatch_assignments`, just never surfaced).

**Why it matters:** a fleet of similar-looking trucks/vans is hard to tell apart in a text-only list, and there's no record of what maintenance was done or when documents expire.

**Fix:**

1. Add `photo_url text` to `vehicles`, wire the existing upload pipeline into add/edit, show the photo in the list row. **[Medium]**
2. Build a `vehicle_maintenance_log` table (date, description, cost, logged by) and a history view. **[Big]**
3. Add document/insurance expiry tracking with a due-soon badge, matching the existing "budget consommé" progress-bar pattern. **[Big]**
4. Add an assignment-history summary per vehicle, reusing existing `dispatch_assignments` data. **[Medium]**

### 1.4 Organization logo not surfaced — **Quick**

**Gap:** logo upload is fully implemented in `organization-settings.tsx`, but `logo_url` is referenced in exactly that one file. The org switcher falls back to initials (`Avatar name={org.name}`, no `imageUrl`), the dashboard doesn't show it, generated PDF reports don't embed it, and the client portal — the one surface an actual outside client sees — doesn't show it either.

**Why it matters:** branding work that's already done never actually reaches the user or an outside client.

**Fix (all just "feed the existing `imageUrl` prop"):**

1. `OrgSwitcherSheet` → `Avatar imageUrl={org.logo_url}`.
2. Dashboard header, next to org name/greeting.
3. Embed top-left on generated PDF reports (`pdf-lib` supports `embedPng`/`drawImage`, already a dependency) — the one missing piece of an otherwise-working PDF export feature.
4. Client portal — highest-value placement of the four.

### 1.5 Worker & project photos — **Medium**

**Gap:** `workers` has no `photo_url` field, and `projects` has no cover-image field. Every worker chip app-wide (dispatch, pointage, team list, dashboard) renders initials only; every project card is text-only.

**Why it matters:** `Avatar.tsx` already supports a real image with initials fallback — the component is ready, the data isn't. A face or a cover photo is recognized far faster than a name once an org has 15+ workers or several similar-sounding project names.

**Fix:** add `photo_url` to `workers` and a cover-image field to `projects`, let a worker set their own photo (or a contractor set it from team-members), join it into every existing identity render. One column each, one upload flow, reused everywhere `Avatar`/project cards already render.

### 1.6 Worker detail screen — **Big**

**Gap:** the screen is 197 lines — identity header plus a lateness-pattern card, nothing else. No edit, no attendance history, no advance history, no documents, no photo.

**Why it matters:** the natural place to manage a worker has no management functionality; a contractor has to go elsewhere (`team.tsx`) to edit basic fields.

**Fix:** rebuild as a tabbed hub — Infos / Pointage / Avances / Dispatch — each tab reusing logic that already exists in `pointage.tsx` / `advances.tsx` / `dispatch.tsx`, filtered to one worker. Mostly assembly of existing logic, not new engineering. Picks up the photo from §1.5 and the attendance history from §1.1 once those exist.

### 1.7 Dashboard activity feed — **Big**, backend-blocked

**Gap:** there's no activity feed on the dashboard because `audit_log` has zero client-facing RLS policies — the mobile app has no legal way to read it yet. This is a backend gap, not a UI one.

**Fix:** add RLS policies to `audit_log` (or build a dedicated feed table), then build the dashboard UI on top. The backend piece must happen first.

### 1.8 Expenses — no receipt photo — **Medium**

**Gap:** receipt photo capture is explicitly deferred in the code's own comment.

**Why it matters:** a receipt photo is close to the core value of a digital expense ledger (proof for the contractor's own books, and for any future accountant handoff), not a nice-to-have.

**Fix:** wire the existing upload pipeline into the expense-add form — same pattern as journal/safety/logo, near-zero marginal infrastructure cost.

### 1.9 Materials — **Medium**

**Gap:** the contractor can only Approve/Refuse/Reassign — requests always originate from a worker. There's no cost field on `materials`, so an approved request never touches `project_expenses`, meaning budget-consumed tracking is blind to material spend.

**Fix:**

1. Let the contractor initiate a material request directly, not just react to worker-submitted ones.
2. Add an optional cost field that can push into `project_expenses` on approval.

### 1.10 Reports & exports — **Medium**

**Gap:** `payroll_summary` and `cnss_declaration` are CSV-only. No chart is embedded in generated PDFs. The "Déclaration CNSS" report type itself should be removed (see §7 for the exact steps).

**Fix:**

1. Extend PDF generation to `payroll_summary` once logo branding (§1.4) is in place, with a disclaimer baked into the document itself (it's an aggregation, not a certified filing).
2. Draw charts directly in the PDF using `pdf-lib`'s vector-shape support, reusing the same data behind `Chart.tsx` — a one/two-page "executive summary" PDF.

### 1.11 Cross-cutting naming ambiguity — **Quick**

**Gap:** `accept-invite.tsx`, `accept-org-invite.tsx`, and `accept-organization-invite.tsx` coexist. `team.tsx` and `team-members.tsx` both exist.

**Fix:** confirm which are live vs. leftover naming churn from earlier phases; consolidate or, if all are intentional, add a clear in-app distinction (title/subtitle) so it's not ambiguous to future work either.

### 1.12 Advances Tier-3 confirmations have no reason-persistence path — **RESOLVED (Phase 19F)**

**Was:** confirmed during the Doc 05 design-system implementation (Phases 19C–19E). Advances' Approve/Reject/Mark-as-Paid actions (mobile and web) gated through a typed-confirmation dialog (Doc 05 §1.7c, Tier 3) with no server-side place for the reason half of that dialog to go — `approve_advance`/`mark_salary_cycle_paid` took no reason parameter, and reject was a raw `.update({status: 'rejected'})` touching no reason column.

**Resolution (migration `0090_advances_manager_reason_persistence.sql`):**

- Added `advances.manager_reason` and `salary_cycles.paid_reason` — new, nullable, additive columns. Deliberately NOT `advances.reason`, which stays the worker's own stated reason for requesting the advance, set at creation.
- `approve_advance` and `mark_salary_cycle_paid` both gained a `p_reason` parameter, validated server-side (raises `reason_required` below 10 characters) — the old 2-arg overloads were dropped and replaced, since every caller in this codebase (mobile `advances.tsx`, web `actions.ts`) was updated in the same phase.
- Reject stays a plain `.update()` under existing RLS (not a new RPC) — consistent with `materials.tsx`'s own reject pattern, and correct per Doc 01 §1.11.3 (rejection isn't in the mandatory-idempotency list). Now writes `manager_reason`, validated client-side via a new `rejectAdvanceSchema`/`managerReasonSchema` (10-char minimum, matching the RPC-side bar).
- Wired into both `ConfirmTypingDialog`s: mobile's (`apps/mobile/src/components/ui/ConfirmTypingDialog.tsx`) did NOT already support a `requireReason` mode — that part of this doc's original **Fix** text was inaccurate; only the web/admin shared one (`packages/ui-web/src/ConfirmTypingDialog.tsx`) did. Mobile's now has a matching `requireReason` prop, same 10-char contract.
- Web's bulk-approve flow (a plain `ConfirmDialog`, not `ConfirmTypingDialog`) also needed a reason once `approveAdvance` made it mandatory — `ConfirmDialog` gained optional `children`/`confirmDisabled` props (default off, every other call site unaffected) to carry a reason field for the batch.
- Audited `materials.tsx`'s own reject flow per this phase's instructions: it was already correctly wired to a real `rejection_reason` column — **not** a second instance of this gap.
- Strictly additive to existing data: every advance/salary-cycle row from before this migration simply has `manager_reason`/`paid_reason` = null, same as any other later-added optional column.

### 1.13 Dark mode — token layer completed, toggle still deferred (Phase 19F) — **Quick (tokens) / Big (toggle)**

**Status:** partially addressed. Phase 17's audit found `packages/design-tokens` already had a fully mirrored dark palette for the core colors; 19F confirmed that's still true and closed the one real gap it had — `neutral-400` and `warning-tint` (added in 19A/19B, after the original dark-palette pass) had no dark equivalents, and `surfaceHierarchy`/`financial` (also 19A/19B) weren't theme-aware at all. All four now have contrast-audited dark values/twins (`color.dark.neutral400`, `color.dark.warningTint`, `surfaceHierarchyDark`, `financialDark` in `packages/design-tokens/src/index.ts`), and mobile's `tamagui.config.ts` dark theme now wires in the two previously-missing keys.

**What's still missing, and why it's deliberately not built in this pass:**

- Mobile has a real, swappable Tamagui `themes: { light, dark }` config already (from the 19A pass), but `apps/mobile/src/app/_layout.tsx` still pins `defaultTheme="light"` — deliberately, per that file's own comment: ~16 component files (icons, `Chart.tsx`/`Sparkline.tsx`'s SVG elements) read color values directly from `@dala/design-tokens` in JS rather than through a Tamagui token, and would stay light-mode-colored under a dark theme, producing a "half-themed screen." Flipping the toggle before that's fixed would reintroduce the exact bug the pinning comment exists to prevent.
- Web and admin's shared Tailwind preset (`packages/config/tailwind-preset.js`) has **no dark-mode wiring at all** — no `darkMode` config, no `dark:` variants anywhere. Building this from scratch across two Next.js apps is a materially bigger effort than mobile's "flip a pinned default" gap.

Given the disclosed light-mode-only status was already a design-doc-level decision ("nice-to-have, not required for MVP"), and completing an actual cross-platform toggle here would mean (a) threading `useTheme()` through ~16 mobile files and (b) building Tailwind dark-mode wiring from zero on web/admin — both real, separate efforts — 19F's judgment call was to finish the token layer only and leave the toggle mechanism itself deferred, same status as before but now on a complete token foundation instead of a partial one.

---

Ordered by how directly each builds on what already exists.

### 2.1 Instant, event-driven notifications — **Medium**

**Gap:** the existing digest notification system (per-category toggles, daily/weekly batch, push token registration) is solid, but nothing is event-driven. A new dispatch assignment, a safety incident, a material request — none of these trigger an immediate push, only the next digest cycle.

**Fix:** add a trigger path fired directly from the RPCs that already exist (dispatch assign, material request, safety incident, invite), reusing the existing `expo_push_token`/`notification_prefs` infrastructure. Smaller than building notifications from scratch — the infrastructure already exists, this adds a second trigger path alongside the digest.

### 2.2 Push notifications don't deep-link — **Medium**

**Gap:** deep linking itself works correctly (`dala://accept-invite`, `dala://auth/confirm` both resolve properly), but there's no `addNotificationResponseReceivedListener`/`getLastNotificationResponse` anywhere. Tapping a push notification opens the app to its default screen, not the dispatch/incident/request it was actually about.

**Fix:** wire a notification-tap listener in the same phase as §2.1 — from the user's perspective it's the same feature as the instant push itself, and a notification that doesn't take you anywhere feels broken even if the alert worked.

### 2.3 Analytics — dedicated screen — **Big**

**Gap:** `Chart.tsx` exists and is proven out (a category-breakdown donut in Expenses), but there's no dedicated analytics screen assembling multiple charts into one view. Dashboard still only shows the small `Sparkline`.

**Fix:** build one new screen with:

- **Financial:** revenue vs. cost per project (bar), monthly cash-out trend (line)
- **Workforce:** attendance-rate trend (depends on §1.1's history fix), per-worker reliability snapshot, headcount by project over time
- **Projects:** budget-consumed distribution across active projects, timeline if start/end dates are tracked
- **Operations:** vehicle utilization (depends on §1.3), safety incident trend by severity

Largely assembly work now that `Chart.tsx` exists — the charting infrastructure doesn't need to be built, just applied to these data sets.

### 2.4 Calendar / planning view — **Medium**

**Gap:** dispatch only shows "today." No week/month view of who's assigned where, no forward planning UI.

**Fix:** a week-strip + day-detail view reusing `dispatch_assignments`, enabling actual forward staffing planning instead of day-by-day.

### 2.5 Client-facing invoicing — **Big**

**Gap:** the client portal is read-only status today; there's no invoice generation, despite `budget_total` vs. `budget_consumed` already being computed per project.

**Fix:** a "generate invoice" action producing a branded PDF (depends on §1.4's logo work and §1.10's PDF branding) with line items from expenses/materials and a due date.

### 2.6 Timesheets → payroll bridge — **Medium**

**Gap:** `advances` and `attendance_records` already contain what's needed to compute "days worked × daily rate − advances taken" per worker, but nothing turns this into a clean payslip.

**Fix:** a new report type — this is aggregation over existing data, not new data collection.

### 2.7 Weather-aware planning — **Quick/Medium**

**Gap:** no weather context on the dispatch/planning screen, despite construction work being weather-sensitive.

**Fix:** a simple forecast widget via a free weather API. Lowest priority in this section.

### 2.8 In-app support/feedback — **Quick**

**Gap:** no way to report a bug or ask a question from inside the app.

**Fix:** a simple "Signaler un problème" writing to a `feedback` table, reducing reliance on WhatsApp/calls during pilot use.

---

## 3. Smart inputs — pick from a list, or specify your own

**Gap:** there is no Select/Picker/Autocomplete component anywhere in the UI kit — only `SegmentedControl` (2–4 fixed options), plain `FormField` (free text), and the date-specific `DatePicker.tsx`. The following fields are free text today and should be pick-or-specify:

| Field                          | File                        | Should be                                                                                                                                                                       |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations.trade_type`     | `organization-settings.tsx` | Picker: Plomberie, Électricité, Maçonnerie, Peinture, Climatisation, Vacuum central, Menuiserie, Carrelage, Gros œuvre, Second œuvre, Rénovation générale, + "Autre (préciser)" |
| `workers.trade`                | `team.tsx`                  | Same list, per worker                                                                                                                                                           |
| `org_insurances` coverage type | `safety.tsx`                | Picker: Responsabilité civile, Décennale, Multirisque chantier, Flotte automobile, + "Autre"                                                                                    |
| Safety incident type           | `safety.tsx`                | Closed list (Chute, Coupure, Électrocution, Accident véhicule, Autre) — also makes the §2.3 safety chart chartable by category, which free text isn't                           |
| Material name/category         | `materials.tsx`             | Common materials list (Ciment, Sable, Fer, Brique, Peinture, Carrelage...) + Autre                                                                                              |
| Absence reason (new, §1.1)     | n/a yet                     | Maladie, Congé autorisé, Absence non justifiée, Autre — build in from day one                                                                                                   |

**Why it matters:** free text can't be charted by category (directly blocks part of §2.3's analytics), can't be validated, and produces inconsistent data across entries that should be identical (e.g. "Plomberie" vs. "plombier" vs. "Plomberie ").

**Fix:** build one `Select.tsx` bottom sheet, modeled on `DatePicker.tsx`'s already-established sheet pattern — search-as-you-type for longer lists, an "Autre — préciser" row revealing inline text input. One component, roughly six call sites. **[Medium]**

**Separately, add prefill/suggestion (not hard pickers) where it adds value:** recently-used addresses per org, a suggested daily rate by trade when adding a worker, a remembered last-amount hint for recurring expense categories, autocomplete on repeat client names. **[Quick, lower cost, high perceived polish.]**

---

## 4. Complete profiles

### 4.1 Photo and identity wiring — **Medium**

**Gap:** `profiles.avatar_url` exists and is settable, but only by the logged-in contractor, only for themselves, in exactly one screen (`profile-settings.tsx`). Worker settings has dead "Profil"/"Téléphone"/"E-mail" menu rows that do nothing. `avatar_url` is never joined into any other screen's identity rendering.

**Fix:**

1. Wire up worker settings' dead rows, letting a worker set their own photo via the same upload pipeline already proven for the contractor.
2. Join `avatar_url` into every existing identity render — dispatch chips, pointage rows, team list, worker detail header, journal authorship. Wiring, not new infrastructure, once step 1 exists.
3. Build one consistent profile screen shape reused across contractor/manager/worker (and eventually client-portal contact): photo, name, role/trade, phone, email, orgs, join date.

### 4.2 Missing org profile fields — **Medium**

**Gap, checked against the actual schema — these fields don't exist:**

- Legal form (Personne physique / SARL / SUARL / SA)
- Workforce size — self-declared bracket at onboarding (1 / 2–10 / 11–50 / 51+), superseded by a live count from `workers` once populated
- Socials/website (Facebook/Instagram matter more than a website for Tunisian trades)
- Service area / zone d'intervention
- RIB/bank details — relevant once client invoicing (§2.5) exists; flag for encryption-at-rest given it's sensitive
- Verification status (matricule fiscal verified, etc.) — low priority

_Already present, no action needed: `contact_phone`, `address`, `matricule_fiscal`, `contact_email` (already independent of the contractor's personal login email)._

### 4.3 Missing individual profile fields — **Medium**

**Gap:**

- Emergency contact — a real gap specific to a construction-site context: if someone's hurt on site, "who do we call" shouldn't be undocumented
- Position/job title, distinct from trade (e.g. "Chef de chantier")
- Real hire/start date, distinct from `organization_members.joined_at` (which only tracks app-join date, not actual employment start)
- Confirm `profiles` email reachability for future notification use — there's no direct `email` column on `profiles` today, it lives on `auth.users`

### 4.4 Profile completion signal — **Quick**

**Gap:** the org has a completion-nudge pattern already (`org_checklist_dismissed_at`); individuals don't have an equivalent.

**Fix:** a small completion indicator ("Profil complété à 60% — ajoutez une photo, un numéro de téléphone") mirroring the existing org pattern. Also add verification/status signals — "Email vérifié," "Invitation acceptée le [date]," last login — turning a data-entry form into something that feels like a real account.

---

## 5. State management & data-flow reliability

This section is foundational — it changes how every screen listed above should be built, not just one feature.

### 5.1 No shared data-caching layer — **Big**

**Gap:** `@tanstack/react-query` is installed and never imported anywhere. WatermelonDB's reactive `.observe()` — the actual point of a local-first reactive database — is used zero times. Supabase Realtime is used zero times. The pattern actually in use, in 32 of 52 screens, is `useFocusEffect` → manual `load()` → `useState`. Two screens showing the same data stay consistent only when both happen to regain focus after an edit, not the instant the edit happens.

**Fix:**

1. Adopt React Query as the shared data layer. Every screen's `useState` + `useFocusEffect` + `load()` triple becomes a `useQuery` with a shared cache key (e.g. `['workers', orgId]`). A mutation on one screen invalidates that key, and every other mounted screen using it re-renders immediately — no navigation event required.
2. Where a screen already touches WatermelonDB (dispatch, pointage, worker home, the two request screens), read via `.observe()` instead of a one-off fetch — the UI updates the instant a local write lands, including from a background sync, with no manual reload call needed.
3. Add Supabase Realtime on the few screens where multi-user simultaneity actually matters — dispatch (two managers), materials approval, safety incidents — invalidating the matching React Query key on any payload.
4. This can adopt incrementally, screen by screen — a non-migrated screen keeps working exactly as it does today.

### 5.2 Sync failures are invisible to the user — **Medium**

**Gap:** `pointage.tsx`'s `handleSave()` writes locally, shows "Pointage enregistré" immediately, then fires `void runSync()` completely detached from the UI. If that sync fails, `db/sync/index.ts` does catch it and report to Sentry — but the calling screen discarded the promise, so the result never reaches the user. `AutoSync.tsx` has the identical shape. Someone can believe their data synced when it didn't.

**Fix:** extend the existing `OfflineBanner` into a persistent sync-status indicator (Hors ligne / Synchronisation… / Synchronisé / Échec de synchronisation, tap for detail). Keep the "write locally, show success immediately" pattern for the local-first writes — that part is correct — but surface the _subsequent_ sync outcome instead of discarding it.

### 5.3 No standard loading/error/success shape — **Medium**

**Gap:** no generic `ErrorState` component exists (only `EmptyState` and `SkeletonList`), and there's no retry pattern anywhere in the codebase. A failed `load()` call today either leaves the skeleton showing indefinitely or resolves to an empty list indistinguishable from genuinely-no-data.

**Fix:** build an `ErrorState` component matching `EmptyState`'s visual family, with a retry button. Pairs naturally with §5.1's `useQuery` adoption, since `isLoading`/`isError`/`data` map directly onto Skeleton/ErrorState/content — three always-distinguishable states on every screen.

### 5.4 No memory-leak guards on async loads — **Medium**

**Gap:** zero occurrences of `AbortController`, an `isMounted` flag, or an effect cleanup function across the 46 screens that fetch data. Navigating away from a screen before its fetch resolves still lets the `setState` calls fire against an unmounted component.

**Fix:** resolved automatically by §5.1's React Query adoption, which handles request cancellation and unmount-safety by default — one more reason to prioritize that migration over patching each screen by hand.

### 5.5 Every mutation needs a designed success/error path — **Medium**

**Gap:** success/error handling is currently ad hoc per screen rather than a deliberate, consistent design.

**Fix:** a toast/haptic pair on every mutation's success (already the pattern in some screens, worth making universal); specific, actionable error messages rather than a generic "Une erreur est survenue" where the underlying error is knowable (RLS rejection vs. network timeout vs. validation failure should read differently); optimistic updates with visible rollback where it's safe to assume success (toggling a status, marking read).

---

## 6. Mobile engineering fundamentals

### 6.1 No list virtualization — **Big**

**Gap:** 34 files use `ScrollView` + `.map()`; `FlatList`/`FlashList` usage is zero across the entire app. Every row of every list renders immediately regardless of visibility.

**Why it matters:** invisible at pilot scale, but directly compounds several items already in this plan — the pointage history view (§1.1), a journal with months of entries (§1.2), and any list-search work all get worse if built as another `ScrollView`.

**Fix:** swap to `FlatList`/`FlashList` as each screen is touched — not a big-bang rewrite, but the default going forward, especially for any of the history/search work above.

### 6.2 No memory-leak guards — see §5.4.

### 6.3 Keyboard handling unverified — **Quick to check, Medium to fix**

**Gap:** zero usage of `KeyboardAvoidingView` across the screens using `FormField`.

**Fix:** verify on a real small-screen device before assuming either way — the navigation layout or Tamagui defaults may already handle it adequately, but this is worth confirming rather than assuming, since "keyboard covers the field" is one of the most common and avoidable mobile complaints.

### 6.4 No over-the-air update mechanism — **Big**, strategic decision

**Gap:** `expo-updates` isn't a dependency. Every fix, including a one-line copy change, needs a full app-store review cycle on both platforms.

**Fix:** a deliberate decision, not a default — weigh it explicitly given how much fast iteration matters during pilot use. (`forced-update.tsx`'s hard-gate pattern already correctly handles breaking changes; OTA would complement it for everything that isn't breaking.)

### 6.5 Push notifications don't deep-link — see §2.2.

### 6.6 No biometric app lock — **Medium**

**Gap:** no `expo-local-authentication` or equivalent.

**Fix:** worth adding as an optional setting, not required, given the app already holds financial data (advances, expenses, daily rates) and personal worker information.

### 6.7 No render memoization — **Quick-Medium**

**Gap:** zero `React.memo` usage anywhere.

**Fix:** not urgent at current data volumes — do this at the same time as §6.1's virtualization work, since both address the same underlying concern (wasted re-renders as data volume grows).

---

## 7. Cleanup — remove the CNSS report type

**Gap:** "Déclaration CNSS" doesn't use any employer-level CNSS data (no such field exists anywhere) — it's a mislabeled per-worker attendance report (name, trade, daily rate, days present), not a real filing document.

**Fix — three touch points, no schema change, other report types unaffected:**

1. Remove `'cnss_declaration'` from the `reportType` enum in `packages/validation/src/exports.ts`.
2. Remove the `case 'cnss_declaration'` branch and the `cnssDeclarationReport()` function in `supabase/functions/generate-report/index.ts`.
3. Remove the `{ value: 'cnss_declaration', label: 'Déclaration CNSS' }` entry in `apps/mobile/src/app/(contractor)/reports.tsx`.

---

## 8. Language picker — a decision, not a fix

**Gap:** Settings offers Français / العربية / English and writes the choice to `preferred_locale`, but there is no i18n library anywhere in the app — every screen has hardcoded French text. Picking Arabic or English changes nothing today.

**Why it matters:** this is worse than not offering the choice, since it actively promises something the app doesn't deliver. Given many workers are more comfortable in Arabic than French, this may be the single highest-impact item in this whole plan for actual daily users, not just the contractor.

**Fix — two honest options, not a partial one:**

1. Build it properly: extract every hardcoded string, add RTL layout support for Arabic, test every screen mirrored. **[Big]**
2. Or remove the picker until it's real. **[Quick]**

A non-functional setting is worse than no setting — this needs a decision, not a deferral.

---

## 9. Remaining UX polish

### 9.1 Search coverage — **Medium**

**Gap:** search exists on Projects and Workers only. Vehicles, Materials, Expenses, and Journal have none. There's already unused full-text search infrastructure at the database level (`organizations.search_vector`, a referenced `search_rpc`) that mobile doesn't call.

**Fix:** extend search to the remaining list screens — check whether the existing `search_rpc` already covers the needed tables before building new query logic.

### 9.2 No undo on soft-deletes, and trash/restore scope is narrow — **Medium**

**Gap:** `trash.tsx` proves soft-delete + restore works well, but only covers projects and workers. Deletes elsewhere use a blocking `ConfirmDialog` rather than a lighter undo pattern.

**Fix:** extend soft-delete + trash/restore to vehicles and journal entries. For lower-stakes deletes (a journal entry, an expense row), replace the modal confirm with a "Supprimé · Annuler" toast with a short undo window — save the modal confirm for genuinely hard-to-reverse actions.

### 9.3 Sync-conflict visibility — **Medium**, depends on live-device verification

**Gap:** when a local edit conflicts with a change made elsewhere (two people editing the same worker's rate while one was offline), it's not established whether the person ever sees that a conflict happened, or whether it resolves silently.

**Fix:** get an explicit, tested, deliberate answer once offline sync is verified on a real device (§10.1) — even if the answer is "last-write-wins is fine here," that should be a decision, not an unknown.

### 9.4 Accessibility labels are inconsistent — **Medium**

**Gap:** roughly a third of screen/component files have an `accessibilityLabel` — real coverage, not zero, but not systematic.

**Fix:** make it a standing checklist item on every new screen going forward, and backfill the highest-traffic existing screens.

### 9.5 Client portal needs its own design pass — **Medium**

**Gap:** it's the one surface an actual outside client sees, and currently reuses the internal app's utilitarian style and terminology.

**Fix:** treat as a small project of its own — typography/branding independent of the internal app, graceful degradation on an older client device, copy that speaks to a client audience rather than internal contractor terminology. Ties directly into §1.4's logo work.

---

## 10. Production readiness

### 10.1 Offline sync — unverified on a real device — **Big**, foundational

**Gap:** WatermelonDB JSI linking and `app.json` config-plugin registration have never been confirmed on a real build.

**Why it matters:** every feature in this plan writes through this layer — building more screens on an unverified foundation compounds risk with each addition.

**Fix:** complete live-device verification before further feature work stacks on top of it.

### 10.2 Detox e2e suite has never been run — **Medium**

**Fix:** run it at least once — an unrun suite isn't a safety net, it's aspirational.

### 10.3 Sentry captures errors but they don't reach the user — **Medium**

**Fix:** see §5.2 — the monitoring exists, the gap is surfacing captured failures to the person experiencing them.

### 10.4 No rate limiting confirmed on public-facing Edge Functions — **Medium**

**Gap:** invite-accept and client-portal endpoints are public-facing; rate limiting/abuse protection isn't confirmed.

**Fix:** verify Supabase defaults are adequate or add explicit limits.

### 10.5 App store readiness — **Medium**

**Gap:** icons, screenshots, privacy policy, and a data-retention/deletion policy aren't confirmed complete — relevant given the app handles phone numbers, photos, and financial data.

### 10.6 Backup & disaster recovery — **Medium**

**Gap:** no documented restore drill for Supabase's point-in-time recovery, beyond assuming backups exist.

### 10.7 No first-run onboarding for new orgs — **Quick**

**Gap:** the org-completion nudge pattern exists (`org_checklist_dismissed_at`), but there's no guided first-run checklist walking a brand-new org through the app's core screens.

**Fix:** mirror the existing completion-nudge pattern for a first-run walkthrough, important for adoption beyond the first pilot user.

---

## 11. Master roadmap — one ordered sequence

Each phase is independently shippable; later phases build on earlier ones.

**Phase 1 — Foundation**

- Live-device sync verification (§10.1)
- CNSS report-type cleanup (§7)
- Adopt React Query as the shared data layer; build `ErrorState`; turn `pointage.tsx`/`AutoSync.tsx`'s silent syncs into a visible status indicator (§5.1–5.3)
- Switch list screens to `FlatList`/`FlashList` as touched; confirm keyboard handling on a real device (§6.1, §6.3)
- Decide the language picker's fate now, before more screens accumulate hardcoded strings (§8)

**Phase 2 — Wiring pass**

- Org logo surfaced: switcher, dashboard header (§1.4)
- Pointage date picker, using existing `DatePicker.tsx` (§1.1, step 1)
- Journal date-grouped sections + contractor add-entry FAB (§1.2, steps 1–2)

**Phase 3 — Photo infrastructure**

- `photo_url` on `workers`/`vehicles`, cover image on `projects` (§1.3, §1.5)
- Worker self-serve photo upload; join `avatar_url` app-wide (§4.1)
- Expense receipt photo (§1.8)

**Phase 4 — Smart inputs**

- Build `Select.tsx`, modeled on `DatePicker.tsx`'s pattern (§3)
- Apply to `trade_type`, worker trade, insurance type, incident type, materials
- Prefill/suggest layer (addresses, daily rate, remembered amounts)

**Phase 5 — Export completion**

- Logo embed in PDF reports (§1.4 step 3)
- Extend PDF to `payroll_summary` with disclaimer; charts in PDF (§1.10)

**Phase 6 — History & correction**

- Attendance history + correction flow (§1.1, steps 2–3)
- Worker detail hub rebuild (§1.6)
- Journal edit/delete/filter/waveform (§1.2, remaining steps)

**Phase 7 — Analytics**

- Dedicated analytics screen, assembling existing `Chart.tsx` components against the data sets in §2.3

**Phase 8 — Backend-blocked items**

- `audit_log` RLS → dashboard activity feed (§1.7)
- Materials cost field + `project_expenses` link (§1.9)
- Vehicle maintenance log + document-expiry tracking (§1.3, steps 2–3)

**Phase 9 — New modules**

- Instant/event-driven push + notification-tap deep linking (§2.1–2.2)
- Calendar/planning view (§2.4)
- Client-facing invoicing, depends on Phase 5 (§2.5)
- Timesheets → payroll bridge (§2.6)
- Weather widget, in-app support — lowest priority (§2.7–2.8)

**Phase 10 — Complete profiles**

- Remaining org fields: legal form, workforce size, socials, service area, RIB (§4.2)
- Remaining individual fields: emergency contact, job title, hire date (§4.3)
- Profile completion checklist + verification signals (§4.4)

**Phase 11 — Interaction polish**

- Search on Vehicles/Materials/Expenses/Journal (§9.1)
- Undo-toast on lower-stakes deletes; extend trash/restore (§9.2)
- Sync-conflict UX, once Phase 1's verification is complete (§9.3)
- Accessibility label pass (§9.4)
- Client portal design pass (§9.5)

**Ongoing, not a phase:** the rest of §10 (Detox suite, rate limiting, app-store readiness, backup/DR, first-run onboarding) — run in parallel, not blocking any feature phase, but gating an actual public launch. Two standalone decisions belong here too: OTA adoption (§6.4) and biometric app-lock (§6.6).

---

## 12. Explicitly out of scope

Confirmed excluded from this plan on your instruction — don't reintroduce these:

- Equipment/tools tracking beyond vehicles
- Subcontractor/supplier directory
- General document vault
- "Sunlight mode" / high-contrast daylight theme
- CNSS employer number field
- Org secondary/emergency phone
- Worker CIN (national ID) and CNSS number
