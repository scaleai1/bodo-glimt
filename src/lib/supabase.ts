// ─── Supabase Client ──────────────────────────────────────────────────────────
// Single shared instance — import { supabase } everywhere.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Profile row type (mirrors the `profiles` table) ─────────────────────────

export interface Profile {
  id:                        string;   // uuid — same as auth.users.id
  email:                     string;
  brand_name:                string;
  website_url:               string;
  brand_logo_url:            string;
  brand_colors:              { primary: string; secondary: string } | null;
  industry:                  string;
  tone:                      string;
  keywords:                  string[];
  meta_access_token:         string;   // sensitive — protected by RLS
  meta_ad_account_id:        string;
  meta_facebook_page_id:     string;
  meta_instagram_account_id: string;
  onboarding_completed:      boolean;
  created_at:                string;
  updated_at:                string;
}
