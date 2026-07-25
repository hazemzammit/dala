'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AdminSessionInfo {
  admin: { id: string; full_name: string; role: 'super_admin' | 'admin' | 'support' };
  session: {
    id: string;
    impersonating_user_id: string | null;
    impersonation_reason: string | null;
    impersonation_expires_at: string | null;
  };
}

/** Client-side session poll, used by the shell to render the admin's name/
 * role and by the impersonation banner. The server already gates every
 * page/route independently — this is for UI rendering only, never for
 * authorization decisions. */
export function useAdminSession(pollMs = 30_000) {
  const [data, setData] = useState<AdminSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session');
      if (res.ok) {
        setData(await res.json());
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { data, loading, refresh };
}
