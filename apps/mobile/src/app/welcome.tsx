import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { TruckIcon, WalletIcon, WifiSlashIcon, type Icon } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';

/**
 * apps/mobile/src/app/welcome.tsx
 *
 * Doc 03 §3.2 — first-cold-start-only orientation, 3 swipeable slides,
 * skippable. Persisted locally via SecureStore (same adapter used for the
 * session — see lib/supabase.ts) so it's never shown again after dismissal.
 * index.tsx checks WELCOME_SEEN_KEY before routing here.
 */
export const WELCOME_SEEN_KEY = 'dala_welcome_seen';

const { width } = Dimensions.get('window');

const SLIDES: { icon: Icon; title: string; body: string }[] = [
  {
    icon: TruckIcon,
    title: 'Planifiez vos dispatchs en quelques taps',
    body: "Assignez ouvriers et véhicules à vos chantiers, envoyez les instructions par l'app ou WhatsApp.",
  },
  {
    icon: WalletIcon,
    title: 'Gardez vos avances et salaires à jour',
    body: 'Suivez les avances données, calculez le net dû, marquez les cycles comme payés en un tap.',
  },
  {
    icon: WifiSlashIcon,
    title: 'Fonctionne même sans réseau',
    body: 'Continuez à travailler sur le chantier — vos données se synchronisent dès que la connexion revient.',
  },
];

async function markSeenAndGo(destination: '/sign-up' | '/login') {
  await SecureStore.setItemAsync(WELCOME_SEEN_KEY, '1');
  router.replace(destination);
}

export default function WelcomeScreen() {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  }

  function goNext() {
    if (isLast) return;
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack justifyContent="flex-end" paddingHorizontal="$4" paddingTop="$6">
        <Text color="$neutral500" onPress={() => markSeenAndGo('/login')}>
          Passer
        </Text>
      </XStack>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
      >
        {SLIDES.map((slide, i) => {
          const SlideIcon = slide.icon;
          return (
            <YStack
              key={i}
              width={width}
              alignItems="center"
              justifyContent="center"
              paddingHorizontal="$6"
              gap="$4"
            >
              <View
                width={96}
                height={96}
                borderRadius={999}
                backgroundColor="$accent50"
                alignItems="center"
                justifyContent="center"
              >
                <SlideIcon size={44} color={color.accent[600]} />
              </View>
              <Text fontFamily="$display" fontSize={22} fontWeight="600" textAlign="center">
                {slide.title}
              </Text>
              <Text color="$neutral500" fontSize={15.5} textAlign="center">
                {slide.body}
              </Text>
            </YStack>
          );
        })}
      </ScrollView>

      <XStack justifyContent="center" gap="$2" marginBottom="$4">
        {SLIDES.map((_, i) => (
          <View
            key={i}
            width={i === index ? 20 : 6}
            height={6}
            borderRadius={999}
            backgroundColor={i === index ? '$accent600' : '$neutral300'}
          />
        ))}
      </XStack>

      <YStack paddingHorizontal="$4" paddingBottom="$6" gap="$3">
        {isLast ? (
          <>
            <Button onPress={() => markSeenAndGo('/sign-up')}>Créer un compte</Button>
            <Button variant="secondary" onPress={() => markSeenAndGo('/login')}>
              J&apos;ai déjà un compte
            </Button>
          </>
        ) : (
          <Button onPress={goNext}>Suivant</Button>
        )}
      </YStack>
    </YStack>
  );
}
