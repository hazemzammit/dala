'use client';

import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

/**
 * apps/admin/src/components/ui/SearchInput.tsx
 *
 * Admin remediation Tier 4.2 — "no new component needed beyond a plain
 * controlled input" (the plan's own words) is true per-screen, but
 * Organizations and Users both need the identical debounce behavior, so
 * this is one small shared component rather than duplicating the same
 * setTimeout/clearTimeout logic twice. Styling matches FormField's input
 * exactly (same classes, checked against components/ui/FormField.tsx
 * before writing this) minus the label — a search bar doesn't get one,
 * per Doc 05's own "never placeholder-as-label" rule not applying here
 * (placeholder legitimately IS the label for a search box; there is no
 * separate description a <label> would add).
 */
export function SearchInput({
  onChange,
  placeholder,
  debounceMs = 300,
  initialValue = '',
}: {
  onChange: (value: string) => void;
  placeholder: string;
  debounceMs?: number;
  // Admin remediation Tier 4.4 — lets a deep link (GlobalSearch's
  // "jump to Users filtered by this name") pre-fill the visible search
  // box, not just silently apply a filter the admin can't see reflected
  // anywhere in the UI.
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => onChange(value), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full max-w-sm">
      <MagnifyingGlassIcon
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="rounded-control bg-neutral-0 focus:border-accent-600 h-10 w-full border border-neutral-300 pl-9 pr-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150 placeholder:text-neutral-500"
      />
    </div>
  );
}
