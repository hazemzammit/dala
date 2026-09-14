'use client';

import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

/**
 * apps/web/src/components/ui/SearchInput.tsx
 *
 * Web-local copy of admin's workflow-primitive SearchInput
 * (apps/admin/src/components/ui/SearchInput.tsx), per the web-app
 * consistency audit's decision (docs/audits/web-consistency-plan-verified.md
 * — "option (b)"): @dala/ui-web deliberately does NOT export SearchInput
 * (the verification pass confirmed this by reading its index.ts), and
 * apps/admin is out of scope for this track, so web duplicates the
 * component locally rather than letting every list page keep hand-rolling
 * its own raw <input>.
 *
 * Same debounced (`debounceMs=300`) controlled/uncontrolled shape as the
 * admin original: `onChange` fires `debounceMs` after the last keystroke;
 * `initialValue` pre-fills the visible box; `value` syncs the visible text
 * from OUTSIDE (filter resets like "Effacer les filtres", deep links)
 * without clobbering mid-word typing. Styling matches FormField's input
 * exactly (h-10, rounded-control, border-neutral-300,
 * focus:border-accent-600) minus the label — a search bar doesn't get
 * one, per Doc 05's "never placeholder-as-label" rule not applying here
 * (placeholder legitimately IS the label for a search box).
 */
export function SearchInput({
  onChange,
  placeholder,
  debounceMs = 300,
  initialValue = '',
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  debounceMs?: number;
  // Pre-fill the visible box on mount (deep-link "jump to filtered list").
  initialValue?: string;
  // External sync (controlled mode) — when the committed filter value
  // changes from outside (reset, back/forward navigation, deep link), the
  // visible text adopts it. Our own debounced commits are recognized via
  // the last-reported ref and skipped, so typing is never clobbered
  // mid-word. Omit for the old uncontrolled behavior.
  value?: string;
}) {
  const [text, setText] = useState(initialValue);
  const lastReported = useRef(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => {
      lastReported.current = text;
      onChange(text);
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // External sync (controlled mode) — see the `value` prop comment.
  useEffect(() => {
    if (value === undefined || value === lastReported.current) return;
    lastReported.current = value;
    setText(value);
  }, [value]);

  return (
    <div className="relative w-full max-w-sm">
      <MagnifyingGlassIcon
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
      />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="rounded-control bg-neutral-0 focus:border-accent-600 h-10 w-full border border-neutral-300 pl-9 pr-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150 placeholder:text-neutral-500"
      />
    </div>
  );
}
