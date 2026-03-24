// ─── Supabase Edge Function: sync-meta-stats ─────────────────────────────────
// Fetches account-level Meta Ads Insights for one or all users and upserts
// results into the ad_stats_cache table.
//
// Secrets required (set in Supabase Dashboard → Settings → Edge Functions → Secrets):
//   ENCRYPTION_KEY           — same value as VITE_ENCRYPTION_KEY in the front-end
//   SUPABASE_URL             — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
//
// Invoke manually:
//   curl -X POST https://<project>.supabase.co/functions/v1/sync-meta-stats \
//     -H "Authorization: Bearer <service-role-key>" \
//     -H "Content-Type: application/json" \
//     -d '{"userId":"<optional-uuid>"}'
//
// Schedule with pg_cron (run in SQL Editor):
//   select cron.schedule('sync-meta-stats', '0 */6 * * *',
//     $$select net.http_post(url:='https://<project>.supabase.co/functions/v1/sync-meta-stats',
//       headers:='{"Authorization":"Bearer <service-role-key>","Content-Type":"application/json"}'::jsonb,
//       body:='{}'::jsonb) as request_id;$$);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const META_VERSION = 'v20.0';
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`;
const DATE_PRESET  = 'last_30d';
const ALGO         = 'AES-GCM';
const KEY_LEN      = 256;
const ITERS        = 100_000;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Crypto — mirrors tokenCrypto.ts exactly ─────────────────────────────────

async function deriveKey(userId: string, masterSecret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterSecret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(userId), iterations: ITERS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LEN },
    false,
    ['decrypt'],
  );
}

async function decryptToken(ciphertext: string, userId: string, masterSecret: string): Promise<string> {
  if (!ciphertext) return '';
  try {
    const packed = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv     = packed.slice(0, 12);
    const data   = packed.slice(12);
    const key    = await deriveKey(userId, masterSecret);
    const dec    = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch {
    return ciphertext;
  }
}

// ─── Meta Insights fetch ──────────────────────────────────────────────────────

const INSIGHT_FIELDS =
  'spend,impressions,clicks,ctr,reach,cpm,cpc,actions,action_values,date_start,date_stop';

async function fetchAccountInsights(
  adAccountId: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const url =
    `${META_BASE}/act_${adAccountId}/insights` +
    `?fields=${INSIGHT_FIELDS}` +
    `&date_preset=${DATE_PRESET}` +
    `&level=account` +
    `&access_token=${accessToken}`;

  const res  = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data.data?.[0] ?? {};
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const encKey     = Deno.env.get('ENCRYPTION_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')             ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!encKey || !supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing required env vars: ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let targetUserId: string | null = null;
  try {
    const body = await req.json();
    targetUserId = body?.userId ?? null;
  } catch { /* body-less request — sync all */ }

  // Fetch profiles to sync
  const profileQuery = sb
    .from('profiles')
    .select('id, meta_access_token, meta_ad_account_id')
    .neq('meta_access_token', '')
    .neq('meta_ad_account_id', '');

  if (targetUserId) profileQuery.eq('id', targetUserId);

  const { data: profiles, error: profilesError } = await profileQuery;

  if (profilesError) {
    return new Response(
      JSON.stringify({ error: profilesError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const results: Array<{ userId: string; status: 'synced' | 'skipped' | 'error'; error?: string }> = [];

  for (const p of (profiles ?? [])) {
    try {
      const token = await decryptToken(p.meta_access_token, p.id, encKey);
      if (!token) {
        results.push({ userId: p.id, status: 'skipped', error: 'empty token after decryption' });
        continue;
      }

      const raw = await fetchAccountInsights(p.meta_ad_account_id, token);

      const { error: upsertErr } = await sb
        .from('ad_stats_cache')
        .upsert(
          { user_id: p.id, date_preset: DATE_PRESET, data: raw, synced_at: new Date().toISOString() },
          { onConflict: 'user_id,date_preset' },
        );

      if (upsertErr) throw new Error(upsertErr.message);
      results.push({ userId: p.id, status: 'synced' });
    } catch (err) {
      results.push({
        userId: p.id,
        status:  'error',
        error:   err instanceof Error ? err.message : String(err),
      });
    }
  }

  const syncedCount = results.filter(r => r.status === 'synced').length;

  return new Response(
    JSON.stringify({ synced: syncedCount, total: results.length, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
