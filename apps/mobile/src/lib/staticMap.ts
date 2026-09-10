/**
 * apps/mobile/src/lib/staticMap.ts
 *
 * IMPROVEMENT-PLAN Part D2 — the guide's original claim was that
 * `SiteLogForm.tsx` AND worker clock-in AND `safety.tsx` incidents all
 * capture GPS coordinates that are never shown visually. Verified against
 * the actual code: only `SiteLogForm.tsx` genuinely does (confirmed via
 * `location_lat`/`location_lng` on `site_logs`, read back and shown as
 * raw "lat, lng" text in journal.tsx's entry detail sheet). Grepped the
 * whole app for `requestForegroundPermissionsAsync`/
 * `getCurrentPositionAsync` — the only other hit is `lib/weather.ts`,
 * unrelated to clock-in. There is no GPS capture anywhere in worker
 * clock-in, and `safety.tsx` incidents store no location fields at all —
 * so this helper (and the one call site that uses it) is the entire real
 * scope of D2, not the three-screen feature the guide described.
 *
 * Provider: Google Static Maps. No existing Maps/Mapbox key anywhere in
 * this repo's env files — this is a genuine "which provider" decision,
 * left to whoever sets `EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY` (see
 * apps/mobile/.env). Static Maps keys are routinely exposed client-side
 * (restricted via HTTP referrer / Android package name / iOS bundle ID in
 * the Google Cloud Console, not by hiding the key) — that's why this is
 * `EXPO_PUBLIC_`, unlike `SUPABASE_SERVICE_ROLE_KEY` above it.
 *
 * Returns null with no key configured, or the key not yet set (the
 * placeholder ships empty) — callers render their existing text-only
 * fallback in that case rather than a broken image.
 */
export function staticMapUrl(lat: number, lng: number, width = 343, height = 160): string | null {
  const key = process.env.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '15',
    size: `${width}x${height}`,
    scale: '2', // @2x for device pixel ratio — crisp on real hardware, not just the simulator
    markers: `color:0x4CBFB0|${lat},${lng}`, // $accent700 (#4CBFB0) — this app's actual accent color, not a guess; the inline MapPinIcon text uses neutral gray instead, a deliberately de-emphasized label-row treatment, so this doesn't need to match that
    key,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
