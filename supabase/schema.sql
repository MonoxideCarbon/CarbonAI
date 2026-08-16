-- CarbonAI Supabase schema
-- Run this once in Supabase SQL Editor before deploying the app.

create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  full_name text,
  avatar_url text,
  personality text not null default 'humanoid' check (personality in ('humanoid', 'professional')),
  theme text not null default 'system' check (theme in ('light', 'dark', 'amoled', 'system')),
  memory_enabled boolean not null default true,
  email_verified boolean not null default true,
  verification_token text,
  reset_token text,
  reset_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_verification_token_idx
  on public.users (verification_token)
  where verification_token is not null;

create unique index if not exists users_reset_token_idx
  on public.users (reset_token)
  where reset_token is not null;

create table if not exists public.chats (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default 'New Chat',
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_user_updated_idx on public.chats (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key,
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  model_used text,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_chat_created_idx on public.messages (chat_id, created_at asc, id asc);
create index if not exists messages_user_idx on public.messages (user_id);

create table if not exists public.memories (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  key text not null,
  value text not null,
  category text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists memories_user_key_idx on public.memories (user_id, key);

create table if not exists public.attachments (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete cascade,
  filename text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists attachments_user_idx on public.attachments (user_id, created_at desc);
create index if not exists attachments_chat_idx on public.attachments (chat_id, created_at desc);

alter table public.users enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.attachments enable row level security;

-- CarbonAI currently uses a server-side service-role client, so client roles do not need table access.
-- Keep these tables inaccessible to anon/authenticated clients by default.
revoke all on table public.users from anon, authenticated;
revoke all on table public.chats from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.memories from anon, authenticated;
revoke all on table public.attachments from anon, authenticated;

grant all on table public.users to service_role;
grant all on table public.chats to service_role;
grant all on table public.messages to service_role;
grant all on table public.memories to service_role;
grant all on table public.attachments to service_role;

-- Create the private Storage bucket for CarbonAI attachments.
insert into storage.buckets (id, name, public)
values ('carbonai-files', 'carbonai-files', false)
on conflict (id) do update set public = excluded.public;

-- Storage is accessed only by the server-side service role.
revoke all on storage.objects from anon, authenticated;
