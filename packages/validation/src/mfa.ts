import { z } from 'zod';

/**
 * Doc 01 §1.15 — Phase 8 two-factor authentication (Supabase Auth's native
 * TOTP MFA, not a custom column — see migration 0029's header for why).
 */
export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
});
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;

/** 8 uppercase-alphanumeric chars, matching generate_mfa_recovery_codes' alphabet (migration 0029). */
export const recoveryCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, 'Le code de récupération doit contenir 8 caractères.'),
});
export type RecoveryCodeInput = z.infer<typeof recoveryCodeSchema>;

/** mfa-recover Edge Function input. */
export const mfaRecoverSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Mot de passe requis.'),
  recovery_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, 'Le code de récupération doit contenir 8 caractères.'),
});
export type MfaRecoverInput = z.infer<typeof mfaRecoverSchema>;
