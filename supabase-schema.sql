-- ─── Scale.ai — Supabase Schema ───────────────────────────────────────────────
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE / DO $$ guards.
--
-- Tables:
--   1. profiles      — one row per user (Brand DNA + Meta tokens)
--   2. campaigns     — campaign records created by agents
--   3. chat_history  — persisted agent conversation history
--
-- All tables have Row Level Security enforced. Policy: auth.uid() = user_id.
-- No user can read even one metadata row of another user.

-- ─── 0. Extensions ───────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1 — profiles
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                        uuid        primary key references auth.users(id) on delete cascade,
  email                     text        not null default '',

  -- Brand DNA
  brand_name                text        not null default '',
  website_url               text        not null default '',
  brand_logo_url            text        not null default '',
  brand_colors              jsonb                default null,   -- { primary, secondary }
  industry                  text        not null default '',
  tone                      text        not null default '',
  keywords                  text[]      not null default '{}',

  -- Meta / Facebook credentials
  -- meta_access_token is stored AES-GCM encrypted by the frontend (tokenCrypto.ts)
  meta_access_token         text        not null default '',
  meta_ad_account_id        text        not null default '',
  meta_facebook_page_id     text        not null default '',
  meta_instagram_account_id text        not null default '',

  -- State
  onboarding_completed      boolean     not null default false,

  -- Timestamps
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2 — campaigns
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.campaigns (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,

  name        text        not null default '',
  platform    text        not null default '',   -- 'meta' | 'google' | 'tiktok'
  status      text        not null default 'DRAFT',
  data        jsonb       not null default '{}', -- full campaign payload

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists campaigns_user_id_idx on public.campaigns(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 3 — chat_history
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.chat_history (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,

  agent_id    text        not null,              -- 'orchestrator' | 'analyst' | 'creative' | 'campaigner'
  role        text        not null check (role in ('user', 'assistant', 'tool')),
  content     text        not null default '',
  session_id  text,                              -- groups a multi-turn conversation

  created_at  timestamptz not null default now()
);

create index if not exists chat_history_user_id_idx   on public.chat_history(user_id);
create index if not exists chat_history_session_id_idx on public.chat_history(session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS — updated_at + new user profile init
-- ─────────────────────────────────────────────────────────────────────────────

-- Generic updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach to profiles
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Attach to campaigns
drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.handle_updated_at();

-- Auto-create profile row on new user signup (covers email/password AND OAuth)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY — profiles
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile"   on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can delete their own profile" on public.profiles;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can delete their own profile"
  on public.profiles for delete
  using (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY — campaigns
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.campaigns enable row level security;

drop policy if exists "Users can view their own campaigns"   on public.campaigns;
drop policy if exists "Users can insert their own campaigns" on public.campaigns;
drop policy if exists "Users can update their own campaigns" on public.campaigns;
drop policy if exists "Users can delete their own campaigns" on public.campaigns;

create policy "Users can view their own campaigns"
  on public.campaigns for select
  using (auth.uid() = user_id);

create policy "Users can insert their own campaigns"
  on public.campaigns for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own campaigns"
  on public.campaigns for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own campaigns"
  on public.campaigns for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY — chat_history
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.chat_history enable row level security;

drop policy if exists "Users can view their own chat history"   on public.chat_history;
drop policy if exists "Users can insert their own chat history" on public.chat_history;
drop policy if exists "Users can delete their own chat history" on public.chat_history;

create policy "Users can view their own chat history"
  on public.chat_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own chat history"
  on public.chat_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own chat history"
  on public.chat_history for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTS — authenticated role
-- ─────────────────────────────────────────────────────────────────────────────

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles     to authenticated;
grant select, insert, update, delete on public.campaigns    to authenticated;
grant select, insert,         delete on public.chat_history to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
-- After running, check RLS is on:
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public';
--
-- All three tables should show rowsecurity = true.
-- SELECT * FROM public.profiles returns only the calling user's own row.
