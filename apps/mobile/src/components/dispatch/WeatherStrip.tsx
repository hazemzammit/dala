import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { fetchWeeklyForecast, WEATHER_CODE_LABELS, type DailyForecast } from '@/lib/weather';

/**
 * apps/mobile/src/components/dispatch/WeatherStrip.tsx
 *
 * PHASE 9 §2.7 — mounted on dispatch-week.tsx (this phase) only, per the
 * plan's own wording ("a simple forecast widget on the dispatch/planning
 * screen"). Renders NOTHING while loading or on any failure — see
 * lib/weather.ts's own header for why this is a deliberately silent
 * best-effort widget, not one with its own error/permission-prompt UI: a
 * manager who never grants location permission should see a normal week
 * view with no weather row, not a persistent "enable location" nag on a
 * screen whose main job is staffing, not weather.
 */
export function WeatherStrip() {
  const [forecast, setForecast] = useState<DailyForecast[] | null>(null);

  useEffect(() => {
    void fetchWeeklyForecast().then(setForecast);
  }, []);

  if (!forecast || forecast.length === 0) return null;

  return (
    <YStack paddingHorizontal="$4" paddingBottom="$3" gap="$1.5">
      <Text fontSize={12} color="$neutral500">
        Météo (position actuelle)
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$2">
          {forecast.map((day) => (
            <YStack
              key={day.date}
              width={72}
              alignItems="center"
              backgroundColor="$neutral0"
              borderRadius="$control"
              paddingVertical="$2"
              gap={2}
            >
              <Text fontSize={11} color="$neutral500">
                {new Date(day.date)
                  .toLocaleDateString('fr-FR', { weekday: 'short' })
                  .replace('.', '')}
              </Text>
              <Text fontSize={13} fontWeight="600">
                {Math.round(day.tempMaxC)}°
              </Text>
              <Text fontSize={11} color="$neutral500">
                {Math.round(day.tempMinC)}°
              </Text>
              {day.precipitationProbability >= 30 && (
                <Text fontSize={10} color="$accent600">
                  {day.precipitationProbability}%
                </Text>
              )}
              <Text fontSize={9.5} color="$neutral500" numberOfLines={1}>
                {WEATHER_CODE_LABELS[day.weatherCode] ?? '—'}
              </Text>
            </YStack>
          ))}
        </XStack>
      </ScrollView>
    </YStack>
  );
}
