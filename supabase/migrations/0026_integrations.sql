-- 0026: Integration Center (Google Calendar, Google Drive). ADDITIVE: three new tables, nothing existing is altered.
--
--  * integrations        one row per person per provider: status, granted scopes, which account, last sync. The app can READ its own rows; only the
--                        server (the `google-integration` Edge Function, service role) writes them, so a page can never mark itself "connected".
--  * integration_events  the activity history shown in the Integration Center (connected, synced, failed, revoked, disconnected). Readable by its owner,
--                        written by the server only. Messages never hold tokens or file contents.
--  * integration_tokens  the OAuth refresh/access tokens. RLS is on with NO policies and every client role is revoked: they cannot be read or written
--                        from the browser or the app, with or without a valid sign-in. Only the Edge Function (service role) touches them.
-- Disconnecting deletes the token row (after the function revokes it at Google). Deleting the account cascades through all three.

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'google_drive')),
  status text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  scopes text[] not null default '{}',
  account_email text not null default '' check (char_length(account_email) <= 320),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text not null default '' check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'google_drive')),
  kind text not null check (kind in ('connected', 'synced', 'backup', 'restore', 'error', 'revoked', 'disconnected', 'conflict')),
  message text not null default '' check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists integration_events_user_idx on public.integration_events (user_id, created_at desc);

create table if not exists public.integration_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'google_drive')),
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

do $$
declare t text;
begin
  foreach t in array array['integrations', 'integration_events', 'integration_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
  -- The two readable tables: SELECT for the owner only, no insert / update / delete from any client.
  foreach t in array array['integrations', 'integration_events'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "owner_read" on public.%I', t);
    execute format('create policy "owner_read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['integrations', 'integration_tokens'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Calendar sync keeps a link from a LifeTrack event to its Google copy, so an event is never created twice and a change is recognised as one.
-- All three are NULL for every existing and every unsynced event.
alter table public.calendar_events add column if not exists external_provider text check (external_provider is null or external_provider = 'google_calendar');
alter table public.calendar_events add column if not exists external_id text check (external_id is null or char_length(external_id) <= 1024);
-- The fingerprint of the event as it was when both sides last agreed. A difference from it on one side means that side changed; on both, a conflict.
alter table public.calendar_events add column if not exists external_hash text check (external_hash is null or char_length(external_hash) <= 64);
create unique index if not exists calendar_events_external_uq on public.calendar_events (user_id, external_provider, external_id) where external_id is not null;
