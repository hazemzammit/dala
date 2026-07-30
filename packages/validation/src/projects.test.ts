import { describe, expect, it } from 'vitest';

import { createProjectSchema, PROJECT_TYPES } from './projects';

/**
 * packages/validation/src/projects.test.ts
 *
 * Phase 7 — first real test file in this package (confirmed zero test
 * files existed anywhere in this repo outside apps/admin's Playwright
 * specs before this phase, despite `vitest` already sitting configured and
 * unused in this package's own package.json). Scoped to exactly what
 * settings.tsx / projects.tsx changed this phase — this is NOT the Doc 02
 * §2.11 test-matrix buildout, which is its own phase (see delivery notes).
 */
describe('createProjectSchema', () => {
  const validBase = {
    name: 'Villa Ennasr',
    client_name: 'M. Trabelsi',
    address: '12 Rue des Oliviers, Ariana',
    start_date: '2026-01-15',
    budget_total: 150000,
    project_type: 'residentiel' as const,
  };

  it('accepts a fully valid payload', () => {
    const result = createProjectSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('requires project_type to be one of the defined enum values', () => {
    const result = createProjectSchema.safeParse({ ...validBase, project_type: 'chateau' });
    expect(result.success).toBe(false);
  });

  it('exposes exactly the six documented project types', () => {
    expect(PROJECT_TYPES).toEqual([
      'residentiel',
      'commercial',
      'industriel',
      'renovation',
      'infrastructure',
      'autre',
    ]);
  });

  it('rejects a start_date more than 2 years in the past (Doc 03 §3.10.3)', () => {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const result = createProjectSchema.safeParse({
      ...validBase,
      start_date: threeYearsAgo.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a start_date exactly at today (not in the past at all)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = createProjectSchema.safeParse({ ...validBase, start_date: today });
    expect(result.success).toBe(true);
  });

  it('accepts budget_total of exactly 0 (spec says "must be ≥0", not >0)', () => {
    const result = createProjectSchema.safeParse({ ...validBase, budget_total: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects a negative budget_total', () => {
    const result = createProjectSchema.safeParse({ ...validBase, budget_total: -1 });
    expect(result.success).toBe(false);
  });

  it('allows budget_total to be omitted entirely (optional per spec)', () => {
    const { budget_total: _omit, ...rest } = validBase;
    const result = createProjectSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it('rejects a name under 2 characters', () => {
    const result = createProjectSchema.safeParse({ ...validBase, name: 'A' });
    expect(result.success).toBe(false);
  });

  it('rejects a name over 100 characters', () => {
    const result = createProjectSchema.safeParse({ ...validBase, name: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });
});
