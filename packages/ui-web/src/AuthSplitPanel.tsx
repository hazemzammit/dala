import type { ReactNode } from 'react';

/**
 * packages/ui-web/src/AuthSplitPanel.tsx
 *
 * UI/UX pass — right-hand hero panel for the primary auth entry screens
 * (web login/sign-up, admin login). Purely presentational: no data
 * fetching, no form logic, nothing that touches the actual auth flow.
 * Hidden below `lg` — small screens keep the single-column form only.
 *
 * Deliberately illustration-based (a large, low-opacity rendition of the
 * real Dala skyline mark, not a stock photo) so the panel stays
 * self-contained — no external image asset, no network fetch, on-brand
 * with the existing logo geometry (see apps/admin/public/logo-mark.png)
 * rather than a generic hero image swapped in as-is.
 *
 * `tone="admin"` swaps the gradient for the darker end of the palette
 * (`color.dark` in @dala/design-tokens, already defined for dark mode but
 * otherwise unused today) — a quiet way to signal "this is the internal
 * console" using tokens already in the system, not a new color.
 */
interface AuthFeature {
  icon: ReactNode;
  label: string;
}

interface AuthSplitPanelProps {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  features: AuthFeature[];
  tone?: 'brand' | 'admin';
}

const toneClasses: Record<NonNullable<AuthSplitPanelProps['tone']>, string> = {
  brand: 'bg-[linear-gradient(155deg,#0B4F4A_0%,#0C7A6F_46%,#2AA99A_100%)]',
  admin: 'bg-[linear-gradient(155deg,#111318_0%,#0A5D55_55%,#0C7A6F_100%)]',
};

export function AuthSplitPanel({
  eyebrow,
  title,
  subtitle,
  features,
  tone = 'brand',
}: AuthSplitPanelProps) {
  return (
    <div
      className={[
        'relative hidden min-h-screen w-1/2 flex-col justify-between overflow-hidden p-12 xl:p-16',
        'lg:flex',
        toneClasses[tone],
      ].join(' ')}
    >
      {/* soft ambient glows — no photo, just depth */}
      <div className="pointer-events-none absolute -end-24 -top-24 h-[420px] w-[420px] rounded-full bg-white/10 blur-3xl" />
      <div className="bg-accent-200/10 pointer-events-none absolute -bottom-32 -start-16 h-[380px] w-[380px] rounded-full blur-3xl" />
      <SkylineWatermark />

      <div className="relative z-10">
        <p className="text-accent-100 text-[11px] font-semibold uppercase tracking-[0.18em]">
          {eyebrow}
        </p>
        <h2 className="font-display mt-3 max-w-md text-[32px] font-semibold leading-[1.2] text-white">
          {title}
        </h2>
        {subtitle && <p className="mt-3 max-w-sm text-[14.5px] text-white/75">{subtitle}</p>}
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-5">
        {features.map((f) => (
          <div key={f.label} className="flex items-center gap-3">
            <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-white/15 text-white">
              {f.icon}
            </span>
            <span className="text-[14px] font-medium text-white/90">{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Oversized, low-opacity echo of the real skyline mark — decoration only. */
function SkylineWatermark() {
  const bars = [
    { x: 40, w: 62, h: 180 },
    { x: 118, w: 62, h: 250 },
    { x: 196, w: 66, h: 320 },
    { x: 278, w: 62, h: 250 },
    { x: 356, w: 62, h: 180 },
  ];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 460 400"
      className="pointer-events-none absolute -bottom-14 -end-10 h-[420px] w-[460px] opacity-[0.08]"
      fill="none"
    >
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={400 - b.h} width={b.w} height={b.h} rx={6} fill="white" />
      ))}
      <rect x={24} y={392} width={412} height={28} rx={6} fill="white" />
    </svg>
  );
}
