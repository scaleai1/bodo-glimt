// ─── Asset Discovery Utility ──────────────────────────────────────────────────
// Runs after OAuth to map all linked Meta assets into platform_mappings.
// Discovers: FB Pages, IG Business Accounts, WABA + phone numbers.
//
// Usage:
//   const assets = await discoverAllAssets(accessToken);
//   saveUserConfig({ ... assets mapped to fields ... });

const META_BASE = 'https://graph.facebook.com/v20.0';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredPage {
  id:           string;
  name:         string;
  access_token: string;  // page-scoped token
}

export interface DiscoveredIGAccount {
  id:       string;
  name?:    string;
  username?: string;
  pageId:   string;      // FB Page this IG account is linked to
}

export interface DiscoveredWAPhoneNumber {
  id:                   string;
  display_phone_number: string;
  verified_name:        string;
}

export interface DiscoveredWABA {
  id:           string;
  name?:        string;
  phoneNumbers: DiscoveredWAPhoneNumber[];
}

export interface DiscoveredAssets {
  pages:             DiscoveredPage[];
  instagramAccounts: DiscoveredIGAccount[];
  wabas:             DiscoveredWABA[];
}

// ── Facebook Pages ────────────────────────────────────────────────────────────

async function fetchManagedPages(accessToken: string): Promise<DiscoveredPage[]> {
  const res  = await fetch(`${META_BASE}/me/accounts?fields=id,name,access_token&limit=50&access_token=${accessToken}`);
  const data = await res.json() as { data?: Array<{ id: string; name: string; access_token: string }>; error?: { message: string } };
  if (data.error) throw new Error(`Pages fetch failed: ${data.error.message}`);
  return (data.data ?? []).map(p => ({ id: p.id, name: p.name, access_token: p.access_token }));
}

// ── Instagram Business Accounts ───────────────────────────────────────────────
// Each FB Page may have a linked Instagram Business account.

async function fetchIGForPage(
  pageId:      string,
  pageToken:   string,
): Promise<DiscoveredIGAccount | null> {
  try {
    const res  = await fetch(
      `${META_BASE}/${pageId}?fields=instagram_business_account{id,name,username}&access_token=${pageToken}`,
    );
    const data = await res.json() as {
      instagram_business_account?: { id: string; name?: string; username?: string };
    };
    if (!data.instagram_business_account?.id) return null;
    const ig = data.instagram_business_account;
    return { id: ig.id, name: ig.name, username: ig.username, pageId };
  } catch {
    return null;
  }
}

// ── WhatsApp Business Accounts ────────────────────────────────────────────────
// Requires: whatsapp_business_management scope.
// Fetches all WABAs from the user's Business Manager, then phone numbers for each.

async function fetchUserBusinessId(accessToken: string): Promise<string | null> {
  try {
    const res  = await fetch(`${META_BASE}/me/businesses?fields=id,name&limit=5&access_token=${accessToken}`);
    const data = await res.json() as { data?: Array<{ id: string; name: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function fetchWABAsForBusiness(
  businessId:  string,
  accessToken: string,
): Promise<DiscoveredWABA[]> {
  try {
    const res  = await fetch(
      `${META_BASE}/${businessId}/whatsapp_business_accounts?fields=id,name&access_token=${accessToken}`,
    );
    const data = await res.json() as {
      data?:  Array<{ id: string; name?: string }>;
      error?: { message: string };
    };
    if (data.error || !data.data) return [];

    const wabas = await Promise.all(
      data.data.map(async (w): Promise<DiscoveredWABA> => {
        const phones = await fetchPhoneNumbersForWABA(w.id, accessToken);
        return { id: w.id, name: w.name, phoneNumbers: phones };
      }),
    );
    return wabas;
  } catch {
    return [];
  }
}

async function fetchPhoneNumbersForWABA(
  wabaId:      string,
  accessToken: string,
): Promise<DiscoveredWAPhoneNumber[]> {
  try {
    const res  = await fetch(
      `${META_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${accessToken}`,
    );
    const data = await res.json() as {
      data?: Array<{ id: string; display_phone_number: string; verified_name: string }>;
    };
    return (data.data ?? []).map(p => ({
      id:                   p.id,
      display_phone_number: p.display_phone_number,
      verified_name:        p.verified_name,
    }));
  } catch {
    return [];
  }
}

// ── Main Discovery Function ───────────────────────────────────────────────────

/**
 * Discovers all linked Meta assets for the authenticated user.
 * Runs in parallel where possible. Non-critical failures are swallowed so
 * a missing WABA scope doesn't break the rest of discovery.
 */
export async function discoverAllAssets(accessToken: string): Promise<DiscoveredAssets> {
  // Fetch pages + business ID in parallel
  const [pages, businessId] = await Promise.all([
    fetchManagedPages(accessToken).catch(() => [] as DiscoveredPage[]),
    fetchUserBusinessId(accessToken).catch(() => null),
  ]);

  // For each page, check for a linked IG account — run in parallel
  const igResults = await Promise.all(
    pages.map(p => fetchIGForPage(p.id, p.access_token)),
  );
  const instagramAccounts = igResults.filter((ig): ig is DiscoveredIGAccount => ig !== null);

  // Fetch WABAs if we have a Business Manager
  const wabas = businessId
    ? await fetchWABAsForBusiness(businessId, accessToken).catch(() => [] as DiscoveredWABA[])
    : [];

  return { pages, instagramAccounts, wabas };
}

/**
 * Maps a DiscoveredAssets result to userConfig fields.
 * Picks the first IG account and first WABA by default.
 * Caller should persist this via saveUserConfig().
 */
export function mapAssetsToConfig(assets: DiscoveredAssets): {
  metaInstagramAccountId: string;
  wabaId:                 string;
  waPhoneNumbers:         string[];
} {
  const firstIG    = assets.instagramAccounts[0];
  const firstWABA  = assets.wabas[0];

  return {
    metaInstagramAccountId: firstIG?.id ?? '',
    wabaId:                 firstWABA?.id ?? '',
    waPhoneNumbers:         firstWABA?.phoneNumbers.map(p => p.id) ?? [],
  };
}
