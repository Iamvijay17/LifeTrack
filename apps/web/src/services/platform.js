// The browser's side of the platform features (migration 0027): audit history, API keys, webhooks, system health. Everything goes through the database's
// own functions and row-level security: the page never decides who may see what. Without a Supabase project (the in-browser dev backend) or in demo mode
// there is nothing to talk to, and every call says so with a PlatformUnavailable error that the pages turn into an explanation.
import { supabase } from '@/lib/supabase'
import { toAppError } from './errors'
import { isDemo } from './demo'
import { invalidateFlags } from './flags'
import { clampPageSize } from '@lifetrack/core/pagination'
import { listPageSupabase } from '@lifetrack/data'

export class PlatformUnavailable extends Error {
  constructor(reason) {
    super(
      reason === 'demo'
        ? 'This is not available in demo mode: it works on your real account.'
        : 'This needs a LifeTrack account on a Supabase project. It is not available in the in-browser dev mode.',
    )
    this.name = 'PlatformUnavailable'
    this.reason = reason
  }
}
export const platformAvailable = () => Boolean(supabase) && !isDemo()
const sb = () => {
  if (isDemo()) throw new PlatformUnavailable('demo')
  if (!supabase) throw new PlatformUnavailable('local')
  return supabase
}
const must = ({ data, error }) => {
  if (error) throw toAppError(error)
  return data
}
const rpc = async (name, args) => must(await sb().rpc(name, args))

// ------------------------------------------------------------------------------------------------------------------ audit
const COLS =
  'id,seq,occurred_at,action,operation,entity,record_id,summary,changed_fields,old_values,new_values,truncated,request_id,source,restored_from'
const likeEscape = (s) => s.replace(/[\\%_,()]/g, ' ')
/**
 * One page of the history, newest first. `filters`: { actions[], entities[], source, from, to (ISO), search, recordId }. Paged by `page` (0-based).
 * The database applies row-level security (and module locks) to every row it returns.
 */
