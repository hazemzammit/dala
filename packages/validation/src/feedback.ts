import { z } from 'zod';

/**
 * packages/validation/src/feedback.ts
 *
 * Gap-closure guide §1.6 — no schema existed for the `feedback` table
 * (migration 0074) anywhere in this package; confirmed by grepping the
 * whole package before adding this file, same check this package's own
 * index.ts header asks every new-schema addition to do first.
 *
 * `category` matches the table's own check constraint exactly
 * (bug/suggestion/question/other, default 'other' server-side — but the
 * client always sends one explicitly here, matching mobile's
 * SegmentedControl which always has a selection). `org_id`/`platform`/
 * `app_version` are deliberately NOT in this schema: `org_id` is resolved
 * server-side (membership lookup), and `platform`/`app_version` are
 * free-text, client-reported fields per the table's own comment — nothing
 * for a shared cross-client schema to validate the shape of.
 */
export const submitFeedbackSchema = z.object({
  category: z.enum(['bug', 'suggestion', 'question', 'other']),
  message: z.string().trim().min(1, 'Décrivez le problème ou la suggestion.'),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
