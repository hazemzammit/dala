# Dala Admin — UI/UX Overhaul Implementation Plan

**Scope:** `apps/admin` UI/UX, built on top of shared, upgraded components in `packages/ui-web` and `packages/design-tokens`. No API business-logic changes (one small additive exception, §0.7). `apps/mobile` is fully untouched (separate Tamagui implementation — see §0.2).

**Update (per your clarification):** the shared package `@dala/ui-web` (and `@dala/design-tokens`) is now the **one and only** place these components live. `apps/admin`'s local, unused duplicate files under `apps/admin/src/components/ui/` (`Card.tsx`, `Button.tsx`, `StatCard.tsx`, `StatusBadge.tsx`, `DataTable.tsx`, `EmptyState.tsx`, `Avatar.tsx`, `FormField.tsx`, `ConfirmTypingDialog.tsx`) get **deleted**, not revived. Every enhancement described below is built directly into `packages/ui-web/src/*` and `packages/design-tokens/src/index.ts`, and both `apps/admin` and `apps/web` benefit from it. `apps/web`'s own redesign is a separate, later effort you'll do yourself — this plan just makes sure it doesn't accidentally break in the meantime.

---

## 0. What I found in the codebase (read this before touching anything)

### 0.1 Monorepo shape

```
dala/
  apps/
    admin/     ← the app you're redesigning right now
    web/       ← contractor web app — shares packages/ui-web, will be redesigned by you later
    mobile/    ← Expo/React Native app — separate Tamagui implementation, no dependency on packages/ui-web at all (confirmed in package.json)
  packages/
    ui-web/         ← SHARED component library — THIS is where the real components live and where you'll do most of the work
    design-tokens/  ← single source of truth for colors/radius/spacing — read from here, and extend it (§0.3/§5)
    config/          ← tailwind preset that reads design-tokens
```

### 0.2 Two component libraries exist — keep only one

`apps/admin/src/components/ui/` currently has local copies of `Card`, `Button`, `StatCard`, `StatusBadge`, `DataTable`, `EmptyState`, `Avatar`, `FormField`, `ConfirmTypingDialog`. Verified by grep: **every single admin page already imports the real versions from `@dala/ui-web`** — these local files are dead code, never imported anywhere.

**Decision (per your instruction): delete the dead local files, build everything in `packages/ui-web/src/`.**

- Delete: `apps/admin/src/components/ui/Card.tsx`, `Button.tsx`, `StatCard.tsx`, `StatusBadge.tsx`, `DataTable.tsx`, `EmptyState.tsx`, `Avatar.tsx`, `FormField.tsx`, `ConfirmTypingDialog.tsx`.
- **Keep as-is** (these are genuinely admin-only, not duplicated in `@dala/ui-web`, and are actually imported): `apps/admin/src/components/ui/SearchInput.tsx`, `apps/admin/src/components/ui/NotesPanel.tsx`. Nothing in this plan touches those two.
- Every new/enhanced component goes into `packages/ui-web/src/`, exported from `packages/ui-web/src/index.ts` (a clean barrel file already exists there), and both `apps/admin` and `apps/web` import from `@dala/ui-web`.

**What this means for `apps/web`:** it will silently inherit the same visual refresh (nicer `Card` hover states, restyled `Pagination`, more colorful `StatusBadge`s, etc.) the next time it's built, since it imports the exact same package. Per your note, that's fine — it saves you work when you get to redesigning `apps/web` later, since the primitives will already be upgraded. The only discipline this requires: every change to `packages/ui-web`/`packages/design-tokens` should be **additive** (new optional props, new exported components, new token keys) rather than renaming/removing anything an existing `apps/web` call site relies on — that way `apps/web` keeps compiling and looking reasonable in the meantime, even though you haven't gotten to redesigning its actual page layouts yet.

**`apps/mobile` is unaffected no matter what you do here** — it doesn't depend on `@dala/ui-web` at all (it has its own separate Tamagui `StatCard`/etc., confirmed in `packages/design-tokens`'s own comments and in `apps/mobile/package.json`). Nothing in this plan touches `apps/mobile/**`.

### 0.3 Design tokens — extend them directly now

`packages/design-tokens/src/index.ts` already defines everything you need — `color.accent`, `color.neutral`, `color.status.{success,warning,danger}`, and a `color.categorical.{blue,violet,amber}` set whose own comment says it's reserved for exactly this kind of "more color, not on buttons" use (icon chips, plan badges, etc.).

Per this update, you can now **directly alias `categorical` into the Tailwind preset** (previously this plan hedged on this because it touched a shared file — that hedge is gone):

```js
// packages/config/tailwind-preset.js
colors: {
  accent: color.accent,
  neutral: color.neutral,
  success: color.status.success,
  warning: color.status.warning,
  danger: color.status.danger,
  categorical: color.categorical, // NEW — additive only, nothing renamed/removed
},
```

This gives you real Tailwind classes like `bg-categorical-violet/10 text-categorical-violet` in both apps. Purely additive — no existing `apps/web` class (`accent-*`, `neutral-*`, etc.) is touched.

**Contrast note (added after an external UX audit flagged this — see Appendix A):** `accent-600` (`#0F9D8E`) on white measures **~3.37:1** — it fails WCAG AA (4.5:1) for normal-size text. It's currently used as small (12–15.5px) link-colored text in several places (org name links, "Exporter", role/plan text). `accent-700` (`#0C7A6F`) measures **~5.21:1** and passes. **Fix, low-risk:** for small text-sized links (`text-xs`/`text-sm` accent-colored text, not filled buttons), swap `text-accent-600` → `text-accent-700` wherever you touch that code in this pass. This is a per-usage class swap, not a token redefinition — `accent-600` itself is untouched (still used correctly for solid button backgrounds' _hover/active_ states, active-nav pills, focus rings, icon chips — none of which are "600-colored text on white" at rest).

**Decided (was previously an open question — see Appendix A.5 for the full reasoning):** `Button.tsx`'s `primary` and `success` variants also fail AA at rest (`primary` 3.37:1, `success` 3.96:1, both need 4.5:1 — `danger` at 5.11:1 already passes, no change needed there). Resolution: **Option D** — redirect the `primary` and `success` variants' _resting-state_ background one step down the existing scale (`primary`: `accent-600` → `accent-700`; `success`: `#1F9254` → its existing darker step), and shift their hover/active states down one step accordingly (`primary` hover `accent-700`→`accent-800`, active `accent-800`→`accent-900`). Nothing new is introduced to the token scale — this reuses shades that already exist and are already reached on hover today, it just makes the resting state match. Every other use of `accent-600` (nav pills, icon chips, focus rings, decorative fills) is untouched, since those are graphical, not text, and already clear the 3:1 non-text threshold at 600. This is a change to `packages/ui-web/src/Button.tsx`'s `variantClasses` map only — see §2.1a below.

### 0.4 The Playwright test contract — `apps/admin` only, and it's the thing that still constrains you

