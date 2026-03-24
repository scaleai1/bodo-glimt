// ─── Meta Ads API ──────────────────────────────────────────────────────────
// Marketing API helpers: ad sets, creative upload, creative swap.
//
// adAccountId throughout = numeric string WITHOUT "act_" prefix (e.g. "123456789").
// The functions add "act_" internally when required by the endpoint.

const META_VERSION = 'v20.0';
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`;

export interface AdSet {
  id:           string;
  name:         string;
  status:       string;
  dailyBudget:  number;   // in cents (Meta minor currency units)
}

export interface AdFromSet {
  id:         string;
  name:       string;
  creativeId: string;
}

// ── Ad Sets ──────────────────────────────────────────────────────────────────
// filtering must be URL-encoded; Meta's Graph Explorer shows the raw JSON
// but the actual HTTP call needs encodeURIComponent on the value.

export async function fetchActiveAdSets(
  adAccountId: string,
  accessToken: string,
): Promise<AdSet[]> {
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: 'adset.effective_status', operator: 'IN', value: ['ACTIVE'] }])
  );

  const url =
    `${META_BASE}/act_${adAccountId}/adsets` +
    `?fields=id,name,status,daily_budget` +
    `&filtering=${filtering}` +
    `&limit=50` +
    `&access_token=${accessToken}`;

  const res  = await fetch(url);
  const data = await res.json() as {
    data?:  Array<{ id: string; name: string; status: string; daily_budget?: string }>;
    error?: { message: string; code?: number };
  };

  if (data.error) {
    const hint = data.error.code === 190 ? ' (token expired)' : '';
    throw new Error(`${data.error.message}${hint}`);
  }

  return (data.data ?? []).map(s => ({
    id:          s.id,
    name:        s.name,
    status:      s.status,
    dailyBudget: parseInt(s.daily_budget ?? '0', 10),
  }));
}

// ── Image upload ──────────────────────────────────────────────────────────────
// Meta requires images hosted at a publicly accessible URL.
// Returns the image hash needed for createAdCreativeFromImage.

export async function uploadAdImage(
  adAccountId: string,
  accessToken: string,
  imageUrl:    string,
): Promise<string> {
  const res  = await fetch(`${META_BASE}/act_${adAccountId}/adimages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url: imageUrl, access_token: accessToken }),
  });
  const data = await res.json() as {
    images?: Record<string, { hash: string; url: string }>;
    error?:  { message: string; code?: number };
  };

  if (data.error) {
    if (data.error.message.includes('size'))
      throw new Error(`Meta rejected the image: ${data.error.message} (minimum 600×315px)`);
    throw new Error(`Image upload failed: ${data.error.message}`);
  }

  const images = data.images ?? {};
  const first  = Object.values(images)[0];
  if (!first?.hash) throw new Error('Image upload succeeded but no hash returned — check the image URL is publicly accessible');
  return first.hash;
}

// ── Ad Creative ───────────────────────────────────────────────────────────────
// object_story_spec must be a JSON object (NOT pre-stringified) in the body.
// page_id is required — corresponds to VITE_META_FACEBOOK_PAGE_ID.

export async function createAdCreativeFromImage(
  adAccountId:  string,
  accessToken:  string,
  imageHash:    string,
  caption:      string,
  pageId:       string,
  creativeName  = 'ScaleAI Creative',
): Promise<string> {
  if (!pageId) throw new Error('Facebook Page ID required for ad creatives — set VITE_META_FACEBOOK_PAGE_ID');

  const res  = await fetch(`${META_BASE}/act_${adAccountId}/adcreatives`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name: creativeName,
      object_story_spec: {           // ← JSON object, not a pre-stringified string
        page_id:   pageId,
        link_data: {
          image_hash: imageHash,
          message:    caption,
        },
      },
      access_token: accessToken,
    }),
  });
  const data = await res.json() as { id?: string; error?: { message: string } };

  if (data.error) throw new Error(`Creative creation failed: ${data.error.message}`);
  if (!data.id)   throw new Error('No creative ID returned from Meta');
  return data.id;
}

