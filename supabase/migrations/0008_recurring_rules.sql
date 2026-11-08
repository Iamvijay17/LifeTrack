-- 0008: recurring transactions (rent, EMI, subscriptions). ADDITIVE: one new table and two nullable columns on transactions; no existing row changes.
-- The apps post due occurrences themselves while open (packages/core/src/recurring.js, api.postDueRecurring). Several devices can do so at once:
-- the unique index below lets only the first insert of an occurrence win, exactly like notifications.dedupe_key does for reminders.

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','savings')),
  amount_paise bigint not null check (amount_paise > 0),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  payment_method text not null default 'Other' check (payment_method in ('Cash','UPI','Credit card','Debit card','Bank transfer','Other')),
  note text not null default '' check (char_length(note) <= 300),
  frequency text not null default 'monthly' check (frequency in ('daily','weekly','monthly','yearly')),
  anchor_day smallint not null check (anchor_day between 1 and 31), -- the intended day of the month: a rule on the 31st falls on Feb 28, then back on Mar 31
  next_date date not null,                                          -- the next occurrence to post
  end_date date,                                                    -- last day an occurrence may fall on (inclusive); null = no end
  active boolean not null default true,                             -- false = paused or finished
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recurring_rules_user_idx on public.recurring_rules (user_id, next_date);

drop trigger if exists set_updated_at on public.recurring_rules;
create trigger set_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();

alter table public.recurring_rules enable row level security;
alter table public.recurring_rules force row level security;
revoke all on public.recurring_rules from anon;
drop policy if exists "owner_all" on public.recurring_rules;
create policy "owner_all" on public.recurring_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_rules') then
    alter publication supabase_realtime add table public.recurring_rules;
  end if;
end $$;

-- A posted transaction remembers its rule and which occurrence it was. recurring_date never changes, so moving a posted transaction to another day
-- (which edits txn_date) can't free that occurrence to post again. Deleting a rule keeps the transactions it already posted.
alter table public.transactions
  add column if not exists recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  add column if not exists recurring_date date;
alter table public.transactions drop constraint if exists transactions_recurring_ck;
alter table public.transactions add constraint transactions_recurring_ck check (recurring_rule_id is null or recurring_date is not null); -- nulls would slip past the unique index
create unique index if not exists transactions_recurring_occurrence_uq on public.transactions (user_id, recurring_rule_id, recurring_date) where recurring_rule_id is not null;
create index if not exists transactions_recurring_rule_idx on public.transactions (recurring_rule_id) where recurring_rule_id is not null;

-- Same-owner guard from 0004: a transaction can't point at another user's rule.
drop trigger if exists fk_owner on public.transactions;
create trigger fk_owner before insert or update on public.transactions
  for each row execute function public.check_fk_owner('recurring_rule_id', 'recurring_rules');
