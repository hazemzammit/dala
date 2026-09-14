/**
 * apps/web/src/lib/salaryCycle.ts
 *
 * Web copy of apps/mobile/src/lib/salaryCycle.ts — the Monday-start salary
 * cycle boundary every payroll screen agrees on. The two apps cannot import
 * across each other (same constraint as the web-local SearchInput
 * duplicate), so these functions are byte-for-byte the same logic as the
 * mobile canonical: cycleStartISO() must produce the same Monday as
 * mobile's, or web's figures would silently disagree with `salary_cycles`
 * rows keyed on (org_id, worker_id, cycle_start) — migration 0007.
 *
 * Added for plan Step 12c (real TeamView/WorkerDetail payroll wiring).
 */
import type { AttendanceStatus } from '@dala/shared-types';

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

/** Days elapsed in the current cycle so far — Monday→today inclusive (1–7). */
export function elapsedCycleDays(reference: Date = new Date()): number {
  const start = Date.parse(cycleStartISO(reference));
  const today = Date.parse(todayISO());
  return Math.max(1, Math.min(7, Math.round((today - start) / 86_400_000) + 1));
}

/**
 * Weighted day value per attendance status — the exact weights mobile's
 * advances.tsx and analytics.tsx use for payroll math (present=1,
 * half_day=0.5, absent=0).
 */
export const ATTENDANCE_DAY_VALUE: Record<AttendanceStatus, number> = {
  present: 1,
  absent: 0,
  half_day: 0.5,
};

/**
 * Weighted attended days → presence % of the cycle days elapsed so far.
 * The formula behind the web "Présence" cell's percentage bar: a real
 * numerator (weighted attendance_effective days, migration 0036) over a
 * real denominator (how far into the Monday-start week we are). Capped
 * at 100.
 */
export function attendancePercent(weightedDays: number, elapsedDays: number): number {
  if (elapsedDays <= 0) return 0;
  return Math.min(100, Math.round((weightedDays / elapsedDays) * 100));
}
