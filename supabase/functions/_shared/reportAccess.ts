// Which org roles may generate which report types.
//
// The `viewer` (Observateur) role is money-blind (migration 0103): it must not
// be able to obtain financial figures through the service-role report function
// that RLS no longer protects. Every report that carries pay or spend is
// listed here; anything not listed (currently safety_summary) stays open to
// all members. New financial report types MUST be added to this set.
export const MONEY_REPORT_TYPES: ReadonlySet<string> = new Set([
  'payroll_summary', // salaries per worker
  'payslip', //         one worker's pay
  'progression', //     includes total expenses per project vs budget
]);

const MONEY_ROLES: ReadonlySet<string> = new Set(['owner', 'manager']);

export function canGenerateReport(role: string | null | undefined, reportType: string): boolean {
  if (!MONEY_REPORT_TYPES.has(reportType)) return true;
  return typeof role === 'string' && MONEY_ROLES.has(role);
}
