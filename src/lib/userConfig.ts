// ─── User Config ─────────────────────────────────────────────────────────────
// Persistent localStorage service for per-user onboarding configuration.

export interface PlatformMappings {
  website:             string;
  metaAdAccount:       string;
  metaPage:            string;
  instagramBusinessId: string | null;   // IG Business Account ID linked to the FB Page
  wabaId:              string | null;   // WhatsApp Business Account ID
  waPhoneNumbers:      string[];        // Verified WABA phone number IDs (not display numbers)
  tiktokId:            string | null;
  lockedAt:            string;          // ISO timestamp set at onboarding completion
}

export interface UserConfig {
  completed:              boolean;
  // Brand DNA
  websiteUrl:             string;
  brandName:              string;
  logoUrl:                string;
  primaryColor:           string;
  secondaryColor:         string;
  industry:               string;
  tone:                   string;
  keywords:               string[];
  // Meta / Facebook Ads
  metaAccessToken:        string;
  metaAdAccountId:        string;
  metaFacebookPageId:     string;
  metaInstagramAccountId: string;
  // Website store integration
  siteAdminApiKey:        string;
  sitePlatformType:       string;   // 'shopify' | 'woocommerce' | 'custom' | ''
  siteApiUrl:             string;
  proofOfLifeStats:       object | null;
  // TikTok (future)
  tiktokId:               string;
  // WhatsApp Business
  wabaId:                 string;
  waPhoneNumbers:         string[];     // Verified WABA phone number IDs
  // Platform lock — verified mapping snapshot written at onboarding completion
  platformMappings:       PlatformMappings | null;
}

const KEY = 'zipit_user_config_v1';

const DEFAULTS: UserConfig = {
  completed:              false,
  websiteUrl:             '',
  brandName:              '',
  logoUrl:                '',
  primaryColor:           '',
  secondaryColor:         '',
  industry:               '',
  tone:                   '',
  keywords:               [],
  metaAccessToken:        '',
  metaAdAccountId:        '',
  metaFacebookPageId:     '',
  metaInstagramAccountId: '',
  siteAdminApiKey:        '',
  sitePlatformType:       '',
  siteApiUrl:             '',
  proofOfLifeStats:       null,
  tiktokId:               '',
  wabaId:                 '',
  waPhoneNumbers:         [],
  platformMappings:       null,
};

export function getUserConfig(): UserConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveUserConfig(patch: Partial<UserConfig>): UserConfig {
  const next = { ...getUserConfig(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function clearUserConfig(): void {
  localStorage.removeItem(KEY);
}
