import { LoginForm } from './LoginForm';

import { Card } from '@/components/ui/Card';

/**
 * Doc 04 §4.3.1 — Admin Login, step 1. Doc 05 §1.3 — auth screens use the
 * "raised" elevation tier (same as apps/web's auth screens), centered on
 * the neutral-25 page background.
 */
export default function AdminLoginPage() {
  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center">
      <Card raised className="w-full max-w-sm p-8">
        <div className="rounded-control bg-accent-600 mb-4 flex h-10 w-10 items-center justify-center text-base font-semibold text-white">
          D
        </div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">Dala Admin</h1>
        <p className="mt-1 text-sm text-neutral-500">Accès réservé à l'équipe Dala.</p>
        <LoginForm />
      </Card>
    </main>
  );
}
