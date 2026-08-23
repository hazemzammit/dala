// supabase/functions/_shared/logInvocation.ts
//
// Ref: migration 0057 (edge_function_invocations)
//
// Admin remediation Tier 2.1. Wraps a function's Deno.serve handler so
// every real invocation gets exactly one edge_function_invocations row —
// wrap once per function, not hand-instrumented per return statement.
// This is deliberately an outside-the-handler wrapper rather than a change
// to each function's own try/catch: every target function already has its
// own complete error handling (its own jsonResponse/Response shapes for
// every failure path), and duplicating that logic here would just be a
// second, parallel place those shapes could drift out of sync. Instead
// this only OBSERVES the Response the handler already produced (or an
// uncaught throw, as a backstop) and logs based on that.
//
// OPTIONS/CORS preflight requests are not logged — same reasoning
// scheduled_job_runs never gets a row for a cron tick that found nothing
// to do: a preflight isn't a real invocation of the function's actual
// logic.
//
// org_id: varies per function (some resolve it from a request body field,
// some from a row looked up mid-handler, some don't have one at all — see
// each retrofitted function for where it's set). The handler signature
// takes a mutable InvocationContext the handler can set ctx.orgId on at
// whatever point in its own logic the org becomes known; if it's never
// set, the logged row's org_id is null.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export interface InvocationContext {
  orgId?: string;
}

export function withInvocationLog(
  functionName: string,
  handler: (req: Request, ctx: InvocationContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return handler(req, {});
    }

    const start = performance.now();
    const ctx: InvocationContext = {};
    let response: Response;
    let errorMessage: string | null = null;

    try {
      response = await handler(req, ctx);
    } catch (e) {
      // Backstop only — every retrofitted function already has its own
      // top-level try/catch, so this should be unreachable in practice.
      // Still logs correctly if it ever isn't.
      errorMessage = e instanceof Error ? e.message : 'Erreur inconnue.';
      response = new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const durationMs = Math.round(performance.now() - start);
    const status: 'success' | 'error' = response.status < 400 ? 'success' : 'error';

    if (status === 'error' && errorMessage === null) {
      // Best-effort extraction from a JSON error body — every function
      // this wraps uses the same `{ error: string }` jsonResponse shape,
      // but this stays defensive (payment-webhook's non-2xx paths use a
      // slightly different inline Response shape than the shared
      // jsonResponse helper, though its bodies still happen to have the
      // same `error` field). clone() first since the caller still needs
      // to read the original response's body.
      try {
        const body = await response.clone().json();
        if (typeof body?.error === 'string') errorMessage = body.error;
      } catch {
        // Non-JSON error body — leave errorMessage null rather than guess.
      }
    }

    try {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await admin.from('edge_function_invocations').insert({
        function_name: functionName,
        status,
        duration_ms: durationMs,
        error_message: errorMessage,
        org_id: ctx.orgId ?? null,
      });
    } catch (logErr) {
      // A logging failure must never break the real response the caller
      // is waiting on — same "log, don't block" discipline as apps/admin's
      // logAdminAction on the admin side.
      console.error(
        `[logInvocation] failed to write edge_function_invocations row for ${functionName}:`,
        logErr,
      );
    }

    return response;
  };
}
