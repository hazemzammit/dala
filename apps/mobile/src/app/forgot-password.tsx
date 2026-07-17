import { forgotPasswordSchema } from '@dala/validation';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';


import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { supabase } from '@/lib/supabase';

/**
 * Doc 01 §1.3.7 — same generic-response Edge Function as web. The
 * x-dala-platform header is what tells the function to send a `dala://`
 * deep link instead of a browser URL (see supabase/functions/forgot-password).
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setMessage(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Adresse e-mail invalide.');
      return;
    }

    setLoading(true);
    const { data } = await supabase.functions.invoke('forgot-password', {
      body: parsed.data,
      headers: { 'x-dala-platform': 'mobile' },
    });
    setLoading(false);

    setMessage(
      data?.message ??
        'Si un compte existe pour cet e-mail, nous avons envoyé un lien de réinitialisation.',
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Mot de passe oublié
      </Text>
      <Text color="$neutral500">
        Entrez votre e-mail, nous vous enverrons un lien de réinitialisation.
      </Text>

      <FormField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      {error && <Text color="$danger">{error}</Text>}
      {message && <Text color="$success">{message}</Text>}

      <Button onPress={handleSubmit} loading={loading}>
        Envoyer le lien
      </Button>
    </YStack>
  );
}
