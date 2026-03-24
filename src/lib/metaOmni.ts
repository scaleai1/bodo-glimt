// ─── Meta Omni-Channel API ────────────────────────────────────────────────────
// Extends meta ad operations with:
//  - Instagram direct publishing (container → publish)
//  - Facebook Page post publishing
//  - WhatsApp Business template messaging
//  - Omni-channel campaign creation (FB + IG + Audience Network)
//
// All existing metaAds.ts functions remain unchanged and importable separately.
// This file adds the cross-channel layer on top.

const META_VERSION = 'v20.0';
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IGPublishResult {
  postId:    string;
  permalink?: string;
}

export interface FBPublishResult {
  postId: string;
}

export interface WAMessageResult {
  messageId: string;
}

export interface OmniCampaignResult {
  campaignId: string;
  adSetId:    string;
}

// ── Instagram Direct Publish ──────────────────────────────────────────────────
// Two-step: create container → poll → media_publish

async function waitForIGContainer(
  containerId: string,
  accessToken: string,
  maxWaitMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const res  = await fetch(`${META_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`);
    const data = await res.json() as { status_code?: string };
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED')
      throw new Error(`IG container status: ${data.status_code}`);
  }
  throw new Error('Timed out waiting for Instagram media container');
}

/**
 * Publish an image or reel directly to an Instagram Business Account.
 * @param igAccountId  Instagram Business Account ID (NOT @username)
 * @param mediaUrl     Publicly accessible image or video URL
 * @param caption      Post caption (supports hashtags, mentions)
 * @param accessToken  User or page access token with instagram_content_publish scope
 * @param mediaType    'image' (default) | 'video' (published as Reel)
 */