// ── Fetch ads in a set ────────────────────────────────────────────────────────

export async function fetchAdSetAds(
  adSetId:     string,
  accessToken: string,
): Promise<AdFromSet[]> {
  const url =
    `${META_BASE}/${adSetId}/ads` +
    `?fields=id,name,creative{id}` +
    `&access_token=${accessToken}`;

  const res  = await fetch(url);
  const data = await res.json() as {
    data?:  Array<{ id: string; name: string; creative?: { id: string } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Failed to fetch ads in set: ${data.error.message}`);

  return (data.data ?? []).map(a => ({
    id:         a.id,
    name:       a.name,
    creativeId: a.creative?.id ?? '',
  }));
}

// ── Add new ad to ad set ──────────────────────────────────────────────────────
// creative must be a JSON object in the POST body (not pre-stringified).

export async function addCreativeToAdSet(
  adAccountId: string,
  accessToken: string,
  adSetId:     string,
  creativeId:  string,
  adName       = 'ScaleAI Ad',
): Promise<string> {
  const res  = await fetch(`${META_BASE}/act_${adAccountId}/ads`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:     adName,
      adset_id: adSetId,
      creative: { creative_id: creativeId },   // ← JSON object, not stringified
      status:   'ACTIVE',
      access_token: accessToken,
    }),
  });
  const data = await res.json() as { id?: string; error?: { message: string } };

  if (data.error) throw new Error(`Failed to add ad to set: ${data.error.message}`);
  if (!data.id)   throw new Error('No ad ID returned from Meta');
  return data.id;
}

// ── Replace creative on existing ad ──────────────────────────────────────────

export async function replaceAdCreative(
  adId:        string,
  accessToken: string,
  creativeId:  string,
): Promise<void> {
  const res  = await fetch(`${META_BASE}/${adId}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      creative:     { creative_id: creativeId },   // ← JSON object, not stringified
      access_token: accessToken,
    }),
  });
  const data = await res.json() as { success?: boolean; error?: { message: string } };

  if (data.error) throw new Error(`Creative replacement failed: ${data.error.message}`);
}

// ── Insights (Stats) ─────────────────────────────────────────────────────────
// Requires: ads_read or ads_management permission on the token.
// ROAS = purchase_conversion_value / spend

export interface AdInsights {
  spend:            number;   // USD float
  impressions:      number;
  clicks:           number;
  ctr:              number;   // percent, e.g. 2.35
  roas:             number;   // e.g. 4.2 means 4.2x return
  reach:            number;
  cpm:              number;   // cost per 1,000 impressions, USD
  cpc:              number;   // cost per click, USD
  conversions:      number;
  conversionValue:  number;
  dateStart:        string;   // YYYY-MM-DD
  dateStop:         string;
}

export interface CampaignInsight {
  id:       string;
  name:     string;
  status:   string;
  insights: AdInsights;
}

function parseInsights(raw: Record<string, unknown>): AdInsights {
  type ActionRow = { action_type: string; value: string };
  const actions      = (raw.actions       as ActionRow[]) ?? [];
  const actionValues = (raw.action_values as ActionRow[]) ?? [];

  const purchaseTypes = ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'];

  const conversions = actions
    .filter(a => purchaseTypes.includes(a.action_type))
    .reduce((s, a) => s + parseFloat(a.value || '0'), 0);

  const conversionValue = actionValues
    .filter(a => purchaseTypes.includes(a.action_type))
    .reduce((s, a) => s + parseFloat(a.value || '0'), 0);

  const spend = parseFloat((raw.spend as string) || '0');

  return {
    spend,
    impressions:     parseInt((raw.impressions as string) || '0', 10),
    clicks:          parseInt((raw.clicks      as string) || '0', 10),
    ctr:             parseFloat((raw.ctr as string) || '0'),
    roas:            spend > 0 ? conversionValue / spend : 0,
    reach:           parseInt((raw.reach as string) || '0', 10),
    cpm:             parseFloat((raw.cpm as string) || '0'),
    cpc:             parseFloat((raw.cpc as string) || '0'),
    conversions,
    conversionValue,
    dateStart:       (raw.date_start as string) || '',
    dateStop:        (raw.date_stop  as string) || '',
  };
}

