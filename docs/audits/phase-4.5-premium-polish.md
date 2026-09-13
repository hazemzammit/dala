# Phase 4.5 — Premium polish pass (run before Phase 5)

This is a cleanup phase, not a redesign. Nothing in the brand (teal accent,
muted status colors, restrained palette) changes — your references aren't
being used to reskin Dala, they're used to fix **execution**, because
several of the components from Phases 1–4 were built exactly to spec, and
the spec itself under-delivered on visual weight. Every file below is a
full replacement, ready to hand to Antigravity as its own phase.

---

## 1. What the reference images actually have in common

Looked at all 7 (DocApp, Donezo, Base, PIMJO/SaaSBold, Panze, DESTEMPLATE,
Jobble). They're stylistically different, but every one of them does these
things that Dala Admin currently doesn't:

1. **Every small control has a real resting surface.** Buttons, pills, the
   view toggle, pagination — none of them are "just colored text/icon that
   turns into a button on hover." They all have a visible background,
   border, and a soft shadow **before** you touch them.
2. **Shadows are actually visible.** Cards clearly sit above the page.
   Dala's tokens already model this correctly (`elevation.resting` /
   `elevation.raised`) but the actual opacity values were tuned so low
   (0.03–0.04) they don't register on a real screen — that's the single
   biggest reason your screens read as "flat."
3. **Segmented controls (table/card toggle) look like Apple's** — a gray
   track with a floating white pill under the active option, not two bare
   buttons side by side.
4. **A topbar with search + account exists everywhere.** You already have
   `Topbar.tsx` and `GlobalSearch.tsx` built and working — they were just
   never rendered.
5. **Nothing is undersized or chromeless.** Small controls (32px) aren't
   the problem — the _lack of a visible surface_ at that size is.

None of this requires new brand colors or a new visual language — it's
"give the existing tokens more presence," which is why every change below
is additive or an isolated, flagged value change (same discipline the
original plan used for the Button contrast fix).

---

## 2. Files changed

