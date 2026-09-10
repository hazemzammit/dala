import type { Project, Vehicle, Worker } from '@dala/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { database } from '@/db';
import DispatchAssignmentModel from '@/db/models/DispatchAssignment';
import DispatchAssignmentConflictModel from '@/db/models/DispatchAssignmentConflict';
import { runSync } from '@/db/sync';
import { haptics } from '@/lib/haptics';

/**
 * apps/mobile/src/components/dispatch/DispatchConflictsSheet.tsx
 *
 * Doc 01 §1.9 / Doc 03 §3.11 — Phase 20. The compare-sheet UI that
 * `dispatch_assignment_conflicts` (schema.ts, Phase 18) and
 * `conflictResolver.ts`'s own comment named as "a future screen (Phase
 * 19+)" — this is that screen, built as a Sheet (not a standalone route),
 * matching `Sheet.tsx`'s own header, which already lists "dispatch
 * conflict-compare" as one of this component's intended consumers, and
 * matching the synchronous "Modifié ailleurs" conflict UI already living
 * inside `dispatch.tsx`'s own sheet (same Sheet wrapper, same "Garder ma
 * version" / "Utiliser la version du serveur" copy, reused verbatim rather
 * than re-worded for the same concept).
 *
 * CORRECTION + CONSOLIDATION (Phase 19C — Doc 05 §1.7d): the spec
 * describes this component as rendering BOTH the async conflict-list
 * below AND dispatch.tsx's live, in-the-moment "Modifié ailleurs" decision
 * (the one shown inline when a save/drag hits a version conflict in real
 * time). That wasn't accurate as of 19C's start: this component only
 * rendered the async list, and the live decision was a second, hand-rolled
 * copy of the same JSX inside dispatch.tsx's own `renderSheet()`. Fixed
 * by extracting the shared visual piece both need into `ConflictCard`
 * (exported below) — dispatch.tsx's live branch now calls it directly
 * instead of duplicating it. The two callers' data sources remain
 * genuinely different and were NOT merged: this file's async conflicts
 * come from the local `dispatch_assignment_conflicts` table (WatermelonDB
 * local-first sync); dispatch.tsx's live conflict comes from a direct,
 * online-only Supabase version check in `submitAssignmentPatch` (see that
 * function's own comment — deliberately not local-first). `ConflictCard`
 * is presentational only; each caller still owns its own resolution
 * handlers and data-fetching, exactly as before.
 *
 * WHAT THIS SHOWS: every unresolved `dispatch_assignment_conflicts` local
 * row, joined against its `dispatch_assignments` row by
 * `dispatch_assignment_id`. Per Doc 03 §3.11's design (server wins in the
 * synced table itself — see `conflictResolver.ts`), that `dispatch_
 * assignments` row IS "what the server now has" by the time this sheet
 * reads it; `local_snapshot` (JSON, changed-fields-only) is "your
 * changements." Field-by-field, side by side.
 *
 * MULTI-CONFLICT: a plain list, one card per conflict — not a
 * single-conflict assumption. Each card resolves independently; resolving
 * one doesn't require leaving or reopening the sheet to resolve the next.
 *
 * RESOLUTION ACTIONS:
 *   - "Garder ma version": re-applies every field in `local_snapshot`
 *     directly onto the current `dispatch_assignments` model via a plain
 *     `record.update(...)` (NOT `updateWithFieldVersions` — that helper,
 *     and the field-level-merge design it belonged to, was deleted this
 *     same phase; see db/fieldVersions.ts's removal). A fresh local dirty
 *     write naturally bumps `version` again on the next push. Then the
 *     local conflict row is deleted.
 *   - "Utiliser la version du serveur": just deletes the local conflict
 *     row — the synced `dispatch_assignments` row already holds the
 *     server's value (conflictResolver.ts's own comment: "the synced row
 *     itself settle[s] to the server's value").
 * Either action calls `void runSync()` afterward so the resolution (the
 * re-applied edit, in the keep-mine case) actually pushes.
 *
 * NAME RESOLUTION: worker/vehicle/project names for the id-valued fields
 * in `local_snapshot` are resolved from the SAME `workers`/`vehicles`/
 * `projects` arrays `dispatch.tsx` already fetches for its own board —
 * passed in as props rather than re-fetched here, since dispatch.tsx's own
 * `load()` already has them for the active org.
 */

