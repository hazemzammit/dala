import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';

/**
 * Doc 03 §3.1 — this is the splash screen's redirect logic. The
 * app_version_check() forced-update gate (Doc 01 §1.8) belongs here too,
 * before the auth check — not wired up yet in this scaffold.
 */
export default function Index() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/dashboard' : '/login');
    });
  }, []);

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$neutral25">
      <Text fontFamily="$display" fontSize={28} fontWeight="700">
        Dala
      </Text>
      <Text color="$neutral500" marginTop="$2">
        La base de tout chantier.
      </Text>
    </YStack>
  );
}
