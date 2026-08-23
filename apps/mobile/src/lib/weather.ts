import * as Location from 'expo-location';

/**
 * apps/mobile/src/lib/weather.ts
 *
 * IMPROVEMENT-PLAN PHASE 9 §2.7 "Weather widget."
 *
 * STEP 1 FINDINGS, both disclosed as deliberate scope decisions rather
 * than silent shortcuts:
 *
 *   1. NO GEOCODING. `projects.address` is free text (grepped `projects`'
 *      own schema before writing this — no latitude/longitude columns
 *      anywhere on it, nor on `organizations`), so "weather at each
 *      project site" would require adding a real geocoding provider and
 *      a new keyed API dependency — genuinely more than a "simple
 *      forecast widget" (the plan's own wording) should cost. Uses the
 *      DEVICE'S current location instead (`expo-location`, already a
 *      real dependency of this app — SiteLogForm.tsx's own
 *      `requestForegroundPermissionsAsync` +
 *      `getCurrentPositionAsync({})` pattern is reused verbatim below,
 *      not reinvented), which is "weather near me right now" rather than
 *      "weather at project X" — a reasonable fit for a manager planning
 *      from the office/site area, disclosed rather than assumed
 *      equivalent to per-project weather.
 *
 *   2. NO EDGE FUNCTION, NO SECRET. Every other outbound third-party call
 *      in this app (`_shared/resend.ts`, the SMS providers referenced in
 *      migration 0028's own header) exists specifically to keep an API
 *      key server-side, away from the client. Open-Meteo
 *      (open-meteo.com) was chosen deliberately BECAUSE it needs no API
 *      key at all — there is no secret to protect here, so proxying this
 *      through an Edge Function would add a network hop for no actual
 *      security benefit, diverging from the resend.ts pattern by
 *      necessity (nothing to hide), not by oversight. If a paid/keyed
 *      provider replaces this later, that secret-storage decision should
 *      be made then, following resend.ts's own convention at that point.
 *
 * Best-effort, same contract every other location call in this app
 * already has (SiteLogForm.tsx's own comment: "never blocks... silently
 * proceed without"): returns null on missing permission, no fix, or a
 * network failure — the caller (WeatherStrip.tsx) renders nothing rather
 * than an error state for what is a nice-to-have widget, not a required
 * one.
 */

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  tempMaxC: number;
  tempMinC: number;
  precipitationProbability: number; // 0-100
  weatherCode: number; // WMO code, see WEATHER_CODE_LABELS below
}

// WMO Weather interpretation codes (Open-Meteo's own documented mapping,
// https://open-meteo.com/en/docs — the subset this app actually
// displays; codes outside this map fall back to a generic label rather
// than an empty one).
export const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Ciel dégagé',
  1: 'Plutôt dégagé',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine',
  55: 'Bruine forte',
  61: 'Pluie légère',
  63: 'Pluie',
  65: 'Pluie forte',
  71: 'Neige légère',
  73: 'Neige',
  75: 'Neige forte',
  80: 'Averses légères',
  81: 'Averses',
  82: 'Averses fortes',
  95: 'Orage',
};

export async function fetchWeeklyForecast(): Promise<DailyForecast[] | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;

    const position = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = position.coords;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      `&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();

    const dates: string[] = json?.daily?.time ?? [];
    const tempMax: number[] = json?.daily?.temperature_2m_max ?? [];
    const tempMin: number[] = json?.daily?.temperature_2m_min ?? [];
    const precip: number[] = json?.daily?.precipitation_probability_max ?? [];
    const codes: number[] = json?.daily?.weathercode ?? [];

    if (dates.length === 0) return null;

    return dates.map((date, i) => ({
      date,
      tempMaxC: tempMax[i] ?? 0,
      tempMinC: tempMin[i] ?? 0,
      precipitationProbability: precip[i] ?? 0,
      weatherCode: codes[i] ?? 0,
    }));
  } catch {
    // Any failure (permission denied, no GPS fix, offline, malformed
    // response) — same silent best-effort contract as this file's own
    // header states.
    return null;
  }
}
