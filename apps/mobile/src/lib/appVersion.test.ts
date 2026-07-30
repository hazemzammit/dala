import { checkAppVersion, currentBuild } from './appVersion';

// Doc 03 §3.1's fails-open rule is the one thing in this file that's
// genuinely worth pinning with a test: it's easy to accidentally regress
// into "network error => treat as needing a forced update", which would
// lock an offline-first user out of an app they're already running.
jest.mock('./supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

// Constants.expoConfig?.version is read once at module-load time in
// appVersion.ts, so this only needs a stable value — not per-test control.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.3.0' } },
}));

import { supabase } from './supabase';

const mockRpc = supabase.rpc as jest.Mock;

describe('checkAppVersion', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('maps a normal RPC response through', async () => {
    mockRpc.mockResolvedValue({
      data: { latest_version: '2.4.0', min_supported_version: '2.0.0', force_update: false },
      error: null,
    });

    const result = await checkAppVersion();
    expect(result).toEqual({
      latestVersion: '2.4.0',
      minSupportedVersion: '2.0.0',
      forceUpdate: false,
    });
  });

  it('surfaces force_update: true when the backend says the build is unsupported', async () => {
    mockRpc.mockResolvedValue({
      data: { latest_version: '2.4.0', min_supported_version: '2.4.0', force_update: true },
      error: null,
    });

    const result = await checkAppVersion();
    expect(result.forceUpdate).toBe(true);
  });

  it('fails open (forceUpdate: false) when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });

    const result = await checkAppVersion();
    expect(result.forceUpdate).toBe(false);
    expect(result.latestVersion).toBe(currentBuild());
  });

  it('fails open (forceUpdate: false) when the call throws (e.g. fully offline)', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));

    const result = await checkAppVersion();
    expect(result.forceUpdate).toBe(false);
    expect(result.latestVersion).toBe(currentBuild());
  });

  it('never throws, even when the RPC rejects', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));
    await expect(checkAppVersion()).resolves.not.toThrow();
  });
});

describe('currentBuild', () => {
  it('reads the version from expo-constants', () => {
    expect(currentBuild()).toBe('2.3.0');
  });
});
