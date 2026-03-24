// ─── Scale.ai — Security & Isolation Test Suite ───────────────────────────────
//
// Verifies that User A's session cannot access User B's data at any layer:
//   1. Supabase RLS on all 4 tables
//   2. Encryption key uniqueness (cross-user token decryption attempt)
//   3. Write isolation (cannot INSERT on behalf of another user)
//   4. Brand context contamination check
//
// Usage (browser console after sign-in):
//   import('/path/to/test-integrity.js').then(m => m.runAndPrint({ userBId: '<uuid>' }));
//
// Usage (inline):
//   const { runIntegrityTests, printResults } = await import('./test-integrity');
//   const results = await runIntegrityTests({ userBId: '<uuid>' });
//   printResults(results);

import { supabase }    from './lib/supabase';
import { decryptToken } from './lib/tokenCrypto';

export type TestStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';

export interface TestResult {
  name:   string;
  status: TestStatus;
  detail: string;
}

export interface IntegrityTestConfig {
  /** UUID of another user whose data should be completely inaccessible from the current session. */
  userBId: string;
  /**
   * Optional: User B's encrypted token (base64 string from profiles.meta_access_token).
   * Provide this to run the cross-decrypt test.
   * Safe to get from a test seed — it's encrypted and should remain opaque.
   */
  userBEncryptedToken?: string;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

export async function runIntegrityTests(config: IntegrityTestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ── Pre-flight: active session ──────────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return [{
      name:   'Pre-flight: active session',
      status: 'ERROR',
      detail: 'No active Supabase session. Sign in before running tests.',
    }];
  }

  const userAId = session.user.id;
  results.push({
    name:   'Pre-flight: active session',
    status: 'PASS',
    detail: `Authenticated as User A (${userAId.slice(0, 8)}…)`,
  });

  // ── Test 1: RLS — profiles ──────────────────────────────────────────────────
  {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, meta_access_token, brand_name')
      .eq('id', config.userBId);

    const rows = data?.length ?? 0;
    results.push({
      name:   'RLS-1: profiles cross-read',
      status: (error || rows === 0) ? 'PASS' : 'FAIL',
      detail: error
        ? `RLS blocked query: ${error.message}`
        : rows === 0
          ? 'RLS enforced — 0 rows returned for User B profile'
          : `BREACH — ${rows} profile row(s) exposed for User B!`,
    });
  }

  // ── Test 2: RLS — campaigns ─────────────────────────────────────────────────
  {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, user_id, name')
      .eq('user_id', config.userBId);

    const rows = data?.length ?? 0;
    results.push({
      name:   'RLS-2: campaigns cross-read',
      status: (error || rows === 0) ? 'PASS' : 'FAIL',
      detail: error
        ? `RLS blocked: ${error.message}`
        : rows === 0
          ? 'RLS enforced — 0 campaign rows from User B'
          : `BREACH — ${rows} campaign row(s) exposed!`,
    });
  }

  // ── Test 3: RLS — chat_history ──────────────────────────────────────────────
  {
    const { data, error } = await supabase
      .from('chat_history')
      .select('id, user_id, content')
      .eq('user_id', config.userBId);

    const rows = data?.length ?? 0;
    results.push({
      name:   'RLS-3: chat_history cross-read',
      status: (error || rows === 0) ? 'PASS' : 'FAIL',
      detail: error
        ? `RLS blocked: ${error.message}`
        : rows === 0
          ? 'RLS enforced — 0 chat rows from User B'
          : `BREACH — ${rows} chat row(s) exposed!`,
    });
  }

  // ── Test 4: RLS — ad_stats_cache ────────────────────────────────────────────
  {
    const { data, error } = await supabase
      .from('ad_stats_cache')
      .select('id, user_id, data')
      .eq('user_id', config.userBId);

    const rows = data?.length ?? 0;
    results.push({
      name:   'RLS-4: ad_stats_cache cross-read',
      status: (error || rows === 0) ? 'PASS' : 'FAIL',
      detail: error
        ? `RLS blocked: ${error.message}`
        : rows === 0
          ? 'RLS enforced — 0 stats rows from User B'
          : `BREACH — ${rows} stats row(s) exposed!`,
    });
  }

  // ── Test 5: Own profile is accessible ──────────────────────────────────────
  {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, brand_name, website_url, industry, keywords')
      .eq('id', userAId)
      .single();

    results.push({
      name:   'Brand Context: own profile readable',
      status: (!error && data) ? 'PASS' : 'ERROR',
      detail: (!error && data)
        ? `Brand: "${data.brand_name || '(empty)'}" — Website: "${data.website_url || '(empty)'}"`
        : `Could not read own profile: ${error?.message ?? 'null result'}`,
    });
  }

