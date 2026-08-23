import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

import { corsHeaders } from '../_shared/cors.ts';
import { withInvocationLog } from '../_shared/logInvocation.ts';
import { embedLogo, fetchLogoAsset } from '../_shared/pdfBranding.ts';

/**
 * supabase/functions/generate-invoice-pdf/index.ts
 *
 * IMPROVEMENT-PLAN PHASE 9 §2.5 "Client-facing invoicing" — the PDF half.
 * `create_invoice()` (migration 0074) already built and froze the
 * invoice's line_items/subtotal snapshot; this function's only job is
 * rendering that stored snapshot as a branded PDF, on demand, for TWO
 * different callers:
 *
 *   1. The CONTRACTOR (owner/manager), from the mobile client-portal.tsx
 *      admin screen, right after generating an invoice or re-downloading
 *      an older one — normal `Authorization: Bearer <session>` header,
 *      membership checked the same way generate-report already does.
 *   2. The CLIENT, anonymous, from the new web client-facing portal page
 *      (apps/web/src/app/portail/[token]/page.tsx, this phase) — no
 *      Supabase session exists for a client, so this path instead takes
 *      `{ token, pin, invoice_id }` in the POST body and re-verifies
 *      through `verify_client_portal_invoice()` (migration 0074), the
 *      SAME PIN-lockout logic the portal page's own initial load already
 *      goes through — a bookmarked/shared download link re-checks the
 *      PIN exactly like opening the page fresh would, it doesn't get a
 *      standing bypass once the page has loaded once.
 *
 * Deliberately ONE function with two auth branches, not two separate
 * Edge Functions: both branches do the exact same thing after
 * authorization (fetch the invoice row, build the same PDF) — splitting
 * that shared rendering code across two files would just be the same
 * "one thing implemented twice, free to drift" risk this migration's own
 * header already argues against elsewhere.
 */

const PAGE_WIDTH = 595.28; // A4 portrait, points — same as generate-report
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const LOGO_BOX = 40;
const LOGO_GAP = 10;

Deno.serve(
  withInvocationLog('generate-invoice-pdf', async (req, ctx) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const body = await req.json();
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const authHeader = req.headers.get('Authorization');
      // deno-lint-ignore no-explicit-any
      let invoice: any;

      if (authHeader) {
        // ---- Path 1: authenticated org member ----
        const { invoice_id } = body;
        if (!invoice_id) return jsonResponse({ error: 'invoice_id manquant.' }, 400);

        const callerClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const {
          data: { user },
        } = await callerClient.auth.getUser();
        if (!user) return jsonResponse({ error: 'Session invalide.' }, 401);

        const { data: row } = await admin
          .from('invoices')
          .select('*')
          .eq('id', invoice_id)
          .maybeSingle();
        if (!row) return jsonResponse({ error: 'Facture introuvable.' }, 404);
        ctx.orgId = row.org_id;

        const { data: membership } = await callerClient
          .from('organization_members')
          .select('role')
          .eq('org_id', row.org_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!membership || !['owner', 'manager'].includes(membership.role)) {
          return jsonResponse({ error: "Vous n'êtes pas autorisé à voir cette facture." }, 403);
        }
        invoice = row;
      } else {
        // ---- Path 2: anonymous client-portal caller ----
        const { token, pin, invoice_id } = body;
        if (!token || !invoice_id) {
          return jsonResponse({ error: 'Paramètres manquants.' }, 400);
        }
        const { data: verified, error: verifyError } = await admin.rpc(
          'verify_client_portal_invoice',
          { p_token: token, p_pin: pin ?? null, p_invoice_id: invoice_id },
        );
        if (verifyError || !verified) {
          // Deliberately generic — same "not_found"-shaped response for a
          // bad token, a bad PIN, or a locked portal, so an anonymous
          // caller can't distinguish "wrong PIN" from "this invoice
          // doesn't exist" by probing this endpoint. The PAGE's own load
          // (verify_client_portal_access) is where a real PIN-entry UX
          // lives; this endpoint only needs to gate the download.
          return jsonResponse({ error: 'Accès refusé.' }, 403);
        }
        invoice = verified;
        ctx.orgId = invoice.org_id;
      }

      const { data: project } = await admin
        .from('projects')
        .select('name')
        .eq('id', invoice.project_id)
        .maybeSingle();
      const { data: org } = await admin
        .from('organizations')
        .select('name, logo_url')
        .eq('id', invoice.org_id)
        .maybeSingle();

      const logoAsset = await fetchLogoAsset(admin, org?.logo_url ?? null);
      const pdfBytes = await buildInvoicePDF({
        orgName: org?.name ?? '—',
        projectName: project?.name ?? '—',
        invoice,
        logoAsset,
      });

      return new Response(pdfBytes, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${invoice.invoice_number}.pdf"`,
        },
      });
    } catch (e) {
      console.error('[generate-invoice-pdf] unhandled error', e);
      return jsonResponse({ error: 'Erreur inattendue.' }, 500);
    }
  }),
);

