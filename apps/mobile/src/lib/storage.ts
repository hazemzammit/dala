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

/**
 * Phase 6 — Billing storage-usage bar (Doc 01 §1.6's 1GB free-tier limit,
 * cut from Phase 5's billing.tsx precisely because this recursive listing
 * didn't exist yet — see that file's header).
 *
 * Supabase Storage's `.list()` is single-level only; there's no "total
 * bytes under this prefix" API call. The path convention is
 * `{org_id}/{category}/{file}` (this file's own header), and categories
 * are open-ended strings (currently 'safety', 'site-logs', more will be
 * added by future screens without touching this function) — so this walks
 * the tree generically rather than hardcoding a category list that would
 * silently go stale.
 *
 * A `.list()` entry is a folder placeholder when `id` is null (no
 * `metadata`); this is the documented way to distinguish a folder from a
 * file in Supabase Storage's flat-key-with-delimiter model. Depth is
 * capped at 4 to bound worst-case request count against a pathologically
 * deep/malformed tree — the real convention is exactly 2 levels deep
 * ({org_id}/{category}/{file}), so this is a safety margin, not an
 * expected depth.
 */
const STORAGE_USAGE_MAX_DEPTH = 4;
const STORAGE_USAGE_LIST_PAGE_SIZE = 1000;

async function sumFolderBytes(prefix: string, depth: number): Promise<number> {
  if (depth > STORAGE_USAGE_MAX_DEPTH) return 0;

  let total = 0;
  let offset = 0;
  // Paginate defensively — a single org could plausibly exceed 1000 files
  // in one category folder (e.g. years of site-log photos) even though
  // the 1GB quota will usually be hit first.
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: STORAGE_USAGE_LIST_PAGE_SIZE,
      offset,
    });
    if (error || !data || data.length === 0) break;

    const subFolderSums = await Promise.all(
      data.map((entry) => {
        if (entry.id === null) {
          // Folder placeholder — recurse.
          return sumFolderBytes(`${prefix}/${entry.name}`, depth + 1);
        }
        return Promise.resolve(entry.metadata?.size ?? 0);
      }),
    );
    total += subFolderSums.reduce((sum, n) => sum + n, 0);

    if (data.length < STORAGE_USAGE_LIST_PAGE_SIZE) break;
    offset += STORAGE_USAGE_LIST_PAGE_SIZE;
  }
  return total;
}

/**
 * Total bytes stored under `{orgId}/` in the org-files bucket. Returns 0 on
 * any listing error (e.g. empty org, not yet a member) rather than
 * throwing — Billing should render "0 Mo utilisés," not crash, if this
 * fails.
 */
export async function getOrgStorageUsageBytes(orgId: string): Promise<number> {
  try {
    return await sumFolderBytes(orgId, 0);
  } catch {
    return 0;
  }
}

export const STORAGE_FREE_TIER_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB, Doc 01 §1.6
