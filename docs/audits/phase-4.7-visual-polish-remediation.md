# Phase 4.7 — Visual Polish & Component Remediation Audit

Status: **gates everything below it.** Phase 4.6 is merged. The 10
original-plan Phase 6 pages are built. Before Phase 5 (data/nav depth)
starts, this phase fixes the visual/UX debt a hands-on pass through the
running app turned up — every item below was confirmed against the actual
source in this repo, not guessed from a screenshot. File location:
`docs/audits/phase-4.7-visual-polish-remediation.md`, alongside
`premium-ux-system-guide.md` and `dala-admin-ui-overhaul-plan.md`.

**Why this exists as its own phase, not folded into Phase 5:** Phase 5
adds power features (URL state, column controls, row menus) on top of
the CURRENT visual surface. If that surface is still generic in the ways
listed below, Phase 5 would be sequencing new behavior on top of
components that are about to change shape anyway — rework risk the
golden rules exist to avoid. Fix the surface first.

**Every item below was verified by reading the actual file** (not
inferred from the screenshots alone) as of this audit. Where a finding
contradicts something `premium-ux-system-guide.md` §1/§2 currently says,
that's called out explicitly as an amendment — this is the newer, more
specific instruction where the two disagree.

---

## 0. Confirmed findings index

Quick map from your list to the actual cause, so nothing gets "fixed" by
guessing:

| Your note                                                                  | Confirmed cause                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PageHero generic / radius too big / gradient                               | `PageHero.tsx` hardcodes `rounded-[24px]` + a bespoke `linear-gradient(180deg,rgba(15,118,110,0.05)...)` — bypasses the token system entirely (see §2)                                                                                                                                                             |
| Description style inconsistent, some pages paragraph-length                | Confirmed per-page in §5 table — Billing/Storage/Dashboard descriptions are 2–3 sentences; Organizations/Dashboard-title are 1 short sentence. No shared rule enforced.                                                                                                                                            |
| Internal disclosure text rendering in the app                              | `dashboard/page.tsx` renders the DAU/MAU/churn explanation as a literal `<p>` in JSX (not a comment) — same pattern in `storage/page.tsx`'s description (`Doc 00 §0.3` citation renders to real users)                                                                                                             |
| SearchInput / filter `<select>` height mismatch                            | `SearchInput.tsx` uses `py-2.5` (no fixed height); `OrganizationsTable.tsx`'s plan `<select>` uses `h-9` — two different sizing systems in the same `FilterBar` row                                                                                                                                                |
| "File de vérification" button unstyled / unclear                           | `OrganizationsTable.tsx` — raw `<button>` with its own one-off classes (`px-3 py-1.5 text-xs`), not `Button.tsx` or any shared control                                                                                                                                                                             |
| ViewToggle too small                                                       | `ViewToggle.tsx` — `h-10 w-10` pill buttons, 16px icons; genuinely smaller than `IconActionButton`'s `h-9 w-9`/18px right next to it                                                                                                                                                                               |
| Table generic                                                              | `DataTable.tsx` — plain white `<thead>`, no header tint, 1px borders only, no row accent; confirmed, this is the actual full markup                                                                                                                                                                                |
| Org name as underlined accent link                                         | `OrganizationsTable.tsx`, `BillingTable.tsx`, `StorageUsageTable.tsx` all render the name cell as `<Link className="text-accent-600 font-medium hover:underline">`                                                                                                                                                 |
| Pagination arrows small/unstyled                                           | `Pagination.tsx` nav buttons are `h-10 w-10`, 14px icons                                                                                                                                                                                                                                                           |
| Card view: 2/row, too much whitespace, no logo                             | `OrganizationsTable.tsx` hardcodes `lg:grid-cols-2`; `EntityCard.tsx` has no avatar/logo slot at all                                                                                                                                                                                                               |
| Org Type not chip-colored                                                  | `OrganizationsTable.tsx`'s Type column renders `r.trade_type ?? '—'` as plain text, no `TypeChip` component exists                                                                                                                                                                                                 |
| IconActionButton "only 3 colors" / same color reused for different actions | `IconActionButton.tsx` has exactly 4 tones (`accent/warning/danger/neutral`, **no `success`**) — and `OrganizationsTable.tsx` assigns `tone="accent"` to BOTH "Approuver" and "Exporter", two semantically different actions                                                                                       |
| Billing/Storage: subtle text instead of stat cards                         | `BillingTable.tsx` renders `<p className="text-sm text-neutral-500">MRR : ...` — plain paragraph; `StorageUsageTable.tsx` same pattern for the totals line                                                                                                                                                         |
| No search/filter on Billing/Storage                                        | Confirmed — neither file imports `FilterBar`/`SearchInput` at all                                                                                                                                                                                                                                                  |
| Plan chips all accent-colored on Billing/Storage                           | Both tables render the plan column via `<StatusBadge variant="info">{r.plan}</StatusBadge>` — **not** `PlanBadge`, which is why every plan (free/pro/business) renders identically accent-tinted. This is a real bug, not a design opinion: `PlanBadge.tsx` already has per-plan colors and isn't being used here. |
| "Nettoyer les fichiers orphelins" placement/style                          | `StorageUsageTable.tsx` — a lone `Button variant="secondary"` floated in a flex row against a plain text totals line, no shared toolbar pattern                                                                                                                                                                    |
| Storage subtitle references `Doc 00 §0.3`                                  | `storage/page.tsx`'s `PageHero description` string literally contains `"Doc 00 §0.3"`                                                                                                                                                                                                                              |
| Services Health: card-in-card                                              | `services-health/page.tsx` wraps each widget in `SectionCard`; `InfraStatusGrid.tsx` then renders its OWN `<Card className="p-4">` per service tile inside that — two nested elevated surfaces                                                                                                                     |
| Invocation log pagination doesn't match                                    | `InvocationLogTable.tsx` hand-rolls its own "page X/Y" text + two plain-text `<button>`s instead of importing `Pagination.tsx`                                                                                                                                                                                     |
| Audit Log filters too manual / no pagination                               | `AuditLogTable.tsx` — five raw `<input>` fields (table name, actor ID, org ID typed by hand) and **no** `Pagination` import anywhere in the file                                                                                                                                                                   |
| Admin Sessions: action icon small, IP column narrow                        | `SessionsTable.tsx`'s revoke button explicitly passes `size="sm"` (every other table's row actions use the `md` default) — inconsistent, not a shared convention; the `ip_address` column has no `width` set (the column type supports one — it's just unused here)                                                |

---

## 1. Design-token amendments

These correct/extend `packages/design-tokens/src/index.ts`. Two of them
**override a decision already written in `premium-ux-system-guide.md`
§1** — flagged explicitly, because the golden rules treat that guide as
the standing instruction otherwise.

### 1.1 `[AMENDS §1]` Radius scale — cap the hero tier at 16px

The guide's §1 currently documents `xl: '24px'` for "DetailHeader,
PageHero." Supersede that: **drop the 24px tier for these two
components.** Both move to the existing `card` token (16px, already
wired as the `rounded-card` Tailwind class — no new token needed).

- `PageHero.tsx`: `rounded-[24px]` → `rounded-card`
- `DetailHeader.tsx`: `rounded-[24px]` → `rounded-card`
- Leave `radius.sheet` (22px) alone — that's modals/bottom-sheets, a
  different surface, not part of this complaint.
- Audit for any other literal `rounded-[24px]`/`rounded-[22px]` in
  `apps/admin` before closing this item — the two files above are the
  only ones a repo-wide grep turned up as of this audit, but re-check
  since this doc is a point-in-time read.

### 1.2 PageHero surface — replace the gradient, not just the radius

Current: `bg-[linear-gradient(180deg,rgba(15,118,110,0.05),rgba(255,255,255,0.92))]`.
A soft teal-to-white wash reads as generic "SaaS landing page," not
Linear/Vercel/Stripe restraint.

`[DECISION]` replace with: solid `bg-neutral-0`, existing
`border-neutral-100`, existing resting shadow — i.e. PageHero becomes a
plain, correctly-elevated `Card`-level surface, no gradient at all. The
one point of color is the existing icon chip (`bg-accent-50
text-accent-600`) — that's enough of a brand accent for a header; the
whole card doesn't need to be tinted too. This is the same restraint
principle already applied to `FilterBar`/`SectionCard` in Phase 4.6 §2 —
apply it to PageHero too, which that step didn't touch.

### 1.3 New IconActionButton tone: `success`

`IconActionButton.tsx`'s tone union is `'accent' | 'warning' | 'danger' |
'neutral'` — no `success`, even though `Button.tsx` and `StatusBadge.tsx`
both already have one (`status.success` / `status.successButton`). This
is why "Approuver" currently has nowhere correct to go and ends up on
`accent` next to unrelated accent-toned actions.

Add:

```ts
success: 'text-success hover:border-success/30 hover:bg-success/10',
```

Uses the existing `color.status.success` token — no new hex value.

### 1.4 New component: `StatStrip` (compact inline statistics)

Needed for §3.9/§3.10 below (Billing/Storage summary lines →
cards). Not `IconStatCard` (that's the Dashboard's large hero-number
variant — reusing it here would look oversized for a one-line summary
sitting above a table). New, small:

```tsx
// packages/ui-web/src/StatStrip.tsx
interface StatStripItem {
  label: string;
  value: ReactNode;
}
interface StatStripProps {
  items: StatStripItem[];
}
```

Renders a `flex flex-wrap gap-3` row of small Level-1 chips (`border
border-neutral-100 bg-neutral-0 rounded-control px-4 py-2.5`), each
showing `label` in the existing "field label" style
(`text-[11px] font-semibold tracking-[0.04em] text-neutral-400`) stacked
above `value` in `text-sm font-semibold text-neutral-900`. Level 1, not
Level 2 — it sits above the table, which stays the page's one hero
surface, per §2 of the main guide.

### 1.5 New component: `TypeChip` (categorical, for org `trade_type`)

Small wrapper around the existing `color.categorical` set
(`blue/violet/amber` — already in tokens, already used for project-type
elsewhere per that token's own comment). Deterministic mapping: hash the
`trade_type` string to one of the 3 hues (same "closed set of 3, not a
rainbow" rule the token comment already states for project types) so
the same type always renders the same color without needing a hardcoded
list of every possible trade type. Renders as the same pill shape as
`PlanBadge`/`StatusBadge` for visual family consistency.

---

## 2. Component fixes

### 2.1 `SearchInput` / filter `<select>` / toggle — one control height

`[DECISION]` standardize every direct child of `FilterBar` to
`h-10` (40px), `rounded-control`, `border-neutral-300`. Concretely:

- `SearchInput.tsx`: replace `py-2.5` with explicit `h-10` (keep the
  icon centering logic, just anchor to the fixed height instead of
  padding-derived height).
- Every inline `<select className="h-9 ...">` in `OrganizationsTable.tsx`
  / `UsersTable.tsx` → `h-10`, same border/radius classes as SearchInput
  (right now they're already close but off by one step — 36px vs
  SearchInput's ~44px).
- `[DECISION]` extract a shared `FilterSelect` component in
  `packages/ui-web` (thin wrapper: same height/border/radius/focus-ring
  as `SearchInput`, native `<select>` underneath) rather than fixing the
  height class in three different page files independently — one place
  to keep this in sync going forward.

### 2.2 "File de vérification" → real toggle control, not a bespoke button

Replace the raw `<button>` in `OrganizationsTable.tsx` with a new small
shared component, `packages/ui-web/src/ToggleChip.tsx`: same height as
§2.1's controls, `rounded-control`, pressed state = `border-accent-600
bg-accent-50 text-accent-700` (already the exact classes in use today —
just promoted into a real component instead of an inline conditional
class string), unpressed = `border-neutral-300 text-neutral-600`. Same
component becomes the reusable pattern for any future
list/toggle-a-view-filter control (Storage's proposed status-filter in
§4.7 uses it too).

Also: the label itself is unclear on first read (per your note — "I
don't even know what it does"). `[DECISION]` keep the exact string
("File de vérification" / "Toutes les organisations") since it's a test
contract per the guide's own note, but add a `title`/tooltip: "Afficher
uniquement les organisations en attente de vérification."

### 2.3 `ViewToggle` — scale up to match its neighbors

Bump `h-10 w-10` → `h-9 w-9` (matches `IconActionButton`'s default `md`
size, which sits in the same row via row actions elsewhere) and icon
size `16` → `18` to match. Track padding (`p-1`) can stay — the pill
itself just needs to read as the same weight class of control as
everything beside it in `FilterBar`.

### 2.4 `Pagination` — scale up nav buttons

Nav buttons `h-10 w-10` → `h-9 w-9`, icon `14` → `16`. Bar padding
(`px-3 py-2`) can stay — same "the whole bar reads like a real toolbar
control" fix as ViewToggle, no structural change.

### 2.5 `DataTable` — give the header and rows real presence

Current header: transparent background, 1px bottom border only. Fix:

- `<thead>` row: add `bg-neutral-25` (the existing page-background tint
  token — already distinguishes header from body without introducing a
  new color) and keep the uppercase/tracking (Phase 4.6 §1 already says
  keep uppercase on table headers — unaffected).
- Row hover (`hover:bg-neutral-25`) stays; add
  `border-l-2 border-l-transparent hover:border-l-accent-200`
  (a hairline left accent on hover — cheap, reads as "this row is
  live," not decorative).
- `[DECISION]` do NOT add zebra striping — that conflicts with Doc 05's
  existing "colored table-row backgrounds" prohibition for status; a
  hover-only treatment keeps that rule intact.

### 2.6 Name-cell styling — stop using `<a>` + underline-on-hover as the pattern

`text-accent-600 font-medium hover:underline` on every name cell
(Organizations, Billing, Storage) is the "cheap default link" look you
flagged. Replace with: `text-neutral-900 font-semibold` at rest,
`group-hover:text-accent-700` on row hover (no underline at all — the
whole row already signals interactivity via §2.5's row-hover treatment,
so the link doesn't need to carry that signal alone). Still a real
`<Link>`/`<a>` under the hood — this is a visual-only change, no
accessibility regression (the row is still keyboard/screen-reader
navigable the same way).

### 2.7 Org logo/avatar next to name — table AND card view

`Avatar.tsx` already exists (used on `DetailHeader`) — reuse it, don't
build a second avatar component. Add a 28px `Avatar` (initials fallback
when no `logo_signed_url`) to the left of the name cell in
`OrganizationsTable.tsx`'s table columns, and to `EntityCard`'s header
row in card view.

### 2.8 `EntityCard` — 3-up grid, tighter internal spacing, logo slot

- `OrganizationsTable.tsx`: `grid-cols-1 lg:grid-cols-2` → `grid-cols-1
md:grid-cols-2 xl:grid-cols-3`.
- `EntityCard.tsx`: add an optional `avatar` slot (rendered left of
  `title`, per §2.7). Tighten the fields `dl` grid gap (`gap-y-2` →
  `gap-y-1.5`) and reduce the card's outer padding on the header row
  specifically (`items-start` block currently has more breathing room
  than the field grid below it — even out the two, don't just shrink
  everything uniformly).

### 2.9 `IconActionButton` tone remap — per action, not per convenience

Confirmed current mis-assignment (`OrganizationsTable.tsx`): "Approuver"
= accent, "Exporter" = accent (same color, two different actions —
exactly your note). Corrected mapping, applied everywhere the same
action appears (§5 lists every table this touches):

| Action                            | Tone (after §1.3's new `success`)                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Approuver / Approve               | `success` (new)                                                                                             |
| Refuser / Reject                  | `danger`                                                                                                    |
| Suspendre                         | `warning` (unchanged — already correct)                                                                     |
| Supprimer / Annuler (destructive) | `danger` (unchanged)                                                                                        |
| Exporter / Télécharger            | `neutral` (unchanged in spirit — it's a utility action, not a brand action; **stop using `accent` for it**) |
| Réinitialiser (2FA/password)      | `neutral`                                                                                                   |
| Révoquer (session)                | `danger` (unchanged — already correct in `AdminUsersTable`)                                                 |
| Impersonate                       | `accent` (unchanged — this genuinely is the one brand-forward action)                                       |

This alone fixes "only 3 colors, 2 buttons same color" without inventing
new hues beyond the one (`success`) §1.3 already adds from existing
tokens.

### 2.10 Fix `PlanBadge` vs `StatusBadge` misuse (Billing, Storage)

Both `BillingTable.tsx` and `StorageUsageTable.tsx` render the plan
column via `<StatusBadge variant="info">{r.plan}</StatusBadge>` instead
of the already-built `<PlanBadge plan={r.plan} />`. This is the actual
cause of "plan chips all accent" — swap the component, not the colors;
`PlanBadge` already has the free/pro/business distinction built and
localized (`Gratuit`/`Pro`/`Entreprise`). Zero new code, one import
change × 2 files.

---

## 3. Copy rules (apply everywhere, not just the two flagged pages)

### 3.1 PageHero description — one rule, no exceptions

`[DECISION]` **one sentence, under ~110 characters, plain language,
what this screen is for.** Match Organizations
("Gérez les comptes contractants : plans, membres, statut et
vérification.") and Dashboard's tone. No enumeration of what's
deliberately NOT built, no internal doc citations, no multi-clause
sentences joined by em-dashes.

Concrete rewrites needed:

| Page                                           | Current                                                                              | New                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Billing                                        | 3 sentences incl. "L'intégration réelle avec Konnect reste dans les Edge Functions…" | "Abonnements, MRR et actions manuelles par organisation."         |
| Storage                                        | 2 sentences incl. `Doc 00 §0.3`, three raw thresholds                                | "Utilisation du stockage par organisation, avec seuils d'alerte." |
| Dashboard                                      | Fine as a description, but see §3.2 for the trailing paragraph                       | unchanged                                                         |
| Any page missing a description at all (see §5) | none                                                                                 | add one, same rule                                                |

### 3.2 Never render internal disclosure/doc-reference text to end users

`dashboard/page.tsx`'s DAU/MAU/churn explanation and
`storage/page.tsx`'s `Doc 00 §0.3` citation are **developer-facing
rationale that leaked into product copy.** Rule going forward: anything
explaining why a metric ISN'T shown, or citing an internal spec section,
stays in a code comment — never in JSX that renders to the page.

- `dashboard/page.tsx`: delete the trailing `<p>` entirely. The
  reasoning already exists as a comment at the top of the file —
  keep that, remove only the rendered paragraph.
- `storage/page.tsx`: apply §3.1's rewrite (removes the citation as a
  side effect of shortening the sentence).
- Audit every other page for the same pattern before closing this
  phase — these two are the only ones a full read of the `(admin)`
  route tree turned up as of this audit, but re-check.

---

## 4. New reusable pieces this phase adds

Summary (all additive, all in `packages/ui-web/src`):

1. `StatStrip.tsx` — §1.4
2. `TypeChip.tsx` — §1.5
3. `FilterSelect.tsx` — §2.1
4. `ToggleChip.tsx` — §2.2
5. `IconActionButton`'s new `success` tone — §1.3 (not a new file, a new
   union member)
6. `Avatar` slot added to `EntityCard` — §2.7/2.8 (prop addition, not a
   new file)

None of these touch `DataTable`'s public API in a breaking way — every
addition here is either a new small component or an additive prop.

---

## 5. Page-by-page checklist

Legend: ✅ apply as specified above · — not applicable to this page.

### Dashboard (`/dashboard`)

- §3.2: delete the rendered disclosure paragraph (keep as comment).
- §1.1/§1.2: PageHero radius + surface fix (applies to every page using
  PageHero — listed once here, assumed for the rest of this table
  without repeating the same two bullets 13 times).

### Organizations — list (`/organizations`)

- §2.1 SearchInput/select height parity.
- §2.2 "File de vérification" → `ToggleChip`.
- §2.3 ViewToggle size.
- §2.5/2.6 table header + name-cell styling.
- §2.7/2.8 avatar + 3-up card grid + `EntityCard` tightening.
- §1.5 `TypeChip` for the Type column (currently plain text/`—`).
- §2.9 tone remap for Approuver/Refuser/Exporter row actions.
- §2.4 Pagination sizing.

### Organizations — detail (`/organizations/[orgId]`)

- §1.1 DetailHeader radius fix.
- No table on this page — §2.5/2.6/2.9 don't apply here.

### Users — list (`/users`)

- Same as Organizations list: §2.1, §2.3, §2.4, §2.5, §2.6, §2.7 (avatar
  next to user name — `Avatar` already used elsewhere for people, reuse
  it), §2.9 (Réinitialiser/Révoquer/Suspendre/Supprimer tone check — audit
  actual current tones per action before remapping, don't assume
  Organizations' mapping transfers 1:1).
- Blank-name rows (e.g. `hazemzammit3@gmail.com` in the screenshots):
  out of scope for this phase — that's a data/empty-state question, not
  a styling one (already flagged as such in the main guide §18).

### Facturation (`/billing`)

- §3.1 description rewrite.
- §2.10 swap `StatusBadge` → `PlanBadge` for the plan column (fixes
  "all accent" directly).
- §1.4 `StatStrip` replaces the plain-text MRR/distribution line.
- Add `FilterBar` + `SearchInput` (search by org name) — none exists
  today; this table has no filtering at all currently.
- §2.6 name-cell styling.
- Row actions ("Prolonger"/"Remise"/"Payé hors Konnect"/"Annuler") are
  currently plain text links, not `IconActionButton`s at all — convert
  to icon buttons with tones: Prolonger=neutral, Remise=neutral, Payé
  hors Konnect=success, Annuler=danger. `[DECISION]` keep these as
  labeled icon+text buttons rather than icon-only (per the main guide's
  own icon-tooltip rule: "never on a button that already shows text" —
  these are financial actions, the label should stay visible, not
  collapse to icon-only).

### Stockage (`/storage`)

- §3.1/§3.2 description rewrite (drops the `Doc 00 §0.3` citation).
- §1.4 `StatStrip` for the "N organisations · N fichiers · N Mo" line.
- Add `FilterBar` + `SearchInput` (search by org name) + a
  `ToggleChip`-based status filter (the 5-tier `overage_status` is
  exactly the kind of thing worth a quick filter — `ok`/`warning`/
  `critical`/`over_limit`/`no_limit_defined`).
- §2.10 the plan column here has the same `StatusBadge`→`PlanBadge` bug.
- Fix "Quota (Doc 00 §0.3)" column HEADER too — same rule as §3.2, just
  in a `<th>` instead of a `<p>`. New header text: **"Quota"** (the
  per-row `StatusBadge` label already explains the actual threshold —
  Doc 00's own review note already says "each already pairs a label
  describing the actual threshold, not just a color," so the header
  doesn't need to duplicate the citation).
- Restyle "Nettoyer les fichiers orphelins": keep `variant="secondary"`,
  move it into the new `FilterBar`'s trailing slot (same slot pattern
  `ViewToggle` uses elsewhere) rather than floating next to the
  stats line — gives it a consistent, predictable location across
  screens that have a similar "maintenance action" need.

### Santé des services (`/services-health`)

- §1.1/§1.2 PageHero.
- Card-in-card fix: `InfraStatusGrid.tsx`'s per-service `<Card
className="p-4">` → de-elevate to a plain tile (`rounded-control
border border-neutral-200 p-4`, no shadow) since the parent
  `SectionCard` already supplies the one raised boundary for this
  section. Same fix wherever `ScheduledJobsTable`/`InvocationLogTable`
  render through `DataTable` inside a `SectionCard` — give `DataTable` a
  new optional `bare` prop that skips its own `Card` wrapper (renders
  the `<table>` directly) for exactly this nested-in-SectionCard case.
  This is a `DataTable` prop addition — flag per the golden rules'
  shared-package diff-review requirement.
- §2.4: `InvocationLogTable.tsx` drops its hand-rolled "page X/Y" text +
  two plain buttons, imports and uses the real `Pagination` component
  instead — direct swap, this table already has `page`/`totalPages`
  state in the right shape.

### Journal d'audit (`/audit-log`)

- Convert the 4 free-text inputs that have a real finite value space
  into selects/comboboxes:
  - **Table** (`tableFilter`) → `<select>` sourced from the actual set
    of tables this log writes to (confirm the list from the audit-log
    API/migration rather than guessing — likely `organizations`,
    `profiles`, `platform_admins`, etc.).
  - **Action** (`actionFilter`) → same treatment, sourced from the
    distinct `admin.*`/`org.*`/`user.*` action strings actually written
    (visible in the screenshots: `admin.login`, `admin.impersonate_start`,
    `user.reset_password`, etc. — collect the full set from the DB enum
    or existing usages, don't hand-type a partial list).
  - **Org ID / Actor ID** → `[DECISION]` these stay free-text (they're
    UUIDs, not a small enumerable set) but should visually match §2.1's
    shared input styling, and ideally become a lightweight lookup later
    (the main guide's §5's Feature-Flags "reuse GlobalSearch's org-lookup
    logic" idea applies equally well here — flagged as a nice-to-have,
    not required to close this phase).
  - **IP / date range** → stay as-is (free text / date pickers are
    already the right control type for these).
- Add `Pagination` — this table has none today despite clearly being a
  paged dataset. Wire it the same way `OrganizationsTable` does
  (`page`/`pageSize`/`total`/`onPageChange`).

### Sessions admin (`/admin-sessions`)

- `SessionsTable.tsx`'s revoke `IconActionButton` explicitly passes
  `size="sm"` — remove that prop (fall back to the shared `md` default)
  so it matches every other table's row-action sizing.
- Give the `ip_address` column an explicit `width` (e.g. `'150px'`) via
  `DataTableColumn`'s existing `width` field, and add `whitespace-nowrap`
  to that cell's render so IPv6 addresses don't wrap awkwardly.

### Gestion des admins (`/admin-users`)

- Same `IconActionButton` sizing check as Sessions — confirm it's using
  the `md` default (per the main guide's own note, this table's single
  action is correctly a lone `IconActionButton`, not a menu — leave that
  decision alone, just verify sizing consistency).

### Feature flags, Announcements, App Versions, Database Explorer

- No table-specific complaints raised against these in your list. Apply
  only the universal items: §1.1/§1.2 PageHero fix (all four use
  PageHero), §3.1 description-length rule if any of them currently runs
  long (spot-check before assuming — this audit didn't find a violation
  in these four specifically, unlike Billing/Storage/Dashboard).

---

## 6. Sequencing — how to run this without breaking Phase 4.6/6's work

Same discipline as the existing `premium-ux-system-prompts.md`: own
commit per step, stop for review, shared-package files get a diff shown
before applying.

```
Step 1 — token amendments only (§1.1–§1.5): packages/design-tokens,
         packages/config/tailwind-preset.js if radius classes need it.
         No component files touched yet. Typecheck + review, stop.

Step 2 — PageHero + DetailHeader (§1.1, §1.2): the two files, nothing
         else. These are shared components — diff review required per
         the golden rules. Typecheck admin + web (DetailHeader is used
         by both apps per its own header comment — confirm that before
         assuming an admin-only change). Stop.

Step 3 — new small components (§1.3 tone, §1.4 StatStrip, §1.5 TypeChip,
         §2.1 FilterSelect, §2.2 ToggleChip): build all five, wire into
         NO page yet. Pure addition, lowest risk step in this phase.
         Typecheck, stop.

Step 4 — DataTable visual pass (§2.5) + optional `bare` prop (§4/Services
         Health item): shared component, diff review required. Typecheck
         admin + web, run the full Playwright suite (this touches every
         table-bearing screen in both apps). Stop.

Step 5 — EntityCard avatar slot + 3-up grid default (§2.7, §2.8): shared
         component + the one call site that sets `grid-cols`
         (Organizations). Diff review. Typecheck + that page's spec file.
         Stop.

Step 6 — Organizations (list): wire everything from §5's Organizations
         row into this one page — SearchInput/select height, ToggleChip,
         ViewToggle/Pagination sizing (already fixed at the component
         level in earlier steps, this step is just confirming the page
         renders correctly with them), name-cell style, TypeChip, tone
         remap, avatar. One page, one session, per the golden rules.
         Run this page's spec file. Stop.

Step 7 — Users (list): same pattern as Step 6, this page only.

Step 8 — Billing: §2.10 PlanBadge swap, §3.1 description, §1.4 StatStrip,
         new FilterBar/SearchInput, row-action IconActionButton
         conversion. One page. Stop.

Step 9 — Storage: same shape as Step 8, plus the status ToggleChip and
         the "Nettoyer…" button relocation. Stop.

Step 10 — Services Health: card-in-card fix + Pagination swap in
          InvocationLogTable. Stop.

Step 11 — Audit Log: filter-field conversion to selects (confirm the
          real enumerated values first, per §5's own note — don't
          hardcode a guessed list) + add Pagination. Stop.

Step 12 — Admin Sessions + Admin Users: sizing fixes + IP column width.
          Smallest step, can be one session for both. Stop.

Step 13 — Dashboard/Billing/Storage copy pass (§3.1/§3.2) if not already
          covered incidentally by Steps 8–9 — verify, don't duplicate
          work already done in those steps.

Step 14 — Spot-check Feature Flags / Announcements / App Versions /
          DB Explorer against §5's "universal items only" note. Fix only
          if a real violation is found — don't invent one to have
          something to do in this step.
```

`[DECISION]` do not start Phase 5 (URL-persisted table state, column
controls, row `•••` menus) until Steps 1–14 above are all merged and
you've done a visual pass over every page in this table. Building Phase
5's state-management layer on top of table markup that's about to
change shape (§2.5/§2.6/§2.7/§2.8) is exactly the rework this phase
exists to avoid.

---

## 7. Definition of done for Phase 4.7

- [ ] No `rounded-[24px]` remains in `PageHero.tsx`/`DetailHeader.tsx`
- [ ] PageHero renders as a solid `neutral-0` card, no gradient
- [ ] Every `FilterBar` child control (search, select, toggle) is the
      same height
- [ ] "File de vérification" is a real component with a tooltip, not a
      one-off `<button>`
- [ ] `ViewToggle` and `Pagination` controls visually match
      `IconActionButton`'s scale
- [ ] Every table's name column: no underline, no `accent-600` link
      color, has an avatar
- [ ] Every table's row actions use the corrected tone-per-action
      mapping (§2.9) — no two semantically-different actions share a
      tone on the same row
- [ ] `PlanBadge` (not `StatusBadge variant="info"`) renders every plan
      column app-wide
- [ ] Organizations card view is 3-up, `EntityCard` has an avatar slot
- [ ] Billing and Storage both have search/filter and a `StatStrip`
      instead of a plain-text summary line
- [ ] No internal doc citation (`Doc 00 §0.3` or similar) or
      DAU/MAU-style disclosure paragraph renders anywhere in the app —
      verified by grep, not just the two pages found in this audit
- [ ] Services Health has no card-inside-card; `InvocationLogTable` uses
      the shared `Pagination`
- [ ] Audit Log's table/action filters are selects sourced from real
      values, not free-typed guesses; the page has pagination
- [ ] Admin Sessions' action icon matches every other table's size; IP
      column has a real width
- [ ] Full Playwright suite green (`pnpm --filter admin test`) — this
      phase touches shared components nearly every screen renders