interface BuildInvoicePDFOptions {
  orgName: string;
  projectName: string;
  // deno-lint-ignore no-explicit-any
  invoice: any;
  // deno-lint-ignore no-explicit-any
  logoAsset: any;
}

// A genuinely different layout from generate-report's ReportTable/chart
// page and from generate-report's own buildPayslipPDF — a letterhead, an
// invoice-number/date/due-date block, a line-item table, and a totals
// footer. See _shared/pdfBranding.ts's own header for why only the LOGO
// piece is shared across all three, not the page layout itself.
async function buildInvoicePDF(opts: BuildInvoicePDFOptions): Promise<Uint8Array> {
  const { orgName, projectName, invoice, logoAsset } = opts;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, logoAsset, LOGO_BOX);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const titleX = MARGIN + (logo ? logo.width + LOGO_GAP : 0);

  if (logo) {
    // deno-lint-ignore no-explicit-any
    page.drawImage(logo.image as any, {
      x: MARGIN,
      y: y - logo.height + 4,
      width: logo.width,
      height: logo.height,
    });
  }
  page.drawText('Facture', { x: titleX, y, size: 20, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  y -= 24;
  page.drawText(orgName, { x: titleX, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 40;

  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 14;

  function metaLine(label: string, value: string) {
    page.drawText(label, { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText(value, {
      x: MARGIN + 130,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;
  }

  metaLine('N° de facture', invoice.invoice_number);
  metaLine('Chantier', projectName);
  metaLine('Date d\u2019émission', invoice.issued_at);
  metaLine('Date d\u2019échéance', invoice.due_date);
  metaLine('Période', `${invoice.period_from} au ${invoice.period_to}`);
  y -= 20;

  // Line-item table header
  const colDesc = MARGIN;
  const colDate = MARGIN + 260;
  const colAmount = PAGE_WIDTH - MARGIN - 90;
  page.drawText('Description', {
    x: colDesc,
    y,
    size: 9,
    font: boldFont,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText('Date', { x: colDate, y, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('Montant (TND)', {
    x: colAmount,
    y,
    size: 9,
    font: boldFont,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 16;

  const lineItems: { description: string; expense_date: string; amount: number }[] =
    invoice.line_items ?? [];
  for (const item of lineItems) {
    if (y < MARGIN + 80) {
      // A long expense period could genuinely overflow one page — new
      // page, header row skipped (a plain continuation, same convention
      // buildReportPDF's own table pagination already uses for a
      // multi-page data table).
      y = PAGE_HEIGHT - MARGIN;
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    }
    page.drawText(item.description.slice(0, 45), {
      x: colDesc,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(item.expense_date, { x: colDate, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(Number(item.amount).toFixed(2), {
      x: colAmount,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 18;
  }

  if (lineItems.length === 0) {
    page.drawText('Aucune dépense sur cette période.', {
      x: colDesc,
      y,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 18;
  }

  y -= 8;
  page.drawLine({
    start: { x: colAmount - 20, y: y + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 8 },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('Total', { x: colDate, y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`${Number(invoice.subtotal).toFixed(2)} TND`, {
    x: colAmount,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  if (invoice.notes) {
    y -= 40;
    page.drawText('Notes', { x: MARGIN, y, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
    page.drawText(String(invoice.notes).slice(0, 110), {
      x: MARGIN,
      y,
      size: 9.5,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  return doc.save();
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
