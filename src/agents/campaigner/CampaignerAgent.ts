// ─── Campaigner Agent ──────────────────────────────────────────────────────────
// Tools: Meta Ads API operations (metaAds.ts) + social publishing (socialPublisher.ts)
//        + omni-channel (metaOmni.ts): IG direct, FB page, WhatsApp templates, omni campaign

import { runAgentLoop } from '../runAgentLoop';
import { CAMPAIGNER_SYSTEM_PROMPT } from './campaigner.prompts';
import type { ClaudeToolDefinition, AgentAction } from '../types';
import {
  fetchActiveAdSets, uploadAdImage, createAdCreativeFromImage,
  fetchAdSetAds, addCreativeToAdSet, replaceAdCreative,
} from '../../lib/metaAds';
import { publishToInstagram, publishToFacebook } from '../../lib/socialPublisher';
import type { MetaCredentials } from '../../lib/socialPublisher';
import { publishIGPost, publishFBPost, sendWATemplate, createOmniCampaign } from '../../lib/metaOmni';
import { getUserConfig } from '../../lib/userConfig';
import type Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

const TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'fetch_active_ad_sets',
    description: 'Get all currently active Meta ad sets with their IDs, names, budgets, and status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'fetch_ads_in_set',
    description: 'Get all ads inside a specific ad set, including their creative IDs.',
    input_schema: {
      type: 'object',
      properties: { ad_set_id: { type: 'string', description: 'The Meta ad set ID' } },
      required: ['ad_set_id'],
    },
  },
  {
    name: 'upload_ad_image',
    description: 'Upload an image from a public URL to Meta Ads and get an image hash. Required before creating an ad creative.',
    input_schema: {
      type: 'object',
      properties: { image_url: { type: 'string', description: 'Publicly accessible URL of the image to upload' } },
      required: ['image_url'],
    },
  },
  {
    name: 'create_ad_creative',
    description: 'Create a Meta ad creative from an image hash and caption text.',
    input_schema: {
      type: 'object',
      properties: {
        image_hash:    { type: 'string', description: 'Hash returned from upload_ad_image' },
        caption:       { type: 'string', description: 'Ad copy / message for the creative' },
        creative_name: { type: 'string', description: 'Name for this creative (optional)' },
      },
      required: ['image_hash', 'caption'],
    },
  },
  {
    name: 'add_creative_to_ad_set',
    description: 'Create a new ad in an existing ad set with the given creative.',
    input_schema: {
      type: 'object',
      properties: {
        ad_set_id:   { type: 'string', description: 'Target ad set ID' },
        creative_id: { type: 'string', description: 'Creative ID from create_ad_creative' },
        ad_name:     { type: 'string', description: 'Name for the new ad (optional)' },
      },
      required: ['ad_set_id', 'creative_id'],
    },
  },
  {
    name: 'replace_ad_creative',
    description: 'Swap the creative on an existing live ad without pausing it.',
    input_schema: {
      type: 'object',
      properties: {
        ad_id:       { type: 'string', description: 'Existing ad ID to update' },
        creative_id: { type: 'string', description: 'New creative ID to apply' },
      },
      required: ['ad_id', 'creative_id'],
    },
  },
  {
    name: 'publish_to_social',
    description: 'Publish an image or video to Instagram or Facebook as an organic post.',
    input_schema: {
      type: 'object',
      properties: {
        media_url:  { type: 'string', description: 'Public URL of the image or video' },
        caption:    { type: 'string', description: 'Post caption' },
        platform:   { type: 'string', description: 'Target platform', enum: ['instagram', 'facebook'] },
        media_type: { type: 'string', description: 'Type of media', enum: ['image', 'video'] },
      },
      required: ['media_url', 'caption', 'platform'],
    },
  },

  // ── Omni-channel tools ──────────────────────────────────────────────────────

  {
    name: 'publish_ig_post',
    description: 'Directly publish an image or Reel to the connected Instagram Business Account.',
    input_schema: {
      type: 'object',
      properties: {
        image_url:  { type: 'string', description: 'Publicly accessible URL of the image or video' },
        caption:    { type: 'string', description: 'Post caption (supports hashtags, emojis)' },
        media_type: { type: 'string', description: 'image (default) or video (Reel)', enum: ['image', 'video'] },
      },
      required: ['image_url', 'caption'],
    },
  },
  {
    name: 'publish_fb_post',
    description: 'Publish a post to the connected Facebook Page (with optional image or video).',
    input_schema: {
      type: 'object',
      properties: {
        message:    { type: 'string', description: 'Post message / copy' },
        media_url:  { type: 'string', description: 'Optional: public URL of image or video to attach' },
        media_type: { type: 'string', description: 'image or video (ignored if no media_url)', enum: ['image', 'video'] },
        link:       { type: 'string', description: 'Optional: link URL for link-preview posts (no media)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'send_wa_template',
    description: 'Send an approved WhatsApp template message to a phone number via the connected WABA.',
    input_schema: {
      type: 'object',
      properties: {
        to:            { type: 'string', description: 'Recipient phone in E.164 format, e.g. "+12125551234"' },
        template_name: { type: 'string', description: 'Pre-approved WhatsApp template name, e.g. "order_confirmation"' },
        language_code: { type: 'string', description: 'BCP-47 language code, e.g. "en_US" or "he"' },
      },
      required: ['to', 'template_name', 'language_code'],
    },
  },
  {
    name: 'create_omni_campaign',
    description: 'Create a new omni-channel ad campaign running across Facebook, Instagram, and Audience Network.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_name:      { type: 'string',  description: 'Name for the campaign' },
        ad_set_name:        { type: 'string',  description: 'Name for the ad set' },
        daily_budget_usd:   { type: 'number',  description: 'Daily budget in USD (e.g. 50 = $50/day)' },
        image_hash:         { type: 'string',  description: 'Image hash from upload_ad_image' },
        ad_message:         { type: 'string',  description: 'Ad copy / message text' },
      },
      required: ['campaign_name', 'ad_set_name', 'daily_budget_usd', 'image_hash', 'ad_message'],
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  // Prefer runtime config (OAuth-stored) over env vars
  const cfg          = getUserConfig();
  const adAccountId  = cfg.metaAdAccountId        || import.meta.env.VITE_META_AD_ACCOUNT_ID         || '';
  const accessToken  = cfg.metaAccessToken         || import.meta.env.VITE_META_ACCESS_TOKEN           || '';
  const pageId       = cfg.metaFacebookPageId      || import.meta.env.VITE_META_FACEBOOK_PAGE_ID      || '';
  const igAccountId  = cfg.metaInstagramAccountId  || import.meta.env.VITE_META_INSTAGRAM_ACCOUNT_ID  || '';
  const wabaPhones   = cfg.waPhoneNumbers;
  const primaryWAPhone = wabaPhones[0] ?? '';

  if (!accessToken) {
    throw new Error('Meta access token not configured. Connect via Settings → Meta Ads or set VITE_META_ACCESS_TOKEN in .env.local');
  }

  switch (name) {
    case 'fetch_active_ad_sets':
      return await fetchActiveAdSets(adAccountId, accessToken);

    case 'fetch_ads_in_set':
      return await fetchAdSetAds(input.ad_set_id as string, accessToken);

    case 'upload_ad_image':
      return { hash: await uploadAdImage(adAccountId, accessToken, input.image_url as string) };

    case 'create_ad_creative': {
      const id = await createAdCreativeFromImage(
        adAccountId,
        accessToken,
        input.image_hash as string,
        input.caption    as string,
        pageId,
        (input.creative_name as string) ?? 'ScaleAI Creative',
      );
      return { creative_id: id };
    }

    case 'add_creative_to_ad_set': {
      const adId = await addCreativeToAdSet(
        adAccountId,
        accessToken,
        input.ad_set_id   as string,
        input.creative_id as string,
        (input.ad_name as string) ?? 'ScaleAI Ad',
      );
      return { ad_id: adId, status: 'ACTIVE' };
    }

    case 'replace_ad_creative':
      await replaceAdCreative(input.ad_id as string, accessToken, input.creative_id as string);
      return { success: true };

    case 'publish_to_social': {
      const platform  = input.platform  as 'instagram' | 'facebook';
      const mediaType = (input.media_type as 'image' | 'video') ?? 'image';
      const mediaUrl  = input.media_url as string;
      const caption   = input.caption   as string;
      const creds: MetaCredentials = { accessToken, instagramAccountId: igAccountId, facebookPageId: pageId, adAccountId };

      if (platform === 'instagram') {
        const result = await publishToInstagram(mediaUrl, caption, creds, mediaType);
        return { post_id: result.postId, platform: 'instagram', success: result.success };
      } else {
        const result = await publishToFacebook(mediaUrl, caption, creds, mediaType);
        return { post_id: result.postId, platform: 'facebook', success: result.success };
      }
    }

    // ── Omni-channel tools ────────────────────────────────────────────────────

    case 'publish_ig_post': {
      if (!igAccountId) throw new Error('Instagram Business Account ID not configured. Run "Sync All Assets" in Settings.');
      const mediaType = (input.media_type as 'image' | 'video') ?? 'image';
      const result = await publishIGPost(
        igAccountId,
        input.image_url as string,
        input.caption   as string,
        accessToken,
        mediaType,
      );
      return { post_id: result.postId, platform: 'instagram' };
    }

    case 'publish_fb_post': {
      if (!pageId) throw new Error('Facebook Page ID not configured.');
      const result = await publishFBPost(
        pageId,
        accessToken,
        input.message as string,
        {
          mediaUrl:  input.media_url  as string | undefined,
          mediaType: input.media_type as 'image' | 'video' | undefined,
          link:      input.link       as string | undefined,
        },
      );
      return { post_id: result.postId, platform: 'facebook' };
    }

    case 'send_wa_template': {
      if (!primaryWAPhone) throw new Error('No WhatsApp phone number ID configured. Run "Sync All Assets" in Settings to discover your WABA.');
      const result = await sendWATemplate(
        primaryWAPhone,
        input.to            as string,
        input.template_name as string,
        input.language_code as string,
        accessToken,
      );
      return { message_id: result.messageId, status: 'sent' };
    }

    case 'create_omni_campaign': {
      if (!pageId) throw new Error('Facebook Page ID not configured.');
      const dailyBudgetCents = Math.round((input.daily_budget_usd as number) * 100);
      const result = await createOmniCampaign({
        adAccountId,
        accessToken,
        campaignName:     input.campaign_name as string,
        adSetName:        input.ad_set_name   as string,
        dailyBudgetCents,
        pageId,
        igAccountId:      igAccountId ?? '',
        imageHash:        input.image_hash    as string,
        adMessage:        input.ad_message    as string,
      });
      return {
        campaign_id: result.campaignId,
        ad_set_id:   result.adSetId,
        status:      'PAUSED',
        note:        'Campaign created in PAUSED state. Review and activate via Meta Ads Manager.',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Public runner ─────────────────────────────────────────────────────────────

export async function runCampaignerAgent(
  userContent: string,
  history:     Anthropic.MessageParam[],
  onAction:    (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<{ text: string; updatedHistory: Anthropic.MessageParam[] }> {
  return runAgentLoop({
    agentId:      'campaigner',
    model:        MODEL,
    systemPrompt: CAMPAIGNER_SYSTEM_PROMPT,
    history,
    userContent,
    tools:        TOOLS,
    executeTool,
    onAction,
  });
}