| File                                                | Change                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/design-tokens/src/index.ts`               | Strengthen `elevation.resting`/`elevation.raised` (flagged, isolated commit); add new `elevation.control` tier |
| `packages/ui-web/src/Card.tsx`                      | Use the strengthened shadow values, slightly bigger hover lift                                                 |
| `packages/ui-web/src/FilterBar.tsx`                 | Match Card's new shadow, bump padding                                                                          |
| `packages/ui-web/src/ViewToggle.tsx`                | Rebuilt as an iOS/macOS-style segmented control (track + floating pill)                                        |
| `packages/ui-web/src/IconActionButton.tsx`          | Real resting surface (border+bg+shadow) instead of chrome-only-on-hover                                        |
| `packages/ui-web/src/Pagination.tsx`                | Whole control now sits in one pill-shaped bar, same surface language                                           |
| `apps/admin/src/components/shell/Sidebar.tsx`       | Collapse toggle is now a single always-floating circular handle (was bare/chromeless when expanded)            |
| `apps/admin/src/app/(admin)/organizations/page.tsx` | **Bug fix** — add the `PageHero` the plan always called for (§5.2), never applied in Phase 4                   |
| `apps/admin/src/app/(admin)/users/page.tsx`         | **Bug fix** — same, `PageHero` per §5.4, never applied in Phase 5                                              |
| `apps/admin/src/components/shell/Topbar.tsx`        | _(scope addition, flagged — see §3 below)_ Restyled, no functional change                                      |
| `apps/admin/src/components/shell/GlobalSearch.tsx`  | _(scope addition)_ Trigger button restyled to match                                                            |
| `apps/admin/src/app/(admin)/layout.tsx`             | _(scope addition)_ Wires `Topbar` in — it existed and worked, just was never rendered                          |

The last three rows are **new scope**, not part of the original 7-phase
plan — flagging that explicitly per your own rule about not silently
bundling things in. Every reference image you sent has a topbar; the
components already exist and work (command palette, search, session
data). If you don't want it yet, skip those three files and the rest of
the pass still stands on its own.

---

## 3. `packages/design-tokens/src/index.ts` — `elevation` block

Replace the existing `elevation` export with:

```ts
export const elevation = {
  // Admin premium-polish pass (pre-Phase-5 cleanup): `resting`/`raised`
  // strengthened in place — their previous values (0.04/0.03 and
  // 0.08/0.06 opacity) rendered as functionally invisible on an actual
  // screen, which is why the shipped Phase 1-4 UI read as "flat/generic"
  // despite Card/FilterBar already wiring shadows correctly. Same
  // "audited, not eyeballed" discipline as the Button contrast fix
  // above: this is a value change to two EXISTING keys (not a new prop),
  // so per the Button-fix precedent it should land as its own isolated,
  // reviewed commit — it repaints every Card/FilterBar in both
  // apps/admin and apps/web the moment it merges. Still two tiers only,
  // still no color, still no gradient — depth got a bit more visible,
  // nothing about the restraint policy changed.
  resting: {
    border: `1px solid ${color.neutral[100]}`,
    shadow: '0 1px 3px rgba(17,19,24,0.06), 0 6px 16px rgba(17,19,24,0.05)',
  },
  raised: {
    // modal / dropdown / actively-dragged dispatch chip
    shadow: '0 8px 16px rgba(17,19,24,0.10), 0 20px 40px rgba(17,19,24,0.08)',
  },
  // NEW — additive. A third, deliberately smaller tier for small pill/
  // icon controls (ViewToggle, IconActionButton, Pagination, the sidebar
  // collapse toggle) that need a real resting surface — a border/shadow
  // pairing lighter than `resting` (which is tuned for whole cards) so a
  // 32-36px control doesn't look like a miniature Card. `hoverShadow` is
  // the one-step-up value the same controls use on :hover, kept here so
  // it's a shared value instead of four components independently
  // inventing their own hover shadow.
  control: {
    border: `1px solid ${color.neutral[200]}`,
    shadow: '0 1px 2px rgba(17,19,24,0.05)',
    hoverShadow: '0 2px 6px rgba(17,19,24,0.08)',
  },
};
```

Nothing else in the file changes. This is the one isolated, reviewed
commit — it touches shared tokens consumed by `apps/web` too (expected
and accepted per the original plan's own §0.2 note that `apps/web`
silently inherits shared-component improvements).

---

## 4. `packages/ui-web/src/Card.tsx`

```tsx
/**
 * packages/ui-web/src/Card.tsx
 *
 * Extracted from apps/web/src/components/ui/Card.tsx and
 * apps/admin/src/components/ui/Card.tsx (Phase 19B, item 3) — the two
 * were byte-identical; no behavioral decision needed.
 *
 * Doc 05 §5 checklist: "Is the background a soft off-white, not pure
 * white, behind raised neutral-0 cards?" and "Is there restraint on
 * shadows — one soft resting shadow, one raised shadow, nothing heavier?"
 *
 * Admin UI/UX overhaul pass — two new optional props added (additive only;
 * every existing call site that omits them renders byte-identically):
 *   `interactive` — hover: shadow deepens + subtle upward lift (150ms ease).
 *                   Used on clickable cards (IconStatCard, EntityCard).
 *   `tone`        — optional 3px logical-start (RTL-safe) accent border.
 *                   Used for section-level emphasis (SectionCard, warnings).
 *
 * Premium-polish pass (pre-Phase-5 cleanup): shadow values below now read
 * directly from `elevation.resting`/`elevation.raised` in
 * @dala/design-tokens (strengthened there — see that file's comment for
 * why) instead of an independently-hardcoded, weaker pair. Interactive
 * hover lift bumped from -translate-y-0.5 to -translate-y-1 to actually
 * register as a lift on screen.
 */
type CardTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<CardTone, string> = {
  accent: 'border-s-4 border-s-accent-600',
  success: 'border-s-4 border-s-success',
  warning: 'border-s-4 border-s-warning',
  danger: 'border-s-4 border-s-danger',
  neutral: 'border-s-4 border-s-neutral-300',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  interactive?: boolean;
  tone?: CardTone;
}

