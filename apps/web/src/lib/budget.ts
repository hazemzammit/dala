/**
 * apps/web/src/lib/budget.ts
 *
 * Ported verbatim from apps/mobile/src/lib/budget.ts (Doc 01 §1.14.2's
 * established definition: expenses-only, payroll excluded, lifetime not
 * windowed). Web had this same formula inline in ProjectsView.tsx's
 * `displayRows` — but without the 100%-cap mobile's version has, so a
 * project that ran over budget rendered a >100 value there. Extracted here
 * and reused in both ProjectsView and the new analytics screen (§1.10) so
 * there's exactly one definition, not two that can drift apart.
 */
export interface ExpenseAmount {
  amount: number | string;
}

/** Payroll/advances are excluded — only project_expenses rows are summed. */
export function calculateConsumedTotal(expenses: ExpenseAmount[]): number {
  return expenses.reduce((sum, e) => sum + Number(e.amount), 0);
}

/**
 * Returns null when there's no budget to compare against (0, null, or
 * undefined) — the caller renders no progress bar/chart entry in that
 * case. Capped at 100 so a project that's gone over budget doesn't render
 * a bar wider than its track.
 */
export function calculateConsumedPercent(
  consumedTotal: number,
  budgetTotal: number | null | undefined,
): number | null {
  if (!budgetTotal || budgetTotal <= 0) return null;
  return Math.min(100, Math.round((consumedTotal / budgetTotal) * 100));
}

/**
 * Same green/amber/red breakpoints as mobile's `thresholdColor`
 * (components/ui/Progress.tsx) — exported there specifically so
 * analytics.tsx's "Budget consommé" chart wouldn't re-type the threshold
 * and risk drifting from the progress-bar definition. Ported here
 * verbatim for the same reason, now that web's analytics screen needs it
 * too.
 */
export function thresholdColor(
  percent: number,
  tc: { success: string; warning: string; danger: string },
): string {
  if (percent > 100) return tc.danger;
  if (percent >= 80) return tc.warning;
  return tc.success;
}
