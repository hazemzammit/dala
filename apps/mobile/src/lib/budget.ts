/**
 * apps/mobile/src/lib/budget.ts
 *
 * Phase 9 extraction. This logic previously lived inline inside
 * expenses.tsx's useMemo hooks — correct, but untestable without rendering
 * the whole screen. Pulled out as pure functions so Doc 02 §2.11's Jest
 * unit-coverage item has something real to test; expenses.tsx now just
 * calls these instead of recomputing the same math inline.
 */
export interface ExpenseAmount {
  amount: number | string;
}

/** Doc 03 §3.10.1 note: payroll/advances are excluded — only project_expenses rows are summed. */
export function calculateConsumedTotal(expenses: ExpenseAmount[]): number {
  return expenses.reduce((sum, e) => sum + Number(e.amount), 0);
}

/**
 * Returns null when there's no budget to compare against (0, null, or
 * undefined) — the caller renders no progress bar in that case, same as
 * expenses.tsx's original inline ternary. Capped at 100 so a project that's
 * gone over budget doesn't render a bar wider than the track.
 */
export function calculateConsumedPercent(
  consumedTotal: number,
  budgetTotal: number | null | undefined,
): number | null {
  if (!budgetTotal || budgetTotal <= 0) return null;
  return Math.min(100, Math.round((consumedTotal / budgetTotal) * 100));
}
