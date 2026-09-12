import { redirect } from 'next/navigation';

import { ImpersonationBanner } from '@/components/shell/ImpersonationBanner';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { getAdminSessionContext } from '@/lib/require-admin-session';

/**
 * Shell for every screen in Doc 04 §4.3 / Doc 05 §3.6. Middleware already
 * redirects unauthenticated requests to /login before this ever renders
 * (fast, JWT-only check) — this second, DB-backed check is what catches a
 * revoked/expired session in between, and confirms a real admin exists to
 * render the shell for.
 */
export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) redirect('/login');

  return (
    <div className="bg-neutral-25 flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <ImpersonationBanner />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
