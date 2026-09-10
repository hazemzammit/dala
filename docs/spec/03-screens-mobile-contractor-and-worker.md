# Dala — Cahier des Charges v4.0

## Document 03 — Screen-by-Screen Breakdown: Mobile App

> Covers both roles that live on mobile: **Contractor** (owner/manager/
> viewer, §3.x) and **Worker** (§4.x). Every screen entry follows the
> same template: Purpose → Entry points → Layout & elements → Fields &
> validation → Primary actions → States → Edge cases → Copy reference.
> UI copy is French (default locale, Doc 00 §0.6); field labels are
> given as they'd appear in-app.

---

# 3. Authentication & Onboarding (shared entry point for all mobile users)

## 3.1 Splash screen

**Purpose**: brand moment + session check while the app determines
where to route the user.

**Entry points**: app cold start only.

**Layout & elements**: centered `Dala` wordmark on teal
background, with the slogan "La base de tout chantier." beneath it in
smaller type, no interactive elements.

**Logic**: two checks run in parallel before any routing decision —
a minimum-app-version check (Doc 01 §1.8) and the session-token check.

1. **Version check first**: if the installed build is below
   `min_supported_version`, routing stops entirely and the user sees
   the Forced Update screen (§3.1a) — no session check, no app access,
   regardless of how valid their session is.
2. If the version check passes: proceed with the session check.
   - Valid session + `email_verified_at` set → route to Home (§3.3).
   - Valid session, `email_verified_at` NULL → route to "Check your email" (§3.1.4) with a banner state.
   - No session → route to Welcome carousel (first launch only) or Login (subsequent launches).

**States**: loading spinner if either check takes >800ms (rare, but the
app must never show a blank white screen). If the version-check network
call fails (offline on cold start), the app **fails open** — proceeds
with the cached last-known-good version status rather than blocking a
legitimate offline-first user from opening an app they're already
running.

---

## 3.1a Forced Update

**Purpose**: hard-block screen for installs below `min_supported_version` (Doc 01 §1.8).

**Layout & elements**: illustration, headline "Mise à jour requise,"
body copy explaining the app needs updating to keep working, single
primary button "Mettre à jour" deep-linking to the App Store / Play
Store listing. No skip, no back button, no bottom nav — this screen
has no exit except updating.

**Copy**: "Une nouvelle version de Dala est nécessaire pour
continuer. Cette mise à jour ne prend qu'une minute."

**Edge cases**: a user who updates and reopens the app re-runs the
version check on the new Splash launch — no separate "confirm you
updated" step needed, since the check is stateless per launch.

---

## 3.2 Welcome / onboarding carousel

**Purpose**: first-launch-only orientation, 3 slides, skippable.

**Entry points**: first cold start on a device only; never shown again after dismissal (persisted locally).

**Layout & elements**: 3 swipeable slides (dispatch — `route-planning` illustration, advances — `mobile-pay` illustration, offline-first messaging — `connection-lost` illustration; illustration registry and convention in Doc 05 §1.5), dot pagination, "Passer" (skip) text button top-right, "Suivant" primary button, final slide has two buttons: "Créer un compte" and "J'ai déjà un compte."

**Primary actions**: → Sign Up (§3.3) or → Log In (§3.6).

**Edge cases**: if the device already has a valid session (e.g. app reinstalled but keychain persisted), skip the carousel entirely and route per §3.1's session logic.

---

## 3.3 Sign Up

**Purpose**: create a new contractor account **and** a new organization
in one flow. This is the replacement for the old magic-link entry
point — the single most consequential screen in this rework.

**Entry points**: Welcome carousel "Créer un compte," Login screen's "Pas de compte ? Créer un compte" link.

**Layout & elements**: single scrollable form, `Dala` logo at top, form fields, password strength meter beneath the password field, terms/privacy checkbox, primary "Créer mon compte" button, secondary "J'ai déjà un compte" link at bottom.

**Fields & validation**:

| Field                                                | Type                                                                   | Rules                                                                                                     | Error copy                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Nom complet                                          | text                                                                   | Required, 2–80 chars                                                                                      | "Merci d'indiquer votre nom complet."                                                                                             |
| Email                                                | email                                                                  | Required, valid format, checked for existing-account collision server-side                                | "Cette adresse e-mail n'est pas valide." / on collision: "Un compte existe déjà avec cet e-mail. Se connecter ?" (links to Login) |
| Téléphone                                            | tel, TN format                                                         | Required, `+216` prefix auto-applied, 8 digits                                                            | "Numéro de téléphone invalide."                                                                                                   |
| Mot de passe                                         | password, masked with show/hide toggle                                 | Min 10 characters. Live zxcvbn strength meter (Faible/Moyen/Fort) shown, not a hard blocker below "Fort." | "Le mot de passe doit contenir au moins 10 caractères."                                                                           |
| Confirmer le mot de passe                            | password                                                               | Must match                                                                                                | "Les mots de passe ne correspondent pas."                                                                                         |
| Nom de l'entreprise                                  | text                                                                   | Required, 2–100 chars                                                                                     | "Merci d'indiquer le nom de votre entreprise."                                                                                    |
| Type d'activité                                      | select (plomberie / électricité / vacuum central / maçonnerie / autre) | Required                                                                                                  | "Merci de sélectionner votre activité."                                                                                           |
| J'accepte les CGU et la politique de confidentialité | checkbox                                                               | Must be checked                                                                                           | "Merci d'accepter les conditions d'utilisation."                                                                                  |

**Primary actions**:

- "Créer mon compte" → submits, disables button + shows inline spinner, calls `auth.signUp` (Doc 01 §1.3.3) then creates `profiles`/`organizations`/`organization_members` in one transaction → routes to §3.4 "Check your email."
- "J'ai déjà un compte ?" → Login (§3.6).

**States**:

- Idle / filling.
- Submitting (button disabled, spinner, all fields disabled to prevent double-submit).
- Server error (network, or unexpected 500) → inline banner: "Une erreur est survenue. Réessayez." with fields preserved, not cleared.
- Field-level validation errors shown inline, on blur and on submit attempt.

**Edge cases**:

- Email already registered but unverified → same collision message as above (don't reveal password-based details, just route toward login/verification).
- User backgrounds the app mid-fill → form state persisted in memory for the session, not across app restarts (no draft persistence to avoid storing a partially-typed password anywhere durable).
- Slow/offline network on submit → "Vérifiez votre connexion et réessayez," button re-enabled.

---

## 3.4 Check your email (verification interstitial)

**Purpose**: hold the user in a known state between account creation and full access, per Doc 01 §1.3.3's soft-gate.

**Entry points**: immediately after Sign Up submit; also reachable any time from Home if `email_verified_at` is still NULL (persistent banner, §3.14).

**Layout & elements**: illustration, headline "Vérifiez votre boîte mail," body text with the submitted email address, "Renvoyer l'e-mail" text button (rate-limited), "Continuer sans vérifier" text button (routes into a read-only Home state), "Modifier l'adresse e-mail" link (routes back to a minimal edit-email flow).

**Primary actions**:

- "Renvoyer l'e-mail" → resend, disabled for 60 seconds after each tap with a visible countdown, capped at 5 resends/hour.
- "Continuer sans vérifier" → Home, but write actions (create project, invite worker, etc.) are blocked with a bottom-sheet prompt to verify first.

**Copy**: "Nous avons envoyé un lien de confirmation à **{{email}}**. Cliquez sur le lien pour activer toutes les fonctionnalités."

**Edge cases**: verification link clicked on a different device than the one mid-onboarding → the original app instance polls session state on foreground and transitions automatically once verified, no manual refresh needed.

---

## 3.5 Log In

**Purpose**: return-user entry point.

**Entry points**: Welcome carousel, Sign Up screen's "J'ai déjà un compte" link, forced logout (session revoked, e.g. after password reset).

**Layout & elements**: logo, email field, password field with show/hide toggle, "Mot de passe oublié ?" link right-aligned under the password field, primary "Se connecter" button, "Pas de compte ? Créer un compte" link at bottom, biometric-login button (Face ID/Touch ID icon) shown only if biometric was previously enabled on this device.

**Fields & validation**:

| Field        | Type     | Rules    | Error copy                            |
| ------------ | -------- | -------- | ------------------------------------- |
| Email        | email    | Required | "Merci de saisir votre e-mail."       |
| Mot de passe | password | Required | "Merci de saisir votre mot de passe." |

**Primary actions**:

- "Se connecter" → auth attempt → success routes per §3.1's session logic; failure shows a single generic error (never "wrong password" specifically, to avoid account enumeration): "E-mail ou mot de passe incorrect."
- Biometric icon → device biometric prompt → on success, retrieves the stored refresh token and logs in without re-typing credentials.
- "Mot de passe oublié ?" → §3.6.

**States**: idle, submitting, locked-out (after 5 failed attempts/hour, per Doc 01 §1.3.8) — shows "Compte temporairement bloqué. Réessayez dans {{minutes}} min ou réinitialisez votre mot de passe," with a direct link to §3.6.

**Edge cases**: unverified account logging in successfully still routes to Home in the soft-gated state (§3.4), not blocked entirely.

**Org-completion redirect (added alongside the §3.22.2a wizard rework)**:
since Sign Up (§3.3) stays intentionally minimal (nom de l'entreprise +
type d'activité only — no logo, no legal/public-profile fields), a fresh
account's active organization is usually incomplete on first login. Right
after a successful `signInWithPassword` — and only when there's no
explicit `next` destination already requested (e.g. an org-invite deep
link) — the app checks the active org's completion using the same
5-field signal (logo, forme juridique, taille de l'équipe, zone
d'intervention, matricule fiscal) and the same `org_checklist_dismissed_at`
flag §3.22.2's completion banner already uses. If incomplete and not
dismissed, login routes into §3.22.2a's wizard (starting at its step 2,
pre-populated for the existing org) instead of Home. This is why the
wizard's sign-up-time confirmation-link path was never built: a mobile
sign-up's confirmation e-mail always opens `apps/web`'s browser-based
`/auth/confirm`, not a deep link back into this app, so the reliable place
to catch "first time this org is really being looked at" is this screen,
not the e-mail-confirmation moment.

---

## 3.6 Forgot Password

**Purpose**: initiate a password reset.

**Entry points**: Login screen's "Mot de passe oublié ?" link.

**Layout & elements**: headline "Réinitialiser votre mot de passe," email field, primary "Envoyer le lien" button, "Retour à la connexion" text link.

**Fields & validation**: Email — required, format-checked only (no existence check surfaced to the user, per Doc 01 §1.3.7's anti-enumeration rule).

**Primary actions**: "Envoyer le lien" → always shows the same confirmation regardless of account existence: "Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé."

**States**: idle, submitting, confirmation (replaces the form with a checkmark illustration + the message above + "Retour à la connexion").

**Edge cases**: rate-limited at 3 requests/hour/email — a 4th attempt within the window still shows the same neutral confirmation copy (never reveals the rate limit itself, to avoid leaking account existence via timing/limit differences).

---

## 3.7 Reset Password

**Purpose**: complete a password reset from the emailed link.

**Entry points**: deep link from the reset email only; direct navigation without a valid token shows an error state, not a blank form.

**Layout & elements**: headline "Choisissez un nouveau mot de passe," new-password field with strength meter (same component as Sign Up), confirm field, primary "Réinitialiser" button.

**Fields & validation**: same rules as Sign Up's password field (min 10 chars, strength meter, confirm-match).

**Primary actions**: "Réinitialiser" → on success, all existing sessions for the account are revoked server-side, user is routed to Login with a success banner: "Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe."

**Edge cases**:

- Expired token (>1 hour old) → "Ce lien a expiré. Demandez-en un nouveau." with a direct link back to §3.6.
- Already-used token → same expired-state copy (tokens are single-use).

---

## 3.8 Worker: Accept Invitation / Set Password

**Purpose**: the worker-specific onboarding path — replaces the old
single-tap magic-link acceptance (Doc 01 §1.3.4). Every worker has a
confirmed email address (Doc 00 §0.5 item 10), so this uses the exact
same email + password mechanism as the contractor flow — no separate
phone-based provider, no dual-auth-path complexity.

**Entry points**: invite sent to the worker's email (primary), with a
WhatsApp/SMS message containing the same link as a convenience
notification channel — the link itself always resolves to this
email-based flow regardless of which channel it arrived through.

**Layout & elements**: headline "Bienvenue chez {{Org Name}}," worker's name and email pre-filled and **read-only** (identity already established by the invite), new-password field with strength meter, confirm field, primary "Activer mon compte" button.

**Fields & validation**: password field only — same min-10-char rule as contractor sign-up, but framed with simpler copy given the target user may be less comfortable with forms: "Choisissez un mot de passe d'au moins 10 caractères."

**Primary actions**: "Activer mon compte" → creates `auth.users` + `profiles`, sets `workers.user_id`, marks `worker_invitations.status = 'accepted'` → routes directly to Worker Home (§4.1), no separate email-verification gate (Doc 01 §1.3.4's rationale: the invite channel is itself the identity proof).

**Edge cases**:

- Expired invite token (>7 days) → "Cette invitation a expiré. Demandez à votre responsable de vous en envoyer une nouvelle."
- Worker already has an account (re-clicked an old invite) → routes straight to Login pre-filled with their phone/email.

---

# 3.x Contractor Core App (Mobile)

## 3.9 Home / Dashboard

**Purpose**: single-glance status of the business — the "3 taps to
anything" hub (Doc 00 §0.6).

**Entry points**: bottom nav tab (always first/leftmost), post-login default route.

**Layout & elements**: top greeting ("Bonjour, {{first name}}"), unverified-email banner if applicable (§3.4), dismissible "Complétez votre profil"/"Complétez le profil de votre entreprise" checklist card (Doc 01 §1.3.12–1.3.13 — avatar, notifications, org logo, matricule fiscal; optional and permanently dismissible except the org-tax-field prompt which resurfaces only when blocking an invoice/report), today's dispatch summary card (vans out / total, tap → Dispatch §3.11), weekly cash snapshot card (advances given this week, tap → Advances §3.13), active projects carousel (tap a card → Project Detail §3.10.2), recent activity feed (site log updates, material requests pending approval), FAB for "Nouveau dispatch."

**States**: empty state for a brand-new org with zero projects — illustration + "Créez votre premier chantier" primary CTA straight into Project Create (§3.10.3).

**Edge cases**: users belonging to more than one organization — whether as owner of several or a member/trade-participant of others (Doc 01 §1.3.13) — see an org switcher pinned under the greeting; switching orgs re-scopes every card on the dashboard and updates `profiles.active_org_id`. Arriving here straight from §3.22.2a's org-creation/completion wizard (any of its three exit paths — Terminer, its own Passer, or "Terminer plus tard") suppresses that first-run `OnboardingChecklist` card for this one load only, so a brand-new org isn't nudged by the wizard and this card back to back; nothing is dismissed by this — the very next fresh visit (a later app open or login) shows the checklist normally if its own conditions are still unmet.

**Status (Phase 23):** built out for real, replacing the Phase-4 placeholder — see `dashboard.tsx`'s own header for the full reasoning. Shipped: hero/greeting card (first name from `profiles.full_name`), a dispatch-today summary tile (vans-out / total, tap-through to Dispatch), plus an unrequested-but-low-risk plain nav row to Advances (disclosed as an addition beyond this phase's stated scope, not a stat tile — no live weekly total). Org-switcher pill and the "Chantiers" entry row are unchanged from Phase 4/6. **Cut, each for a stated reason**: the activity feed has no backing data source — `audit_log` (migration 0009) has RLS enabled with zero client-facing policies, by explicit original design ("never queried directly by mobile/web clients"); this is a real product gap (needs a new policy or a purpose-built feed table/view), not invented silently. The weekly-cash stat (a real number, not just a nav link), profile-completion checklist card, unverified-email banner, active-projects carousel, empty state, and FAB are all real §3.9 elements not yet built — genuinely still the Phase-4/6 placeholder for those specific pieces, scoped out to keep this pass bounded to what Phase 23's brief named. Dispatch-today reads Supabase directly rather than the WatermelonDB `dispatch_assignments` collection, matching `dispatch.tsx`'s own established read pattern and avoiding a first-screen dependency on native WatermelonDB linking, which has never been verified working on a real build (Item 2b, every phase since 18).

---

## 3.9a Vue d'ensemble (cross-org rollup)

**Purpose**: a combined glance across every organization the user _owns_ — only shown/reachable when the account owns 2+ orgs (Doc 01 §1.17).

**Entry points**: pinned item in the org switcher (§3.22.2a), above the individual org list.

**Layout & elements**: one card per owned org, each showing the same tile set as that org's own Home (active project count, this week's advances total, tomorrow's dispatch-planned status, pending request counts), with a "Voir le détail" link routing into that org's full Home (§3.9) with the switcher set to it. A top summary line sums the per-org numbers for display only ("950 TND en avances cette semaine, toutes entreprises confondues") — computed by adding two independently-fetched numbers client-side, never by a query that reads both orgs' data in one request (Doc 01 §1.17.2).

**States**: not shown at all (no nav entry, no switcher row) for an account that owns only one org — this screen doesn't exist as an empty state, it simply isn't reachable.

**Edge cases**: orgs where the user is a member/trade-participant but not owner are excluded from this view (Doc 01 §1.17.3) — it's specifically an owned-businesses rollup, not a general "everywhere I have access" view.

---

## 3.10 Projects

### 3.10.1 Projects list

**Purpose**: all chantiers the org owns or has been invited onto.
**Layout**: filter chips (Tous / Actifs / Terminés / Invités), search bar, card list — each card shows project name, client name, progress %, budget-consumed bar, lead-org badge if it's a project this org was invited onto rather than owns.
**Primary action**: FAB "Nouveau chantier" → §3.10.3. Tap a card → §3.10.2.
**Empty state**: "Aucun chantier pour le moment" + CTA, `under-construction` illustration (Doc 05 §1.5 — every empty state in the app follows this illustration+headline+CTA pattern via the shared `EmptyState` component; not re-specified screen by screen below where it wasn't already called out).

### 3.10.2 Project detail

**Purpose**: hub for everything scoped to one chantier.
**Layout**: header (name, client, address, progress ring), tab bar (Aperçu / Dispatch / Dépenses / Matériaux / Journal / Sécurité / Équipe), each tab deep-links into the relevant module pre-filtered to this project.
**Edge cases**: for a project this org is a trade participant on (not the lead), the Private-layer tabs (payroll-adjacent data) are hidden per the visibility model (Doc 02 §2.8) — not shown-then-blocked, simply absent from the tab bar.

**Status (Phase 10)**: `project/[id].tsx` shipped as the real hub, replacing the lightweight sheet stand-in Phases 7-9 used. Aperçu, Dépenses, and Journal are genuine pre-filtered tabs (expenses.tsx/journal.tsx now accept a `project_id` deep-link param). Dispatch, Matériaux, and Sécurité are still plain unfiltered links pending their own retrofit. Équipe isn't linked — which workers count as "this project's team" isn't answered by this section as written (dispatch assignments? a new membership concept?), so it wasn't invented. No progress ring — no milestones/tasks data model exists anywhere in this schema; still explicitly out of scope until that's a real decision, not a side effect of this phase.

**Status (Phase 11)**: Dispatch is now a genuine pre-filtered tab too (`dispatch.tsx` accepts a `project_id` deep-link param, filtering the assignment list and auto-setting `project_id` on new assignments). Visible to lead and trade-participant orgs alike — see `project/[id].tsx`'s own header for the Shared-layer reasoning, flagged as an interpretation the same way Journal's was in Phase 10. The mobile Dispatch screen has no "week" concept (it's a single-date view with a rolling date strip, deliberately not a port of the web weekly grid — see dispatch.tsx's own header); the project-scoped tab keeps that same date-strip navigation rather than introducing a week-grid that doesn't exist anywhere else in the app. A `completed`/`archived` project's Dispatch tab is read-only (historical assignments visible, no new ones, no edits). Matériaux and Sécurité remain unfiltered — both are deliberately org-wide by an earlier phase's own design decision (see each file's header), and folding them into this hub reverses that decision rather than retrofitting a filter, so it wasn't done without that being revisited explicitly.

**Équipe — schema decision resolved, not yet built (post-Phase 11 planning).** "Which workers count as this project's team" is now answered: an explicit, durable roster (`project_workers`, migration `0034_project_workers.sql`), not a computed view over dispatch history — dispatch is scheduling, this is staffing, and the two answer different questions (a worker on leave for a few days shouldn't vanish from "the team"; workshop-prep work with zero dispatch assignments should still count). Auto-seeded from dispatch assignments (a worker dispatched to a project is added to that project's roster automatically, reactivating if previously removed), also directly manageable. Visibility is per-org, same as dispatch_assignments/project_expenses — a trade org sees only its own roster entries on a shared project, never the lead org's. See the migration's own header for the full RLS design and two things deliberately left open at the time: whether to also close a pre-existing gap in `dispatch_assignments` (its write policy didn't check project membership at all, only org role), and the Équipe screen itself (roster list, add/remove UI) — schema was ready, the mobile screen was not yet built.

**Status (Phase 12):** both of those are now closed. The `dispatch_assignments` gap is closed by migration `0035_dispatch_assignments_project_participation.sql` (INSERT/UPDATE now require real project participation whenever `project_id` is non-null; DELETE deliberately stays ungated). Closing it surfaced a more severe, related bug in 0034 itself — its original roster-write policy and auto-seed trigger both gated on `is_project_member()` alone, which only ever matches trade/client participants (no path anywhere creates a lead-role `project_memberships` row), so it would have silently blocked every roster write on a single-org project, the common case, not the exception. Fixed in place with a new `is_project_participant()` helper (lead OR trade — the same predicate `projects`' own SELECT policy already uses); see Doc 00 §0.5 decisions #23 (corrected) and #24. The Équipe screen itself is now built — `project-roster.tsx`, deep-linked as `?project_id=` like Dispatch/Dépenses/Journal, deliberately not named `equipe.tsx`/`team.tsx` to avoid colliding with the pre-existing org-wide `team.tsx`. Visible to lead AND trade-participant orgs, same interpretation as Dispatch. Full add/remove CRUD, not a read-only first cut — add opens a searchable picker scoped to the org's own active workers (never another org's, never a worker already active on the roster); remove is a soft-delete (`removed_at`/`removed_by`), never a hard delete. Deliberately no archived/completed-project read-only lock (unlike Dispatch's) — nothing in this section says staffing history should freeze on archival, unlike Dispatch's "no new assignments on a finished project," so it wasn't invented; worth revisiting if that's wrong.

**Status (Phase 13):** the archived-lock question above is now resolved rather than left open — see Doc 00 §0.5 decision #26. Staffing DOES freeze once a project is archived/completed, same reasoning and same `readOnly`-flag pattern as Dispatch's own Phase-11 retrofit: a roster is a record of who actually worked a finished job, and letting it keep changing after the job closes creates the same "which version is authoritative" ambiguity Dispatch's retrofit exists to avoid. `project-roster.tsx` now fetches the project's `status` and folds `status === 'active'` into the same `canWrite` flag that already gates the FAB and "Retirer" on role — existing roster rows stay fully visible either way. Disclosed plainly, not glossed over: like Dispatch's own lock, this was client-side only at the time — no RLS policy on `project_workers` checked project status, so this carried forward a pre-existing gap rather than introducing an inconsistency by fixing it on only one screen.

**Status (Phase 14):** that gap is now closed, for both Dispatch and Équipe together — see Doc 00 §0.5 decision #28. Migration `0038_archived_project_write_freeze.sql` adds an `is_project_active()` RLS predicate and requires it on `project_workers`'s INSERT/UPDATE policies (covering both "add a worker" and "remove a worker," since removal is itself an UPDATE setting `removed_at`) and on `dispatch_assignments`'s existing (0035) INSERT/UPDATE policies whenever `project_id` is non-null. The client-side `canWrite`/`readOnly` flags on both screens are unchanged and still correct — they were never wrong, just not backed by a server-side guarantee. DELETE stays ungated on both tables, same reasoning 0035 already established for project-participation: this app never issues a hard delete against either table today, and losing write access to a stale/archived project shouldn't strand an org's own existing rows.

**Status (Phase 23):** Matériaux and Sécurité remain plain, unfiltered, org-wide links — explicitly reaffirmed, not silently left alone. See Doc 00 §0.5 decision #36: both screens' own header comments correctly cite §3.15/§3.17 as flat, org-wide-by-design, unlike the four tabs that got the `?project_id=` retrofit. Progress %/ring tracking also remains explicitly out of scope — see decision #37 — still blocked on no milestones/tasks data model existing, and this phase made no product decision about what that model should be, so none was invented. Aperçu tab unchanged.

**Fields & validation**:

| Field           | Type                            | Rules                                    |
| --------------- | ------------------------------- | ---------------------------------------- |
| Nom du chantier | text                            | Required, 2–100 chars                    |
| Client          | text or link to existing client | Required                                 |
| Adresse         | text + map pin                  | Required                                 |
| Date de début   | date picker                     | Required, cannot be >2 years in the past |
| Budget total    | numeric, TND                    | Optional, must be ≥0                     |
| Type de projet  | select                          | Required                                 |

**Primary action**: "Enregistrer" → validates → writes → routes to Project Detail.

### 3.10.3a Dépenses (project expense ledger)

**Purpose**: the "Dépenses" tab's content — closes the previously-undefined budget-consumed gap (Doc 01 §1.14).

**Layout**: consumed-% bar at top (same visual as the project card, §3.10.1), reverse-chronological expense list (category icon, amount, description, date), FAB "Nouvelle dépense."

**Fields & validation (new expense)**:

| Field         | Type                                              | Rules                                                          | Error copy                                |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Catégorie     | select (Matériaux/Carburant/Sous-traitance/Autre) | Required                                                       | "Merci de sélectionner une catégorie."    |
| Montant (TND) | numeric                                           | Required, >0                                                   | "Merci d'indiquer un montant valide."     |
| Description   | text                                              | Optional, max 200 chars                                        | —                                         |
| Reçu          | photo                                             | Optional, same compression pipeline as site logs (Doc 02 §2.5) | —                                         |
| Date          | date picker                                       | Defaults to today, cannot be in the future                     | "La date ne peut pas être dans le futur." |

**Primary action**: "Enregistrer" → writes a `project_expenses` row → returns to the list, consumed-% bar updates immediately.

**Permissions**: Owner/Manager can add/edit/delete; Viewer sees the list and the bar but no "Nouvelle dépense" FAB (Doc 01 §1.4).

---

## 3.11 Dispatch board

**Purpose**: weekly assignment planning (Doc 02 §2.2).

**Layout & elements**: date-range header with "Aujourd'hui" quick-jump, weekly grid (rows = vehicles, columns = days), tap an empty cell → assign-worker bottom sheet, tap a filled cell → edit/remove assignment, "Copier semaine précédente" button top-right, conflict warnings shown as red cell borders with a tap-to-see-detail tooltip.

**Assign-worker bottom sheet fields**: Véhicule (pre-filled from tapped cell), Ouvriers (multi-select, capped at vehicle capacity), Chantier de destination, Heure de départ, Outils à apporter (free text), send-via toggle (App notification / WhatsApp — auto-detected per worker based on account status).

**Primary actions**: "Envoyer" → runs conflict detection (Doc 02 §2.2) → if clean, sends; if conflicts, shows a blocking modal listing each conflict with an "Ignorer et envoyer quand même" override per conflict.

**States**: empty week (no assignments yet) shows the "Copier semaine précédente" CTA prominently since ~70% of weeks repeat.

**Offline conflict handling (Doc 01 §1.9)**: this is the highest write-
contention screen in the app, so it's the primary consumer of the
version-column conflict policy. If a contractor edits a dispatch cell
while offline and, on reconnect, the server finds that cell was changed
by someone else in the meantime, the local edit is **not** silently
overwritten and does **not** silently win — the cell shows a small
"Modifié ailleurs" badge, the local (unsynced) version is preserved in
a "Vos changements" side-by-side compare sheet, and the contractor
explicitly picks "Garder ma version" or "Utiliser la version du
serveur" before the write completes. This is the one place in the app
where an automatic merge is deliberately avoided — a wrong automatic
guess here means the wrong worker gets sent to the wrong site.

---

## 3.12 Vehicles

**List**: card per vehicle (name/plate, status badge, assigned driver). **Detail/Add**: fields — Nom/Plaque (required), Capacité (required, integer ≥1), Statut (Disponible/En service/Maintenance), Chauffeur assigné (optional, worker picker). Marking a vehicle "Maintenance" removes it from the dispatch board's assignable list and triggers the conflict-detection rule if it was already scheduled.

---

## 3.13 Worker roster & invitations

### 3.13.1 Worker list

Card per worker: name, trade, status badge (Actif/Invitation en attente/Inactif), tap → detail.

### 3.13.2 Add / invite worker

**Fields & validation**:

| Field                 | Type                                              | Rules                                                                                                  | Error copy                                    |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Nom complet           | text                                              | Required                                                                                               | "Merci d'indiquer le nom du travailleur."     |
| Email                 | email                                             | Required — this is the account identity and primary invite channel                                     | "Merci d'indiquer une adresse e-mail valide." |
| Téléphone             | tel                                               | Required — used for the WhatsApp/SMS notification convenience copy, not for auth                       | "Numéro de téléphone requis."                 |
| Métier                | text/select                                       | Optional                                                                                               | —                                             |
| Taux journalier (TND) | numeric                                           | Required, >0                                                                                           | "Merci d'indiquer un taux journalier valide." |
| Canal de notification | select: WhatsApp / SMS / aucun (email uniquement) | The invite link is always emailed; this only controls whether a courtesy heads-up message is also sent | —                                             |

**Primary action**: "Envoyer l'invitation" → creates `workers` + `worker_invitations` rows, dispatches via chosen channel → worker lands on §3.8 when they open the link.

**Edge cases**: re-sending an expired invite updates the existing `worker_invitations` row (Doc 01 §1.2) rather than creating a duplicate.

---

## 3.14 Advances & payroll (contractor)

**Weekly view**: per-worker card — gross this cycle, advances given, net owed, "Marquer comme payé" button. Running total banner at top. FAB "Nouvelle avance" opens a quick-tap chip flow: worker picker → amount chips (20/50/100/custom TND) → optional reason → confirm, targeting under 5 seconds end-to-end.

**Idempotency (Doc 01 §1.11)**: both "Marquer comme payé" and the
advance-confirm button generate a client-side idempotency key the
instant the button is tapped, disable themselves immediately, and
attach that key to the request. A double-tap, a retried request after
a timeout, or a background sync replay all resolve to the same single
financial write — the server returns the original result rather than
processing the action twice. This is non-negotiable for this specific
screen, since it's the highest-consequence tap target in the app.

**Fields & validation (custom amount)**: numeric, TND, required if "custom" chip selected, must be >0 and ≤ the worker's estimated remaining net (soft warning, not a hard block, if it exceeds — some contractors intentionally advance beyond net).

**Cycle detail**: day-by-day breakdown table, PDF export button.

---

## 3.15 Materials (contractor)

**List**: pending requests badge count, filter (En attente/Approuvé/Refusé). **Request detail**: item, quantity, urgency, requesting worker, note. Actions: Approuver / Refuser (requires a reason, min 3 chars) / Réassigner (worker picker).

---

## 3.16 Site logs

**Timeline**: reverse-chronological feed per project, photo/voice/text entries, tap for full-screen with caption and metadata (worker, timestamp, GPS-stripped location tag if captured).

---

## 3.17 Safety & insurance

**Safety incident list/detail**: date, location, description, photos, severity (select: Mineur/Modéré/Grave), involved worker multi-select. PDF export.
**Insurance tracker list/detail**: policy number, provider, coverage type, expiry date (date picker, required), auto-reminder 30 days before expiry (toggle, on by default).

---

## 3.18 Client portal management

**Per-project settings screen**: "Générer un lien client" button, toggle "Protéger par code PIN," 4-digit PIN field (numeric only, validated live) shown only if the toggle is on, "Réinitialiser le PIN du client" button (contractor-only self-service, per Doc 02 §2.7 — no client-side reset exists).

---

## 3.19 Multi-org collaboration

**Invite a trade org**: fields — Nom de l'entreprise ou téléphone/email, Métier requis, message optionnel. On send, if the invited org doesn't exist yet, the invite doubles as a sign-up entry point (routes the recipient into §3.3 with organization context pre-filled).

**Accept invitation (recipient side)**: shows the lead org's name, the project name, and the two opt-in toggles from Doc 02 §2.8 — "Partager mon budget consommé" (default off) and report-branding opt-out — before the final "Rejoindre le chantier" confirm.

**Fellow-collaborator identity (org-creation-guide follow-on)**: both of this screen's lists — the trade orgs invited onto a project I lead, and the lead org of a project I'm a trade participant on — render each other's identity via a compact `OrgIdentityRow` (logo, name, trade_type/legal_form subtitle, a verified checkmark if `verification_status = 'verified'`) rather than a bare name string. Tapping it opens a read-only detail sheet adding `service_area`/`address` if set. This closes a real bug: neither list could actually display the other org's name before this — `organizations`' only SELECT policy (`organizations_select_member`) only covers same-org membership, so a fellow collaborator's row silently failed to load and fell back to "—". Fixed via a new, narrow, purpose-built RPC (`get_shared_project_org_summaries`, migration 0078) that returns only a safe, non-sensitive subset — never `matricule_fiscal`/`rc_number`/RIB — rather than widening `organizations`' own RLS to expose the whole row to anyone sharing a project. The RPC also resolves the logo to an already-signed URL server-side, since cross-org logo access has no client-reachable path either (`org-files` storage RLS only covers same-org participants or specifically-shared site-log files).

**Not yet done, flagged not silently skipped**: ~~`accept-org-invite.tsx` (the pre-signup invite-acceptance screen) still shows only the lead org's bare name — extending it the same way needs a separate decision first, since that screen is reachable by an anonymous, no-account-yet visitor, and widening its backing RPC (`get_project_invitation_by_token`, anon-grantable) to expose logo/legal_form is a different, more sensitive exposure question than an already-authenticated in-app screen like this one.~~ **Done** — Hazem decided this screen should show the full identity (name/logo/trade_type/legal_form/verification badge), same as `collaboration.tsx`. `get_project_invitation_by_token` (migration 0024) widened in migration 0079 with new `lead_org_*`-prefixed keys (kept separate from the pre-existing `trade_type` key, which is the invite's own required trade, not the lead org's) — still never exposes `matricule_fiscal`/`rc_number`/RIB.

---

## 3.20 Reports & exports

List of exportable reports (Rapport de progression, Résumé de paie, Déclaration CNSS, Résumé de sécurité), each with a date-range picker and "Générer PDF" / "Exporter Excel" buttons.

---

## 3.21 Billing & subscription

Current plan card, usage bar (storage, per Doc 01 §1.6's quota), "Passer à Pro" CTA, payment method (Konnect), invoice history list.

---

## 3.22 Settings & account

**Top-level layout**: sectioned list — Profil, Organisation, Sécurité,
Notifications, Langue, Membres de l'équipe, Facturation, Déconnexion,
Supprimer mon compte. Each row routes to its own sub-screen except
Déconnexion (immediate action with a confirm dialog).

### 3.22.1 Profile (edit)

**Purpose**: the "later updates" surface for everything §1.3.12
deferred out of sign-up.

**Layout**: avatar (tap to change — opens camera/gallery picker →
in-app square crop tool → uploads), then a plain field list below.

**Fields & validation**:

| Field       | Type                              | Rules                                                      | Behavior on change                                                                                                                                                                                                                                            |
| ----------- | --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avatar      | image                             | Square crop enforced client-side, max 512×512 after resize | Uploads immediately on crop-confirm, no separate "save" needed — matches the low-friction pattern of everything else in §1.3.12.                                                                                                                              |
| Nom complet | text                              | Required, 2–80 chars                                       | Saves inline on blur.                                                                                                                                                                                                                                         |
| Téléphone   | tel                               | Required, TN format                                        | Does **not** save inline — opens a 6-digit SMS code confirmation sheet (§1.3.12) before the new number takes effect; the old number stays active until confirmed.                                                                                             |
| Email       | email                             | Required, valid format                                     | Does **not** save inline — shows "Un e-mail de confirmation a été envoyé à {{new email}} et à {{old email}}. Le changement prendra effet une fois confirmé." The field itself reverts to showing the old (still-active) email until the new one is confirmed. |
| Langue      | select (Français/العربية/English) | —                                                          | Applies immediately, no confirmation needed.                                                                                                                                                                                                                  |

**Copy for phone re-verification sheet**: "Confirmez votre nouveau
numéro. Un code à 6 chiffres a été envoyé par SMS." — 5-minute expiry,
"Renvoyer le code" after 60s.

**Edge cases**: changing email while a prior email-change confirmation is still pending replaces the pending request (only one in flight at a time) — the sheet copy updates to reflect the newest target address.

### 3.22.2 Organization (edit) — owner/manager only, some fields owner-only

**Purpose**: the "later updates" surface for the deferred `organizations` fields from §1.3.13.

**Layout**: logo (tap to change, same crop pipeline as avatar but no forced square — logos vary in aspect ratio, cropped to a max 3:1 bounding box), then field list, with legal/tax fields visually grouped under a separate "Informations légales" subheading and a small lock icon next to each — visible to Managers as read-only, editable only for Owners.

**Fields & validation**:

| Field                | Type   | Rules                                                                                                                                        | Who can edit   |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Logo                 | image  | Max 3:1 aspect box, transparent PNG recommended (copy hint shown), stored full-res for print-quality report exports                          | Owner, Manager |
| Nom de l'entreprise  | text   | Required, 2–100 chars                                                                                                                        | Owner, Manager |
| Type d'activité      | select | Required                                                                                                                                     | Owner, Manager |
| Adresse              | text   | Optional                                                                                                                                     | Owner, Manager |
| Téléphone de contact | tel    | Optional                                                                                                                                     | Owner, Manager |
| Email de contact     | email  | Optional — this is the org's public contact address shown on client-facing reports, distinct from any individual member's login email        | Owner, Manager |
| Matricule fiscal     | text   | Optional for now (Doc 01 §1.3.13 — exact format validation pending accountant/lawyer review), but flagged with a "Requis pour facturer" hint | **Owner only** |
| Numéro RC            | text   | Optional for now, same caveat                                                                                                                | **Owner only** |

**Blocking prompt (only place this screen ever blocks anything)**: if
an owner navigates here _from_ a blocked invoice/report-generation
attempt (§1.3.13), the Matricule Fiscal and Logo fields are
highlighted with a banner: "Ces informations sont nécessaires pour
générer des documents officiels."

### 3.22.2a Org switcher & "Create organization"

**Purpose**: the entry point for both switching between orgs and
creating a new one — reached by tapping the org name/switcher control
that's pinned under the Home greeting (§3.9) and also present at the
top of Settings.

**Layout**: bottom sheet listing every organization the user belongs
to — grouped into "Mes entreprises" (orgs where they're `owner`) and
"Autres organisations" (orgs where they're a member with another role,
or a trade participant via project membership) — each row showing the
org's logo/initial, name, and the user's role badge in that org. The
currently-active org has a checkmark. A pinned row at the bottom: "+
Créer une nouvelle entreprise."

**Bug fix (found while building the collaboration-screen org-identity
work)**: each row's logo — and the small logo shown next to the org name
under the Home greeting (§3.9) — was rendering broken/blank for every org,
including the user's own, regardless of any permission question. `logo_url`
is a private-bucket storage PATH, not a fetchable URL, and both this sheet
and the dashboard's header avatar were passing it straight to `Avatar`
with no signing step at all — not an RLS gap (the user has full read
rights to their own org's logo), just a missing line of code, in contrast
to `organization-settings.tsx`, which already signed it correctly. Fixed
by resolving every org's logo through the same batched `getSignedUrlMap`
pattern already used elsewhere on the dashboard for worker/project photos.

**"Create organization" form — 4-step wizard** (superseded from the
original single-screen `name` + `trade_type` form; this same screen also
serves as the completion wizard §3.5's post-login redirect sends an
existing, incomplete org into, starting at step 2 in that case):

| Step | Title                | Fields                                                                                                    | RPC called on Continuer/Passer                                                                                                     |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Essentials           | Nom de l'entreprise (required, 2–100 chars), Type d'activité (optional — picker with free-text "Autre")   | `create_organization_for_current_user` — skipped entirely when arriving via the redirect (org already exists)                      |
| 2    | Coordonnées          | Adresse, Téléphone de contact, E-mail de contact, Logo (upload starts here — needs a real `org_id`)       | `update_organization_profile` (resends the full accumulated state so far)                                                          |
| 3    | Informations légales | Forme juridique (chip row: Personne physique / SARL / SUARL / SA), Matricule fiscal, Registre de commerce | `update_organization_profile` again (now including matricule/RC) + `update_organization_extended_profile` (legal_form only so far) |
| 4    | Profil public        | Taille de l'équipe (chip row: 1 / 2–10 / 11–50 / 51+), Zone d'intervention, Facebook, Instagram, Site web | `update_organization_extended_profile` (everything)                                                                                |

Every step but the first has a "Passer" (skip) button beside "Continuer" —
steps 2–4 are all optional, matching the DB's own nullability (§1.1 of the
org-creation guide this wizard was built from — only `name` is NOT NULL).
A step dot indicator (not a field-count progress bar, since skipping is
expected and normal) shows "Étape X sur 4." A "Terminer plus tard" text
link is available from step 2 onward, routing straight to Home/Dashboard
without forcing the rest of the wizard. Every exit path (Terminer, this
screen's own Passer, and "Terminer plus tard") routes to Home with a
one-time `from_wizard` marker — see §3.9's edge cases — so the dashboard's
own `OnboardingChecklist` card doesn't nudge the person a second time in
the same breath.

**RIB is never collected on this screen** — it remains exclusively
§3.22.2's "Ajouter un RIB" flow, owner-only.

**Save-as-you-go**: each step's RPC call resends the FULL accumulated
wizard state (not just that step's new fields) — mirrors §3.22.2's own
handleSave/handleSaveExtended pattern. This means abandoning the wizard at
any point after step 1 (including via "Terminer plus tard" or backing out
of the app) leaves a usable org with everything typed so far actually
saved, not just whatever the last-completed step's RPC happened to cover.

**Primary action** (final step): "Terminer" → persists step 4's fields,
sets the org as the new `active_org_id` (create mode only), and routes to
Home. For a brand-new org this still lands on Home's empty state (§3.9)
prompting "Créez votre premier chantier," exactly as before.

**Edge cases**: no cap on the number of orgs a user can create (Doc 01
§1.3.13) — the switcher sheet simply scrolls if the list grows long.
Switching orgs mid-task (e.g. mid-way through creating a dispatch
assignment) discards the in-progress unsaved form with a confirm dialog,
since the destination org's data (workers, vehicles) wouldn't be valid for
a form built against the source org anyway. Reopening this screen from the
switcher (`+ Créer une nouvelle entreprise`) always starts a fresh create
flow at step 1, never the completion mode — completion mode is only ever
reached via §3.5's login redirect, with an explicit org already targeted.

---

## 3.23 Security, notifications, team, billing (settings sub-screens)

**Sécurité**: change password (requires current password re-entry, same strength meter as sign-up), biometric toggle, active sessions list with per-session "Déconnecter" (Doc 01 §1.3.5's max-3-sessions list).

**Notifications**: push toggles per category (dispatch, advances, materials, safety).

**Membres de l'équipe**: two separate screens on two separate tables — the
worker roster (§3.13, `workers`) is unchanged; org-member (non-worker)
role-change/removal for existing members shipped in Phase 7
(`organization_members`); invite-by-email for a NEW org member (owner
only, role limited to manager/viewer — not owner) shipped in Phase 9 via
`organization_member_invitations` (migration 0030) — see
`docs/MOBILE_IMPLEMENTATION_STATUS.md`'s Phase 9 section for the accept-flow
design (three-way branch: already logged in / has an account / no
account). Phase 9 left actual e-mail delivery unwired (link had to be
shared manually); Phase 10 closed that gap via
`send-organization-invitation-email` (Resend, reusing the app's existing
provider — this was never blocked on an undecided provider the way the
worker-invite WhatsApp/SMS gap still is), plus resend and copy-link
actions per pending invitation as a fallback if delivery fails.

**Facturation**: → §3.21.

**Déconnexion**: immediate, confirm dialog.

**Supprimer mon compte**: double-confirm, explains data retention per Doc 01's org-deletion policy.

---

# 4. Worker Mobile App

The worker app is **three actions, everything else read-only** — this
principle is unchanged by the auth rework; only how the worker first
gets an account changed (§3.8).

## 4.1 Worker Home

**Purpose**: today's mission + the one button that matters.

**Layout & elements**: today's mission card (site name, address, vehicle, teammate(s), departure time, tools to bring), the primary action button (state machine below), a compact salary summary strip ("Cette semaine : 4 jours · 200 TND · Avance reçue : 50 TND · Net : 150 TND").

**Primary action button — state machine**:

1. **"Je suis parti"** (default state) → one tap → flips to state 2, updates the contractor's live dispatch board to "En route · {{time}}."
2. **"Je suis arrivé"** → one tap → flips to state 3, updates the live board to "Sur place · {{time}}."
3. **"Envoyer un update"** → opens Update Chantier (§4.2).

**Implemented**: the label+icon change between states is a cross-fade
(Doc 05 §1.4 `crossfade` token), never a hard instant swap. A light
confirm haptic fires on each successful departure/arrival write, an
error haptic on a failed one (Doc 05 §1.4a).

**States**: no assignment today → home shows "Aucune mission aujourd'hui" with the salary summary strip still visible (that part is never empty).

**Edge cases**: tapping "Je suis parti" with location services denied still succeeds (no GPS requirement for the check-in itself, per Doc 02's photo-metadata-stripping principle — location is never silently required).

---

## 4.2 Update chantier

**Purpose**: the worker's only content-creation surface.

**Fields**: Photo (camera or gallery, optional), Note vocale (record, optional, max 2 min), Note texte (optional, max 500 chars) — at least one of the three is required to submit.

**Photo pipeline (client-side, before upload — Doc 02 §2.5)**: any
photo taken or selected here is resized (longest edge capped at
1920px) and re-encoded (JPEG, ~80% quality) on-device immediately after
capture, before it ever touches the upload queue — the worker never
sees or waits on this step beyond a brief inline spinner, and offline
capture still compresses locally so the eventual sync upload is already
small. GPS/EXIF stripping (Doc 01 §1.3.11) happens in the same pass.

**Primary action**: "Envoyer" → writes to the project's site log (auto-creates today's log entry if none exists) → contractor sees it on the live board immediately (Realtime), using an idempotency key (Doc 01 §1.11) so a retried submit from a flaky connection never creates a duplicate log entry.

**Validation**: "Ajoutez au moins une photo, une note vocale ou un texte avant d'envoyer." if all three are empty.

---

## 4.3 Material request (worker)

**Fields & validation**:

| Field    | Type                   | Rules                   |
| -------- | ---------------------- | ----------------------- |
| Article  | text                   | Required                |
| Quantité | numeric                | Required, >0            |
| Urgence  | toggle (Normal/Urgent) | Defaults to Normal      |
| Note     | text                   | Optional, max 200 chars |

**Primary action**: "Envoyer la demande" → push notification to the contractor (§3.15) → status visible to the worker as En attente/Approuvé/Refusé on a small history list below the form.

---

## 4.4 Advance request (worker)

**Layout**: live balance display (gross so far, advances received, estimated net) above the form. **Fields**: Montant (numeric TND, required, >0), Raison (optional, max 200 chars). **Primary action**: "Demander une avance" → contractor approves in one tap (§3.14) → on approval, worker gets a push confirmation and the balance display updates.

---

## 4.5 Salary view (worker)

Day-by-day breakdown for the current cycle (Présent/Absent/Demi-journée with TND value each), gross, advances deducted, net owed, payment status badge. On the contractor marking the cycle paid, a push notification confirms and the status badge updates to "Payé."

---

## 4.6 Worker settings

Minimal: Profil (name read-only — set by the org, not self-editable, to prevent identity drift from the roster record; avatar is self-editable, same crop/resize pipeline as contractor profiles, Doc 01 §1.3.12), Téléphone (editable, triggers the same SMS re-verification code as the contractor flow, §3.22.1), Email (editable, same dual-confirmation flow as contractor accounts — workers are full `profiles` records with the same account-security rules, not a lesser account type), Sécurité (change password, biometric toggle), Langue, Déconnexion. No org/billing sections — those don't exist for a worker account.

---

## Post-v4.0 New & Changed Screens (Gap-Fix Roadmap)

_Added retroactively — screens and components built after this document's
v4.0 baseline that were never folded back into the sections above._

- **`analytics.tsx`** — new contractor screen: financial and operational
  charts (§ see Doc 02 addendum), each card wrapped in a shared
  `ChartCard.tsx`, capped at 10 bars per chart for readability.
- **`dispatch-week.tsx`** — a weekly calendar view of dispatch
  assignments, alongside the existing daily dispatch screen.
- **`vehicle/[id].tsx`** — new vehicle detail screen, reusing the same
  `WorkerHubTabs.tsx` two-tab pattern originally built for the worker
  detail screen (Infos / Maintenance-and-Documents). **Documents tab
  updated post-launch**: `vehicle_documents.document_url` (schema-ready
  since 0073, but uncollected) is now wired up via the same
  camera-or-library photo picker `vehicles.tsx` already uses for its own
  photo field — a photo/scan of the document, not a true PDF picker
  (`expo-document-picker` isn't a dependency here, same as the disclosed
  gap on `org_insurances.document_url` in `safety.tsx`). Saved documents
  show a signed thumbnail when a photo is attached; a plain note
  ("Aucune photo du document jointe") when not.
- **Worker "no site assigned" display bug fixed** —
  `(worker)/material-request.tsx` and `(worker)/update-chantier.tsx` both
  show a "Pour {site}" subtitle sourced from
  `dispatch_assignments... projects(name)`. Before migration 0080, the
  embedded `projects(name)` silently returned null for every worker
  session (`projects`' RLS only covered org/project members, not a
  worker's own auth user), so both screens fell back to "Aucun chantier
  assigné aujourd'hui" even on a day the worker WAS assigned a site — the
  opposite of the truth, not just a blank field. Fixed by an additive RLS
  policy (`projects_select_assigned_worker`, 0080); no changes were
  needed in either screen's own code.
- **`accept-invite.tsx` (worker invite) rebuilt for identity parity with
  `accept-org-invite.tsx`** — previously showed only bare text ("Bienvenue
  chez {orgName}"), no logo/trade_type/legal_form/verification badge,
  unlike the org-to-org invite screen sitting right next to it in the same
  auth-flow family, which got that treatment in `0079`. Migration `0082`
  widened `get_worker_invitation_by_token` to match, and this screen now
  renders `OrgIdentityRow` plus a small row of Facebook/Instagram/website
  links (same component, same link-row pattern as `collaboration.tsx`'s
  detail sheet and `accept-org-invite.tsx`). Flagged explicitly in `0082`'s
  own header as a parity judgment call, not a separately confirmed product
  decision — easy to revert to the bare-name version if that's the wrong
  call.
- **Worker detail screen** — rebuilt as `WorkerHubTabs.tsx`, a tabbed hub
  (Infos / Pointage / Avances / Dispatch) assembling logic already
  present in `pointage.tsx`/`advances.tsx`/`dispatch.tsx`, filtered to one
  worker, rather than a single flat screen.
- **`AttendanceHistory.tsx`** — calendar/list toggle view showing each
  attendance record's `source` (manual vs. dispatch check-in) and who
  recorded it, with same-day conflicting-record ("Corrigé") detection.
- **Unified `components/profile/ProfileScreen.tsx`** — parameterized by
  role, replacing what were previously divergent profile screens per
  contractor/manager/viewer; also backs the worker's own profile screen
  (`(worker)/profile.tsx`), which previously only had an avatar-only stub.
- **`feedback.tsx`** — new "Signaler un problème" screen (see Doc 02
  addendum).
- **`components/ui/Select.tsx`** — new shared bottom-sheet pick-or-specify
  component (search field appears at ≥6 options; "Autre — préciser"
  stores free text directly in the underlying column, no separate flag).
- **`components/ui/UndoToast.tsx`** — new lower-stakes-delete pattern
  (vehicle, expense) offering an inline undo before the soft-delete is
  final.
- **`NotificationRouter.tsx`** — deep-links a tapped push notification
  (dispatch/material/safety) directly to the relevant record.
- **`AppLockGate.tsx`** — biometric app-lock via `expo-local-authentication`
  (needs a dev/production build; does not function in Expo Go).
- **Journal (`journal.tsx`)** — gained date-grouped sections, a
  contractor add-entry FAB (previously contractor-only via
  `update-chantier.tsx`), edit-caption/soft-delete, and a voice-note
  playback progress bar with tap-to-seek.
- **Pointage / sync UX** — background sync (previously silent) now shows
  a visible three-state status indicator (Synchronisation… / Synchronisé
  / Échec + Réessayer); a past-date correction banner was added to
  `pointage.tsx` alongside the new `AttendanceHistory.tsx`.
- **Reports (`reports.tsx`)** — two-ended date-range picker with bounds
  that can't invert or reach into the future; generated PDFs now embed
  the org logo and, for every report type, a one-page bar-chart overview
  before the data table.