export async function publishIGPost(
  igAccountId: string,
  mediaUrl:    string,
  caption:     string,
  accessToken: string,
  mediaType:   'image' | 'video' = 'image',
): Promise<IGPublishResult> {
  if (!igAccountId) throw new Error('Instagram Business Account ID is required');

  // Step 1 — Create container
  const containerBody: Record<string, string> = { caption, access_token: accessToken };
  if (mediaType === 'video') {
    containerBody.media_type = 'REELS';
    containerBody.video_url  = mediaUrl;
  } else {
    containerBody.image_url = mediaUrl;
  }

  const containerRes  = await fetch(`${META_BASE}/${igAccountId}/media`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(containerBody),
  });
  const containerData = await containerRes.json() as { id?: string; error?: { message: string } };
  if (containerData.error) throw new Error(`IG container failed: ${containerData.error.message}`);
  if (!containerData.id)   throw new Error('No container ID returned from Instagram');

  // Step 2 — For video, wait for processing
  if (mediaType === 'video') {
    await waitForIGContainer(containerData.id, accessToken);
  }

  // Step 3 — Publish
  const publishRes  = await fetch(`${META_BASE}/${igAccountId}/media_publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
  });
  const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
  if (publishData.error) throw new Error(`IG publish failed: ${publishData.error.message}`);
  if (!publishData.id)   throw new Error('No post ID returned from Instagram publish');

  return { postId: publishData.id };
}

// ── Facebook Page Publish ─────────────────────────────────────────────────────

/**
 * Publish a post to a Facebook Page.
 * For images: POST /{page-id}/photos
 * For videos: POST /{page-id}/videos
 * For link posts (no media): POST /{page-id}/feed
 */
export async function publishFBPost(
  pageId:      string,
  accessToken: string,
  message:     string,
  opts: {
    mediaUrl?:  string;
    mediaType?: 'image' | 'video';
    link?:      string;
  } = {},
): Promise<FBPublishResult> {
  if (!pageId) throw new Error('Facebook Page ID is required');

  let endpoint: string;
  const body: Record<string, string> = { access_token: accessToken };

  if (opts.mediaUrl && opts.mediaType === 'video') {
    endpoint         = `${META_BASE}/${pageId}/videos`;
    body.file_url    = opts.mediaUrl;
    body.description = message;
  } else if (opts.mediaUrl) {
    endpoint    = `${META_BASE}/${pageId}/photos`;
    body.url    = opts.mediaUrl;
    body.caption = message;
  } else {
    endpoint    = `${META_BASE}/${pageId}/feed`;
    body.message = message;
    if (opts.link) body.link = opts.link;
  }

  const res  = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json() as { id?: string; error?: { message: string } };
  if (data.error) throw new Error(`FB post failed: ${data.error.message}`);
  if (!data.id)   throw new Error('No post ID returned from Facebook');

  return { postId: data.id };
}

// ── WhatsApp Business Template Messaging ──────────────────────────────────────
// Requires: whatsapp_business_management scope + verified phone number ID
// Only pre-approved templates can be sent to arbitrary recipients.

export interface WATemplateComponent {
  type:       'header' | 'body' | 'button';
  parameters: Array<{ type: 'text' | 'image' | 'document'; text?: string; image?: { link: string } }>;
}

/**
 * Send a WhatsApp template message to a phone number.
 * @param phoneNumberId  WABA phone number ID (NOT the display number)
 * @param to             Recipient phone in E.164 format: "+12125551234"
 * @param templateName   Pre-approved template name (e.g. "order_confirmation")
 * @param languageCode   BCP-47 language code (e.g. "en_US", "he")
 * @param accessToken    User token with whatsapp_business_management scope
 * @param components     Optional template components (header/body variable substitutions)
 */
export async function sendWATemplate(
  phoneNumberId: string,
  to:            string,
  templateName:  string,
  languageCode:  string,
  accessToken:   string,
  components:    WATemplateComponent[] = [],
): Promise<WAMessageResult> {
  if (!phoneNumberId) throw new Error('WhatsApp phone number ID is required');
  if (!to)            throw new Error('Recipient phone number (to) is required');

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name:     templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  const res  = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as {
    messages?: Array<{ id: string }>;
    error?:    { message: string; code?: number };
  };

  if (data.error) throw new Error(`WA template send failed: ${data.error.message}`);
  const msgId = data.messages?.[0]?.id;
  if (!msgId) throw new Error('No message ID returned from WhatsApp API');

  return { messageId: msgId };
}

// ── Omni-Channel Campaign Creation ───────────────────────────────────────────
// Creates a campaign that runs across Facebook + Instagram + Audience Network
// via a single ad set with publisher_platforms targeting.

export interface OmniCampaignOptions {
  adAccountId:     string;   // WITHOUT "act_" prefix
  accessToken:     string;
  campaignName:    string;
  adSetName:       string;
  dailyBudgetCents: number;  // Meta minor currency units (e.g. 5000 = $50.00)
  pageId:          string;   // Facebook Page ID
  igAccountId:     string;   // Instagram Business Account ID
  imageHash:       string;   // Previously uploaded image hash
  adMessage:       string;   // Ad copy
  targetAudience?: {
    age_min?: number;
    age_max?: number;
    geo_locations?: { countries: string[] };
    interests?: Array<{ id: string; name: string }>;
  };
}

/**
 * Creates an omni-channel campaign targeting Facebook, Instagram, and Audience Network.
 * Returns campaignId and adSetId for the new campaign.
 */
export async function createOmniCampaign(opts: OmniCampaignOptions): Promise<OmniCampaignResult> {
  const base = `${META_BASE}/act_${opts.adAccountId}`;
  const token = opts.accessToken;

  // Step 1 — Create campaign
  const campRes  = await fetch(`${base}/campaigns`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:            opts.campaignName,
      objective:       'OUTCOME_SALES',
      status:          'PAUSED',           // start paused — let analyst activate
      special_ad_categories: [],
      access_token:    token,
    }),
  });
  const campData = await campRes.json() as { id?: string; error?: { message: string } };
  if (campData.error) throw new Error(`Campaign create failed: ${campData.error.message}`);
  if (!campData.id)   throw new Error('No campaign ID returned');

  // Step 2 — Create ad set with omni-channel publisher_platforms
  const targeting = {
    publisher_platforms: ['facebook', 'instagram', 'audience_network'],
    facebook_positions:  ['feed', 'story'],
    instagram_positions: ['stream', 'story', 'reels'],
    ...(opts.targetAudience ?? {}),
  };

  const adSetRes  = await fetch(`${base}/adsets`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:                     opts.adSetName,
      campaign_id:              campData.id,
      daily_budget:             opts.dailyBudgetCents,
      billing_event:            'IMPRESSIONS',
      optimization_goal:        'OFFSITE_CONVERSIONS',
      bid_strategy:             'LOWEST_COST_WITHOUT_CAP',
      targeting,
      status:                   'PAUSED',
      access_token:             token,
    }),
  });
  const adSetData = await adSetRes.json() as { id?: string; error?: { message: string } };
  if (adSetData.error) throw new Error(`Ad set create failed: ${adSetData.error.message}`);
  if (!adSetData.id)   throw new Error('No ad set ID returned');

  // Step 3 — Create ad creative
  const creativeRes  = await fetch(`${base}/adcreatives`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:               `${opts.campaignName} — Creative`,
      object_story_spec: {
        page_id:   opts.pageId,
        instagram_actor_id: opts.igAccountId || undefined,
        link_data: {
          image_hash: opts.imageHash,
          message:    opts.adMessage,
        },
      },
      access_token: token,
    }),
  });
  const creativeData = await creativeRes.json() as { id?: string; error?: { message: string } };
  if (creativeData.error) throw new Error(`Creative create failed: ${creativeData.error.message}`);
  if (!creativeData.id)   throw new Error('No creative ID returned');

  // Step 4 — Create ad in the ad set
  const adRes  = await fetch(`${base}/ads`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:         `${opts.adSetName} — Ad`,
      adset_id:     adSetData.id,
      creative:     { creative_id: creativeData.id },
      status:       'PAUSED',
      access_token: token,
    }),
  });
  const adData = await adRes.json() as { id?: string; error?: { message: string } };
  if (adData.error) throw new Error(`Ad create failed: ${adData.error.message}`);

  return { campaignId: campData.id, adSetId: adSetData.id };
}

// ── IG Account Lookup ─────────────────────────────────────────────────────────

/**
 * Fetches the Instagram Business Account linked to a Facebook Page.
 * Returns null if no IG account is linked.
 */
export async function fetchIGLinkedToPage(
  pageId:      string,
  pageToken:   string,
): Promise<{ id: string; username?: string } | null> {
  try {
    const res  = await fetch(
      `${META_BASE}/${pageId}?fields=instagram_business_account{id,username}&access_token=${pageToken}`,
    );
    const data = await res.json() as {
      instagram_business_account?: { id: string; username?: string };
    };
    return data.instagram_business_account ?? null;
  } catch {
    return null;
  }
}

// ── WABA Info ─────────────────────────────────────────────────────────────────

/**
 * Fetches details and verified phone numbers for a WhatsApp Business Account.
 */
export async function fetchWABAInfo(
  wabaId:      string,
  accessToken: string,
): Promise<{ id: string; name?: string; phoneNumbers: Array<{ id: string; display_phone_number: string; verified_name: string }> }> {
  const [wabaRes, phonesRes] = await Promise.all([
    fetch(`${META_BASE}/${wabaId}?fields=id,name&access_token=${accessToken}`),
    fetch(`${META_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${accessToken}`),
  ]);

  const waba   = await wabaRes.json()   as { id?: string; name?: string; error?: { message: string } };
  const phones = await phonesRes.json() as { data?: Array<{ id: string; display_phone_number: string; verified_name: string }>; error?: { message: string } };

  if (waba.error)   throw new Error(`WABA info fetch failed: ${waba.error.message}`);
  if (phones.error) throw new Error(`Phone numbers fetch failed: ${phones.error.message}`);

  return {
    id:           waba.id   ?? wabaId,
    name:         waba.name,
    phoneNumbers: phones.data ?? [],
  };
}