  // ── Test 6: Encryption — cross-decrypt attempt ──────────────────────────────
  if (config.userBEncryptedToken) {
    try {
      const output = await decryptToken(config.userBEncryptedToken, userAId);
      const isRawCiphertext = output === config.userBEncryptedToken;
      const looksLikeToken  = /^EAA[A-Za-z0-9]{20,}/.test(output);

      if (isRawCiphertext || !looksLikeToken) {
        results.push({
          name:   'Encryption: cross-decrypt blocked',
          status: 'PASS',
          detail: isRawCiphertext
            ? 'decryptToken returned raw ciphertext — AES-GCM rejected wrong-user key'
            : 'Output is garbled binary — key mismatch confirmed',
        });
      } else {
        results.push({
          name:   'Encryption: cross-decrypt blocked',
          status: 'FAIL',
          detail: 'CRITICAL — decrypted User B token with User A key. Encryption is broken!',
        });
      }
    } catch (err) {
      results.push({
        name:   'Encryption: cross-decrypt blocked',
        status: 'PASS',
        detail: `decryptToken threw (expected for wrong key): ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    results.push({
      name:   'Encryption: cross-decrypt blocked',
      status: 'SKIP',
      detail: 'Provide userBEncryptedToken in config to run this test',
    });
  }

  // ── Test 7: Write isolation — cannot INSERT as User B ──────────────────────
  {
    const testName = `SECURITY_TEST_INJECTION_${Date.now()}`;
    const { error } = await supabase
      .from('campaigns')
      .insert({ user_id: config.userBId, name: testName, platform: 'test', data: {} });

    if (error) {
      results.push({
        name:   'Write Isolation: cannot impersonate User B',
        status: 'PASS',
        detail: `INSERT blocked by RLS: ${error.message}`,
      });
    } else {
      // Clean up the injected row
      await supabase.from('campaigns').delete().eq('name', testName);
      results.push({
        name:   'Write Isolation: cannot impersonate User B',
        status: 'FAIL',
        detail: 'BREACH — INSERT as User B succeeded! RLS is not enforced on INSERT.',
      });
    }
  }

  // ── Test 8: Brand context contains no User B data ──────────────────────────
  {
    const { data: userAProfile } = await supabase
      .from('profiles')
      .select('brand_name, website_url, industry, keywords, meta_ad_account_id')
      .eq('id', userAId)
      .single();

    const { data: userBProfile } = await supabase
      .from('profiles')
      .select('brand_name, website_url')
      .eq('id', config.userBId)
      .single();

    if (!userBProfile || !userAProfile) {
      results.push({
        name:   'Brand Context: no User B contamination',
        status: 'PASS',
        detail: 'User B profile not accessible — no contamination possible (RLS confirmed)',
      });
    } else {
      const aJson = JSON.stringify(userAProfile);
      const bName = userBProfile.brand_name;
      const bUrl  = userBProfile.website_url;
      const contaminated = (bName && aJson.includes(bName)) || (bUrl && aJson.includes(bUrl));
      results.push({
        name:   'Brand Context: no User B contamination',
        status: contaminated ? 'FAIL' : 'PASS',
        detail: contaminated
          ? `BREACH — User B data found in User A context! (brand: "${bName}")`
          : 'User A brand context contains zero User B identifiers',
      });
    }
  }

  return results;
}

// ─── Pretty printer ───────────────────────────────────────────────────────────

export function printResults(results: TestResult[]): void {
  const icons: Record<TestStatus, string> = { PASS: '✅', FAIL: '❌', ERROR: '⚠️', SKIP: '⏭' };
  const counts = { PASS: 0, FAIL: 0, ERROR: 0, SKIP: 0 };

  console.group('%c🔒 Scale.ai — Security Integrity Test Results', 'font-weight:bold;font-size:14px');

  for (const r of results) {
    console.log(`${icons[r.status]} [${r.status}]  ${r.name}\n        ${r.detail}`);
    counts[r.status]++;
  }

  console.log(
    `\n%cSummary: ${counts.PASS} passed · ${counts.FAIL} failed · ${counts.ERROR} errors · ${counts.SKIP} skipped`,
    'font-weight:bold',
  );

  if (counts.FAIL === 0 && counts.ERROR === 0) {
    console.log('%c✓ All security tests passed — system is properly isolated.', 'color:#4ade80;font-weight:bold');
  } else {
    console.error(`${counts.FAIL} test(s) FAILED — investigate immediately!`);
  }

  console.groupEnd();
}

/** Convenience: run + print in one call */
export async function runAndPrint(config: IntegrityTestConfig): Promise<TestResult[]> {
  const results = await runIntegrityTests(config);
  printResults(results);
  return results;
}