const FIELD_LABELS: Record<string, string> = {
  worker_id: 'Ouvrier',
  vehicle_id: 'Véhicule',
  project_id: 'Chantier',
  assignment_date: 'Date',
  departure_time: 'Heure de départ',
  confirmation_channel: 'Envoyer via',
  actual_departure_time: 'Départ réel',
};

const CHANNEL_LABELS: Record<string, string> = {
  app: 'App',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  call: 'Appel',
};

/** Maps a `local_snapshot` JSON key to the model property it corresponds
 * to, so "Garder ma version" can re-apply it through the real Model API
 * rather than poking `_raw` directly. */
const FIELD_SETTERS: Record<string, (record: DispatchAssignmentModel, value: unknown) => void> = {
  worker_id: (record, value) => {
    record.workerId = value as string;
  },
  vehicle_id: (record, value) => {
    record.vehicleId = (value as string | null) ?? null;
  },
  project_id: (record, value) => {
    record.projectId = (value as string | null) ?? null;
  },
  assignment_date: (record, value) => {
    record.assignmentDate = value as string;
  },
  departure_time: (record, value) => {
    record.departureTime = (value as string | null) ?? null;
  },
  confirmation_channel: (record, value) => {
    record.confirmationChannel = (value as string | null) ?? null;
  },
  actual_departure_time: (record, value) => {
    record.actualDepartureTime = (value as string | null) ?? null;
  },
};

/** snake_case `local_snapshot` key -> the matching camelCase property on
 * the `DispatchAssignment` model, so the server-side column value can be
 * read generically instead of a repeated if/else per field. */
const MODEL_PROPERTY: Record<string, keyof DispatchAssignmentModel> = {
  worker_id: 'workerId',
  vehicle_id: 'vehicleId',
  project_id: 'projectId',
  assignment_date: 'assignmentDate',
  departure_time: 'departureTime',
  confirmation_channel: 'confirmationChannel',
  actual_departure_time: 'actualDepartureTime',
};

interface ConflictRow {
  /** WatermelonDB id of the `dispatch_assignment_conflicts` row itself. */
  conflictId: string;
  dispatchAssignmentId: string;
  localSnapshot: Record<string, unknown>;
  /** The actual model — kept for `handleKeepMine` to write onto (needs
   * the real WatermelonDB record, not just its values). Null only if the
   * synced row somehow no longer exists locally. */
  serverRecord: DispatchAssignmentModel | null;
  /** Same row's values, read out into a plain snake_case-keyed object via
   * MODEL_PROPERTY — this is what gets passed to `ConflictCard` for
   * display, so that component can render identically regardless of
   * whether the caller has a real model (this file) or a plain object
   * from a direct Supabase read (dispatch.tsx's live case). */
  serverValues: Record<string, unknown> | null;
}

/**
 * Doc 05 §1.7d consolidation (Phase 19C): the shared card both conflict
 * surfaces render — extracted so dispatch.tsx's live, in-the-moment
 * decision (`renderSheet()`'s `conflict` branch) can call the exact same
 * implementation this file's own async list uses below, instead of a
 * second, hand-rolled copy of the same JSX (the discrepancy the header
 * comment above describes finding).
 *
 * The two callers' current visible output is preserved exactly, not
 * merged into one appearance: the field-by-field diff block only renders
 * when `changedKeys`/`localSnapshot` are actually provided. The async
 * list always has real diff data (from `local_snapshot`), so its cards
 * are unchanged. dispatch.tsx's live conflict never had per-field diff
 * data (`submitAssignmentPatch`'s conflict result is only `{ serverVersion
 * }` — no field-level compare was ever fetched for it), so passing no
 * diff data here reproduces its existing simpler "title → description →
 * two buttons" appearance exactly, rather than this consolidation
 * silently adding a diff view it never had.
 */
