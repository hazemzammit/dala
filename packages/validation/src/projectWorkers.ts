import { z } from 'zod';

/**
 * Doc 03 §3.10.2 Équipe tab — migration 0034_project_workers.sql.
 *
 * Both schemas are deliberately thin: `project_workers`' real guardrails
 * (which worker/project pairs are actually allowed, org isolation, the
 * partial-unique-active-row constraint) live in RLS + the DB schema, not
 * here — these two schemas exist to catch obviously-malformed client input
 * before a round-trip, not to re-implement the RLS predicate client-side.
 */

/** "+ Ajouter un ouvrier" — adds one worker to a project's roster. */
export const addProjectWorkerSchema = z.object({
  project_id: z.string().uuid(),
  worker_id: z.string().uuid(),
});
export type AddProjectWorkerInput = z.infer<typeof addProjectWorkerSchema>;

/**
 * "Retirer du chantier" — soft-delete via `removed_at`/`removed_by`, never
 * a hard delete (see migration 0034's header). `id` is the `project_workers`
 * row id, not the worker id — a worker can have more than one historical
 * row against the same project (removed, then manually re-added later), so
 * the roster's own row id is what the remove action actually targets.
 */
export const removeProjectWorkerSchema = z.object({
  id: z.string().uuid(),
});
export type RemoveProjectWorkerInput = z.infer<typeof removeProjectWorkerSchema>;
