import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  DEFAULT_FETCH_TIMEOUT_MS,
  FetchTimeoutError,
  fetchWithTimeout,
} from './fetchWithTimeout';

// The whole point of this helper is a behavior that is invisible in a
// happy-path test: a request that NEVER settles must stop being awaited.
// So the fakes below are shaped like a real fetch/AbortController pair —
// the pending promise is only ever rejected by an `abort` event, exactly
// like RN's fetch — rather than a mock that resolves on demand.
//
// `global.fetch` is the whatwg-fetch polyfill RN installs; swapping it per
// test and restoring it afterwards keeps this file independent of the rest
// of the suite.
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function installFetch(impl: FetchImpl) {
  const fn = jest.fn(impl);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** A fetch that only ever settles when the signal passed to it aborts —
 *  i.e. a host that drops packets instead of refusing them. */
function hangingFetch() {
  return installFetch(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
}

describe('fetchWithTimeout', () => {
  it('resolves the response when the request settles in time', async () => {
    const response = { ok: true, status: 200 } as Response;
    installFetch(() => Promise.resolve(response));

    await expect(fetchWithTimeout('http://127.0.0.1:54321/auth/v1/health')).resolves.toBe(response);
  });

  it('passes the caller init through and adds its own abort signal', async () => {
    const fetchMock = installFetch(() => Promise.resolve({} as Response));

    await fetchWithTimeout('http://example.test/rest/v1/projects', {
      method: 'POST',
      body: '{}',
    });

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(init.signal).toBeDefined();
    expect(init.signal?.aborted).toBe(false);
  });

  it('rejects with FetchTimeoutError when the request never settles', async () => {
    hangingFetch();

    const promise = fetchWithTimeout('http://10.0.2.2:54321/rest/v1/', undefined, 50);

    await expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);
    await expect(promise).rejects.toThrow(/Le serveur ne répond pas/);
  });

  it('reports the timeout it actually used, so a call site can raise or lower it', async () => {
    hangingFetch();

    await expect(fetchWithTimeout('http://10.0.2.2:54321/rest/v1/', undefined, 50)).rejects.toMatchObject(
      { timeoutMs: 50 },
    );
    // The default is what every Supabase request inherits (see supabase.ts).
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(10000);
  });

  it('does not blame a timeout for a genuine, immediate network failure', async () => {
    installFetch(() => Promise.reject(new TypeError('Network request failed')));

    await expect(fetchWithTimeout('http://10.0.2.2:54321/rest/v1/')).rejects.toThrow(
      'Network request failed',
    );
  });

  it("forwards the caller's own abort signal into the request", async () => {
    const fetchMock = installFetch(() => Promise.resolve({} as Response));
    const controller = new AbortController();

    const promise = fetchWithTimeout('http://example.test/rest/v1/projects', {
      signal: controller.signal,
    });
    controller.abort();

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(init.signal?.aborted).toBe(true);
    await expect(promise).resolves.toBeDefined();
  });

  it('honours a signal that was already aborted before the call', async () => {
    const fetchMock = installFetch(() => Promise.resolve({} as Response));
    const controller = new AbortController();
    controller.abort();

    await fetchWithTimeout('http://example.test/rest/v1/projects', { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(init.signal?.aborted).toBe(true);
  });
});
