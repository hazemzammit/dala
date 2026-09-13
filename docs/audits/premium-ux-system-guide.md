# Dala Admin — Premium UX & Interaction System (v2, with page-by-page plan)

Everything in one file: the token system, every component/state spec, and
now a walk through every actual screen in the app — what it looks like
today, and exactly what changes apply to it and in which phase. Target
reference: **Linear / Vercel / Stripe** — hierarchy and restraint over
decoration. Every `[DECISION]` marks a call the source critique left open;
I picked a default rather than leaving it for Antigravity to invent one
mid-build.

This replaces the previous guide — same content, same phase numbers,
expanded with more concrete detail plus a new page-by-page section (§18).

---

## 0. What's already done vs. already built vs. new

**Already done (Phase 1–4.5):** every shared component in `packages/ui-web`
— Card, FilterBar, ViewToggle, IconActionButton, Pagination, Button,
DataTable, StatusBadge, PlanBadge, FormField, ConfirmTypingDialog,
DetailHeader, IconStatCard, SectionCard, EmptyState, ErrorState, Avatar —
carries a real resting shadow, a synced elevation scale, and consistent
hover/focus treatment. Sidebar toggle and Topbar (search-only) are wired.

**Already built, just not surfaced everywhere:**

- **Command palette** (`GlobalSearch.tsx`) — real `⌘K` search, wired into
  Topbar. Needs a Recent/Actions section (§5), not a rebuild.