interface ConflictCardProps {
  /** Exact copy to show — the async list's and dispatch.tsx's live case
   * use very slightly different wording (the live case appends "Que
   * voulez-vous faire ?"), so this is a required prop rather than a
   * hardcoded default, to guarantee neither caller's copy shifts. */
  description: string;
  changedKeys?: string[];
  localSnapshot?: Record<string, unknown>;
  serverValues?: Record<string, unknown> | null;
  lookups?: { workers: Worker[]; vehicles: Vehicle[]; projects: Project[] };
  onKeepMine: () => void;
  onUseServer: () => void;
  resolving: boolean;
  /** "Garder ma version" needs a real server row to apply the diff onto —
   * disabled when the caller has none (the async list's defensive
   * `serverRecord === null` case; dispatch.tsx's live case always has one,
   * since it was just fetched to detect the conflict in the first place). */
  keepMineDisabled?: boolean;
}

export function ConflictCard({
  description,
  changedKeys = [],
  localSnapshot = {},
  serverValues = null,
  lookups,
  onKeepMine,
  onUseServer,
  resolving,
  keepMineDisabled = false,
}: ConflictCardProps) {
  return (
    <YStack backgroundColor="$neutral25" borderRadius="$card" padding="$3" gap="$3">
      <Text fontFamily="$display" fontSize={15} fontWeight="600">
        Modifié ailleurs
      </Text>
      <Text color="$neutral500" fontSize={13}>
        {description}
      </Text>

      {changedKeys.length > 0 && lookups && (
        <YStack gap="$2">
          {changedKeys.map((key) => (
            <YStack key={key} gap="$1">
              <Text fontSize={12} fontWeight="500" color="$neutral500">
                {FIELD_LABELS[key] ?? key}
              </Text>
              <XStack gap="$2">
                <YStack flex={1} gap="$0.5">
                  <Text fontSize={11} color="$neutral500">
                    Version du serveur
                  </Text>
                  <Text fontSize={13.5}>
                    {serverValues ? formatValue(key, serverValues[key], lookups) : '—'}
                  </Text>
                </YStack>
                <YStack flex={1} gap="$0.5">
                  <Text fontSize={11} color="$accent600">
                    Vos changements
                  </Text>
                  <Text fontSize={13.5} fontWeight="500">
                    {formatValue(key, localSnapshot[key], lookups)}
                  </Text>
                </YStack>
              </XStack>
            </YStack>
          ))}
        </YStack>
      )}

      <Button onPress={onKeepMine} loading={resolving} disabled={keepMineDisabled}>
        Garder ma version
      </Button>
      <Button variant="secondary" onPress={onUseServer} loading={resolving}>
        Utiliser la version du serveur
      </Button>
    </YStack>
  );
}

function formatValue(
  key: string,
  value: unknown,
  lookups: { workers: Worker[]; vehicles: Vehicle[]; projects: Project[] },
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (key === 'worker_id') {
    return lookups.workers.find((w) => w.id === value)?.full_name ?? String(value);
  }
  if (key === 'vehicle_id') {
    return lookups.vehicles.find((v) => v.id === value)?.name ?? String(value);
  }
  if (key === 'project_id') {
    return lookups.projects.find((p) => p.id === value)?.name ?? String(value);
  }
  if (key === 'confirmation_channel') {
    return CHANNEL_LABELS[value as string] ?? String(value);
  }
  return String(value);
}

interface DispatchConflictsSheetProps {
  visible: boolean;
  onClose: () => void;
  workers: Worker[];
  vehicles: Vehicle[];
  projects: Project[];
  /** Called after any resolution so the caller can refresh its own
   * conflict-count badge / assignment list. */
  onResolved: () => void;
}