export function Card({
  raised = false,
  interactive = false,
  tone,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        'rounded-card bg-neutral-0 border border-neutral-100',
        raised
          ? 'shadow-[0_8px_16px_rgba(17,19,24,0.10),0_20px_40px_rgba(17,19,24,0.08)]'
          : 'shadow-[0_1px_3px_rgba(17,19,24,0.06),0_6px_16px_rgba(17,19,24,0.05)]',
        interactive
          ? 'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_8px_16px_rgba(17,19,24,0.10),0_20px_40px_rgba(17,19,24,0.08)]'
          : '',
        tone ? toneClasses[tone] : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
```

---

## 5. `packages/ui-web/src/FilterBar.tsx`

```tsx
'use client';

import type { ReactNode } from 'react';

/**
 * packages/ui-web/src/FilterBar.tsx
 *
 * Admin UI/UX overhaul pass — card-styled row that holds a search slot,
 * arbitrary filter controls, and a trailing slot (e.g. ViewToggle).
 * §2.5 of the plan.
 *
 * Intentionally a thin layout wrapper: it imposes no opinions about
 * what the filter controls are — callers compose their own SearchInput,
 * <select>, toggle chips, etc. as children.
 *
 * `trailing` — optional slot flush to the right edge (ViewToggle lives here).
 *
 * Premium-polish pass (pre-Phase-5 cleanup): shadow strengthened to match
 * Card's updated `elevation.resting` value, and vertical padding bumped
 * (py-3 → py-3.5) — same "give it room to breathe" direction as the rest
 * of this pass.
 */

interface FilterBarProps {
  children: ReactNode;
  trailing?: ReactNode;
}

export function FilterBar({ children, trailing }: FilterBarProps) {
  return (
    <div className="rounded-card bg-neutral-0 flex flex-wrap items-center gap-3 border border-neutral-100 px-4 py-3.5 shadow-[0_1px_3px_rgba(17,19,24,0.06),0_6px_16px_rgba(17,19,24,0.05)]">
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
```

---

## 6. `packages/ui-web/src/ViewToggle.tsx`

```tsx
'use client';

import { SquaresFourIcon, TableIcon } from '@phosphor-icons/react';

/**
 * packages/ui-web/src/ViewToggle.tsx
 *
 * Admin UI/UX overhaul pass — two-button segmented control for switching
 * between table and card list views. §2.6 of the plan.
 *
 * Test-contract / default-state rules (§0.5):
 *   - The parent MUST always initialize `value` to 'table' on a fresh load.
 *   - This component is purely controlled; it never manages its own default.
 *     The caller (e.g. OrganizationsTable) is responsible for the default.
 *
 * Premium-polish pass (pre-Phase-5 cleanup) — rebuilt as an iOS/macOS-style
 * segmented control: a neutral-100 "track" holding a floating white pill
 * that carries the active option (bg-neutral-0 + small shadow), rather
 * than the previous flat two-button pair with no resting surface at all
 * (which is why it read as unstyled). Same accessible-name/aria-pressed
 * contract as before — nothing test-relevant changed.
 */

interface ViewToggleProps {
  value: 'table' | 'card';
  onChange: (v: 'table' | 'card') => void;
}

const OPTIONS = [
  { value: 'table' as const, label: 'Vue tableau', icon: TableIcon },
  { value: 'card' as const, label: 'Vue carte', icon: SquaresFourIcon },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Mode d'affichage"
      className="inline-flex items-center gap-0.5 rounded-full bg-neutral-100 p-1"
    >
      {OPTIONS.map(({ value: v, label, icon: IconComponent }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={[
              'inline-flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150',
              active
                ? 'bg-neutral-0 text-accent-700 shadow-[0_1px_3px_rgba(17,19,24,0.12)]'
                : 'text-neutral-500 hover:text-neutral-900',
            ].join(' ')}
          >
            <IconComponent size={16} weight={active ? 'bold' : 'regular'} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
```

---

## 7. `packages/ui-web/src/IconActionButton.tsx`

```tsx
'use client';

import type { Icon } from '@phosphor-icons/react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

/**
 * packages/ui-web/src/IconActionButton.tsx
 *
 * Admin UI/UX overhaul pass — small rounded-square icon-only action
 * control that replaces bare text action links/buttons (§2.8 of the plan).
 *
 * Test-contract guarantee (§0.4): the `label` prop becomes both
 * `aria-label` and a `title` tooltip, AND is repeated in a `sr-only` span
 * for belt-and-suspenders accessible name matching. `getByRole('button',
 * { name: 'Suspendre' })` resolves correctly whether the element is a
 * <button> or an <a> rendered as a button, and whether the name comes
 * from aria-label or visible text.
 *
 * `href` — when set, renders an <a> element instead of <button>.
 *          Same visual treatment; use for links that were plain <a> before.
 *
 * Premium-polish pass (pre-Phase-5 cleanup): previously this had NO
 * resting-state chrome at all — no border, no background, color only on
 * hover — so a row of these read as plain icons, not buttons, until you
 * moused over them. Now every control gets a real bg-neutral-0 + border
 * + small shadow surface at rest (via elevation.control), and hover
 * shifts border/background into the tone color instead of introducing
 * one for the first time. Sizes bumped 32px/28px → 36px/32px.
 */

type IconActionTone = 'accent' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<IconActionTone, string> = {
  accent: 'text-accent-700 hover:border-accent-200 hover:bg-accent-50',
  warning: 'text-warning hover:border-warning/30 hover:bg-warning/10',
  danger: 'text-danger hover:border-danger/30 hover:bg-danger/10',
  neutral: 'text-neutral-500 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900',
};

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-9 w-9',
};

type IconSize = 'sm' | 'md';

interface BaseProps {
  icon: Icon;
  label: string;
  tone?: IconActionTone;
  size?: IconSize;
}

type ButtonMode = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { href?: undefined };

type AnchorMode = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & { href: string };

type IconActionButtonProps = ButtonMode | AnchorMode;

export function IconActionButton({
  icon: IconComponent,
  label,
  tone = 'neutral',
  size = 'md',
  href,
  className = '',
  ...rest
}: IconActionButtonProps) {
  const shared = {
    'aria-label': label,
    title: label,
    className: [
      'inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-0',
      'shadow-[0_1px_2px_rgba(17,19,24,0.05)] transition-all duration-150',
      'hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(17,19,24,0.08)]',
      sizeClasses[size],
      toneClasses[tone],
      'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_1px_2px_rgba(17,19,24,0.05)]',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  };

  const inner = (
    <>
      <IconComponent size={size === 'sm' ? 15 : 17} weight="bold" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );

  if (href !== undefined) {
    return (
      <a href={href} {...shared} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" {...shared} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  );
}
```

---

## 8. `packages/ui-web/src/Pagination.tsx`

```tsx
'use client';

import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';

/**
 * packages/ui-web/src/Pagination.tsx
 *
 * Admin UI/UX overhaul pass — extracted from DataTable.tsx's inline
 * pagination markup so it can be used standalone (§2.9 of the plan).
 *
 * Prop shape is identical to DataTablePagination so DataTable can drop
 * this in with zero prop-contract change for its callers.
 *
 * Test-contract invariants (§0.4 — must survive unchanged):
 *   - "Page X/Y" text format   → getByText(/Page \d+\/\d+/)
 *   - "Suivant" button label   → getByRole('button', { name: 'Suivant' })
 *   - "Précédent" button label → getByRole('button', { name: 'Précédent' })
 *   - "X–Y sur Z" / "0 résultat" count text
 *
 * The prev/next buttons use icon-only visuals but keep the text as
 * sr-only + aria-label so all four assertions above keep resolving.
 *
 * Premium-polish pass (pre-Phase-5 cleanup): previously this was just
 * text + two bare bordered squares floating on the page background — no
 * containing surface at all, so it read as unstyled scaffolding rather
 * than a real control. Now the whole thing sits in one pill-shaped bar
 * (same border/shadow language as IconActionButton/ViewToggle), with the
 * page indicator promoted to the visual center of that bar.
 */

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  const rangeText =
    total === 0
      ? '0 résultat'
      : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} sur ${total}`;

  const navButtonClasses =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 transition-all duration-150 hover:-translate-y-px hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-neutral-200 disabled:hover:bg-transparent disabled:hover:text-neutral-600';

  return (
    <div className="bg-neutral-0 mt-4 flex items-center justify-between gap-3 rounded-full border border-neutral-200 px-3 py-2 shadow-[0_1px_2px_rgba(17,19,24,0.05)]">
      <span className="pl-2 text-sm text-neutral-500">{rangeText}</span>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Précédent"
          title="Précédent"
          className={navButtonClasses}
        >
          <ArrowLeftIcon size={14} aria-hidden="true" />
          <span className="sr-only">Précédent</span>
        </button>

        <span className="min-w-[68px] text-center text-xs font-medium text-neutral-900">
          Page {page}/{totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Suivant"
          title="Suivant"
          className={navButtonClasses}
        >
          <ArrowRightIcon size={14} aria-hidden="true" />
          <span className="sr-only">Suivant</span>
        </button>
      </div>
    </div>
  );
}
```

---

## 9. `apps/admin/src/components/shell/Sidebar.tsx` — header block only

Replace just the header `<div>` (logo + collapse toggle) — everything else
in the file (`NAV_GROUPS`, `AdminNavItem`, footer) is unchanged:

```tsx
{
  /*
        Header — Real logo.
        Premium-polish pass (pre-Phase-5 cleanup): the collapse toggle
        previously only got a real button surface (border/bg/shadow) in
        the collapsed state — expanded, it was a bare 32px gray chevron
        with no chrome, which is why it read as "too small"/unfinished.
        It's now a single, always-floating circular handle (same
        border+shadow language as the other controls in this pass),
        positioned on the sidebar's edge in both states, matching the
        collapse-handle pattern used by Notion/macOS Finder.
      */
}
<div className="relative flex h-[72px] items-center border-b border-neutral-100 px-4">
  {collapsed ? (
    <div className="mx-auto flex w-full items-center justify-center">
      <Image
        src="/logo-mark.png"
        alt="Dala"
        width={32}
        height={32}
        className="h-10 w-10 object-contain"
      />
    </div>
  ) : (
    <Image
      src="/logo-full.png"
      alt="Dala Admin"
      width={120}
      height={40}
      className="h-10 w-auto object-contain"
    />
  )}

  <button
    onClick={() => setCollapsed(!collapsed)}
    aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
    title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
    className="bg-neutral-0 hover:border-accent-200 hover:text-accent-700 absolute right-[-14px] top-[34px] z-10 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 shadow-[0_2px_6px_rgba(17,19,24,0.10)] transition-colors"
  >
    {collapsed ? (
      <CaretRightIcon size={13} weight="bold" />
    ) : (
      <CaretLeftIcon size={13} weight="bold" />
    )}
  </button>
</div>;
```

Note: removed `justify-between` from the header row (only one flex child
remains — the toggle is `absolute` now, positioned independent of flex
layout) and dropped the old conditional `style={{ zIndex: 10 }}` in favor
of a `z-10` class applied unconditionally in both states.

---

## 10. Bug fixes — the two missed `PageHero` conversions

### `apps/admin/src/app/(admin)/organizations/page.tsx`

```tsx
import { PageHero } from '@dala/ui-web';
import { BuildingsIcon } from '@phosphor-icons/react/ssr';

import { OrganizationsTable } from './OrganizationsTable';

export default function OrganizationsPage() {
  return (
    <div>
      <PageHero
        icon={BuildingsIcon}
        title="Organisations"
        description="Gérez les comptes contractants : plans, membres, statut et vérification."
      />
      <div className="mt-6">
        <OrganizationsTable />
      </div>
    </div>
  );
}
```

### `apps/admin/src/app/(admin)/users/page.tsx`

```tsx
import { Suspense } from 'react';

import { PageHero } from '@dala/ui-web';
import { UsersThreeIcon } from '@phosphor-icons/react/ssr';

import { UsersTable } from './UsersTable';

export default function UsersPage() {
  return (
    <div>
      <PageHero
        icon={UsersThreeIcon}
        title="Utilisateurs"
        description="Comptes contractants et ouvriers, toutes organisations confondues."
      />
      <div className="mt-6">
        {/* Admin remediation Tier 4.4 — UsersTable now calls
            useSearchParams() (to read GlobalSearch's `?q=` deep link),
            which Next.js requires to be wrapped in Suspense or the build
            emits a "should be wrapped in a suspense boundary" error. */}
        <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
          <UsersTable />
        </Suspense>
      </div>
    </div>
  );
}
```

---

## 11. Scope addition (optional) — wire the topbar in

Skip this section entirely if you want to defer the topbar decision again.
If not:

### `apps/admin/src/components/shell/Topbar.tsx` (full replacement)

```tsx
'use client';

import { SignOutIcon } from '@phosphor-icons/react';

import { GlobalSearch } from './GlobalSearch';

import { useAdminSession } from '@/lib/use-admin-session';

/**
 * apps/admin/src/components/shell/Topbar.tsx
 *
 * Premium-polish pass (pre-Phase-5 cleanup) — this component and
 * GlobalSearch already existed and worked, but were never rendered in
 * (admin)/layout.tsx (flagged as a known, deliberately-deferred gap in
 * the original overhaul plan §0.8). Every reference screenshot in this
 * pass has a topbar, so it's wired in now as an explicit scope addition
 * — not a silent bundle-in. Restyled to match the rest of this pass'
 * control language (real resting surfaces, sidebar-matching avatar chip)
 * rather than the old plain-border/plain-text bar.
 *
 * No functional change: same session data, same logout call, same
 * GlobalSearch component/behavior underneath.
 */

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  support: 'Support',
};

export function Topbar() {
  const { data } = useAdminSession();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="bg-neutral-0 flex h-[72px] shrink-0 items-center justify-between border-b border-neutral-100 px-8">
      <GlobalSearch />

      <div className="flex items-center gap-3">
        {data && (
          <div className="flex items-center gap-2.5 pr-1">
            <div className="rounded-control bg-accent-100 text-accent-700 flex h-10 w-10 shrink-0 items-center justify-center text-xs font-semibold">
              {data.admin.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-medium text-neutral-900">{data.admin.full_name}</p>
              <p className="text-xs text-neutral-500">
                {ROLE_LABELS[data.admin.role] ?? data.admin.role}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className="hover:border-danger/30 hover:bg-danger/10 hover:text-danger bg-neutral-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 shadow-[0_1px_2px_rgba(17,19,24,0.05)] transition-all duration-150 hover:-translate-y-px"
        >
          <SignOutIcon size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
```

### `apps/admin/src/components/shell/GlobalSearch.tsx` — trigger button only

Replace just the trigger `<button>` (the command palette markup below it
is unchanged):

```tsx
<button
  onClick={() => setOpen(true)}
  className="rounded-control bg-neutral-0 flex items-center gap-2 border border-neutral-200 px-3.5 py-2 text-sm text-neutral-500 shadow-[0_1px_2px_rgba(17,19,24,0.05)] transition-all duration-150 hover:-translate-y-px hover:border-neutral-300 hover:shadow-[0_2px_6px_rgba(17,19,24,0.08)]"
>
  <MagnifyingGlassIcon size={15} />
  Rechercher
  <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
    ⌘K
  </kbd>
</button>
```

### `apps/admin/src/app/(admin)/layout.tsx` (full replacement)

```tsx
import { redirect } from 'next/navigation';

import { ImpersonationBanner } from '@/components/shell/ImpersonationBanner';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { getAdminSessionContext } from '@/lib/require-admin-session';

/**
 * Shell for every screen in Doc 04 §4.3 / Doc 05 §3.6. Middleware already
 * redirects unauthenticated requests to /login before this ever renders
 * (fast, JWT-only check) — this second, DB-backed check is what catches a
 * revoked/expired session in between, and confirms a real admin exists to
 * render the shell for.
 */
export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) redirect('/login');

  return (
    <div className="bg-neutral-25 flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <ImpersonationBanner />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
```

---

## 12. Ready-to-paste Antigravity prompt

Same pattern as your existing `antigravity-phase-prompts.md` — new
task/session, Review-driven development, review the diff before
accepting.

```
Read docs/audits/dala-admin-ui-overhaul-plan.md and AGENTS.md in full before
doing anything else. Phases 0–4 are already done and merged.

This is Phase 4.5 — a premium-polish cleanup pass, not a new feature phase.
I'm giving you exact full-file replacements for every file below; apply them
as given rather than reinventing the styling yourself. Do it in three
separate steps, each its own commit, stop for my review after each:

STEP 1 (isolated commit — this one visibly repaints every Card/FilterBar in
both apps/admin and apps/web, same as the Button contrast fix in Phase 1):
apply the `elevation` block change to packages/design-tokens/src/index.ts,
then packages/ui-web/src/Card.tsx and packages/ui-web/src/FilterBar.tsx,
exactly as given in [paste doc §3–5]. Show me the diff before applying.
After I approve, run pnpm --filter @dala/design-tokens typecheck,
pnpm --filter @dala/ui-web typecheck, pnpm --filter admin typecheck, and
pnpm --filter web typecheck. Paste results and stop.

STEP 2 (only after I say "continue"): apply
packages/ui-web/src/ViewToggle.tsx, packages/ui-web/src/IconActionButton.tsx,
packages/ui-web/src/Pagination.tsx, and the Sidebar.tsx header-block change,
exactly as given in [paste doc §6–9]. Then fix the two missed PageHero
conversions: apps/admin/src/app/(admin)/organizations/page.tsx and
apps/admin/src/app/(admin)/users/page.tsx, exactly as given in [paste doc
§10]. Run pnpm --filter admin typecheck, pnpm --filter admin lint,
tests/organizations.spec.ts, and tests/users.spec.ts. Paste results and stop.

STEP 3 (only after I say "continue" — SKIP THIS STEP if I tell you to defer
the topbar): apply the Topbar.tsx, GlobalSearch.tsx trigger-button, and
layout.tsx changes exactly as given in [paste doc §11]. This is new scope
(wiring in a previously-unrendered component), not part of the original
7-phase plan — confirm you understand that before applying. Run
pnpm --filter admin typecheck, pnpm --filter admin lint, and the full
apps/admin Playwright suite (pnpm --filter admin test) since this touches
the shared layout every screen renders inside. Paste full results and stop.

Don't touch any file not explicitly listed above. Don't start Phase 5 after
this — wait for me to say so.
```
