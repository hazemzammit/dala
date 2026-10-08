/**
 * Whether the signed-in user may see financial data (pay, advances, expenses,
 * invoices, reports): owners and managers yes, viewers (Observateur) no.
 * Migration 0103 made the database money-blind for viewers, so a money screen
 * opened by a viewer would otherwise show empty lists and "0 TND" — misleading
 * rather than merely restricted.
 *
 * PRESENTATION ONLY: RLS is the boundary, this just avoids showing a broken
 * screen. Because the app is offline-first, the last known role is cached in
 * SecureStore (per user + org) and used when the network lookup fails or times
 * out — a manager in a tunnel must not be shown a "restricted" screen. With no
 * cache and no network the answer is "not allowed" (safe default), which only
 * happens on a first-ever offline open of a money screen.
 */
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

import { getActiveOrgId, getMyOrgRole } from './activeOrg';
import { supabase } from './supabase';

type Role = 'owner' | 'manager' | 'viewer';
const CACHE_KEY = 'dala.orgRoleCache.v1';
const LOOKUP_TIMEOUT_MS = 4_000;

export function roleAllowsMoney(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

async function readCachedRole(userId: string): Promise<Role | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; role?: Role };
    return parsed.userId === userId ? (parsed.role ?? null) : null;
  } catch {
    return null;
  }
}

async function writeCachedRole(userId: string, orgId: string, role: Role): Promise<void> {
  try {
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ userId, orgId, role }));
  } catch {
    /* cache is best-effort */
  }
}

export async function resolveMoneyAccess(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession(); // local — works offline
  if (!session) return false;
  const userId = session.user.id;

  try {
    const live = await Promise.race([
      (async () => {
        const orgId = await getActiveOrgId();
        const role = orgId ? await getMyOrgRole(orgId) : null;
        return orgId && role ? { orgId, role } : null;
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)),
    ]);
    if (live) {
      void writeCachedRole(userId, live.orgId, live.role);
      return roleAllowsMoney(live.role);
    }
  } catch {
    /* fall through to the cache */
  }
  return roleAllowsMoney(await readCachedRole(userId));
}

export function useCanSeeMoney(): { loading: boolean; canSeeMoney: boolean } {
  const [state, setState] = useState({ loading: true, canSeeMoney: false });
  useEffect(() => {
    let cancelled = false;
    void resolveMoneyAccess().then((allowed) => {
      if (!cancelled) setState({ loading: false, canSeeMoney: allowed });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
