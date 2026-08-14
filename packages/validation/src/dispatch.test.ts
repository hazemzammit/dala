import { describe, expect, it } from 'vitest';

import { createDispatchAssignmentSchema, updateDispatchAssignmentSchema } from './dispatch';

/**
 * packages/validation/src/dispatch.test.ts
 *
 * Regression test for a real bug: `departure_time` (and
 * `actual_departure_time`) previously validated as `z.string().optional()`
 * with no format check, so a bare `"7"` typed into dispatch.tsx's
 * free-text "Heure de départ" field passed client-side validation, got
 * written to the local WatermelonDB record, and only failed later — during
 * the background sync push, as an opaque Postgres
 * `invalid input syntax for type time: "7"` error the person who created
 * the assignment never saw (`departure_time`/`actual_departure_time` are
 * plain `time` columns, migration 0006). This file exists to keep that bug
 * from silently coming back if the schema is ever loosened again.
 */
describe('createDispatchAssignmentSchema', () => {
  const validBase = {
    worker_id: '22222222-2222-2222-2222-000000000001',
    assignment_date: '2026-01-15',
  };

  it('accepts a valid HH:MM departure_time', () => {
    const result = createDispatchAssignmentSchema.safeParse({
      ...validBase,
      departure_time: '07:30',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a missing departure_time (optional)', () => {
    const result = createDispatchAssignmentSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('rejects a bare digit departure_time — the exact bug this file guards against', () => {
    const result = createDispatchAssignmentSchema.safeParse({
      ...validBase,
      departure_time: '7',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range hour', () => {
    const result = createDispatchAssignmentSchema.safeParse({
      ...validBase,
      departure_time: '25:00',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateDispatchAssignmentSchema', () => {
  it('rejects a bare digit actual_departure_time', () => {
    const result = updateDispatchAssignmentSchema.safeParse({
      version: 1,
      actual_departure_time: '7',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid HH:MM:SS actual_departure_time', () => {
    const result = updateDispatchAssignmentSchema.safeParse({
      version: 1,
      actual_departure_time: '14:05:00',
    });
    expect(result.success).toBe(true);
  });
});
