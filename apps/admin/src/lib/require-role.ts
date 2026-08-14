/**
 * apps/admin/src/lib/require-role.ts
 *
 * Doc 04 §4.3 intro — role gate shared by every mutating route handler.
 * `admins/route.ts` already had its own inline `requireSuperAdmin` before
 * this file existed; this generalizes that same shape (returns a 403
 * JSON response rather than throwing — caller decides how/whether to
 * return it) so every other route can compose it the same way every route
 * already composes the `if (!ctx) return ...401...` check from
 * `getAdminSessionContext()`.
 *
 * Role table (Doc 04 §4.3 intro):
 *   super_admin — full access, incl. managing other admins, raw SQL, org deletion.
 *   admin       — everything except managing admins, raw SQL, deleting orgs.
 *   support     — read-only + impersonation, password resets. No data/billing changes.
 *
 * Usage:
 *   const ctx = await getAdminSessionContext();
 *   if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
 *   const roleError = requireRole(ctx, ['super_admin', 'admin']);
 *   if (roleError) return roleError;
 */
import { NextResponse } from 'next/server';

import type { AdminSessionContext } from './require-admin-session';

export type AdminRole = 'super_admin' | 'admin' | 'support';

export function requireRole(ctx: AdminSessionContext, allowed: AdminRole[]): NextResponse | null {
  if (allowed.includes(ctx.admin.role)) return null;
  return NextResponse.json(
    { error: 'Vous n\u2019avez pas les droits n\u00e9cessaires pour effectuer cette action.' },
    { status: 403 },
  );
}