- **Breadcrumbs** (`DetailHeader`'s `backLabel`) — already renders
  `Organisations / Acme Corporation`. Extend, don't rebuild (§4, §11).
- **Distinct empty/error/permission states** (`EmptyState`, `ErrorState`
  with a `permission` variant) — exist. What's missing is (a) a fourth
  "no results from filters" case and (b) call sites in EVERY screen
  actually choosing the right one — see §18's per-page table for exactly
  which screens currently get this wrong or don't handle it at all.

**Genuinely new, needs building:** typography/spacing/motion tokens,
column controls, density toggle, row `•••` menu, toast/undo, saved views,
responsive table collapse, mobile nav, activity timeline, onboarding,
URL-persisted table state, preference persistence, NoResultsState.

---

## 1. Design tokens

Add to `packages/design-tokens/src/index.ts`, additive, nothing existing
changes:

```ts
export const type = {
  pageTitle: { size: '28px', line: '1.2', weight: 600, tracking: '-0.01em' },
  pageSubtitle: { size: '14px', line: '1.45', weight: 400, tracking: '0' },
  sectionTitle: { size: '17px', line: '1.3', weight: 600, tracking: '0' },
  body: { size: '14.5px', line: '1.5', weight: 400, tracking: '0' },
  secondary: { size: '13px', line: '1.4', weight: 400, tracking: '0' },
  meta: { size: '12px', line: '1.3', weight: 500, tracking: '0.02em' },
  // StatCard/IconStatCard's 36px tabular-nums hero number is untouched —
  // it's a separate, already-tuned scale, not part of this hierarchy.
};

export const space = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
};

export const radius = {
  xs: '6px', // checkboxes, tiny chips
  sm: '8px', // inputs, small buttons
  md: '12px', // IconActionButton, ViewToggle pill segments
  lg: '16px', // Card, FilterBar (existing rounded-card)
  xl: '24px', // DetailHeader, PageHero (existing rounded-[24px])
  full: '9999px',
};

export const motion = {
  fast: '150ms',
  panel: '220ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
};
```

`[DECISION]` Tailwind can't read JS objects at build time — same
limitation `elevation` already works around. These get mirrored as
literal Tailwind classes per component, with this file as documented
source of truth. No Tailwind plugin; out of scope for a design pass.

**Uppercase audit — apply everywhere in §18's per-page table, but the
rule itself:**

- Table column headers → **keep** uppercase (genuinely aids scanning
  across rows).
- Sidebar group labels (`VUE D'ENSEMBLE`, `GESTION`) → **keep**.
- Field labels next to their own value (`DetailHeader`/`EntityCard`'s
  `dt` elements, `IconStatCard`/`StatCard`'s label) → **drop** uppercase,
  keep `text-[11px] font-semibold tracking-[0.04em] text-neutral-400`
  sizing/tracking/color.

---

## 2. Hierarchy — three surface levels

| Level | Look                                     | Used for                                                                                                               |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0     | No container                             | Page background                                                                                                        |
| 1     | `border border-neutral-100`, no shadow   | FilterBar, most SectionCards                                                                                           |
| 2     | Full `elevation.resting` shadow + border | ONE primary surface per screen: the DataTable card, PageHero, DetailHeader, a modal, a "Zone dangereuse" warning block |

Concrete diff: `FilterBar.tsx` drops its Phase-4.5 shadow (keep padding/
radius/border). `SectionCard.tsx` gets a `tone="none"` behavior — when no
`tone` is passed, render Level 1 (border only); the existing `tone` prop
(accent/success/warning/danger/neutral) keeps Level 2 + colored border,
since a "Zone dangereuse" block SHOULD stand out. `DataTable`'s own Card
wrapper, `PageHero`, and `DetailHeader` stay Level 2 — they're each the
one hero surface on their screen. See §18 for exactly which SectionCard
instance on which page keeps Level 2.

---

## 3. Sidebar

- Active pill: add `transition-[background-color] duration-150` so the
  fill animates in rather than snapping.
- Group spacing: `mt-6` between `NAV_GROUPS`, not the current flat
  `space-y-1` for everything.
- Tooltip-on-collapse: already implemented (`title={collapsed ? ... }`).
- `[DECISION]` no second "DALA / Admin" text block above the logo — the
  existing logo already serves as identity; a workspace switcher is only
  worth building if multi-tenant/multi-region admin ever becomes real.
- `[DECISION]` roving arrow-key focus between nav items → real but
  optional, moved to §12 (Accessibility), not bundled into a visual pass.

---

## 4. Topbar & breadcrumbs

Topbar stays search-only (no duplicate logout — Sidebar footer owns
that). Add a breadcrumb slot, populated only on detail pages:
`Organisations / Acme Corporation`. `[DECISION]` implementation: a small
`BreadcrumbContext` that detail-page layouts set on mount, read by
Topbar — flag as its own reviewed step since it's the one non-CSS change
here.

`[DECISION]` Help and Notifications icons: **deferred**. No help-center
content and no notification-producing backend event exist yet — building
the icon before the destination is decoration. Add once there's a real
target.

---

## 5. Command palette

Extend `GlobalSearch.tsx` with, shown only when the query is empty:

```text
Récent          (last 5 distinct pages visited, sessionStorage)
  Organisations
  Utilisateurs

Actions         (every sidebar nav item not already in "Récent")
  Aller à Facturation
  Aller à Stockage
```

No create-flow actions (`+ Créer une organisation`) unless that flow
already exists — confirm before adding, don't invent it to fill space.

---

## 6. DataTable — power features (app-wide, sequenced)

1. **Row `•••` menu** replacing 2-4 separate `IconActionButton`s per row.
   Per-table: needs the actual current action list confirmed before
   building (Organizations ≠ Users ≠ AdminUsers actions) — see §18.
2. **URL-persisted filter/sort/page state** — build this BEFORE column
   controls (below), so both share one state mechanism instead of two.
3. **Column visibility + reorder** (`Colonnes ⚙` in FilterBar's trailing
   slot) — real new state inside `DataTable`, scope per-table.
4. **Density toggle** (`Confortable / Défaut / Compact`) — cheap once
   #3's persistence plumbing exists.
5. **Selection bar** — `"N sélectionnés"` + real buttons + `Tout
désélectionner`, no `DataTable` API change, just how callers use
   `bulkActions`.

Not every table in the app needs all five — see §18 for which get which,
sized to how much that specific table is actually used.

---

## 7. States — empty / no-results / error / permission / offline

Add `NoResultsState` (new, small — `EmptyState` without a create-CTA,
description echoes the active search/filter). `DataTable` callers choose
between `EmptyState` (no data at all) and `NoResultsState` (filters/search
active + zero matches) based on whether any filter/search value is set —
not just `rows.length === 0`.

`[DECISION]` Offline state: **not built**. Confirmed neither admin nor
web has offline architecture; building a banner with nothing to trigger
it borrows a mobile-only concept these apps don't need.

Content templates (French, matching existing app copy style):

```text
Empty:        ◎  Aucune organisation pour le moment
               Créez votre première organisation pour commencer.
               [+ Créer une organisation]

No results:    ⌕  Aucun résultat pour « xyz123 »
               Essayez un autre terme ou modifiez vos filtres.
               [Réinitialiser les filtres]

Error:         ⚠  Un problème est survenu
               Impossible de charger ces données. Vérifiez votre
               connexion et réessayez.
               [Réessayer]

Permission:    🔒  Vous n'avez pas la permission d'accéder à ces données
               Contactez un responsable si vous pensez qu'il s'agit
               d'une erreur.
```

---

## 8. Motion

Two durations (`fast` 150ms, `panel` 220ms), one decelerate easing. Applied
to sidebar active-pill fade, dropdown/menu open, dialog open, toast
appear/dismiss, tab switch. All wrapped in `motion-safe:` so
`prefers-reduced-motion` is respected automatically.

`[DECISION]` roll back `hover:-translate-y-px` from `secondary` buttons and
`IconActionButton` — reserve lift for primary CTAs, interactive Cards, and
floating pill controls only. Background/border/shadow change is enough
signal for small controls; lift on every single one is the "too much
movement" the critique flagged. One-line removal in `Button.tsx` and
`IconActionButton.tsx`.

---

## 9. Toast + undo

New `ToastProvider` + `useToast()`, mounted once in `(admin)/layout.tsx`.
Stack bottom-right, max 3 visible, 5s auto-dismiss (8s if it has an
`Annuler` action).

`[DECISION]` undo-toast replaces confirmation ONLY for reversible,
low-blast-radius actions (archive, suspend, status change). Delete/revoke
keep `ConfirmTypingDialog` — matches the critique's own distinction.
See §18 for exactly which per-page action converts and which doesn't.

---

## 10. Dialog tiers

1. **Light confirm** (new `ConfirmDialog`) — title + one-line consequence
   - Cancel/Confirm. For reversible actions where undo-toast is too
     casual but typing is overkill.
2. **Destructive confirm** (existing `ConfirmTypingDialog`,
   `destructive=true`) — unchanged; already correctly neutral-surfaced
   with only the confirm button colored danger, not the whole dialog.
3. **Positive confirm** (existing `ConfirmTypingDialog`,
   `destructive=false`) — unchanged, already used by Advances' Approve
   flow.

All three: ESC closes, focus traps while open, focus returns to trigger
element on close — audit whether `ConfirmTypingDialog` already does this
(§12) before assuming it does.

---

## 11. Detail-page command-center layout

`identity → actions → navigation → metrics → details`, e.g.:

```text
← Organisations / Acme Corporation

Acme Corporation
acme.com  ·  ● Active
[Modifier] [•••]
──────────────────────────────
Aperçu   Membres   Facturation   Activité

┌───────────┐ ┌───────────┐ ┌───────────┐
│ Membres   │ │ Plan      │ │ Créée le  │
│ 248       │ │ Pro       │ │ 12 janv.  │
└───────────┘ └───────────┘ └───────────┘
```

`[DECISION]` converting `OrgDetail`/`UserDetail` from one long scroll to
tabs is real navigation-structure work (what's in which tab, URL-synced
or not) — needs its own small spec before building, flagged not detailed
further; see §18 for exactly which `SectionCard`s on each detail page
would become which tab.

---

## 12. Accessibility checklist

- [ ] Every icon-only control has an accessible name — audit any raw
      `<button><Icon /></button>` NOT using `IconActionButton`.
- [ ] Visible `:focus-visible` ring on every interactive element, not
      just `FormField`.
- [ ] Dialogs trap focus, restore focus to trigger on close — verify
      `ConfirmTypingDialog` actually does this today; fix if not.
- [ ] ESC closes any open dialog/dropdown/palette.
- [ ] Checkbox/radio hit areas ≥ 24×24px via label padding.
- [ ] Color never the only signal (StatusBadge already correct — audit
      for any bare color chip elsewhere).
- [ ] `prefers-reduced-motion` respected (§8).
- [ ] Async results announced via `aria-live="polite"`.
- `[DECISION]` roving arrow-key sidebar/palette focus — last, after the
  checklist above (those are correctness bugs; this is an enhancement).

---

## 13. Responsive & mobile

`[DECISION]` confirm actual tablet/phone usage before building three
breakpoint layouts for what may be a desktop-only internal tool. If
needed: tablet hides lowest-priority columns per table; mobile forces
`EntityCard` view (reuse `ViewToggle`'s existing card mode, don't build a
third row-renderer); mobile nav is a bottom tab bar replacing the
sidebar.

---

## 14. Icon size & tooltip conventions

16px table/inline icons, 18px buttons/nav (round `IconActionButton`'s
current 17px up to 18 for consistency), 20px prominent controls (already
IconStatCard's chip), 24px+ empty/error icons (already 28px), 32px+
feature illustrations (none exist yet). Tooltips only on icon-only
controls with no visible label — never on a button that already shows
text.

---

## 15. Preferences, URL state, saved views

URL-persist filter/sort/page (`?status=active&plan=pro&page=2&sort=name`)
before building column controls (§6.2) on top of it. `localStorage` for
density/columns/sidebar-collapsed (sidebar already does this — extend the
mechanism). `[DECISION]` saved views deferred — needs a product decision
(per-admin or shared? what does "À surveiller" even filter on?) before a
picker gets built.

---

## 16. Onboarding & activity timeline

Both `[DECISION]` deferred. Onboarding checklist needs real first-run
flows (org creation, invite) to check off first. Activity timeline needs
Journal d'audit (Phase 6, §5.7 of the original plan) shipped first, so it
reuses that event feed instead of inventing a second one.

---

## 17. Rollout phases

```
Phase 4.6 — cheap, CSS + small logic, ship this week
  Typography scale + uppercase audit · Hierarchy (FilterBar/SectionCard
  → Level 1) · Motion tokens + prefers-reduced-motion · Roll back
  over-applied hover lift · Icon size pass · Sidebar spacing/transition

Phase 5 — data & navigation depth
  5.1 Command palette Recent/Actions · 5.2 Row ••• menu per-table
  5.3 URL-persisted table state · 5.4 NoResultsState + correct empty/
  error/permission wiring per page (§18) · 5.5 Column visibility +
  density (built on 5.3)

Phase 6 — interaction & feedback
  6.1 ToastProvider/useToast · 6.2 Light ConfirmDialog tier
  6.3 Convert archive/suspend/status-change actions to undo-toast, per
  action (§18 lists which) · 6.4 Dialog focus-trap/ESC audit

Phase 7 — accessibility audit (§12, top to bottom)

Phase 8+ — gated on a product decision not yet made
  Detail-page tabs · Breadcrumb-in-Topbar · Responsive/mobile (confirm
  usage first) · Saved views · Activity timeline (after audit-log ships)
  · Onboarding (after real first-run flows exist) · Help/Notifications
```

---

## 18. Page-by-page work

Every screen in the app, current state, and exactly what applies from
§§1–16 above, in phase order. "Surface tier" = §2's Level 0/1/2 model.

### Dashboard (`/dashboard`)

**Today:** `PageHero` + 9× `IconStatCard` in a grid + a plain disclosure
paragraph explaining which metrics are deliberately not shown (DAU/MAU,
churn, invite-acceptance — flagged as needing data that doesn't exist
yet, not faked).

- Surface: PageHero (L2) + IconStatCard grid (L2, unchanged — already
  correctly "raised" since these ARE the page's content, not a container
  around content).
- Phase 4.6: uppercase → sentence case on each `IconStatCard` label
  ("Organisations totales" not "ORGANISATIONS TOTALES").
- Phase 5+: **do not** build a time-range selector or trend chart here
  yet — no charting library exists in this app and the doc-comment
  already correctly defers this. Leave as-is until that's a scoped
  decision.
- `[DECISION]` this page has no `DataTable`, so §6/§7/§15 mostly don't
  apply here. Leave alone otherwise.

### Organizations — list (`/organizations`)

**Today:** `PageHero` (fixed in 4.5) + `FilterBar` (search, plan filter,
"File de vérification" toggle, `ViewToggle`) + `DataTable`/`EntityCard`
with columns Nom/Type/Plan/Membres/Stockage/Créée le + row actions.

- Surface: FilterBar → L1 (Phase 4.6). DataTable card stays L2.
- Phase 5.2: convert row actions to `•••` menu — confirm the exact
  current action set (view/impersonate/suspend/delete/download, per the
  screenshot's icon row) before building.
- Phase 5.3: URL-persist plan filter + verification-queue toggle + view
  mode + page.
- Phase 5.4: distinguish "no organizations at all" (`EmptyState` + create
  CTA — confirm a create-org flow actually exists first) from "search/plan
  filter matched nothing" (`NoResultsState`).
- Phase 6.3: suspend → undo-toast candidate (reversible). Delete stays
  `ConfirmTypingDialog` (irreversible).

### Organizations — detail (`/organizations/[orgId]`)

**Today:** `DetailHeader` (breadcrumb, avatar via `logo_signed_url`,
status) + `SectionCard`s for org profile / members (`ROLE_LABEL` map) +
Impersonate action.

- Surface: DetailHeader stays L2. Member-list `SectionCard` → L1 unless
  it's flagged as needing to stand out (it doesn't).
- Phase 8: `[DECISION]` tab conversion (`Aperçu / Membres / Facturation /
Activité`) — org detail is the primary candidate for this since it
  already has 2+ logical sections; scope the exact tab list before
  building.
- Phase 6.3: Impersonate keeps its existing confirm flow as-is — starting
  an impersonation session isn't the kind of action undo-toast fits.

### Users — list (`/users`)

**Today:** `FilterBar` (search + "Statut" filter + `ViewToggle`) +
`DataTable`/`EntityCard`, columns Nom/Email/Téléphone/Organisation(s)/
Dernière connexion/Statut, actions Réinitialiser/Révoquer les sessions/
Suspendre/Supprimer (per screenshot 3).

- Surface: FilterBar → L1.
- Phase 5.2: `•••` menu for the 4 actions — `Réinitialiser`'s exact-text
  test assertion moves to the menu's `role="menuitem"` text, same string.
- Phase 5.3: URL-persist status filter + view mode + page.
- Phase 6.3: **Suspendre** → undo-toast candidate. **Réinitialiser**
  (password reset) and **Révoquer les sessions** are one-shot actions
  with no natural "undo" — leave as direct actions, not toast-wrapped.
  **Supprimer** stays `ConfirmTypingDialog`.
- Note: this table has rows with no name (`hazemzammit3@gmail.com` in
  screenshot 3 shows a blank Nom cell) — Phase 5.4's empty-vs-no-results
  logic doesn't apply to individual blank cells, only to whole-table
  empty states; leave blank-name rendering as-is unless product wants a
  "Sans nom" placeholder (separate, small decision).

### Users — detail (`/users/[userId]`)

**Today:** `DetailHeader` (initials avatar, `backHref="/users"`) +
`SectionCard` around "Notes internes."

- Surface: DetailHeader L2, Notes-internes `SectionCard` → L1.
- Phase 8: tab conversion lower priority here than Organizations — this
  page has only one real sub-section today (Notes internes), not enough
  distinct content to justify tabs yet. Defer until this page grows.

### Facturation (`/billing`)

**Today:** still bare `<h1>` (Phase 6, not yet built). `BillingTable`
columns: Organisation/Plan/Statut/Sièges/Montant du cycle/Début du
cycle/Dernier paiement + an unlabeled actions column.

- When Phase 6 (original plan's, not this doc's) builds this page's
  `PageHero`, apply §1's uppercase rule and §2's L1 FilterBar from day
  one — don't ship it in the old style and revisit later.
- Phase 5.2: this table's actions column is currently unlabeled
  (`header: ''`) — confirm what it actually contains before deciding
  whether it's `•••`-menu-worthy or a single action that should stay a
  plain button.
- Phase 6.3: billing state changes (plan/seat changes) are financial —
  `[DECISION]` these do NOT become undo-toasts even if reversible;
  billing changes should stay in the "light confirm" tier (§10.1) at
  minimum, given real money is involved.

### Stockage (`/storage`)

**Today:** bare `<h1>`. `StorageUsageTable` columns: Organisation/Plan/
Fichiers/Stockage utilisé/Statut/Quota, with a 5-tier status system
(`ok`/`warning`/`critical`/`over_limit`/`no_limit_defined`) already using
`StatusBadge` variants correctly.

- This table's 5-state status column is a good candidate for keeping
  **very** literal — don't compress `critical`/`over_limit` into fewer
  visual states for "simplicity"; the distinction between "banner shown"
  and "read-only" is operationally important, matching §7's "color is
  never the only signal" principle (each already pairs a label
  describing the actual threshold, not just a color).
- Phase 5.3: URL-persist a status filter (e.g. `?status=over_limit` to
  jump straight to orgs that need action) — high value here specifically
  since this table exists to be scanned for problems.

### Santé des services (`/services-health`)

**Today:** bare `<h1>`, four sub-widgets: `InfraStatusGrid`,
`EmailDeliverabilityTable`, `ScheduledJobsTable`, `InvocationLogTable`.

- This page is the strongest candidate in the whole app for the
  §11 tab pattern once it gets its Phase 6 build — four genuinely
  distinct data sources (infra status / email / scheduled jobs /
  invocation log) is exactly the "too much on one scroll" case tabs
  solve. `[DECISION]` scope as: `Infrastructure | Email | Jobs planifiés
| Journal d'invocation` tabs, each lazy-loaded (these are 4 separate
  data fetches — no reason to fetch all 4 before the user picks a tab).
- Each sub-table gets its own `SectionCard` at L1 today; once tabbed,
  each tab's content can drop the `SectionCard` wrapper entirely (the
  tab panel itself IS the section, per §2's "don't nest cards" rule) and
  let its own `DataTable` (L2) be the only raised surface in that tab.

### Versions de l'app (`/app-versions`)

**Today:** bare `<h1>`. `AppVersionsForm` — one `PlatformCard` per
platform (iOS/Android) with `latest_version`/`min_supported_version`
fields and a dirty-state Save button.

- Small page, low complexity — no `DataTable`, no filters. Phase 6 (this
  doc's) barely touches it beyond §1's typography and §2's surface tier
  for the two `PlatformCard`s (L1 is enough; these aren't the kind of
  content that needs to visually dominate).
- Phase 6.3: version updates are exactly the kind of "reversible, low
  blast radius, but you'd still want to know it happened" action a
  success toast (not undo, just confirmation) fits well — `[DECISION]`
  add a plain success toast on save here even before the broader
  toast-for-destructive-alternatives rollout, since it's simple and this
  page currently has no feedback beyond the dirty-state button itself.

### Feature flags (`/feature-flags`)

**Today:** bare `<h1>`. `FeatureFlagsTable` + an `OverridesPanel` per flag
(org-level override list with add/clear).

- The `OverridesPanel`'s add-override flow (org ID text input +
  enabled toggle) is a good `[DECISION]` candidate for a light autocomplete
  (reuse `GlobalSearch`'s org-lookup logic) instead of a raw org-ID text
  field — flagged as a nice-to-have, not required for this pass.
- Clearing an override is reversible (re-adding it restores the same
  state) → Phase 6.3 undo-toast candidate.

### Annonces (`/announcements`)

**Today:** bare `<h1>`. `AnnouncementForm` (channels: in-app/email/push)

- `AnnouncementsList` columns Message/Canaux/Destinataires estimés/
  Statut/Livraison.

* Phase 7's "no results" content template applies directly here once
  search/filter exists on this list — currently it doesn't, so §7 doesn't
  apply until this list grows a `FilterBar`.
* An announcement, once sent, is NOT undo-able (it already went out) —
  `[DECISION]` this list's actions should stay `ConfirmTypingDialog`-tier
  or better for "Envoyer," never a toast-with-undo.

### Journal d'audit (`/audit-log`)

**Today:** bare `<h1>`. `AuditLogTable` columns Date/Action/Cible/Org/
Acteur/IP/Impersonation.

- This is the data source §16 (Activity timeline) depends on — sequence
  Phase 6 (original plan)'s build of this page BEFORE attempting the
  activity-timeline addition to Organization/User detail pages.
- Phase 5.3: URL-persist a date-range + action-type filter — this table
  is read-heavy/scan-heavy by nature, exactly where deep-linkable filters
  earn their cost fastest.
- Read-only page (no destructive actions) — §9/§10 (toast/dialogs) don't
  apply here at all.

### Database Explorer (`/db-explorer`)

**Today:** bare `<h1>`. `QueryEditor` (raw SQL, danger-zone checkbox
routing through `ConfirmTypingDialog` per the original plan's Phase 6
note) + `PendingApprovals`.

- This page is the one place in the app where §10's tier-2 (destructive
  typed confirmation) is unambiguously correct and should NOT be
  softened to a toast or light confirm under any circumstance — flag this
  explicitly so a later phase doesn't "simplify" it by mistake.
- `PendingApprovals`'s approve action uses the `success` Button variant
  (per `Button.tsx`'s own comment, "the one place a green confirm reads
  more correctly than accent teal") — leave that choice exactly as-is.

### Gestion des admins (`/admin-users`)

**Today:** bare `<h1>`. `AdminUsersTable` columns Nom/Rôle/2FA/Dernière
connexion, "Réinitialiser 2FA" already routed through
`ConfirmTypingDialog` per the original plan.

- Phase 5.2: restyle the "Réinitialiser 2FA" trigger as `•••`-menu-worthy
  only if more actions get added later — today it's the only action, so
  a single `IconActionButton` (not a menu) is still correct; don't force
  a one-item menu just for consistency with other tables.
- Admin-account actions (2FA reset, role changes) are security-sensitive
  → `[DECISION]` never candidates for undo-toast regardless of technical
  reversibility.

### Sessions admin (`/admin-sessions`)

**Today:** bare `<h1>`. `SessionsTable` columns Admin/Connectée depuis/
Dernière activité/IP + two unlabeled action columns (likely
view-details/revoke).

- Revoking an admin session is security-sensitive, same rule as above —
  keep as a direct confirm action, not a toast.
- Small/simple table — §6.2/6.3 (column controls/density) are low
  priority here; this table is unlikely to ever need more than ~10
  visible columns or benefit from density toggling given its row count
  is bounded by "currently active admin sessions."

---

## 19. Sequencing summary across all pages

Build order that avoids rework, combining §17's phase order with §18's
page notes:

1. **Phase 4.6** (typography/hierarchy/motion) — apply globally, touches
   every page's shared components, no page-specific decisions needed.
2. **Ship the remaining original-plan Phase 6 pages** (Billing, Storage,
   Services Health, App Versions, Feature Flags, Announcements, Audit
   Log, DB Explorer, Admin Users, Admin Sessions) — using Phase 4.6's
   already-updated tokens/components from the start, not the old style.
3. **Phase 5** (data/nav depth) — prioritize Organizations and Users
   first (highest-traffic tables), then Storage and Audit Log (highest
   value from URL-persisted filters), then the rest.
4. **Phase 6** (toast/dialogs) — build the undo-toast mechanism against
   Users' "Suspendre" and Organizations' "Suspendre" first (the two
   clearest candidates from §18), not against Billing/Announcements/
   Admin-security actions, which stay confirm-gated per their own notes.
5. **Phase 7** (accessibility) — full-app audit, not page-specific.
6. **Phase 8+** — Organization detail's tab conversion is the first
   candidate (already has 2+ sections); Services Health is the second
   (4 sub-widgets, strongest case); everything else in §16/§18's
   `[DECISION]`-deferred list waits on its named prerequisite.