`apps/admin/tests/*.spec.ts` locks in exact accessible names and visible text. (Note: `apps/web` currently ships **no** Playwright suite at all in this codebase — `package.json` has a `test` script but no config/spec files exist yet — so there is no automated regression risk on the `apps/web` side to worry about; `apps/admin`'s suite is the one real constraint left.) Grepped every `getByRole`/`getByText` across the whole `apps/admin` suite; this is the full list of strings that **must still resolve exactly the same way**:

| Selector                                                                                                                                                                                                    | Must remain                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getByRole('heading', { name: 'Métriques' })`                                                                                                                                                               | Dashboard heading text stays exactly `Métriques` (icon must be a **sibling**, not inside the heading text, and must have `aria-hidden="true"`)                                                                                       |
| `getByRole('button', { name: 'Suspendre' })` (row + dialog, `exact: true` on the dialog one)                                                                                                                | Suspend button/icon-button accessible name stays `Suspendre`                                                                                                                                                                         |
| `getByRole('button', { name: 'Supprimer' })`                                                                                                                                                                | Delete button accessible name stays `Supprimer`                                                                                                                                                                                      |
| `getByRole('button', { name: 'Restaurer' })`                                                                                                                                                                | Restore button stays `Restaurer`                                                                                                                                                                                                     |
| `getByRole('button', { name: 'Suivant' })`                                                                                                                                                                  | Pagination "next" control stays `Suivant`                                                                                                                                                                                            |
| `getByRole('button', { name: 'Impersonate' })`                                                                                                                                                              | stays `Impersonate`                                                                                                                                                                                                                  |
| `getByRole('button', { name: 'Démarrer' })`                                                                                                                                                                 | `ConfirmTypingDialog`'s confirm button — component behavior unaffected as long as you only restyle it                                                                                                                                |
| `getByRole('button', { name: "Quitter l'impersonation" })`, `'Activer et se connecter'`, `'Continuer'`, `'Déconnexion'`, `'Se connecter'`, `'Réinitialiser 2FA'`, `'Réinitialiser'` (exact), `'Rechercher'` | unaffected screens/components — just don't rename these while restyling nearby code                                                                                                                                                  |
| `getByText(/Page \d+\/\d+/)`                                                                                                                                                                                | Pagination indicator text format `Page X/Y` must stay **exactly** this format (can be restyled, not reworded)                                                                                                                        |
| `getByText('Supprimée (récupérable)')`, `getByText('Active', {exact:true})`                                                                                                                                 | Status badge **label text** must stay exactly this (badge color/shape can change)                                                                                                                                                    |
| `getByRole('row', { name: new RegExp(...) })`                                                                                                                                                               | Table rows must stay real `<tr>`/`<table>` semantics in the **default view** — see 0.5                                                                                                                                               |
| `getByText('Aucune organisation ne correspond à cette recherche.')`                                                                                                                                         | Empty-state copy unchanged                                                                                                                                                                                                           |
| `getByRole('button', { name: 'Impersonate' })` + `.locator('tr', { hasText: 'Impersonate' })` (`tests/impersonation.spec.ts`)                                                                               | If you localize this to "Imiter" (an external audit's suggestion — see Appendix A), you **must** update this test file in the same change. Not a blocker, just not a silent copy edit.                                               |
| `page.locator('p', { hasText: 'DAU/MAU' })` whose `innerText` must contain both `DAU/MAU` and `désabonnement` (`tests/dashboard.spec.ts`)                                                                   | The Dashboard's honest-gap disclosure paragraph must stay a real, visible `<p>` containing both phrases — restyle its container all you want, don't move this into a tooltip/modal/collapsed disclosure or reword away either phrase |
| `getByText('Organisations totales')` etc. (all 8 exact `StatCard` labels, `tests/dashboard.spec.ts`)                                                                                                        | `IconStatCard` must render these exact same 8 label strings (§5.1 already does this — just don't rephrase them for "polish")                                                                                                         |

**Rule of thumb:** restyle freely, but any user-visible **text string** or **`aria-label`** a test asserts on must survive unchanged. Converting a text button to an icon button → put the exact original label in `aria-label` (and optionally a visually-hidden `sr-only` span too) — `getByRole('button', {name: 'Suspendre'})` matches an `aria-label` just as well as visible text.

### 0.5 Table/Card view toggle — must default to "table"

Every list screen's Playwright test drives the **table** (`getByRole('row', ...)`). When you add a Table/Card view switch, **the default view on load must stay "Table"**. Card view is an alternate the admin opts into; persist the choice in `localStorage` if you like, but the code default must be `'table'` regardless of any stored value logic, since Playwright runs with a clean browser profile per `tests/global-setup.ts` anyway.

### 0.6 The logo asset

`apps/admin/assets/logo.png` — 2160×1080, RGB, lots of white padding, contains an icon mark ("building bars") on the left and the "dala" wordmark + tagline on the right, in one image.

`apps/admin/assets/` is **not** served by Next.js — only `apps/admin/public/` is, and that directory doesn't exist yet. You need to:

1. Create `apps/admin/public/`.
2. Export two crops from the source PNG:
   - `public/logo-mark.png` — just the icon (square-ish crop of the left ~48% of the image). Used for the **collapsed** sidebar and as a small square badge.
   - `public/logo-full.png` — icon + "dala" wordmark. Used in the **expanded** sidebar header, replacing the current `<div className="bg-accent-600">D</div>` placeholder.
3. One-off crop script (or any image editor — this is a manual, one-time step):

```js
// scripts/crop-logo.mjs — run once locally, not part of the app bundle
import sharp from 'sharp';
await sharp('assets/logo.png')
  .extract({ left: 380, top: 190, width: 380, height: 400 })
  .resize(128, 128, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .toFile('public/logo-mark.png');
await sharp('assets/logo.png')
  .extract({ left: 380, top: 190, width: 1170, height: 400 })
  .resize(600, 205, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .toFile('public/logo-full.png');
```

(Crop coordinates are approximate — adjust by eye against the actual file.) Use `next/image` for both.

This logo work stays **admin-only** (`apps/admin/public/`, `apps/admin/src/components/shell/Sidebar.tsx`) regardless of the packages/ui-web decision above — it's not a shared component.

### 0.7 The org logo field exists in the DB but isn't exposed by the admin API yet

`organizations.logo_url` (migration `0003`) is a real column — a storage path in the `org-files` bucket, not a directly renderable URL. The admin org-detail route (`apps/admin/src/app/api/admin/organizations/[orgId]/route.ts`) currently does a plain `select('*')`, so `organization.logo_url` in the JSON is just the raw path.

One small **additive** backend change (this is the only API route touched in this whole plan):

```ts
// in GET handler, after fetching `organization`:
let logoSignedUrl: string | null = null;
if (organization.logo_url) {
  const { data: signed } = await supabase.storage
    .from('org-files')
    .createSignedUrl(organization.logo_url, 3600);
  logoSignedUrl = signed?.signedUrl ?? null;
}
return NextResponse.json({
  organization: { ...organization, logo_signed_url: logoSignedUrl },
  members: members ?? [],
});
```

Purely additive (new key in the response) — every existing consumer keeps working identically.

### 0.8 Other gaps confirmed while reading the code (context only)

- `Topbar.tsx`/`GlobalSearch.tsx` exist but aren't rendered anywhere (`(admin)/layout.tsx` only renders `Sidebar` + `ImpersonationBanner` + `main`), matching your screenshots. Re-wiring them is a functional change, out of scope for this styling pass — flagged so you don't "discover" it mid-task and think something's broken.
- Every admin page currently renders a bare `<h1>` (+ sometimes a plain `<p>` description). `packages/ui-web` already has a `PageHero` component with almost exactly this anatomy (eyebrow → title → description → actions) — its own header comment currently says _"Web-only — never imported by Admin... Admin's plain `<h1>` dashboard is deliberate."_ That comment is now stale per your new direction; Phase 1 updates it and extends `PageHero` so Admin uses it too (see §2.4).
- Organizations list API supports `?q=`, `?page=`, `?pageSize=`, `?verificationPending=1`, but no `?plan=` filter yet. The plan-filter dropdown is therefore a **client-side filter over the current page's rows** — zero backend risk, optional server-side `?plan=` param noted as a future nice-to-have.

---

## 1. Guiding rules (read before every phase)

1. **`packages/ui-web/**` and `packages/design-tokens/**` are now in scope.** Build/enhance components there. Every change must be **additive**: new optional props with safe defaults, new exported components, new token keys — never rename or remove an existing export, prop, or token key that `apps/web` might already use (you haven't audited every `apps/web` call site, so don't assume it's safe to delete something just because _admin_ doesn't use it).
2. **`apps/mobile/**` is fully out of scope** — it has zero dependency on `packages/ui-web`, so there's no way to accidentally affect it, but don't go looking for a reason to touch it either.
3. **`apps/web/**`'s own page code is out of scope for this pass** — you're upgrading the shared primitives it happens to consume, not redesigning its screens. Don't open files under `apps/web/src/app/**` at all.
4. **Never change request/response shapes of existing API routes** except the one additive `logo_signed_url` field (§0.7).
5. **Never rename or remove an existing visible string or `aria-label`** covered in the §0.4 table, or anything a `.spec.ts` file asserts on — grep the relevant spec file first if unsure.
6. **Default states must not change**: default list view = table, default sidebar state = expanded, default sort = unsorted.
7. **Delete the dead admin-local duplicates** (§0.2) as an early cleanup step — don't leave two copies of `Card`/`Button`/etc. lying around.
8. **One phase at a time, verify, commit, move on.** After each phase: `pnpm --filter @dala/ui-web typecheck`, `pnpm --filter admin typecheck`, `pnpm --filter admin lint`, run the relevant `*.spec.ts` file(s), and eyeball the page against the screenshots you already have. Also spot-check that `apps/web` still typechecks (`pnpm --filter web typecheck`) since it now shares every component you're touching.

---

## 2. New / enhanced component inventory — all in `packages/ui-web/src/`

Every component below lives in `packages/ui-web/src/`, gets exported from `packages/ui-web/src/index.ts`, and is imported in `apps/admin` (and, automatically, available to `apps/web`) as `import { X } from '@dala/ui-web'`.

### 2.1 `Card.tsx` (extend the existing shared component)

Add an `interactive` prop (hover elevation + subtle lift transition) and a `tone` prop (colored left accent border), both optional, both no-ops unless passed — so every existing `apps/web` usage renders identically until a caller opts in.

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  interactive?: boolean; // hover: shadow deepens + translateY(-2px), 150–200ms ease
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral'; // optional 3px left border
}
```

### 2.1a `Button.tsx` (contrast fix, Option D — decided, see §0.3/Appendix A.5)

`variantClasses` currently has `primary`/`success` failing WCAG AA at rest. Fix:

```tsx
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent-700 text-white hover:bg-accent-800 active:bg-accent-900',
  secondary:
    'bg-neutral-0 text-neutral-900 border border-neutral-300 hover:bg-neutral-100 active:bg-neutral-200', // unchanged
  text: 'bg-transparent text-accent-700 hover:text-accent-800 px-0', // was accent-600/700 — same reasoning as the small-link-text fix in §0.3
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80', // unchanged — already 5.11:1, passes
  success: 'bg-status-successButton text-white hover:opacity-90 active:opacity-80', // NEW token, see below
};
```

`primary`/`text` genuinely just reuse existing scale steps (`accent-700`/`800`/`900` already exist in `packages/design-tokens`) — nothing new there. `success` is different: **`packages/design-tokens`'s `status` colors have no scale at all** (`success`/`warning`/`danger` are each a single hex, confirmed by reading the token file directly — there's a _dark-mode_ success value, `#26A862`, but that's a lighten for dark backgrounds, the opposite direction, not reusable here). So a genuinely new token is needed for this one case — add `color.status.successButton` rather than redefining `color.status.success` itself. Confirmed why that matters: `status.success` is consumed in 25+ files across `apps/admin` and `apps/web` (`StatusBadge`, `StatCard`, `Avatar`, several contractor screens like billing/advances/team/vehicles), almost all as colored text/badge-tint on a light background — a different, already-passing contrast pairing from "white text on a solid fill." Redefining `success` itself would risk re-tuning all of those for a problem specific to one component's one variant. A scoped `successButton` token keeps the fix exactly where the failure is. Computed value: darkening `#1F9254` by ~8% gives `#1C864D` at **4.60:1** against white — clears AA with a small margin, smallest change that works, same method as the accent computation above.

Worth noting: `packages/design-tokens` already has a precedent for exactly this kind of audited darkening — its dark-mode block has a comment explaining `success`/`danger` were deliberately re-measured and adjusted (in that case lightened, for dark backgrounds) with the exact ratios recorded inline, rather than eyeballed. Add the new `successButton` value the same way: as a real token with a comment recording the computed ratio, not a hardcoded hex dropped directly into `Button.tsx`.

This is the **one** change in this whole plan that visibly changes the resting color of an existing, shared, heavily-used component beyond "add an optional prop" — flagged explicitly rather than folded in silently, per the Guiding Rules' additive-by-default principle (§1). It affects every `primary`/`success`/`text`-variant button in both `apps/admin` and `apps/web` simultaneously, immediately on merge. Do this as its own isolated commit/PR, separate from any single page's changes, so it's easy to review and easy to revert on its own.

### 2.2 `StatusBadge.tsx` (extend) + new `PlanBadge.tsx`

Keep the existing `success | warning | danger | info | neutral` variants and their exact rendering (test-asserted text must not change). Add a new sibling component, `PlanBadge`:

```tsx
// packages/ui-web/src/PlanBadge.tsx
export function PlanBadge({ plan }: { plan: string }) {
  /* free→neutral, pro→accent, business→categorical-violet */
}
```

- `free` → neutral pill (base tier, no special color)
- `pro` → accent teal (paid, branded tier)
- `business` → `categorical.violet` (`#7B5FCE`) — visually distinct top tier, never reusing status-meaning colors
  Export it from `index.ts` alongside `StatusBadge`. Directly answers "make the Plan pills different colors, switch the value."

### 2.3 `IconStatCard.tsx` (new, sibling of the existing `StatCard`)

Keep `StatCard.tsx` itself untouched (don't risk any existing `apps/web`/mobile-parity assumptions about its exact shape) — add a new component instead:

```tsx
interface IconStatCardProps {
  label: string;
  value: string | number;
  icon: Icon; // phosphor icon component
  tone?:
    | 'accent'
    | 'success'
    | 'warning'
    | 'danger'
    | 'categoricalBlue'
    | 'categoricalViolet'
    | 'categoricalAmber';
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
}
```

Renders `Card` (with `interactive`) + a 40px rounded icon chip (background = tone at 10–15% opacity, icon = solid tone color) + label/value, matching `StatCard`'s existing typography exactly. This is the "add icons to each card on Métriques" component.

### 2.4 `PageHero.tsx` (extend — this is the "title + subtitle + icon" component, reused rather than reinvented)

`PageHero` already has almost exactly the anatomy you want (eyebrow → title → description → actions). Add one new optional prop:

```tsx
interface PageHeroProps {
  eyebrow?: string;
  icon?: Icon; // NEW — optional, renders a colored icon chip before the title
  title: string;
  description?: string;
  actions?: ReactNode;
}
```

When `icon` is omitted, rendering is byte-identical to today (so existing `apps/web` usages are unaffected). Update its header comment — it currently says "never imported by Admin" / "Admin's plain `<h1>` is deliberate," which is no longer true; replace that note with something like "Now used by both apps — Admin adopted this in its UI overhaul pass; the `icon` prop is Admin's main addition, `apps/web` call sites simply don't pass it." Every `apps/admin` page swaps its bare `<h1>`/`<p>` pair for `<PageHero icon={...} title="..." description="..." />` — keep the exact same title text everywhere a test asserts on it (see §0.4).

### 2.5 `FilterBar.tsx` (new)

A `Card`-styled row holding: a search input slot + a slot for arbitrary filter controls (`<select>`s, toggle chips) + a trailing slot (e.g. `ViewToggle`). Reuses `apps/admin`'s existing `SearchInput` component as a child (that one stays admin-local, per §0.2 — it's not duplicated in `ui-web`, no reason to move it).

```tsx
interface FilterBarProps {
  children: ReactNode;
  trailing?: ReactNode;
}
```

### 2.6 `ViewToggle.tsx` (new)

Two-button segmented control (table icon / grid icon):

```tsx
function ViewToggle({
  value,
  onChange,
}: {
  value: 'table' | 'card';
  onChange: (v: 'table' | 'card') => void;
});
```

Default value passed in by the parent must always be `'table'` (§0.5).

### 2.7 `EntityCard.tsx` (new — the "card view" row renderer used by Organizations/Users lists)

```tsx
interface EntityCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  fields: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  href?: string;
}
```

### 2.8 `IconActionButton.tsx` (new — replaces bare text action links like "Suspendre"/"Supprimer"/"Exporter")

```tsx
interface IconActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  label: string; // becomes aria-label — THE EXACT SAME STRING the old text button used
  tone?: 'accent' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
  href?: string; // renders an <a> instead of a <button> when set (e.g. the Exporter link)
}
```

Small rounded-square icon-only control with `aria-label={label}`, a native `title={label}` tooltip, and a `sr-only` span for extra-safe accessible-name matching. Drop-in replacement for any existing plain text action link/button — same `onClick`/`href`/disabled logic, same accessible name, new look.

### 2.9 `Pagination.tsx` (new — extracted from `DataTable`'s inline pagination markup)

Same prop shape `DataTable` already accepts as its `pagination` prop (`page`, `pageSize`, `total`, `onPageChange`). Must preserve:

- `X–Y sur Z` / `0 résultat` text.
- Exact `Page X/Y` text format (test-asserted).
- `Précédent` / `Suivant` accessible names (`Suivant` is test-asserted).
  Visual upgrade only: card/pill container, icon-only prev/next buttons with the label kept as `sr-only`/`aria-label`.

### 2.10 `DataTable.tsx` (extend in place — shared component, thin visual changes only)

Keep 100% of the existing sort/select/bulk-action logic unchanged. Visual-only changes:

- Header cells: subtle background tint, smoother sort-caret transition.
- Row hover: a touch more contrast + a subtle left-border highlight (still `cursor-pointer` when `onRowClick` set).
- Bulk-actions bar: icon + a bit more color.
- Swap the inline pagination markup for the new `<Pagination {...pagination} />` (2.9) — same prop contract, so this is a pure internal refactor from `DataTable`'s callers' point of view.
- **Audit-derived, cheap and worth doing:** give the trailing actions column a real (visually present or at least screen-reader-present) header — `header: 'Actions'` on that column definition wherever a page currently leaves it blank — and add `className="sticky top-0"` (plus a solid/blurred background so content doesn't show through) to the `<thead>` for any table likely to scroll past one screen (Organizations, Users, Audit Log). Both are one-line, purely additive changes to each call site's column config / the shared `<thead>` className, not a `DataTable` API change.
- **Correcting a screenshot-only assumption in the external audit:** it says "bulk actions are missing despite checkboxes" for Organizations/Users — that's not accurate; both `OrganizationsTable.tsx` and `UsersTable.tsx` already pass a `bulkActions` render-prop to `DataTable`, which only appears once at least one row is selected (`selected.size > 0`) — the screenshots simply had nothing selected. Nothing to build here, just be aware the feature already exists when you restyle the bar's colors/icons per §5.2/§5.4.

### 2.11 `DetailHeader.tsx` (new — for Organization/User detail pages)

```tsx
interface DetailHeaderProps {
  backHref: string;
  backLabel?: string; // e.g. "Organisations" — powers the breadcrumb, see below
  icon: Icon;
  avatarUrl?: string | null; // e.g. org.logo_signed_url
  title: string;
  status?: ReactNode;
  meta?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
}
```

Icon-button back arrow (→ "add back arrow to the previous page") + a 56px logo/avatar circle (image if `avatarUrl`, else initials in a colored circle, same palette-hash logic `Avatar.tsx` already uses) + title + status badges + small meta stats + optional actions.

**Addition (external audit's "no breadcrumbs" point, adopted here rather than as a separate component):** when `backLabel` is passed, render a small breadcrumb strip above the title — `{backLabel} / {title}` (e.g. "Organisations / Climatisation Cap Bon") — as plain text with the first segment as a link to `backHref`. This is the same information the back arrow already conveys, just also written out, so it's an additive text row inside `DetailHeader`, not a whole new navigation component or a router-level breadcrumb system.

### 2.12 `SectionCard.tsx` (new, tiny) — `Card` + an icon+title header, used for every "Profil de l'entreprise" / "Membres" / "Notes internes"-style sub-section so those get the same icon+heading treatment as top-level pages.

### 2.13 `apps/admin/src/components/shell/Sidebar.tsx` (admin-only, edit in place — see §3)

### 2.14 `packages/design-tokens/src/index.ts` — no new file, just the `categorical` Tailwind-preset alias from §0.3, plus (optional, nice-to-have) a small exported palette-rotation helper if you want one shared between `IconStatCard` usages: `colorForIndex(i: number)`.

### 2.15 `Skeleton.tsx` / `TableSkeleton.tsx` (new — replaces bare "Chargement…" text, per the audit's loading-state point)

`IconStatCard`/`StatCard` already have a loading skeleton (animated-pulse bars inside a `Card`) — this generalizes that same visual language into two small reusable pieces:

```tsx
export function Skeleton({ className }: { className?: string }); // one pulsing bar, sized by className
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }); // a Card containing a grid of pulsing bars shaped like a table
```

Every page currently doing `{loading ? <p className="text-sm text-neutral-500">Chargement…</p> : ...}` swaps that ternary's loading branch for `<TableSkeleton />` (or a couple of `<Skeleton />` bars for smaller sections). No test asserts on the literal string "Chargement…" (confirmed by grepping the whole `apps/admin/tests/` suite), so this is a safe, no-caveat swap everywhere it appears.

### 2.16 `OverflowActionMenu.tsx` (new, optional — only for rows with more actions than comfortably fit as icon buttons)

The audit's "replace text links with a `⋯` dropdown" is adopted **selectively**, not as a wholesale replacement of `IconActionButton` (2.8) — you were explicit that you want icon buttons for row actions, and `IconActionButton` already solves the "text links wrap and clutter the row" problem the audit is really pointing at. Reserve `OverflowActionMenu` for rows that would otherwise need more than ~3 icon buttons side by side (e.g. Users list, whose current action set is fuller: reset password, suspend/reactivate, delete, revoke sessions). Pattern: show the 1–2 most common actions as `IconActionButton`s, put the rest behind a single `⋯` (`DotsThreeVerticalIcon`) trigger that opens a small popover list — each item in that list is still a plain, real `<button>`/`<a>` with the exact same `aria-label`/text it had before, so `getByRole('button', {name: 'Réinitialiser'})` etc. keep resolving correctly whether the button is directly visible or inside an opened popover (Playwright can open the popover in a test if one is ever added for it, but nothing here is currently test-asserted through this menu specifically — double-check the relevant `.spec.ts` file's exact click path before wiring this into a screen that already has passing tests clicking that action directly).

### 2.17 Localized label-map pattern (not a component — a convention to reuse)

`OrgDetail.tsx` already has this exact pattern for `verification_status`/`legal_form`/`workforce_size_bracket` (`VERIFICATION_LABEL`, `LEGAL_FORM_LABEL`, `WORKFORCE_BRACKET_LABEL` — plain `Record<string, string>` maps, enum value in, French label out, raw value stays the source of truth everywhere else). Extend the same convention to the two places the audit correctly flagged raw enum values leaking into the UI as English/technical strings:

- **Organization member role** (`owner`/`manager`/`viewer` in `OrgDetail.tsx`'s members table): add `const ROLE_LABEL: Record<string,string> = { owner: 'Propriétaire', manager: 'Gestionnaire', viewer: 'Lecteur' }`, render `ROLE_LABEL[m.role] ?? m.role` inside the existing `StatusBadge`. No test asserts on the literal `owner`/`manager`/`viewer` text (confirmed), so this is a safe, drop-in display-only change — the underlying `m.role` value used for any logic (e.g. permission checks) is untouched.
- **Plan display label** inside the new `PlanBadge` (2.2): show `{ free: 'Gratuit', pro: 'Pro', business: 'Entreprise' }[plan] ?? plan` instead of the raw `free`/`pro`/`business` string, while the component's `plan` prop and every API payload/DB value stay exactly `free`/`pro`/`business` (confirmed: `tests/organizations.spec.ts` asserts on the raw value `'pro'` sent to/read from the mutation API, never on displayed badge text — so this localization is purely cosmetic and doesn't touch anything test- or logic-relevant).

---

## 3. Sidebar collapse/expand — detailed spec (unchanged by the packages decision — this stays admin-only)

**File:** `apps/admin/src/components/shell/Sidebar.tsx`.

### Behavior

- New state: `collapsed: boolean`, initialized from `localStorage.getItem('dala-admin-sidebar-collapsed') === '1'`, defaulting to `false` (expanded) when nothing is stored.
- A toggle button (chevron icon) at the bottom of the nav or top-right of the header. `aria-label="Réduire le menu"` / `"Développer le menu"`.
- Width transitions with `transition-[width] duration-200 ease-in-out`: `w-[240px]` ⇄ `w-[76px]`.

### What shows in each state

| Element          | Expanded (240px)                                   | Collapsed (76px)                                                                       |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Header           | `logo-full.png` (icon + "dala" wordmark)           | `logo-mark.png` only, centered                                                         |
| Nav items        | icon + label, same active/hover treatment as today | icon only, centered; label visually hidden as `sr-only` (keeps accessible name intact) |
| Nav item tooltip | none needed                                        | native `title` attribute with the label                                                |
| Footer           | avatar + name + role + sign-out icon               | avatar only + sign-out icon, `aria-label="Déconnexion"` unchanged (test-asserted)      |

### Implementation notes

- Keep `NAV_ITEMS` and `AdminNavItem`'s active-state logic completely unchanged — only branch the rendered markup on a new `collapsed` prop passed down from `Sidebar`.
- Persist to `localStorage` in a `useEffect` keyed on `collapsed`.
- `(admin)/layout.tsx` needs no change beyond the aside's width class — flexbox reflows `<main>` automatically.
- Don't change `getAdminSessionContext()` / `useAdminSession()` wiring.

### Addition (external audit's "13+ flat items, group them" point — adopted, low risk)

Restructure `NAV_ITEMS` from one flat array into 4 labeled groups, rendered with a small uppercase group-label divider between them:

- **Vue d'ensemble** — Métriques
- **Gestion** — Organisations, Utilisateurs, Facturation, Stockage
- **Système** — Santé des services, Versions de l'app, Feature flags, Annonces
- **Sécurité** — Journal d'audit, Database Explorer, Gestion des admins, Sessions admin

This is purely a data-shape change to how `NAV_ITEMS` is declared (array of groups instead of one array of items) plus a render-loop change — every individual item's `href`/icon/active-logic is identical, so nothing about navigation, routing, or the active-state check changes. Confirmed no test asserts on `getByRole('link', ...)` against the sidebar (grepped the whole suite), so regrouping the same items is safe. In the **collapsed** state, render the group divider as a thin horizontal rule with no visible label (keep it purely as a visual separator, `aria-hidden`) rather than trying to fit vertical group text into 76px.

---

## 4. Color usage summary table

| Purpose                                                                 | Token                            | Notes                                                             |
| ----------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| Primary buttons, active nav, links, focus rings                         | `accent-600`                     | unchanged — still the only "this is clickable/primary" signal     |
| Success status (Active, Approved, 2FA on)                               | `status.success`                 | unchanged token, used more often via `StatusBadge`/`IconStatCard` |
| Warning status (Suspended, stale data, near storage limit)              | `status.warning`                 | same                                                              |
| Danger status (Deleted, Suspend/Delete action icon, over storage limit) | `status.danger`                  | same                                                              |
| "Business" plan / highest-privilege role                                | `categorical.violet` (`#7B5FCE`) | new usage — never on a button/CTA                                 |
| "Utilisateurs"/secondary metric icon chips                              | `categorical.blue` (`#3E6FD1`)   | new usage — icon chips only                                       |
| "Projets"/tertiary metric icon chips                                    | `categorical.amber` (`#B5790F`)  | new usage — icon chips only                                       |
| Neutral/base (free plan, unmonitored, no-data)                          | `neutral-100/500`                | unchanged                                                         |

Primary actions (buttons, active nav, links) stay accent-teal — that convention is correct and isn't changing. "More color" means richer icon chips / plan badges / role badges, done via `packages/design-tokens`'s existing `categorical`/`status` sets (§0.3), not a repaint of buttons.

**Decided (previously an open question — see §2.1a and Appendix A.5 for the full reasoning):** the audit's contrast complaint also applies to solid `accent-600`/`success` buttons with white label text, not just small text links. Resolution: **Option D** — `primary` moves to `accent-700`/`800`/`900` (reusing existing scale steps, hover/active shift down one step to match), `success` gets one new, properly-computed `successButton` token (`#1C864D`, 4.60:1) rather than redefining the widely-consumed base `success` value. `danger` needs no change (already 5.11:1). Implemented in `packages/ui-web/src/Button.tsx` — see §2.1a for the exact diff and why this one change ships as its own isolated commit rather than folded into a page's changes.

---

## 5. Per-page implementation plan

For every page: current file(s), what changes, which components are used (all now `import { X } from '@dala/ui-web'` unless noted as admin-local), page-specific gotchas.

### 5.1 Dashboard / Métriques — `app/(admin)/dashboard/page.tsx`

- Swap the bare `<h1>Métriques</h1>` for `<PageHero icon={GaugeIcon} title="Métriques" description="Vue d'ensemble de la plateforme : organisations, utilisateurs, activité et facturation." />`. Keep the text `Métriques` exactly (icon is a decorative sibling with `aria-hidden`, never inside the `<h1>` — check `PageHero`'s internal markup to confirm the icon isn't nested inside the heading element).
- Replace each `<StatCard .../>` with `<IconStatCard .../>` (2.3), one icon + tone per metric:
  - Organisations totales → `BuildingsIcon`, tone accent
  - Organisations actives → `CheckCircleIcon`, tone success
  - Utilisateurs totaux → `UsersThreeIcon`, tone categoricalBlue
  - MRR → `CoinsIcon`, tone categoricalViolet
  - Projets → `HardHatIcon`, tone categoricalAmber
  - Journaux de chantier → `ClipboardTextIcon`, tone accent
  - Dépenses enregistrées → `ReceiptIcon`, tone warning
  - Stockage utilisé → `HardDrivesIcon`, tone neutral
- Give each card `interactive` for the subtle hover animation ask.
- The DAU/MAU/churn footnote paragraph **must stay a real, visible `<p>` containing both "DAU/MAU" and "désabonnement" verbatim** (test-asserted, §0.4) — restyle its container as an `info`-toned `SectionCard`/callout with an icon, but don't shorten it into a generic "no data" empty state or move it into a tooltip, however tempting that is for "polish." This directly reconciles the external audit's "replace the wall of text with a designed empty state" suggestion — the content has to stay, only the frame around it can change.
- Use the new `Skeleton`/`TableSkeleton` (2.15) if this page has any client-side loading branch; if it's fully server-rendered (it currently is — `async function DashboardPage()`), there may be nothing to skeleton-ize here at all, which is fine.
- This file is a Server Component — confirm `PageHero`/`IconStatCard` don't require client-only hooks (they shouldn't; only interactive bits like `Sidebar`/`ViewToggle` need `'use client'`).

### 5.2 Organizations list — `organizations/page.tsx` + `organizations/OrganizationsTable.tsx`

- `page.tsx`: `<PageHero icon={BuildingsIcon} title="Organisations" description="Gérez les comptes contractants : plans, membres, statut et vérification." />`.
- `OrganizationsTable.tsx`:
  - Replace the current search+queue-toggle row with `<FilterBar>` containing: the existing `SearchInput` (admin-local, unchanged), a new native `<select>` "Plan" filter (`Tous les plans / free / pro / business`) filtering the already-fetched `orgs` array client-side (§0.8 — no backend change), and the existing "File de vérification" toggle button as a filter chip. `<ViewToggle>` as the `trailing` slot, defaulting to `'table'`.
  - Replace `<StatusBadge variant="info">{r.plan}</StatusBadge>` with `<PlanBadge plan={r.plan} />`.
  - Replace the bare action links (Suspendre / Supprimer / Exporter / Approuver / Refuser) with `<IconActionButton>`, each keeping its exact original `aria-label`/behavior: `PauseCircleIcon` (Suspendre, warning), `TrashIcon` (Supprimer, danger), `DownloadSimpleIcon` (Exporter, accent, `href` set since it's a plain link today), `CheckIcon`/`XIcon` (Approuver/Refuser, queue-only).
  - `viewMode === 'card'` → `orgs.map(org => <EntityCard .../>)` in a responsive grid using the same data as the table columns. `viewMode === 'table'` (default) → unchanged `<DataTable>` usage, now visually upgraded automatically since `DataTable` itself was enhanced in `packages/ui-web`.
  - Bulk-action bar labels ("Changer le plan", "Exporter (JSON)") can gain small icons — text unchanged.
  - Swap `Chargement…` for `<TableSkeleton />` (2.15).
  - "File de vérification" toggle button: keep its exact current behavior, but per the audit's fair point that the label is ambiguous — consider a clearer label (e.g. "Vérifications en attente") plus a small count badge showing how many orgs are pending. Confirmed: `tests/organizations.spec.ts` never references this string, so renaming it is safe.

### 5.3 Organization detail — `organizations/[orgId]/OrgDetail.tsx` (+ its `page.tsx` wrapper)

- Check the current `page.tsx` wrapper's exact contents before editing (thin server component rendering `<OrgDetail orgId=.../>`).
- Replace the bare `<h1>{org.name}</h1>` block with `<DetailHeader>`:
  - `backHref="/organizations"`.
  - `avatarUrl={org.logo_signed_url}` (from the §0.7 API addition) — falls back to initials/building-icon circle when absent.
  - `status`: existing suspended/deleted/active `StatusBadge` logic, unchanged, relocated into the header.
  - `meta`: plan, trade_type, created date. Keep the fuller `<dl>` field grid below for everything else ("Profil de l'entreprise") — don't drop any field, just wrap it in `SectionCard`.
- "Membres" block → `SectionCard`. The lone "Impersonate" action → `<IconActionButton icon={UserSwitchIcon} label="Impersonate" tone="accent" />` — same `aria-label`, same `onClick`.
- `NotesPanel` stays exactly as-is (admin-local, already working) — optionally wrap in `SectionCard` for visual consistency.
- Restore/Approuver/Refuser buttons keep using the (now-enhanced) shared `Button` — no import change needed, they already come from `@dala/ui-web`.
- Member role labels → apply the `ROLE_LABEL` map from §2.17 inside the existing `StatusBadge`, display-only.
- Any field currently rendering a bare `—` for a genuinely-empty value (e.g. `org.matricule_fiscal ?? '—'`) can read `'Non renseigné'` instead per the audit's suggestion — purely a copy change on the fallback string, no test dependency found on the literal `—` character. Do this consistently across every field in the "Profil de l'entreprise" section if you adopt it, not just some.

### 5.4 Users list — `users/page.tsx` + `users/UsersTable.tsx`

Same treatment as 5.2:

- `PageHero icon={UsersThreeIcon} title="Utilisateurs" description="Comptes contractants et ouvriers, toutes organisations confondues."`.
- `FilterBar` wraps `SearchInput` + a new "Statut" filter (`Tous / Actif / Suspendu`, client-side) + `ViewToggle` (default `'table'`).
- `StatusBadge` text (`Actif`/`Suspendu`) stays exactly the same, just restyled.
- Action links → `IconActionButton`s for every existing action in this table's columns (check the actual current set before assuming). **`Réinitialiser` has an `exact: true` test assertion** — the icon button's `aria-label` must be exactly `Réinitialiser`, not a longer phrase.
- Card view via `EntityCard`.

### 5.5 User detail — `users/[userId]/UserDetail.tsx`

Same `DetailHeader` treatment (`backHref="/users"`, initials-based circle since users have no logo field). `SectionCard` around "Notes internes." Don't invent data fields the API doesn't return.
**On the audit's "extremely sparse, add org memberships/role/phone/last login/2FA/sessions/activity" point:** most of that data isn't in this route's current response at all — adding it means extending the underlying API query (a real backend addition, same additive shape as §0.7), not a restyle of what's already fetched. If you want it, treat it as its own small Phase-6-adjacent task (extend the `GET` handler to also select the user's `organization_members` rows and any session data already exposed elsewhere in the admin API, then render it in a new `meta`/section on this page) rather than assuming the current redesign pass surfaces data that doesn't exist yet. The sparseness itself is a data-availability fact, not a layout bug — the redesign's job here is to make the _existing_ two fields (email, status) plus notes look intentional and well-spaced, not to fabricate sections for data you haven't wired up.

### 5.6 Database Explorer — `db-explorer/page.tsx`, `PendingApprovals.tsx`, `QueryEditor.tsx`

- `PageHero icon={DatabaseIcon}` with real constraint copy (mirror whatever's already documented in these files — don't invent new policy language).
- Wrap "Demandes d'approbation en attente" and the query editor each in `SectionCard`.
- Give the "Zone dangereuse" checkbox row a `tone="warning"` `Card` background — don't touch the gating logic.
- **Audit's strongest, most valid point on this screen:** when the "Zone dangereuse" checkbox is ticked, the "Exécuter" button should switch from its default primary-teal look to the `danger` `Button` variant (already exists, already used elsewhere in this app) for as long as the checkbox stays checked, and executing should go through the existing `ConfirmTypingDialog` (type-to-confirm) rather than firing immediately — check `QueryEditor.tsx`'s current submit handler first: if it already gates on the checkbox but executes on click with no confirmation step, wire in `ConfirmTypingDialog` here (confirm value could be something fixed like the literal word `EXECUTER`, since there's no single "name" to type for an arbitrary SQL statement) exactly the same way `OrganizationsTable.tsx`/`OrgDetail.tsx` already do for suspend/delete/impersonate. This reuses 100% existing components — no new dependency, no SQL-editor rewrite.
- "Approuver et exécuter" / "Rejeter" buttons keep their `success`/`danger` variants, just add icons inside the label.
- **Explicitly deferred (see Appendix A):** swapping the plain `<textarea>` for a real code editor (CodeMirror/Monaco) with syntax highlighting, schema browser, query history, and an `EXPLAIN` view. That's a legitimate improvement but a meaningfully sized feature build (new dependency, new UI surface, new state), not a styling pass — out of scope here, flagged as a good next project.

### 5.7 Journal d'audit — `audit-log/page.tsx` + `AuditLogTable.tsx`

- `PageHero icon={ClipboardTextIcon}` with a description covering the filter dimensions.
- Wrap the existing 6-input filter grid + "Filtrer" button in `FilterBar`/`SectionCard` styling rather than rebuilding it. No card-view toggle needed here (inherently log-like, keep table-only).
- The "Impersonation" column's colored-dot cell → a small `info`-tone `StatusBadge`-style pill.
- Action-name cells (`admin.login`, etc.) → `<code>`-styled neutral chip, cosmetic only.
- **Audit-derived, adopted carefully:** the raw actor/org IDs (`22222222`, `organizations:11111111...`) are genuinely hard to scan. The audit's fix — resolve them to names — is real value but is a **backend change** (a join against `profiles`/`organizations` in the audit-log API route), the same shape as the already-planned §0.7 logo-URL addition: fully additive (add a `resolved_actor_name`/`resolved_org_name` field alongside the existing raw IDs, remove nothing). Treat this as an **optional Phase 6 stretch item**, not required to satisfy the core styling ask. If you skip it this pass, still do the free, zero-risk part: wrap raw IDs in a monospace (`font-mono text-xs`) chip with a "copy" icon button (`CopyIcon`, `aria-label="Copier l'identifiant"`) — much more scannable with no backend change at all.
- **Deferred:** a full filter-panel redesign with quick date ranges ("Aujourd'hui / 7 jours / 30 jours") and a row-click detail drawer showing the full JSON payload/diff. Good ideas, but the drawer in particular is a new UI surface + likely a new API shape, not a restyle — flagged for later, not part of this pass.
- **Native date-input locale caveat:** the audit is right that the `mm/dd/yyyy` placeholder looks wrong in a French UI, but that placeholder comes from the browser's own locale rendering of `<input type="date">`, not from app copy — CSS/text changes won't fix it. A real fix means swapping to a masked text input or a small date-picker component that renders its own French-formatted UI; that's a slightly bigger (still self-contained, no new dependency required) task, worth doing in this pass since the filter row is already being touched, but budget it as its own sub-task rather than assuming it's a one-line label fix.

### 5.8 Facturation — `billing/page.tsx` + `BillingTable.tsx`

- `PageHero` with the existing description paragraph moved in verbatim.
- Restyle existing status pills via the enhanced `StatusBadge` — confirm exact variants/text first, no wording changes.

### 5.9 Stockage — `storage/page.tsx` + `StorageUsageTable.tsx`

- `PageHero icon={HardDrivesIcon}` with the existing threshold-explainer paragraph as `description`.
- Color the 800/950/1000MB threshold tiers via `tone`-colored `Card`/badges (warning → stronger warning → danger) — restyle only, don't touch the threshold math or the RPC call.
- **Audit-derived, low effort:** consolidate storage/currency number formatting (`0.000 TND`, `0.00 Go`, `0.5 Mo`) into one small admin-local utility, `apps/admin/src/lib/format.ts` (`formatCurrencyTND`, `formatStorage`), and use it everywhere a byte/TND value is rendered (Storage, Billing, Dashboard). Confirmed no test asserts on the current raw formatted strings, so this is a free-form improvement — pick one consistent precision per unit (e.g. whole Go/Mo below some threshold, one decimal above) rather than the current mixed `0.000`/`0.00`/`0.5`. Keep this a plain utility function, not a new component — it's formatting logic, not markup.

### 5.10 Santé des services — `services-health/page.tsx` + 4 sub-components

- `PageHero icon={PulseIcon}`.
- Each `<h2>` sub-section → `SectionCard` header.
- `InfraStatusGrid.tsx`: give "Données obsolètes"/"Non surveillé" pills distinct tones (warning/neutral/success), exact text unchanged.
- **Audit-derived, worth doing:** every card currently says "Données obsolètes," which reads as universally broken rather than "this check hasn't run recently." Add one small overall-status line at the top of the section (e.g. "X services surveillés, Y nécessitent une actualisation") computed from the same data already on the page — no new data source, just a summary of what's already fetched. **Not** adopting the audit's fuller "uptime %, latency sparkline, incident history" suggestion here — that needs real time-series data this page doesn't have yet (same "don't fabricate a number" principle the Dashboard page's own existing code comment already applies to churn/DAU — stay consistent with it).
- Jobs table showing "Jamais exécuté" for every job is accurate, not broken (these jobs are cron-scheduled and simply haven't fired yet in this environment) — the audit read this as a bug from the screenshot alone. No change needed beyond normal visual polish; don't invent a "next run" time or a "run now" action unless that capability actually exists server-side (it doesn't currently — check before promising it in the UI).

### 5.11 Versions de l'app — `app-versions/page.tsx` + `AppVersionsForm.tsx`

- `PageHero icon={DeviceMobileIcon}` with existing description. Form wrapped in `SectionCard`.

### 5.12 Feature flags — `feature-flags/page.tsx` + `FeatureFlagsTable.tsx`

- `PageHero icon={FlagIcon}` with existing description. Table restyle + icon buttons for existing actions.

### 5.13 Annonces — `announcements/page.tsx` + form/list

- `PageHero icon={MegaphoneIcon}`. Form → `SectionCard`. History list restyled (optionally `EntityCard`-based per announcement).

### 5.14 Gestion des admins — `admin-users/page.tsx` + `AdminUsersTable.tsx`

- `PageHero icon={ShieldCheckIcon}`.
- Role pills (`Super Admin`/`Admin`/`Support`) and 2FA pills → restyled `StatusBadge`, exact text unchanged, distinct tone per role (Super Admin → categorical violet, Admin → accent, Support → neutral).
- "Réinitialiser 2FA" → `IconActionButton` (`KeyIcon`, warning) with `aria-label="Réinitialiser 2FA"` (test-asserted — type the literal `é`, the `\u00e9` in the grep output is just how it displayed, not an instruction to escape it).
- "Inviter un admin" form → `SectionCard`.
- **Already implemented, no action needed:** the audit assumed "Réinitialiser 2FA" fires immediately with no confirmation, based on the screenshot alone. It's already gated behind a `ConfirmTypingDialog` (`title="Réinitialiser la 2FA"`, `confirmLabel="Réinitialiser"`) in the actual code — the modal just doesn't show up in a static screenshot. Nothing to build here; just restyle the trigger button, the dialog itself is untouched.
- **Deferred:** a full "Rôles & permissions" tab explaining what each role can do, and a pending-invitations sub-list with resend/revoke. Real value, but new data/state (invitation status tracking, a permissions-matrix content page) rather than a restyle of what exists today.

### 5.15 Sessions admin — `admin-sessions/page.tsx` + `SessionsTable.tsx`

- `PageHero icon={MonitorIcon}` with existing description. Revoke action (if present) → `IconActionButton`.

---

## 6. Implementation phases (do them in this order)

### Phase 0 — Assets, cleanup, tokens (≈30–45 min)

- [ ] Delete the dead files listed in §0.2 (`apps/admin/src/components/ui/Card.tsx`, `Button.tsx`, `StatCard.tsx`, `StatusBadge.tsx`, `DataTable.tsx`, `EmptyState.tsx`, `Avatar.tsx`, `FormField.tsx`, `ConfirmTypingDialog.tsx`). Confirm nothing imports them first (`grep -rn "components/ui/Card\|components/ui/Button\|..." apps/admin/src` should return nothing after deletion, and it should return nothing _before_ deletion either — they're unused).
- [ ] Create `apps/admin/public/`; crop & export `logo-mark.png` / `logo-full.png` (§0.6).
- [ ] Add `categorical` to `packages/config/tailwind-preset.js` (§0.3).
- [ ] `pnpm --filter admin typecheck` and `pnpm --filter web typecheck` — should still pass (nothing real was removed, and no shared file changed behaviorally yet beyond the additive color key).

### Phase 1 — Shared component upgrades in `packages/ui-web`

- [ ] **As its own separate commit, before anything else in this phase:** apply the `Button.tsx` contrast fix (§2.1a, Option D) — `primary`→`accent-700/800/900`, `text`→`accent-700/800`, new `status.successButton` (`#1C864D`) added to `packages/design-tokens` and used by `success`. Typecheck/build both `apps/admin` and `apps/web` after this one change lands, on its own, before touching anything else — this is the one visible resting-state repaint in the whole plan, and isolating it makes it trivial to review or revert independently of every additive change around it.
- [ ] Extend `Card.tsx` (`interactive`, `tone`).
- [ ] Extend `StatusBadge.tsx` usage sites if needed; add `PlanBadge.tsx`.
- [ ] Add `IconStatCard.tsx`.
- [ ] Extend `PageHero.tsx` with optional `icon`; update its stale "web-only" comment.
- [ ] Add `FilterBar.tsx`, `ViewToggle.tsx`.
- [ ] Add `IconActionButton.tsx`.
- [ ] Extract `Pagination.tsx`; wire it into `DataTable.tsx`'s existing `pagination` rendering.
- [ ] Add `EntityCard.tsx`, `SectionCard.tsx`, `DetailHeader.tsx`.
- [ ] Update `packages/ui-web/src/index.ts` to export every new component/type.
- [ ] `pnpm --filter @dala/ui-web typecheck && pnpm --filter @dala/ui-web lint`, then `pnpm --filter admin typecheck` and `pnpm --filter web typecheck`. No admin page imports the new stuff yet, so this phase can't visually break anything in either app beyond the deliberate, isolated button-contrast commit above.

### Phase 2 — Shell (Sidebar collapse + logo) — admin-only

- [ ] Implement collapsed/expanded `Sidebar.tsx` per §3.
- [ ] Swap the placeholder badge for the real logo images.
- [ ] Manual check: expand/collapse persists, active-nav-item logic intact, sign-out still works.
- [ ] Run whichever spec loads the shell (`tests/dashboard.spec.ts` or similar).

### Phase 3 — Dashboard

- [ ] Implement §5.1.
- [ ] Run `tests/platform-metrics-snapshot.spec.ts` / `tests/dashboard.spec.ts`.

### Phase 4 — Organizations (list + detail)

- [ ] Backend: add `logo_signed_url` to the org-detail GET route (§0.7); confirm the POST branch is untouched.
- [ ] `OrganizationsTable.tsx` per §5.2.
- [ ] `OrgDetail.tsx` per §5.3.
- [ ] Run `tests/organizations.spec.ts` in full (heaviest selector coverage in the suite) before moving on.

### Phase 5 — Users (list + detail)

- [ ] `UsersTable.tsx` per §5.4 — watch the exact-match `Réinitialiser` label.
- [ ] `UserDetail.tsx` per §5.5.
- [ ] Run `tests/users.spec.ts`, `tests/admin-users.spec.ts` (if relevant), `tests/rbac.spec.ts` (icon-button conversion must not change which roles see which actions).

### Phase 6 — Remaining pages

- [ ] Database Explorer (§5.6) → `tests/db-explorer.spec.ts`.
- [ ] Audit Log (§5.7) → `tests/audit-log.spec.ts`.
- [ ] Billing (§5.8) → `tests/billing.spec.ts`.
- [ ] Storage (§5.9) → `tests/storage.spec.ts`.
- [ ] Services Health (§5.10) → `tests/services-health.spec.ts`, `tests/email-deliverability.spec.ts`.
- [ ] App Versions (§5.11) → `tests/app-versions.spec.ts`.
- [ ] Feature Flags (§5.12) → `tests/feature-flags.spec.ts`.
- [ ] Announcements (§5.13) → `tests/announcements.spec.ts`.
- [ ] Admin Users (§5.14) → `tests/admin-users.spec.ts`.
- [ ] Admin Sessions (§5.15) → `tests/admin-sessions.spec.ts`.

### Phase 7 — Polish pass

- [ ] Consistent hover/transition timings (reuse `motion.microInteractionMs`/`screenTransitionMs` already defined in `design-tokens`, don't invent new numbers).
- [ ] Confirm collapsed-sidebar tooltips and icon-button tooltips (`title=`) are all present.
- [ ] Full click-through against every screenshot you started with.
- [ ] Full `apps/admin` Playwright suite (`pnpm --filter admin test`).
- [ ] `pnpm --filter web typecheck` (and a quick visual spot-check of a couple of `apps/web` screens) to confirm the shared-component changes didn't break its build — full `apps/web` redesign is your separate later task, this is just "did I break the build."
- [ ] Confirm zero diffs under `apps/mobile/**`.

---

## 7. Copilot prompt templates

**Phase 1 example prompt:**

> In `packages/ui-web/src/Card.tsx`, extend `CardProps` with optional `interactive?: boolean` (adds `hover:-translate-y-0.5 hover:shadow-[...raised shadow...] transition-all duration-200`) and `tone?: 'accent'|'success'|'warning'|'danger'|'neutral'` (adds a 3px `border-s-4 border-s-{tone}` accent). Keep every existing prop/behavior identical when neither new prop is passed, since `apps/web` also imports this component and must keep rendering exactly as before wherever it doesn't pass the new props.

**Phase 3 example prompt:**

> In `apps/admin/src/app/(admin)/dashboard/page.tsx`, replace the `<h1>` with `<PageHero icon={GaugeIcon} title="Métriques" description="..." />` from `@dala/ui-web`, and replace every `<StatCard>` with `<IconStatCard>` (also from `@dala/ui-web`), picking icon/tone per metric per plan §5.1. Don't change any data-fetching code above the `return` statement.

**Phase 4 example prompt:**

> In `apps/admin/src/app/api/admin/organizations/[orgId]/route.ts`'s `GET` handler, after fetching `organization`, sign `organization.logo_url` via `supabase.storage.from('org-files').createSignedUrl(...)` if set, and include it as `logo_signed_url` alongside the unmodified `organization` object in the JSON response. Don't change anything else in this file, including the `POST` handler.

(Repeat the pattern per page: name the exact file, the exact component swap, the relevant plan section, and explicitly note anything adjacent that's off-limits.)

---

## 8. Final safety checklist before calling any phase "done"

- [ ] Every change under `packages/ui-web/**` / `packages/design-tokens/**` is additive (new prop/export/token key) — nothing existing renamed or removed.
- [ ] No file under `apps/web/src/**` was opened/edited (you're only consuming the upgraded shared package from there, not touching its pages).
- [ ] No file under `apps/mobile/**` was touched.
- [ ] Every string/aria-label in the §0.4 table still matches exactly.
- [ ] Default sidebar = expanded, default list view = table, on a fresh (no localStorage) load.
- [ ] `pnpm --filter @dala/ui-web typecheck`, `pnpm --filter admin typecheck`, `pnpm --filter admin lint`, `pnpm --filter admin test` (Playwright), and `pnpm --filter web typecheck` all pass.
- [ ] Visual pass against all 9 provided screenshots confirms every requested change (icons on cards, subtitles, colored plan pills, icon action buttons, card/table toggle, improved pagination, collapsible sidebar with real logo, redesigned org detail with back arrow + logo + more fields surfaced).

---

## Appendix A — External UX audit: what was adopted, adapted, corrected, or deferred

You had a separate UX audit run against the same 9 screenshots. It's a solid, mostly accurate read of the surface, and several of its points are genuinely good catches that the original request didn't cover. This appendix explains exactly what got folded into the plan above (already inserted at the relevant section, cross-referenced below), what got adapted to fit this codebase's real constraints, what turned out to already be built, and what's deliberately left out — with reasoning, not just a verdict.

### A.1 Adopted as-is (already inserted above, listed here for a quick scan)

- Small-text link contrast fix, `accent-600` → `accent-700` (§0.3).
- Sidebar grouped into 4 sections (§3, "Addition" box).
- Breadcrumb strip folded into `DetailHeader` (§2.11).
- `Skeleton`/`TableSkeleton` replacing "Chargement…" (§2.15).
- Table `Actions` column header + sticky `<thead>` on long tables (§2.10).
- `ROLE_LABEL`/`PLAN_LABEL` localization maps, following the codebase's own existing `VERIFICATION_LABEL`/`LEGAL_FORM_LABEL` pattern (§2.17).
- "Non renseigné" instead of bare `—` for empty profile fields (§5.3).
- Number/currency/storage formatting consolidated into one utility (§5.9).
- Database Explorer danger-zone button turning red + type-to-confirm via the existing `ConfirmTypingDialog` (§5.6).
- Audit-log raw IDs at minimum get a monospace/copy treatment even without the full name-resolution feature (§5.7).
- Services Health gets one honest summary line instead of implying uniform breakage (§5.10).

### A.2 Adopted with a real constraint attached

| Audit suggestion                                                      | What changed                                                                                                                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace text action links with a `⋯` dropdown menu everywhere         | Kept `IconActionButton` (icon-only buttons) as the primary pattern per your original, explicit ask; `OverflowActionMenu` (2.16) is only used on rows with more actions than comfortably fit as icons (Users list)             | Your original request was specific about icon buttons; a blanket dropdown-everywhere would override that instruction rather than build on it. The audit's underlying problem — "text links wrap and clutter rows" — is already solved by icon buttons; the dropdown is only needed where icon buttons alone would still crowd the row |
| Localize "Impersonate" → "Imiter"                                     | Flagged as doable, but requires a coordinated one-line edit to `tests/impersonation.spec.ts` in the same change (§0.4 table)                                                                                                  | This exact string is asserted on by `getByRole('button', {name: 'Impersonate'})` and `.locator('tr', {hasText: 'Impersonate'})` — a silent rename breaks the test suite. Not rejected, just not free                                                                                                                                  |
| Replace the Métriques disclosure paragraph with a generic empty state | Rejected as written; restyle the container, keep the paragraph's actual sentence containing "DAU/MAU" and "désabonnement"                                                                                                     | `tests/dashboard.spec.ts` explicitly asserts a real `<p>` element contains both phrases verbatim — this is a _deliberate_, tested product decision (the code comment in `dashboard/page.tsx` calls it out: don't show a fabricated metric, disclose the gap instead), not an oversight to "fix away"                                  |
| Resolve audit-log actor/org IDs to names                              | Marked optional/Phase-6, since it requires a join in the API route (additive, same shape as the org-logo change) rather than a pure restyle                                                                                   | Genuinely good idea, just bigger than "styling," and not required to satisfy your core ask                                                                                                                                                                                                                                            |
| French date-range inputs                                              | Real fix acknowledged, but native `<input type="date">` renders its own locale-based UI regardless of app copy — a true fix means a custom masked input, budgeted as its own small task rather than assumed to be a CSS tweak | Prevents you from allocating "5 minutes" to something that actually needs a small component                                                                                                                                                                                                                                           |

### A.3 Already implemented — the audit read a screenshot, not the code

- **"No confirmation dialog for 2FA reset"** — it already goes through `ConfirmTypingDialog` (`title="Réinitialiser la 2FA"`). The modal simply isn't visible in a static screenshot of the idle table.
- **"No persistent impersonation banner"** — `ImpersonationBanner.tsx` already exists, is rendered unconditionally in the root admin layout, and is explicitly documented in its own code comment as "non-dismissable, every screen" (Doc 05 §3.6 / Doc 04 §4.3.3a). It only appears once an impersonation session is actually active, so it wasn't visible in any of the 9 screenshots you captured.
- **"Bulk actions are missing despite checkboxes"** — both `OrganizationsTable.tsx` and `UsersTable.tsx` already pass a working `bulkActions` prop to `DataTable`; the bar only renders once ≥1 row is selected, so an idle screenshot never shows it.
- **"Jobs table looks broken (all 'Jamais exécuté')"** — that's accurate cron-job state in this environment (nothing has fired yet), not a rendering bug.

This isn't a criticism of the audit — a screenshot-only review can't see conditional UI, and calling out "is this missing or just not currently visible" is exactly the kind of check this plan exists to do before you spend a phase rebuilding something that already works.

### A.4 Deliberately deferred (not part of this pass — listed with reasoning, not silently dropped)

| Suggestion                                                                                                       | Why it's out of scope for a styling/UX pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adopt TanStack Table (sorting/filtering/column visibility/row selection as a library)                            | `DataTable` already has working, tested sort/select/bulk logic. Swapping the underlying engine is a rewrite with real regression risk to `tests/organizations.spec.ts`/`tests/users.spec.ts`, for a benefit (column-visibility toggle, mainly) that can be added incrementally to the existing component later if you want it                                                                                                                                                                                                                                                                                                   |
| Real SQL editor (CodeMirror/Monaco) with schema browser, query history, `EXPLAIN`                                | A genuine feature build — new dependency, new state, new UI surface — not a restyle. The safety-UX half of this suggestion (danger button, type-to-confirm) _is_ adopted now because it's free with existing components (§5.6)                                                                                                                                                                                                                                                                                                                                                                                                  |
| Charts on Métriques (MRR trend, org growth, sparklines)                                                          | `dashboard/page.tsx`'s own existing code comment already explains this was a deliberate call: no time-series data source exists yet, so no chart is shown rather than shipping one against fabricated/insufficient history. This plan respects that precedent rather than overriding it by adding a charting library this pass                                                                                                                                                                                                                                                                                                  |
| Full tab-based detail pages (Vue d'ensemble / Membres / Facturation / Journal / Notes)                           | The current single-scroll layout with `SectionCard`-separated blocks already gives most of the organizational benefit tabs would; converting to a tab system is a bigger interaction-pattern change worth doing deliberately later, not bundled into "add icons and subtitles"                                                                                                                                                                                                                                                                                                                                                  |
| Permission matrix, pending-invitations management, incident history, dark mode, full WCAG AA accessibility audit | All real, all reasonable — all separate projects with their own scope, not additions to this UI-polish pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Auto-capitalizing "hazem zammit" → "Hazem Zammit"                                                                | **Rejected, not just deferred.** This is a real person's name as they entered it in their own profile (`full_name`, free-text, user-owned data) — this is not a real admin account you have. Force-capitalizing arbitrary user-entered text is a data-integrity anti-pattern (breaks names like "McDonald," "O'Brien," or names in scripts where "capitalization" doesn't apply the way it does in French/English) — it's not the app's place to "correct" how someone typed their own name. If a specific account's name is genuinely just a data-entry mistake, fix that one row's data, not the rendering logic for everyone |

### A.5 The primary-button contrast question — decided: Option D

The audit's contrast concern turned out to be two separate, confirmed failures, not one: `primary` (`accent-600`, 3.37:1) and `success` (`#1F9254`, 3.96:1) buttons both fail AA at rest for their white label text (`font-medium`/500-weight ~15.5px doesn't clear the bar for WCAG's large/bold-text exception either — that needs ≥18.7px _and_ 700-weight, and this text is below the size floor regardless of weight). `danger` (`#C0433D`, 5.11:1) already passes, untouched.

Four options were discussed:

- **A — do nothing.** Defensible for a small, known internal admin roster, but leaves a documented, real gap.
- **B — global remap to `accent-700` everywhere `accent-600` appears.** Simplest, but visibly rebrands the app's signature teal in both `apps/admin` and `apps/web` at once, well beyond just fixing buttons.
- **C — new intermediate `accent-650`-style token** (computed at `#0D8478`, ~4.58:1) for a smaller visual departure than a full jump to 700 — but introduces a new palette step purely to sit right at the AA line, with little margin.
- **D — chosen.** Only redirect the _button-with-white-text_ cases (`primary`, `success`) to a darker step; leave `accent-600` untouched everywhere else (nav pills, icon chips, focus rings, decorative fills — all graphical/non-text uses that already clear the separate 3:1 non-text threshold at 600). For `primary`, this reuses `accent-700`/`800`/`900`, which already exist and are already what the button shows on hover/active today — the "brand" isn't changing, the resting state is just catching up to what interacting with the button already looks like. For `success`, there's no existing darker step to reuse (`packages/design-tokens`'s status colors, unlike `accent`, aren't a full scale — just one hex each), so this is the one place a genuinely new token gets added: `successButton`, computed at `#1C864D` (4.60:1), added as its own token rather than redefining the widely-shared `status.success` value (confirmed via grep: 25+ files across both apps consume `status.success` as text/badge-tint color, a different, already-passing contrast case that a blanket redefinition would risk disturbing for no reason).

Implementation lives in `packages/ui-web/src/Button.tsx` (§2.1a) and, for the new `successButton` token, `packages/design-tokens/src/index.ts` (documented inline with its computed ratio, following the same audited-not-eyeballed convention the token file already uses for its dark-mode success/danger values). Shipped as its own isolated commit, separate from any page-level change, so it's trivially reviewable and revertible on its own.
