import { signUpSchema } from '@dala/validation';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, YStack } from 'tamagui';


import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { supabase } from '@/lib/supabase';

/**
 * Doc 01 §1.3.3 — same Edge Function as web (supabase/functions/sign-up),
 * for the same reason: org + owner-membership creation can't happen
 * client-side under RLS before email confirmation. See the function's own
 * header comment.
 */
export default function SignUpScreen() {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    organization_name: '',
    trade_type: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setLoading(true);
    const { data, error: fnError } = await supabase.functions.invoke('sign-up', {
      body: parsed.data,
      headers: { 'x-dala-platform': 'mobile' },
    });
    setLoading(false);

    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Impossible de créer le compte.');
      return;
    }

    router.replace('/check-email');
  }

  return (
    <ScrollView backgroundColor="$neutral25">
      <YStack padding="$4" gap="$4">
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Créer votre compte
        </Text>

        <FormField
          label="Nom complet"
          value={form.full_name}
          onChangeText={(v) => update('full_name', v)}
        />
        <FormField
          label="E-mail"
          value={form.email}
          onChangeText={(v) => update('email', v)}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <FormField
          label="Téléphone"
          value={form.phone}
          onChangeText={(v) => update('phone', v)}
          keyboardType="phone-pad"
        />

        <YStack>
          <FormField
            label="Mot de passe"
            value={form.password}
            onChangeText={(v) => update('password', v)}
            secureTextEntry
          />
          <PasswordStrengthMeter password={form.password} />
        </YStack>

        <FormField
          label="Nom de l'entreprise"
          value={form.organization_name}
          onChangeText={(v) => update('organization_name', v)}
        />
        <FormField
          label="Type d'activité (optionnel)"
          value={form.trade_type}
          onChangeText={(v) => update('trade_type', v)}
        />

        {error && <Text color="$danger">{error}</Text>}

        <Button onPress={handleSubmit} loading={loading}>
          Créer mon compte
        </Button>
      </YStack>
    </ScrollView>
  );
}
