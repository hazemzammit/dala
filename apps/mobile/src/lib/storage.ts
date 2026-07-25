import * as Crypto from 'expo-crypto';

import { supabase } from './supabase';

/**
 * apps/mobile/src/lib/storage.ts
 *
 * First Storage-upload code in this repo — no bucket existed in any
 * migration before 0020, and no screen up to Phase 2 ever needed to
 * actually put a file somewhere (see that migration's header for the
 * full gap writeup). Every photo/*_url column in this schema (materials
 * has none, but site_logs.photo_url, safety_incidents.photo_url,
 * org_insurances.document_url) stores the STORAGE PATH, never a public or
 * signed URL directly — Doc 01 §1.3.11 says photos are "never public,
 * 1-hour signed URLs," which only works if what's persisted is the stable
 * path and a fresh signed URL is minted on every read. Storing a signed
 * URL in the row would silently start 404ing an hour later.
 *
 * Path convention: `{org_id}/{category}/{uuid}.{ext}` — the first segment
 * is what migration 0020's `org_files_*` storage.objects policies check
 * against org membership (contractor) or a linked workers row (worker).
 */
const BUCKET = 'org-files';

export async function uploadOrgFile(
  orgId: string,
  category: string,
  localUri: string,
  extension: string,
  contentType: string,
): Promise<string> {
  const path = `${orgId}/${category}/${Crypto.randomUUID()}.${extension}`;

  // React Native's fetch can read a local file:// URI as a Blob directly on
  // both iOS and Android with modern Expo/RN — no separate base64 round
  // trip needed, which keeps a multi-MB photo from being inflated ~33%
  // by base64 encoding before it even reaches Supabase.
  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  return path;
}

/**
 * Mints a fresh 1-hour signed URL for display (Doc 01 §1.3.11). Returns
 * null rather than throwing on a missing/inaccessible path so a screen can
 * render "image unavailable" instead of crashing a whole list over one bad
 * row.
 */
export async function getSignedUrl(
  path: string | null,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
