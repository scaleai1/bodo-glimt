// ─── Edge Function: delete-account ────────────────────────────────────────────
// Permanently deletes the calling user's account (auth.users row).
// Cascades automatically to profiles, campaigns, and chat_history via FK rules.
//
// Deploy:
//   supabase functions deploy delete-account --no-verify-jwt
//
// Required secrets (set in Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL               (auto-populated by Supabase)
//   SUPABASE_ANON_KEY          (auto-populated)
//   SUPABASE_SERVICE_ROLE_KEY  (add manually — NEVER expose to browser)
//
// Client usage (from AuthContext.tsx):
//   await supabase.functions.invoke('delete-account')

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Verify the caller's JWT ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Anon client — scoped to the calling user's JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Delete with service-role client ──────────────────────────────────
    // Service role key lives only in the Edge Function environment — never
    // sent to the browser. Required to call auth.admin.deleteUser().
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    // ── 3. Done — cascade in SQL handles profiles / campaigns / chat_history ─
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[delete-account]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
