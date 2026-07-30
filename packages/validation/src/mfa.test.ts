import { describe, expect, it } from 'vitest';

import { mfaRecoverSchema, recoveryCodeSchema, totpCodeSchema } from './mfa';

/**
 * packages/validation/src/mfa.test.ts
 *
 * Phase 8 — targeted tests for the new two-factor-authentication schemas
 * only, same scoping discipline as Phase 7's projects.test.ts/
 * organizations.test.ts (not the full Doc 02 §2.11 test-matrix buildout).
 */
describe('totpCodeSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(totpCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('rejects a code with the wrong length', () => {
    expect(totpCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: '1234567' }).success).toBe(false);
  });

  it('rejects a code containing non-digit characters', () => {
    expect(totpCodeSchema.safeParse({ code: '12345a' }).success).toBe(false);
  });
});

describe('recoveryCodeSchema', () => {
  it('accepts an 8-character uppercase alphanumeric code', () => {
    expect(recoveryCodeSchema.safeParse({ code: 'ABCD2345' }).success).toBe(true);
  });

  it('normalizes a lowercase code to uppercase before validating', () => {
    const result = recoveryCodeSchema.safeParse({ code: 'abcd2345' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('ABCD2345');
    }
  });

  it('trims surrounding whitespace before validating', () => {
    const result = recoveryCodeSchema.safeParse({ code: '  ABCD2345  ' });
    expect(result.success).toBe(true);
  });

  it('rejects a code that is not exactly 8 characters', () => {
    expect(recoveryCodeSchema.safeParse({ code: 'ABCD234' }).success).toBe(false);
    expect(recoveryCodeSchema.safeParse({ code: 'ABCD23456' }).success).toBe(false);
  });
});

describe('mfaRecoverSchema', () => {
  const valid = {
    email: 'contractor@example.com',
    password: 'correcthorsebattery',
    recovery_code: 'abcd2345',
  };

  it('accepts a fully valid payload and normalizes the recovery code', () => {
    const result = mfaRecoverSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recovery_code).toBe('ABCD2345');
    }
  });

  it('rejects a malformed email', () => {
    expect(mfaRecoverSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(mfaRecoverSchema.safeParse({ ...valid, password: '' }).success).toBe(false);
  });

  it('rejects a malformed recovery code', () => {
    expect(mfaRecoverSchema.safeParse({ ...valid, recovery_code: '123' }).success).toBe(false);
  });
});
