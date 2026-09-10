/**
 * apps/mobile/src/lib/accessibilityState.ts
 *
 * Doc 05 §1.7n — "Disabled vs. unavailable vs. read-only vs. hidden: these
 * are four distinct semantic states (§1.7b) and must be exposed distinctly
 * to assistive technology, not collapsed into a single generic `disabled`
 * attribute."
 *
 * §1.7b already names these four treatments (hidden / disabled-plain /
 * disabled-with-explanation / read-only-banner) as a VISUAL pattern, with
 * real examples across the app (`organization-settings.tsx`'s `LockIcon`,
 * Admin `feature-flags`, web `RolesView.tsx`). What's missing per §1.7n
 * is the assistive-tech-facing half — confirmed via a codebase-wide grep:
 * `accessibilityState={{ disabled }}` (or `{ checked, disabled }`) exists
 * on exactly one component (`Toggle.tsx`) anywhere in the app; none of the
 * §1.7b reference examples themselves expose their state to screen readers
 * today. This utility is the shared building block for closing that gap —
 * it does not, itself, retrofit any of those existing screens (that's a
 * per-screen change belonging to whichever later phase revisits each one,
 * not a foundation-layer token/utility).
 *
 * `disabled` (RN's own accessibilityState key) covers exactly the first
 * two rows of §1.7b's table — "disabled (plain)" and "disabled + explanation"
 * are the same assistive-tech state, differing only in whether a visible
 * explanation happens to be shown alongside; VoiceOver/TalkBack must
 * announce both as unavailable-to-interact either way. "Hidden" (§1.7b's
 * structural-boundary row) isn't an accessibilityState value at all —
 * screens implementing it correctly simply don't render the element, which
 * already fully removes it from the accessibility tree; there's nothing
 * for this utility to add there. "Read-only banner at section level" is
 * `busy`, not `disabled` — the content itself is still readable, only not
 * editable, which VoiceOver/TalkBack should announce differently from a
 * disabled control.
 */
export type PermissionAccessibilityState = 'disabled' | 'disabled-explained' | 'read-only';

interface PermissionAccessibilityProps {
  accessibilityState: { disabled?: boolean; busy?: boolean };
  /** Pass as the control's `accessibilityHint` when present (RN merges an
   * explicit `accessibilityLabel` with this automatically for screen
   * readers — do not concatenate it into the label by hand). */
  accessibilityHint?: string;
}

/**
 * Maps one of §1.7b's non-hidden permission states to the RN accessibility
 * props that expose it correctly. `explanation` is the same human-readable
 * "why" text already shown visually next to a `LockIcon`-style treatment
 * (§1.7b's second row) — pass it through here too, rather than only
 * rendering it as visible text, so a screen-reader user gets the same
 * information a sighted user does.
 */
export function getPermissionAccessibilityProps(
  state: PermissionAccessibilityState,
  explanation?: string,
): PermissionAccessibilityProps {
  if (state === 'read-only') {
    return { accessibilityState: { busy: true } };
  }
  return {
    accessibilityState: { disabled: true },
    accessibilityHint: state === 'disabled-explained' ? explanation : undefined,
  };
}
