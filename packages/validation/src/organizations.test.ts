import { describe, expect, it } from 'vitest';

import {
  changePasswordSchema,
  confirmPhoneChangeSchema,
  deleteAccountConfirmSchema,
  inviteOrganizationMemberSchema,
  organizationMemberSetPasswordSchema,
  requestEmailChangeSchema,
  updateOrganizationMemberRoleSchema,
} from './organizations';

/**
 * packages/validation/src/organizations.test.ts
 *
 * Phase 7 — targeted tests for settings.tsx's new schemas only (email
 * change, member role change, delete-account, password change). See
 * projects.test.ts's header for why this package's test suite is scoped
 * this narrowly this phase.
 */
describe('deleteAccountConfirmSchema', () => {
  it('requires the exact word SUPPRIMER', () => {
    expect(deleteAccountConfirmSchema.safeParse({ confirmation: 'SUPPRIMER' }).success).toBe(true);
  });

  it('rejects any other input, including a near-miss', () => {
    expect(deleteAccountConfirmSchema.safeParse({ confirmation: 'supprimer' }).success).toBe(false);
    expect(deleteAccountConfirmSchema.safeParse({ confirmation: 'SUPPRIMER ' }).success).toBe(
      false,
    );
    expect(deleteAccountConfirmSchema.safeParse({ confirmation: '' }).success).toBe(false);
  });
});

describe('updateOrganizationMemberRoleSchema', () => {
  it('accepts each of the three valid roles', () => {
    for (const role of ['owner', 'manager', 'viewer'] as const) {
      const result = updateOrganizationMemberRoleSchema.safeParse({
        user_id: '11111111-1111-1111-1111-111111111111',
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid role string', () => {
    const result = updateOrganizationMemberRoleSchema.safeParse({
      user_id: '11111111-1111-1111-1111-111111111111',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });
});

describe('requestEmailChangeSchema', () => {
  it('accepts a valid email', () => {
    expect(requestEmailChangeSchema.safeParse({ new_email: 'a@b.com' }).success).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(requestEmailChangeSchema.safeParse({ new_email: 'not-an-email' }).success).toBe(false);
  });
});

describe('confirmPhoneChangeSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(confirmPhoneChangeSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('rejects a code that is not exactly 6 characters', () => {
    expect(confirmPhoneChangeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(confirmPhoneChangeSchema.safeParse({ code: '1234567' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('accepts matching passwords of sufficient length', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'oldpass1',
      new_password: 'newpass123',
      confirm_password: 'newpass123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched confirm_password', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'oldpass1',
      new_password: 'newpass123',
      confirm_password: 'different',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a new_password under 8 characters', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'oldpass1',
      new_password: 'short',
      confirm_password: 'short',
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Phase 9 — migration 0030's invite-by-email pipeline (Doc 03 §3.22, cut
 * from Phase 7).
 */
describe('inviteOrganizationMemberSchema', () => {
  it('accepts manager and viewer roles', () => {
    for (const role of ['manager', 'viewer'] as const) {
      const result = inviteOrganizationMemberSchema.safeParse({
        org_id: '11111111-1111-1111-1111-111111111111',
        email: 'a@b.com',
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects "owner" — ownership transfer is not part of this pipeline', () => {
    const result = inviteOrganizationMemberSchema.safeParse({
      org_id: '11111111-1111-1111-1111-111111111111',
      email: 'a@b.com',
      role: 'owner',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed email', () => {
    const result = inviteOrganizationMemberSchema.safeParse({
      org_id: '11111111-1111-1111-1111-111111111111',
      email: 'not-an-email',
      role: 'manager',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid org_id', () => {
    const result = inviteOrganizationMemberSchema.safeParse({
      org_id: 'not-a-uuid',
      email: 'a@b.com',
      role: 'manager',
    });
    expect(result.success).toBe(false);
  });
});

describe('organizationMemberSetPasswordSchema', () => {
  it('accepts a token with a password of at least 10 characters', () => {
    const result = organizationMemberSetPasswordSchema.safeParse({
      invitation_token: 'some-token',
      password: 'longenoughpw',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a password under 10 characters', () => {
    const result = organizationMemberSetPasswordSchema.safeParse({
      invitation_token: 'some-token',
      password: 'short1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty invitation_token', () => {
    const result = organizationMemberSetPasswordSchema.safeParse({
      invitation_token: '',
      password: 'longenoughpw',
    });
    expect(result.success).toBe(false);
  });
});
