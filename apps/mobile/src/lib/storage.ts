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
 *
 * PHASE 18 REDO — this file briefly (same conversation) carried a TUS
 * resumable-upload rewrite (`tus-js-client`, 64KB-then-6MB chunking),
 * built against a stale docx requirement ("64KB chunks... resume
 * individually on drop") that doesn't exist anywhere in this repo's own
 * authoritative spec (`docs/spec/`, confirmed the living/current version —
 * grepped the whole spec tree for "resumable," "TUS," "chunk," "background
 * upload": zero matches). The real spec
 * (`docs/spec/03-screens-mobile-contractor-and-worker.md` §4.2) just says
 * a compressed photo goes into "the upload queue" — no chunking/resumable
 * protocol specified. Reverted to the original single-shot upload rather
 * than keeping an unrequested dependency and a genuinely mismatched
 * mechanism (Supabase's real TUS chunk size is server-fixed at 6MB, which
 * doesn't correspond to anything meaningful for a ~1-2MB compressed
 * photo either — see the removed code's own now-deleted header for that
 * dead end). If real resumable-upload resilience becomes a stated
 * requirement later, revisit `tus-js-client` then, spec in hand — not
 * preemptively re-added here.
 */
const BUCKET = 'org-files';

export async function uploadOrgFile(
  orgId: string,
  category: string,
  localUri: string,
  extension: string,
  contentType: string,
): Promise<string> {
  const fileName = `${Crypto.randomUUID()}.${extension}`;
  const path = `${orgId}/${category}/${fileName}`;

  // Bug fix: fetch(localUri).blob() was producing an effectively-empty
  // body on this RN/Hermes bridgeless setup — Storage's own request log
  // showed the multipart upload arriving as ~160 bytes total (just
  // boundary/header framing, no actual file content), and rejecting it
  // with "No content provided". Reading a local file:// URI through
  // fetch().blob() and handing that Blob to a multipart upload isn't
  // reliable across every RN/architecture combination. The
  // documented-reliable way to upload a local file in React Native is to
  // skip the Blob step and give FormData a { uri, name, type } object —
  // RN's native networking layer recognizes that shape and streams the
  // file straight from disk instead of materializing it as a JS Blob.
  const formData = new FormData();
  formData.append('file', { uri: localUri, name: fileName, type: contentType } as any);

  const { error } = await supabase.storage.from(BUCKET).upload(path, formData, {
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
  // Bug fix: @supabase/storage-js only resolves `{ data: null, error }` for
  // API-level errors (a 4xx response from the storage service). A genuine
  // low-level network failure (connection refused, DNS failure, no route
  // to host) makes it REJECT the promise instead — so the `if (error)`
  // check below never even runs for that case, and this function's own
  // documented "never throws" contract silently didn't hold. Wrapping the
  // call itself in try/catch closes that gap without changing behavior
  // for the ordinary API-error case.
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * IMPROVEMENT-PLAN PHASE 3 — every screen this phase joins a photo into
 * (dispatch chips, pointage rows, team list, dashboard chips, journal
 * authorship) renders a LIST of identities, not a single one — the
 * existing `getSignedUrl` above (proven in profile-settings.tsx/
 * journal.tsx's detail sheet) is the right primitive for "one path, one
 * URL," but calling it once per row serially isn't wrong so much as
 * slower than it needs to be, and every existing list-screen caller would
 * otherwise hand-roll its own `Promise.all` + path-to-url map (journal.tsx
 * already does exactly this inline for `thumbUrls` — see its `loadLogs`).
 * This is that same pattern, extracted once so every new Phase 3 caller
 * shares it rather than re-copying it a fifth time.
 *
 * De-dupes paths before minting (two rows can share the same worker photo
 * path, e.g. two dispatch assignments for the same worker on the same
 * day) and drops nulls/failures rather than surfacing them — same
 * "return null, don't throw" contract as `getSignedUrl` itself, so a list
 * screen never crashes over one bad/missing photo.
 */
export async function getSignedUrlMap(
  paths: (string | null | undefined)[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const entries = await Promise.all(
    uniquePaths.map(async (p) => [p, await getSignedUrl(p, expiresInSeconds)] as const),
  );
  const map: Record<string, string> = {};
  for (const [p, url] of entries) {
    if (url) map[p] = url;
  }
  return map;
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
