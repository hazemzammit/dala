import { router } from 'expo-router';
import { CaretRightIcon, CheckCircleIcon, CircleIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Text, View, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/onboarding/OnboardingChecklist.tsx
 *
 * Phase 12 (improvement-plan §10.7). Mirrors organization-settings.tsx's
 * §4.4 profile-completion nudge card — same visual shape (a YStack card,
 * a dismiss affordance, tappable rows) — while tracking a genuinely
 * different "done" condition. See migration 0077's Part 3 header for the
 * full reasoning on why this is a second column/RPC rather than reusing
 * org_checklist_dismissed_at.
 *
 * Steps are computed from whether real data exists (a project row, a
 * worker row, an attendance row) — NOT from a stored per-step completion
 * flag. This is a deliberate simplification: it means a step can't be
 * marked done without the underlying real action actually having
 * happened (there's no "check this box" without doing the thing), and it
 * needs no new schema beyond the single dismiss flag — the three existence
 * checks below are single-row `head: true, count: 'exact'` queries against
 * tables that already exist and are already RLS-scoped to the active org,
 * the same query shape `myOrgs.ts`'s own counts already use elsewhere in
 * this codebase.
 *
 * Auto-hides (returns null, no card at all) once every step is complete
 * OR the org has explicitly dismissed it — a completed checklist has
 * nothing left to nudge toward, so showing a fully-checked, un-dismissable
 * card forever would just be visual clutter on every dashboard load.
 */
interface Step {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export function OnboardingChecklist({ orgId }: { orgId: string | null }) {
  const tc = useTokenColor();
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    void load(orgId);
  }, [orgId]);

  async function load(org: string) {
    setLoading(true);

    const [{ data: orgRow }, projectCount, workerCount, attendanceCount] = await Promise.all([
      supabase.from('organizations').select('onboarding_dismissed_at').eq('id', org).maybeSingle(),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('org_id', org),
      supabase.from('workers').select('id', { count: 'exact', head: true }).eq('org_id', org),
      supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org),
    ]);

    setDismissed(!!orgRow?.onboarding_dismissed_at);
    setSteps([
      {
        key: 'project',
        label: 'Ajoutez votre premier chantier',
        done: (projectCount.count ?? 0) > 0,
        // No dedicated "new project" route exists — creation happens via
        // a sheet opened from the FAB on projects.tsx (confirmed by
        // reading that file before writing this, not assumed) — so this
        // routes to the list screen, same as tapping the tab would.
        href: '/(contractor)/projects',
      },
      {
        key: 'worker',
        label: 'Ajoutez un travailleur',
        done: (workerCount.count ?? 0) > 0,
        // Same reasoning — invite flow lives inline on team.tsx, no
        // dedicated "new worker" route.
        href: '/(contractor)/team',
      },
      {
        key: 'attendance',
        label: 'Faites votre premier pointage',
        done: (attendanceCount.count ?? 0) > 0,
        href: '/(contractor)/pointage',
      },
    ]);
    setLoading(false);
  }

  async function handleDismiss() {
    if (!orgId) return;
    setDismissed(true);
    await supabase.rpc('dismiss_org_onboarding', { p_org_id: orgId, p_dismissed: true });
  }

  if (loading || dismissed || !orgId) return null;
  const allDone = steps.length > 0 && steps.every((s) => s.done);
  if (allDone) return null;

  return (
    <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize={15} fontWeight="600">
          Premiers pas sur Dala
        </Text>
        <View
          onPress={() => void handleDismiss()}
          accessibilityRole="button"
          accessibilityLabel="Ignorer"
        >
          <XIcon size={16} color={tc.neutral500} />
        </View>
      </XStack>

      <YStack gap="$2.5">
        {steps.map((step) => (
          <XStack
            key={step.key}
            alignItems="center"
            gap="$2.5"
            onPress={() => !step.done && router.push(step.href as never)}
            accessibilityRole="button"
            accessibilityLabel={step.label}
          >
            {step.done ? (
              <CheckCircleIcon size={20} weight="fill" color={tc.success} />
            ) : (
              <CircleIcon size={20} color={tc.neutral300} />
            )}
            <Text
              flex={1}
              fontSize={14}
              color={step.done ? '$neutral500' : '$neutral900'}
              textDecorationLine={step.done ? 'line-through' : 'none'}
            >
              {step.label}
            </Text>
            {!step.done && <CaretRightIcon size={16} color={tc.neutral300} />}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}
