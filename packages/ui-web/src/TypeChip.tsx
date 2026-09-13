/**
 * packages/ui-web/src/TypeChip.tsx
 *
 * Phase 4.7 (§1.5) — small categorical pill for org `trade_type`,
 * replacing the plain `r.trade_type ?? '—'` text in the Type column.
 *
 * Same pill anatomy as StatusBadge/PlanBadge (rounded-full, px-2.5 py-1,
 * text-xs font-medium, small leading dot) so the three chip components
 * in a row read as one family.
 *
 * Color: rotates through design-tokens' `color.categorical` closed set
 * (blue/violet/amber — the 3-hue "closed set, not a rainbow" rule from
 * that file's own comment). Rotation is deterministic per value (FNV-1a
 * over the trimmed value, hue = hash % 3), so the same type always gets
 * the same hue in a list render — never random, and no hardcoded list
 * of every possible trade type value.
 *
 * Categorical colors are never used for buttons/CTAs/selected states
 * (accent-600 stays the app's one "action" color), per design-tokens'
 * comment.
 *
 * Tailwind note (same rule as PlanBadge's comment): the class strings
 * below are literal and present in source so Tailwind's content scanner
 * can detect them — not constructed dynamically. Uses the preset's
 * flattened categorical-* keys — the same mechanism StatusBadge's
 * violet variant already relies on.
 *
 * Pure addition in this step — wired into NO page yet (Step 6 adopts it).
 */

const HUES = ['blue', 'violet', 'amber'] as const;
type Hue = (typeof HUES)[number];

const hueClasses: Record<Hue, string> = {
  blue: 'bg-categorical-blue/10 text-categorical-blue',
  violet: 'bg-categorical-violet/10 text-categorical-violet',
  amber: 'bg-categorical-amber/10 text-categorical-amber',
};

const dotClasses: Record<Hue, string> = {
  blue: 'bg-categorical-blue',
  violet: 'bg-categorical-violet',
  amber: 'bg-categorical-amber',
};

const NULL_CLASSES = 'bg-neutral-100 text-neutral-500';
const NULL_DOT_CLASSES = 'bg-neutral-500';

// FNV-1a 32-bit — deterministic, well-distributed, dependency-free.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

interface TypeChipProps {
  /** Raw DB value; `null` renders the neutral '—' fallback the Type column shows today. */
  tradeType: string | null;
}

export function TypeChip({ tradeType }: TypeChipProps) {
  if (!tradeType) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${NULL_CLASSES}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${NULL_DOT_CLASSES}`} />—
      </span>
    );
  }
  const hue = HUES[fnv1a(tradeType.trim()) % HUES.length]!;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${hueClasses[hue]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[hue]}`} />
      {tradeType}
    </span>
  );
}
