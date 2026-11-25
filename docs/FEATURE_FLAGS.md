# Feature flags and experiments

Migration `0028_performance_flags.sql`, engine in `packages/core/src/flags.js`, page **Feature Management** (`/features`, administrators only, in the System group of the menu).

## What a flag is (and is not)

A flag switches a feature on for some people, or off in an emergency. A flag is **not authorisation**: hiding a button or a page because of a flag protects nothing. Anything that must be enforced is checked by the database (`flag_enabled('key')` in SQL, used by `experiment_assign`). The web app only uses flags for presentation (menu entries, page gates, experiment variants).

## Model

| Table | Holds |
|---|---|
| `feature_flags` | key, name, description, kind (`release` / `experiment` / `ops`), optional module, protected, archived, default value, created/updated and by |
| `feature_flag_envs` | one row per flag and environment (`development`, `staging`, `production`): enabled, rollout %, allow list, block list, roles, value outside the rollout |
| `platform_controls` | the single row of emergency controls |
| `feature_flag_history` | every change with who, before, after, when, why (source of rollback) |
| `experiments`, `experiment_events` | experiments and their exposure / conversion events |

All six tables have row-level security enabled **without policies** and all privileges revoked: every read and write goes through `security definer` functions that check the caller.

## Evaluation (same rules in `flags.js` and in SQL `_flag_value`)

1. Protected flag (`core.*`) → always on. Nothing below can change that.
2. Archived → its default.
3. Emergency controls: global disable → off; experiments disabled and the flag is an `experiment` → off; the flag's module is in `disabled_modules` → off.
4. No setting for the environment → the flag's default.
5. Environment switched off → off.
6. Block list → off. Allow list → on.
7. Roles set and the person's role (`user` / `admin`) is not among them → off.
8. Rollout 100 % → on. Otherwise the person's bucket (`FNV-1a("<flag key>:<user id>") mod 10000`) is below `percent × 100` → on; else the value outside the rollout.

The bucket is stable, so raising a percentage only adds people, and different flags place the same person independently. A parity test runs the SQL and the JavaScript on the same inputs.

`evaluate_flags(env)` evaluates **every** flag for the signed-in person in one call. The browser keeps the answer for a minute (`FRESHNESS.presentation`), refreshes on focus and every 5 minutes, drops it after any change an administrator makes in that browser, and **falls back** to the last answer or to the code defaults (`FLAG_REGISTRY`, which equal the behaviour before flags existed) when the server can not be reached or the migration is not applied yet. Other browsers see a change within about a minute.

The environment the browser asks for comes from `VITE_APP_ENV` (`development` / `staging` / `production`), else `production` in a production build and `development` otherwise. It is a **staging aid, not security**; server code uses the database setting `lifetrack.environment` (default `production`).

## Shipped flags

`core.auth`, `core.security`, `core.data_integrity`, `core.recovery` (protected, always on) and `module.automation`, `module.challenges`, `module.lifemap`, `module.insights`, `module.developers` (on in every environment; they control the menu entry and a page gate, and can be switched off with the module control).

## Emergency controls

Stop all experiments · switch off every optional feature · switch off one module. A reason is required; each change is confirmed, written to the history and to the Audit History. Sign-in, security, data integrity and recovery can not be switched off by any of them (and a module named `auth`, `security`, `recovery`, `data_integrity`, `core` or `settings` is refused).

## Change history and rollback

Every flag, environment, experiment and control change is stored with before/after. Flag-environment and control changes can be **rolled back**: the earlier configuration is restored, a protected or archived flag is refused, and the rollback is itself a new history entry. The Audit History receives a redacted line (`entity` = `feature_flag`, `experiment`, `platform_controls`): allow and block lists are recorded as counts, never as user ids. Flags are archived, never deleted.

## Experiments

An experiment sits on a flag of kind `experiment`: control + treatment variants (2–5, weights add up to 100, one is `control`), a traffic share, a goal event. States: `draft → running ⇄ paused → completed`; only a draft can be edited. **Off by default**: a draft enrolls no one, and a running experiment enrolls nobody until its flag is on for that person.

* `experiment_assign(key)` decides everything on the server (running, controls, flag on, traffic share, variant by hash), is consistent for a person, and records one **exposure**. Anyone not enrolled gets `control` and nothing is recorded.
* `experiment_convert(key, event)` records an explicit **conversion** (once per event name, only for enrolled people). The app calls it from `useExperiment(key).convert()`.
* Privacy: events hold the user id only so that a person's records go with their account (`on delete cascade`); administrators only receive **counts per variant** and exposures per day, never ids.
* Results show participants, share against target, conversions, the rate with a 95 % Wilson range and the difference against control in points. The page **does not declare a winner and makes no significance claim**; below 100 participants per variant it says "Not enough data yet".

### Using an experiment in the app

```jsx
const { variant, convert } = useExperiment('checkout_copy') // 'control' until the server enrolls this person
...
<Button onClick={() => { start(); convert('purchased') }}>{variant === 'treatment' ? 'Buy now' : 'Checkout'}</Button>
```

## Endpoints (all Postgres functions, called through PostgREST RPC)

Signed-in people: `evaluate_flags(p_env)`, `flag_enabled(p_key)`, `experiment_assign(p_key)`, `experiment_convert(p_key, p_event)`.
Administrators (checked inside each function by `_require_admin()`): `admin_flags`, `admin_flag_create`, `admin_flag_update`, `admin_flag_env_set`, `admin_flag_archive`, `admin_flag_history`, `admin_flag_rollback`, `admin_controls_set`, `admin_experiments`, `admin_experiment_save`, `admin_experiment_set_status`, `admin_experiment_results`. Errors are Postgres errors with a code (`28000` not signed in, `42501` not allowed, `22023` invalid input, `23505` duplicate, `23514` state not allowed, `P0002` not found) that the web app turns into messages.

## Setup (once, on your Supabase project)

1. Run `supabase/migrations/0028_performance_flags.sql` (needs 0027 first).
2. Make yourself an administrator if you are not (also needed for System Health): `insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';`
3. Optional: schedule `select purge_performance_data();` daily (service role) and, if you use experiments, delete finished experiments' events you no longer need.

Until step 1 is done the app behaves exactly as before: flag calls fail quietly and the code defaults apply.

## Limitations

* No scheduled rollouts, no multi-variant *flags* (experiments have variants; flags are on/off), no per-user targeting by anything but id and role (`user` / `admin`).
* Experiment results are descriptive. Choosing a winner, or stopping early, is a human decision; the page gives no p-values by design.
* Flag changes reach other browsers within about a minute (no push channel).
* `module.*` flags hide the menu entry and gate the page; the data stays reachable through the API and the database as before: modules that must be *blocked* server-side should call `flag_enabled()` from their RPC.