const INSIGHT_FIELDS =
  'spend,impressions,clicks,ctr,reach,cpm,cpc,actions,action_values,date_start,date_stop';

const EMPTY_INSIGHTS: AdInsights = {
  spend: 0, impressions: 0, clicks: 0, ctr: 0, roas: 0,
  reach: 0, cpm: 0, cpc: 0, conversions: 0, conversionValue: 0,
  dateStart: '', dateStop: '',
};

/** Pull account-level totals for a given period (default: last 30 days). */
export async function fetchAccountInsights(
  adAccountId: string,
  accessToken: string,
  datePreset = 'last_30d',
): Promise<AdInsights> {
  const url =
    `${META_BASE}/act_${adAccountId}/insights` +
    `?fields=${INSIGHT_FIELDS}` +
    `&date_preset=${datePreset}` +
    `&level=account` +
    `&access_token=${accessToken}`;

  const res  = await fetch(url);
  const data = await res.json() as {
    data?:  Array<Record<string, unknown>>;
    error?: { message: string; code?: number };
  };

  if (data.error) {
    const hint = data.error.code === 190 ? ' (token expired)' : '';
    throw new Error(`${data.error.message}${hint}`);
  }

  return data.data?.[0] ? parseInsights(data.data[0]) : { ...EMPTY_INSIGHTS };
}

/** Pull per-campaign stats (active + paused). */
export async function fetchCampaignInsights(
  adAccountId: string,
  accessToken: string,
  datePreset = 'last_30d',
): Promise<CampaignInsight[]> {
  const url =
    `${META_BASE}/act_${adAccountId}/campaigns` +
    `?fields=id,name,status,insights{${INSIGHT_FIELDS}}` +
    `&date_preset=${datePreset}` +
    `&filtering=${encodeURIComponent(JSON.stringify([{ field: 'campaign.effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]))}` +
    `&limit=50` +
    `&access_token=${accessToken}`;

  const res  = await fetch(url);
  const data = await res.json() as {
    data?:  Array<{ id: string; name: string; status: string; insights?: { data: Array<Record<string, unknown>> } }>;
    error?: { message: string; code?: number };
  };

  if (data.error) throw new Error(data.error.message);

  return (data.data ?? []).map(c => ({
    id:       c.id,
    name:     c.name,
    status:   c.status,
    insights: c.insights?.data?.[0] ? parseInsights(c.insights.data[0]) : { ...EMPTY_INSIGHTS },
  }));
}

// ── Ad Set Controls ──────────────────────────────────────────────────────────
// Requires: ads_management permission.

async function patchAdSet(
  adSetId: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res  = await fetch(`${META_BASE}/${adSetId}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...body, access_token: accessToken }),
  });
  const data = await res.json() as { success?: boolean; error?: { message: string } };
  if (data.error) throw new Error(`Ad set update failed: ${data.error.message}`);
}

export const pauseAdSet   = (id: string, token: string) => patchAdSet(id, token, { status: 'PAUSED' });
export const resumeAdSet  = (id: string, token: string) => patchAdSet(id, token, { status: 'ACTIVE' });

/** dailyBudgetCents: Meta's minor currency unit — e.g. 5000 = $50.00 USD */
export const updateAdSetBudget = (id: string, token: string, dailyBudgetCents: number) =>
  patchAdSet(id, token, { daily_budget: dailyBudgetCents });

// ── Campaign Controls ────────────────────────────────────────────────────────

async function patchCampaign(
  campaignId: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res  = await fetch(`${META_BASE}/${campaignId}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...body, access_token: accessToken }),
  });
  const data = await res.json() as { success?: boolean; error?: { message: string } };
  if (data.error) throw new Error(`Campaign update failed: ${data.error.message}`);
}

export const pauseCampaign  = (id: string, token: string) => patchCampaign(id, token, { status: 'PAUSED' });
export const resumeCampaign = (id: string, token: string) => patchCampaign(id, token, { status: 'ACTIVE' });
