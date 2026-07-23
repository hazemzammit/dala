/**
 * apps/mobile/src/lib/salaryCycle.ts
 *
 * Doc 03 §3.14/§4.5 — "weekly view" / "current cycle." Monday-start week,
 * matching the same boundary already inlined in
 * `(worker)/home.tsx`'s `startOfWeekISO()`. Factored out here rather than
 * left duplicated a third time across advances.tsx (contractor) and
 * salary.tsx (worker) — both need the exact same cycle_start/cycle_end
 * pair to agree on which `salary_cycles` row they're looking at.
 *
 * `salary_cycles` rows are keyed on (org_id, worker_id, cycle_start) —
 * see migration 0007 — so cycleStartISO() here has to be byte-for-byte
 * the same Monday every screen computes, or the contractor's "mark cycle
 * as paid" and the worker's payment-status badge would silently look at
 * two different rows.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function cycleStartISO(reference: Date = new Date()): string {
  const day = reference.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday-start week
  const monday = new Date(reference);
  monday.setDate(reference.getDate() - diff);
  return monday.toISOString().slice(0, 10);
}

export function cycleEndISO(reference: Date = new Date()): string {
  const start = new Date(cycleStartISO(reference));
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}

/** Every date (YYYY-MM-DD) in the current cycle, Monday through Sunday. */
export function cycleDates(reference: Date = new Date()): string[] {
  const start = new Date(cycleStartISO(reference));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
