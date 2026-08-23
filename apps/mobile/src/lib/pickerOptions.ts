import type { SelectOption } from '@/components/ui/Select';

/**
 * apps/mobile/src/lib/pickerOptions.ts
 *
 * IMPROVEMENT-PLAN PHASE 4 (§3) — the six closed-ish lists §3's own table
 * specifies, verbatim (French labels, exact order as given in the plan
 * doc). Centralized here rather than declared inline in each of the six
 * files that use them, for the one genuine duplication this phase creates:
 * `organization-settings.tsx` (`organizations.trade_type`) and `team.tsx`
 * (`workers.trade`) use the literal SAME list ("same list, per worker,"
 * per the plan's own wording) — a single source keeps them from silently
 * drifting apart if a trade is ever added or renamed later.
 *
 * `value` and `label` are identical for every option below — there's no
 * separate machine-code/display-label distinction anywhere in this app's
 * existing free-text fields (organizations.trade_type, workers.trade,
 * org_insurances.coverage_type were always plain free text with no coded
 * form), so introducing one now (e.g. 'plumbing' -> 'Plomberie') would be
 * a data-shape change beyond what this phase's "add a picker in front of
 * an existing text field" scope calls for.
 *
 * DISCLOSED MISMATCH, not silently glossed over: `supabase/seed.sql`'s
 * existing `organizations.trade_type` values are lowercase free text
 * ('plomberie', 'électricité' — checked directly, not assumed) rather
 * than this list's Title Case ('Plomberie'). `Select.tsx` still displays
 * these correctly (a stored value that doesn't exactly match a preset's
 * own `value` renders as itself via the "custom value" path — see that
 * file's own header), but reopening the picker on an existing seeded org
 * won't highlight a preset row as selected; the org would need to
 * re-pick (or free-type via "Autre") once to normalize onto this list's
 * exact casing. Not fixed by a data migration here — normalizing existing
 * rows is a one-time cleanup decision, not part of "add a picker," and
 * doing it silently inside this phase's migration would be exactly the
 * kind of unscoped pulling-forward the plan's own guardrail warns against.
 */
export const TRADE_OPTIONS: SelectOption[] = [
  { value: 'Plomberie', label: 'Plomberie' },
  { value: 'Électricité', label: 'Électricité' },
  { value: 'Maçonnerie', label: 'Maçonnerie' },
  { value: 'Peinture', label: 'Peinture' },
  { value: 'Climatisation', label: 'Climatisation' },
  { value: 'Vacuum central', label: 'Vacuum central' },
  { value: 'Menuiserie', label: 'Menuiserie' },
  { value: 'Carrelage', label: 'Carrelage' },
  { value: 'Gros œuvre', label: 'Gros œuvre' },
  { value: 'Second œuvre', label: 'Second œuvre' },
  { value: 'Rénovation générale', label: 'Rénovation générale' },
];

export const INSURANCE_COVERAGE_OPTIONS: SelectOption[] = [
  { value: 'Responsabilité civile', label: 'Responsabilité civile' },
  { value: 'Décennale', label: 'Décennale' },
  { value: 'Multirisque chantier', label: 'Multirisque chantier' },
  { value: 'Flotte automobile', label: 'Flotte automobile' },
];

/** Plan §3 — "also makes the §2.3 safety chart chartable by category,
 * which free text isn't." Kept as a distinct list from insurance coverage
 * above even though both live on `safety.tsx` — §3's own table lists them
 * as two separate fields, and `Assurance` and `Incident` have nothing
 * conceptually in common besides sharing a screen. */
export const INCIDENT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'Chute', label: 'Chute' },
  { value: 'Coupure', label: 'Coupure' },
  { value: 'Électrocution', label: 'Électrocution' },
  { value: 'Accident véhicule', label: 'Accident véhicule' },
];

export const MATERIAL_OPTIONS: SelectOption[] = [
  { value: 'Ciment', label: 'Ciment' },
  { value: 'Sable', label: 'Sable' },
  { value: 'Fer', label: 'Fer' },
  { value: 'Brique', label: 'Brique' },
  { value: 'Peinture', label: 'Peinture' },
  { value: 'Carrelage', label: 'Carrelage' },
];

export const ABSENCE_REASON_OPTIONS: SelectOption[] = [
  { value: 'Maladie', label: 'Maladie' },
  { value: 'Congé autorisé', label: 'Congé autorisé' },
  { value: 'Absence non justifiée', label: 'Absence non justifiée' },
];

/** Phase 8 (improvement-plan §1.3 step 3) — vehicle_documents.document_type.
 * Same free-text-with-preset pattern as every other list in this file: a
 * value that doesn't match a preset (an "Autre" free-type, or a value
 * seeded before this list existed) still displays correctly via Select's
 * own custom-value path. */
export const VEHICLE_DOCUMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'Carte grise', label: 'Carte grise' },
  { value: 'Contrôle technique', label: 'Contrôle technique' },
  { value: 'Assurance', label: 'Assurance' },
  { value: 'Vignette', label: 'Vignette' },
];
