/**
 * apps/mobile/src/lib/fetchWithTimeout.ts
 *
 * WHY THIS EXISTS — found by running the app, 2026-09-30. React Native's
 * `fetch` has NO timeout of its own, and a host that silently DROPS packets
 * (rather than refusing the connection) is never "done" failing: the request
 * just hangs until the platform's own socket timeouts give up. Nothing in
 * this app bounded that — `lib/supabase.ts` built the Supabase client with
 * the default global fetch, so every auth refresh, RPC and table query
 * inherited the same unbounded behaviour.
 *
 * The consequence, measured on a device rather than reasoned about: with a
 * local Supabase stack whose host ports could not be published (Windows had
 * reserved TCP 54268-54367, which contains the stack's 54321/54322/54323),
 * `app/index.tsx`'s splash ran a CHAIN of Supabase calls
 * (app_version_check -> getSession() -> profiles -> organization_members ->
 * workers). Each call hung to its own timeout, so the splash stayed on
 * screen for ~5 minutes (device logcat: MainActivity displayed 21:44:20,
 * Login finally mounted ~21:49:35) before the app got anywhere — and
 * `void resolve()` would have swallowed a rejection forever had one of
 * those calls thrown instead of resolving with an error.
 *
 * Passing this function as the Supabase client's `global.fetch` is the
 * single-point fix: it bounds EVERY request made through that client —
 * auth, PostgREST, Storage, Edge Functions, and the WatermelonDB sync that
 * uses the same client — instead of patching call site by call site.
 * `app/index.tsx` separately caps the whole bootstrap sequence with its own
 * deadline, so a slow-but-alive backend can't stretch the splash either.
 *
 * Deliberately NOT `AbortSignal.timeout()`: Hermes does not implement it
 * (it's a Node/WHATWG addition React Native has never polyfilled — see the
 * `abort-controller` polyfill note in RN's own docs), so the abort is driven
 * by an explicit `AbortController` + `setTimeout`. A caller-supplied
 * `init.signal` is still honoured (forwarded to the same controller), so
 * this stays a drop-in `fetch` replacement for any call site that passes
 * its own cancellation signal — supabase-js does exactly that for its
 * `abortSignal` options.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10000;

/**
 * Message shown to users when the client gives up waiting. French, matching
 * every other user-facing string in this app, and deliberately not
 * "Network request failed" (what the platform throws) because login.tsx
 * surfaces `authError.message` verbatim — auth-js re-wraps whatever we throw
 * into an `AuthRetryableFetchError` carrying this same message (see
 * @supabase/auth-js `lib/fetch.js`), so the person sees a sentence they can
 * act on instead of an English platform error.
 */
export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Le serveur ne répond pas (délai de ${Math.round(timeoutMs / 1000)} s dépassé).`);
    this.name = 'FetchTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/**
 * `input` is declared wider than this project's own `fetch` signature on
 * purpose: supabase-js types its `global.fetch` slot as accepting
 * `RequestInfo | URL` (a URL object, not just a string), so the wrapper has
 * to accept that too or it can't be installed there at all. The cast below
 * mirrors what the platform does anyway — every call this app makes passes
 * a string URL.
 */
export async function fetchWithTimeout(
  input: FetchInput | string | URL,
  init?: FetchInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Forward a caller's own signal (supabase-js's `abortSignal`, or any
  // future call site) into the controller that actually drives the request,
  // so both cancellation sources work through one signal.
  const callerSignal = init?.signal ?? null;
  const forwardAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', forwardAbort);
  }

  try {
    return await fetch(input as FetchInput, { ...init, signal: controller.signal });
  } catch (error) {
    // Distinguish "we gave up" from every other failure (connection refused,
    // DNS, TLS, the caller's own abort): only the first is worth telling the
    // user that the server is slow rather than unreachable.
    if (timedOut) throw new FetchTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener('abort', forwardAbort);
  }
}