export function DispatchConflictsSheet({
  visible,
  onClose,
  workers,
  vehicles,
  projects,
  onResolved,
}: DispatchConflictsSheetProps) {
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const conflictsCollection = database.get<DispatchAssignmentConflictModel>(
      'dispatch_assignment_conflicts',
    );
    const dispatchCollection = database.get<DispatchAssignmentModel>('dispatch_assignments');
    const conflictRecords = await conflictsCollection.query().fetch();

    const rows: ConflictRow[] = [];
    for (const c of conflictRecords) {
      let serverRecord: DispatchAssignmentModel | null = null;
      try {
        serverRecord = await dispatchCollection.find(c.dispatchAssignmentId);
      } catch {
        // The synced row is gone locally for some reason (shouldn't
        // normally happen — no delete path exists for this table, per
        // pullChanges.ts's own note). Still show the conflict rather than
        // silently dropping it; "Utiliser la version du serveur" still
        // works (just deletes the conflict row), "Garder ma version" is
        // disabled below when serverRecord is null.
        serverRecord = null;
      }

      let localSnapshot: Record<string, unknown> = {};
      try {
        localSnapshot = JSON.parse(c.localSnapshot) as Record<string, unknown>;
      } catch {
        localSnapshot = {};
      }

      let serverValues: Record<string, unknown> | null = null;
      if (serverRecord) {
        serverValues = {};
        for (const [snakeKey, camelKey] of Object.entries(MODEL_PROPERTY)) {
          serverValues[snakeKey] = (serverRecord as unknown as Record<string, unknown>)[camelKey];
        }
      }

      rows.push({
        conflictId: c.id,
        dispatchAssignmentId: c.dispatchAssignmentId,
        localSnapshot,
        serverRecord,
        serverValues,
      });
    }

    setConflicts(rows);
    setLoading(false);
  }, []);

  // Reload every time the sheet opens, not just on mount — a conflict may
  // have been created (a new sync ran) since the last time this was shown.
  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  async function handleKeepMine(row: ConflictRow) {
    if (!row.serverRecord) return;
    setResolvingId(row.conflictId);
    try {
      await database.write(async () => {
        await row.serverRecord!.update((record) => {
          for (const [key, value] of Object.entries(row.localSnapshot)) {
            const setter = FIELD_SETTERS[key];
            if (setter) setter(record, value);
          }
        });
        const conflictsCollection = database.get<DispatchAssignmentConflictModel>(
          'dispatch_assignment_conflicts',
        );
        const toDelete = await conflictsCollection.find(row.conflictId);
        await toDelete.destroyPermanently();
      });
      haptics.confirm();
      void runSync();
      await load();
      onResolved();
    } catch {
      haptics.error();
    } finally {
      setResolvingId(null);
    }
  }

  async function handleUseServer(row: ConflictRow) {
    setResolvingId(row.conflictId);
    try {
      await database.write(async () => {
        const conflictsCollection = database.get<DispatchAssignmentConflictModel>(
          'dispatch_assignment_conflicts',
        );
        const toDelete = await conflictsCollection.find(row.conflictId);
        await toDelete.destroyPermanently();
      });
      haptics.confirm();
      void runSync();
      await load();
      onResolved();
    } catch {
      haptics.error();
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Vos changements">
      {loading ? (
        <Text color="$neutral500" fontSize={14}>
          Chargement…
        </Text>
      ) : conflicts.length === 0 ? (
        <Text color="$neutral500" fontSize={14}>
          Aucun conflit à résoudre.
        </Text>
      ) : (
        <YStack gap="$4">
          {conflicts.map((row) => {
            const changedKeys = Object.keys(row.localSnapshot);
            const lookups = { workers, vehicles, projects };
            return (
              <ConflictCard
                key={row.conflictId}
                description="Cette affectation a été modifiée par quelqu'un d'autre entre-temps."
                changedKeys={changedKeys}
                localSnapshot={row.localSnapshot}
                serverValues={row.serverValues}
                lookups={lookups}
                onKeepMine={() => handleKeepMine(row)}
                onUseServer={() => handleUseServer(row)}
                resolving={resolvingId === row.conflictId}
                keepMineDisabled={!row.serverRecord}
              />
            );
          })}
        </YStack>
      )}
    </Sheet>
  );
}
