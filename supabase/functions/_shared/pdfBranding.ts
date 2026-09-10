/**
 * supabase/functions/_shared/pdfBranding.ts
 *
 * PHASE 9 — extracted from generate-report/index.ts, which previously
 * defined `fetchLogoAsset`/`LogoAsset`/`STORAGE_BUCKET` as its own private
 * helpers. This phase adds a second PDF-producing Edge Function
 * (generate-invoice-pdf) that needs the exact same "fetch this org's logo,
 * signed-URL-mint it via service role, return raw bytes + content-type"
 * behavior — duplicating those ~30 lines a second time would be the same
 * kind of drift risk Phase 8's org_activity_feed reasoning already argues
 * against for insert logic, just applied to a read helper instead. Moved
 * here rather than left in generate-report so both functions import ONE
 * copy; generate-report's own file re-exports nothing new, it just imports
 * from here now (see that file's own updated header note).
 *
 * Deliberately NOT extracted alongside this: the ReportTable/ChartSpec
 * page-drawing code (drawHorizontalBarChart, buildReportPDF's table/chart
 * layout). That machinery is genuinely report-shaped (a title block over a
 * data table with an optional chart page) and generate-invoice-pdf needs a
 * DIFFERENT layout (line items + a totals footer, no chart) — forcing both
 * into one shared "PDF body" function would mean threading report-only
 * concepts (ReportTable, ChartSpec) through an invoice caller that has
 * neither, for no real reuse benefit. Only the LOGO/branding piece — which
 * is identical in both documents — is shared.
 *
 * IMPROVEMENT-PLAN — fallback branding: `embedLogo` used to return `null`
 * whenever an org had no `logo_url`, leaving blank header space on any
 * report or invoice sent to a real client before the org got around to
 * uploading one. It now falls back to a generic Dala mark in that case —
 * see fallbackLogo.ts. `fetchLogoAsset` itself is UNCHANGED (still
 * genuinely returns null for "no logo configured" or "fetch failed" —
 * that distinction is still useful to callers/logs); the fallback is
 * applied one layer up, in `embedLogo`, so both PDF functions get it for
 * free with no per-call-site change.
 */
import { FALLBACK_LOGO_BASE64, FALLBACK_LOGO_CONTENT_TYPE } from './fallbackLogo.ts';

export interface LogoAsset {
  bytes: Uint8Array;
  /** Lowercased Content-Type from the fetch response — format is detected
   * from THIS, not the file extension (an extension can lie; a fetch
   * response's declared type is what `embedPng`/`embedJpg` actually need
   * to match). Unchanged from generate-report's original comment. */
  contentType: string;
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Decoded once per function instance, not per request — cheap either way
// at this size, but no reason to redo it on every invocation.
const FALLBACK_LOGO_ASSET: LogoAsset = {
  bytes: decodeBase64(FALLBACK_LOGO_BASE64),
  contentType: FALLBACK_LOGO_CONTENT_TYPE,
};

export const ORG_FILES_BUCKET = 'org-files';

// deno-lint-ignore no-explicit-any
export async function fetchLogoAsset(
  admin: any,
  logoPath: string | null,
): Promise<LogoAsset | null> {
  if (!logoPath) return null;
  try {
    // Service-role client mints its OWN signed URL — a URL signed for a
    // mobile client's session cannot be reused here; this Edge Function
    // has no access to that session's token. 60s is plenty — the URL is
    // used exactly once, synchronously, right after minting.
    const { data, error } = await admin.storage
      .from(ORG_FILES_BUCKET)
      .createSignedUrl(logoPath, 60);
    if (error || !data?.signedUrl) {
      console.error('[pdfBranding] logo signed-url mint failed', error);
      return null;
    }
    const res = await fetch(data.signedUrl);
    if (!res.ok) {
      console.error('[pdfBranding] logo fetch failed', res.status);
      return null;
    }
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, contentType };
  } catch (e) {
    console.error('[pdfBranding] logo asset fetch threw', e);
    return null;
  }
}

/**
 * Embeds a LogoAsset into a given pdf-lib PDFDocument and returns it fit
 * within a square bounding box, aspect ratio preserved. Falls back to the
 * generic Dala mark (FALLBACK_LOGO_ASSET) when `logoAsset` is null — i.e.
 * the org has no `logo_url` set — so a document never ships with blank
 * header space. Still non-fatal on a genuine embed failure (corrupt/
 * unsupported image bytes): returns null rather than throwing, same
 * contract as before — a broken logo must never break a document.
 */
export async function embedLogo(
  // deno-lint-ignore no-explicit-any
  doc: any,
  logoAsset: LogoAsset | null,
  boxSize: number,
  // deno-lint-ignore no-explicit-any
): Promise<{ image: any; width: number; height: number } | null> {
  const asset = logoAsset ?? FALLBACK_LOGO_ASSET;
  try {
    const isJpeg = asset.contentType.includes('jpeg') || asset.contentType.includes('jpg');
    // deno-lint-ignore no-explicit-any
    const embedded: any = isJpeg
      ? await doc.embedJpg(asset.bytes)
      : await doc.embedPng(asset.bytes);
    const factor = boxSize / Math.max(embedded.width, embedded.height);
    const scaled = embedded.scale(factor);
    return { image: embedded, width: scaled.width, height: scaled.height };
  } catch (e) {
    console.error('[pdfBranding] logo embed failed', e);
    return null;
  }
}
