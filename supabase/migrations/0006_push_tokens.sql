-- Push notification device tokens. ADDITIVE: one new table and two functions; no existing data is touched.
-- Clients never write this table directly: they call register_push_token / unregister_push_token (security definer),
-- so a token can be re-assigned when a different user signs in on the same phone, without opening an RLS hole.

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^(Expo|Exponent)PushToken\[[^\]]+\]$'),
  platform text not null check (platform in ('ios','android')),
  device_name text not null default '' check (char_length(device_name) <= 80),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index device_push_tokens_user_idx on public.device_push_tokens (user_id);

create trigger set_updated_at before update on public.device_push_tokens
  for each row execute function public.set_updated_at();

alter table public.device_push_tokens enable row level security;
alter table public.device_push_tokens force row level security;
revoke all on public.device_push_tokens from anon;
-- Read and delete your own tokens only. No insert/update policy => direct writes are denied.
create policy "owner_select" on public.device_push_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy "owner_delete" on public.device_push_tokens for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.device_push_tokens from authenticated;

create or replace function public.register_push_token(p_token text, p_platform text, p_device_name text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.device_push_tokens (user_id, token, platform, device_name)
  values (auth.uid(), p_token, p_platform, left(coalesce(p_device_name, ''), 80))
  on conflict (token) do update
    set user_id = auth.uid(), platform = excluded.platform, device_name = excluded.device_name, last_seen_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.device_push_tokens where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
