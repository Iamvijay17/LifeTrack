-- 0030: index the foreign-key columns added by 0028 (feature flags, experiments, platform controls). ADDITIVE and idempotent: indexes only.
-- A foreign key without an index makes deleting the referenced row (or a user) scan the whole child table.
create index if not exists feature_flags_created_by_idx on public.feature_flags (created_by);
create index if not exists feature_flags_updated_by_idx on public.feature_flags (updated_by);
create index if not exists feature_flag_envs_updated_by_idx on public.feature_flag_envs (updated_by);
create index if not exists feature_flag_history_actor_idx on public.feature_flag_history (actor);
create index if not exists experiments_flag_key_idx on public.experiments (flag_key);
create index if not exists experiments_created_by_idx on public.experiments (created_by);
create index if not exists platform_controls_updated_by_idx on public.platform_controls (updated_by);