export async function listAuditEvents({ filters = {}, page = 0, pageSize = 25 } = {}) {
  pageSize = clampPageSize(pageSize) // one cap for every list (@lifetrack/core/pagination)
  let q = sb().from('audit_events').select(COLS, { count: 'exact' })
  if (filters.actions?.length) q = q.in('action', filters.actions)
  if (filters.entities?.length) q = q.in('entity', filters.entities)
  if (filters.source) q = q.eq('source', filters.source)
  if (filters.recordId) q = q.eq('record_id', filters.recordId)
  if (filters.from) q = q.gte('occurred_at', filters.from)
  if (filters.to) q = q.lt('occurred_at', filters.to)
  const term = filters.search ? likeEscape(filters.search.trim()).slice(0, 80) : ''
  if (term) q = q.or(`summary.ilike.%${term}%,record_id.ilike.%${term}%,entity.ilike.%${term}%,request_id.ilike.%${term}%`)
  const { data, error, count } = await q
    .order('occurred_at', { ascending: false })
    .order('seq', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw toAppError(error)
  return { rows: data, total: count ?? data.length }
}
/**
 * Up to `limit` events for the export (newest first), under the same filters. Walks the history by cursor (keyset), not by page number: the cost of each
 * request stays the same however far back it goes, and a row written meanwhile can not shift the pages. Free-text and record searches use the page route.
 */
export async function exportAuditEvents(filters = {}, limit = 5000) {
  const out = []
  if (filters.search || filters.recordId) {
    for (let page = 0; out.length < limit; page++) {
      const { rows } = await listAuditEvents({ filters, page, pageSize: 100 })
      out.push(...rows)
      if (rows.length < 100) break
    }
    return out.slice(0, limit)
  }
  const req = {
    pageSize: 100,
    count: false,
    filters: { action: filters.actions, entity: filters.entities, source: filters.source },
    from: filters.from,
    to: filters.to,
  }
  let cursor = null
  while (out.length < limit) {
    const page = await listPageSupabase(sb(), 'audit_events', { ...req, cursor })
    out.push(...page.items)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return out.slice(0, limit)
}
export const previewRestore = (eventId) => rpc('audit_restore', { p_event: eventId, p_apply: false })
export const applyRestore = (eventId) => rpc('audit_restore', { p_event: eventId, p_apply: true })
export const verifyAuditChain = () => rpc('audit_verify_chain', { p_limit: 5000 })
export const eraseAuditHistory = () => rpc('erase_my_audit_history')
export { logAudit } from './auditLog'

// ------------------------------------------------------------------------------------------------------------------ API keys
const KEY_COLS = 'id,name,description,key_prefix,scopes,rate_limit_per_min,expires_at,revoked_at,last_used_at,request_count,created_at'
export const listApiKeys = async () => must(await sb().from('api_keys').select(KEY_COLS).order('created_at', { ascending: false }))
export const createApiKey = ({ name, description, scopes, expiresDays, rateLimit }) =>
  rpc('create_api_key', {
    p_name: name,
    p_description: description ?? '',
    p_scopes: scopes,
    p_expires_days: expiresDays ?? null,
    p_rate_limit: rateLimit ?? 60,
  })
export const revokeApiKey = (id) => rpc('revoke_api_key', { p_id: id })
export const updateApiKey = (id, { name, description, rateLimit }) =>
  rpc('update_api_key', { p_id: id, p_name: name, p_description: description ?? '', p_rate_limit: rateLimit })
export const apiUsage = (days = 14) => rpc('api_usage_summary', { p_days: days })
export async function listApiRequests({ keyId, onlyErrors = false, page = 0, pageSize = 25 } = {}) {
  let q = sb()
    .from('api_request_log')
    .select('id,key_id,request_id,method,path,status,duration_ms,error_code,created_at', { count: 'exact' })
  if (keyId) q = q.eq('key_id', keyId)
  if (onlyErrors) q = q.gte('status', 400)
  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw toAppError(error)
  return { rows: data, total: count ?? data.length }
}

// ------------------------------------------------------------------------------------------------------------------ webhooks
const EP_COLS = 'id,url,description,events,enabled,timeout_ms,max_attempts,consecutive_failures,disabled_reason,last_delivery_at,created_at'
export const listWebhooks = async () => must(await sb().from('webhook_endpoints').select(EP_COLS).order('created_at', { ascending: false }))
export const createWebhook = ({ url, description, events, timeoutMs, maxAttempts }) =>
  rpc('create_webhook_endpoint', {
    p_url: url,
    p_description: description ?? '',
    p_events: events,
    p_timeout_ms: timeoutMs ?? 5000,
    p_max_attempts: maxAttempts ?? 6,
  })
export const updateWebhook = (id, { url, description, events, enabled, timeoutMs, maxAttempts }) =>
  rpc('update_webhook_endpoint', {
    p_id: id,
    p_url: url,
    p_description: description ?? '',
    p_events: events,
    p_enabled: enabled,
    p_timeout_ms: timeoutMs,
    p_max_attempts: maxAttempts,
  })
export const deleteWebhook = (id) => rpc('delete_webhook_endpoint', { p_id: id })
export const rotateWebhookSecret = (id) => rpc('rotate_webhook_secret', { p_id: id })
export const retryDelivery = (id) => rpc('retry_webhook_delivery', { p_id: id })
export async function listDeliveries({ endpointId, status, page = 0, pageSize = 20 } = {}) {
  let q = sb()
    .from('webhook_deliveries')
    .select('id,endpoint_id,event_type,status,attempts,next_attempt_at,last_status,last_error,delivered_at,created_at', { count: 'exact' })
  if (endpointId) q = q.eq('endpoint_id', endpointId)
  if (status) q = q.eq('status', status)
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw toAppError(error)
  return { rows: data, total: count ?? data.length }
}
export const listAttempts = async (deliveryId) =>
  must(
    await sb()
      .from('webhook_attempts')
      .select('id,attempt,ok,status,error,duration_ms,created_at')
      .eq('delivery_id', deliveryId)
      .order('attempt'),
  )
/** Asks the dispatcher to send this person's due deliveries now. Resolves to its counts, or throws if it is not deployed. */
export async function deliverNow() {
  const { data, error } = await sb().functions.invoke('webhook-dispatch', { body: { action: 'flush' } })
  if (error)
    throw Object.assign(new Error('The webhook sender is not reachable. It may not be deployed yet (see docs/WEBHOOKS_API.md).'), {
      code: 'unreachable',
    })
  return data
}
export async function sendTest(endpointId) {
  await rpc('queue_webhook_test', { p_id: endpointId })
  return deliverNow()
}

// ------------------------------------------------------------------------------------------------------------------ system health (administrators)
export const isPlatformAdmin = async () => {
  if (!platformAvailable()) return false
  try {
    return Boolean(await rpc('is_platform_admin'))
  } catch {
    return false
  }
}
export const systemOverview = () => rpc('admin_system_overview')
export const systemMetrics = (hours = 24) => rpc('admin_system_metrics', { p_hours: hours })
export const systemErrors = ({ category, page = 0, pageSize = 20 } = {}) =>
  rpc('admin_system_errors', { p_limit: pageSize, p_offset: page * pageSize, p_category: category ?? null })

// ------------------------------------------------------------------------------------------------------------------ database performance (administrators)
export const dbOverview = (hours = 24) => rpc('admin_db_overview', { p_hours: hours })
export const dbQueryReport = (hours = 24) => rpc('admin_db_query_report', { p_hours: hours })

// ------------------------------------------------------------------------------------------------------------------ feature flags (administrators)
// Every change is checked and recorded by the database; after a write the flags this browser holds are dropped and fetched again.
const changed = async (promise) => {
  const out = await promise
  invalidateFlags()
  return out
}
export const adminFlags = () => rpc('admin_flags')
export const createFlag = ({ key, name, description, kind, module, defaultValue }) =>
  changed(
    rpc('admin_flag_create', {
      p_key: key,
      p_name: name,
      p_description: description ?? '',
      p_kind: kind ?? 'release',
      p_module: module || null,
      p_default: Boolean(defaultValue),
    }),
  )
export const updateFlag = (key, { name, description, module }) =>
  changed(rpc('admin_flag_update', { p_key: key, p_name: name, p_description: description ?? '', p_module: module || null }))
export const setFlagEnv = (key, env, patch, reason = '') =>
  changed(rpc('admin_flag_env_set', { p_key: key, p_env: env, p_patch: patch, p_reason: reason }))
export const archiveFlag = (key, archived, reason = '') =>
  changed(rpc('admin_flag_archive', { p_key: key, p_archived: archived, p_reason: reason }))
export const flagHistory = ({ key, page = 0, pageSize = 20 } = {}) =>
  rpc('admin_flag_history', { p_key: key ?? null, p_limit: pageSize, p_offset: page * pageSize })
export const rollbackFlag = (historyId, reason = '') => changed(rpc('admin_flag_rollback', { p_history_id: historyId, p_reason: reason }))
export const setControls = (patch, reason) => changed(rpc('admin_controls_set', { p_patch: patch, p_reason: reason }))
export const adminExperiments = () => rpc('admin_experiments')
export const saveExperiment = ({ key, flagKey, name, hypothesis, traffic, variants, primaryEvent }) =>
  rpc('admin_experiment_save', {
    p_key: key,
    p_flag_key: flagKey,
    p_name: name,
    p_hypothesis: hypothesis ?? '',
    p_traffic: traffic,
    p_variants: variants,
    p_primary_event: primaryEvent || 'conversion',
  })
export const setExperimentStatus = (key, status, reason = '') =>
  changed(rpc('admin_experiment_set_status', { p_key: key, p_status: status, p_reason: reason }))
export const experimentResults = (key) => rpc('admin_experiment_results', { p_key: key })

// The overview is expensive for the database (catalog scans, a few timed queries) and fine to be half a minute old: one load serves everyone who asks at once.
import { createCache, FRESHNESS } from '@lifetrack/core/cache'
const adminCache = createCache({ ttlMs: FRESHNESS.admin.ttlMs, maxEntries: 10 })
export const dbOverviewCached = (hours = 24, { force = false } = {}) =>
  adminCache.get(adminCache.key('dbperf', 'admin', 'overview', hours), () => dbOverview(hours), { ...FRESHNESS.admin, force })
export const dbQueryReportCached = (hours = 24, { force = false } = {}) =>
  adminCache.get(adminCache.key('dbperf', 'admin', 'queries', hours), () => dbQueryReport(hours), { ...FRESHNESS.admin, force })
export const dbCacheStats = () => adminCache.stats()
