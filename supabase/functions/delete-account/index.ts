// supabase/functions/delete-account/index.ts
//
// Phase 7 — Doc 03 §3.22 "Supprimer mon compte."
//
// The client-side flow is: request_account_deletion() RPC (migration 0028)
// validates the "not a sole org owner elsewhere" invariant and stamps
// profiles.deletion_requested_at, then the delete-account.tsx screen calls
// THIS function to actually perform the deletion — a client can never call
// auth.admin.deleteUser itself (service-role only), which is the entire
// reason this needs to be an Edge Function rather than a plain RPC.
//
// Deliberately synchronous/immediate, not a queued/delayed job: Doc 03 §3.22
// doesn't describe a grace period for account deletion the way Trash (Doc 01
// §1.16) gives projects/workers a 30-day undo window — those are two
// different, independently-designed mechanisms, and conflating them (e.g.
// soft-deleting the profile row for 30 days) would be inventing a grace
// period the spec never asked for. The confirm-by-typing-"SUPPRIMER" step in
// delete-account.tsx is the only safeguard, matching how the spec frames
// this as an immediate, serious action.
//
// `on delete cascade` from auth.users already covers profiles,
// organization_members, and every FK'd row this user directly owns — this
// function's real job is just the one call the client can't make, plus
// re-validating the sole-owner invariant server-side (never trust that the
// RPC step actually ran right before this).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Authentification requise.' }, 401);
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) {
      return jsonResponse({ error: 'Session invalide.' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Re-check the profile was actually stamped by request_account_deletion()
    // — this function should never be reachable except as the second half of
    // that flow.
    const { data: profile } = await admin
      .from('profiles')
      .select('deletion_requested_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.deletion_requested_at) {
      return jsonResponse(
        {
          error:
            "Aucune demande de suppression en cours. Confirmez d'abord depuis l'écran Supprimer mon compte.",
        },
        400,
      );
    }

    // Re-validate the sole-owner invariant server-side with the service-role
    // client — never trust that the client-side RPC check still holds by
    // the time this call lands (another tab could have made them a sole
    // owner again in between).
    const { data: soleOwnerOrgs } = await admin
      .from('organization_members')
      .select('org_id, organizations(name)')
      .eq('user_id', user.id)
      .eq('role', 'owner');

    for (const row of soleOwnerOrgs ?? []) {
      const { count } = await admin
        .from('organization_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('org_id', (row as any).org_id)
        .eq('role', 'owner');
      if ((count ?? 0) <= 1) {
        return jsonResponse(
          {
            error:
              "Vous êtes toujours seul propriétaire d'au moins une organisation. Transférez la propriété avant de continuer.",
          },
          409,
        );
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return jsonResponse({ error: 'La suppression du compte a échoué. Réessayez.' }, 500);
    }

    return jsonResponse({ deleted: true }, 200);
  } catch {
    return jsonResponse({ error: 'Une erreur est survenue.' }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
