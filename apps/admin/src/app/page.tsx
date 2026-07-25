import { redirect } from 'next/navigation';

/**
 * The real login flow lives at /(auth)/login, /(auth)/totp, and
 * /(auth)/totp-setup (Doc 04 §4.3.1 / Doc 01 §1.3.10). Middleware already
 * redirects an unauthenticated request for "/" straight to /login before
 * this component ever runs, so this redirect only ever fires for an
 * already-authenticated admin landing on the bare root URL.
 */
export default function AdminRootPage() {
  redirect('/dashboard');
}
