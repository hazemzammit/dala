/**
 * apps/admin/src/lib/format.ts
 *
 * Plan §5.9 (audit-derived) — consolidate the admin's number formatting
 * (`0.000 TND`, `0.00 Go`, `0.5 Mo` mixed across screens) into one
 * admin-local utility with one consistent precision per unit. Plain
 * functions, not a component — it's formatting logic, not markup.
 *
 * Precision per §5.9's example: whole Go/Mo below the unit threshold,
 * one decimal above.
 */

/** Bytes → human-readable storage string. Whole Mo below 1 Go, one-decimal
 *  Go at/above 1 Go ("500 Mo", "1.2 Go"). */
export function formatStorage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} Mo`;
  return `${(mb / 1024).toFixed(1)} Go`;
}

/** Millimes → canonical 3-decimal TND ("0.000 TND", "12.500 TND"). */
export function formatCurrencyTND(millimes: number): string {
  return `${(millimes / 1000).toFixed(3)} TND`;
}
