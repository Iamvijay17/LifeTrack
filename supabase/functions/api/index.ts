// Supabase Edge Function (Deno): the public LifeTrack REST API and its health checks. All decisions are in logic.js (tested in Node); this file only
// connects it to the database. Deploy WITHOUT Supabase's JWT check (callers authenticate with a LifeTrack API key instead):
//   supabase functions deploy api --no-verify-jwt
// URL: https://<project-ref>.supabase.co/functions/v1/api/v1/tasks   (health: /functions/v1/api/health, /health/live, /health/ready)
// Optional secrets: API_SLOW_MS (a request slower than this counts as slow in System Health; default 1000), API_BASE_URL (shown in the OpenAPI document).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself and never leave the server.
import { createClient } from '@supabase/supabase-js'
import { handleApiRequest } from './logic.js'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
  global: { headers: { 'x-lifetrack-source': 'api' } }, // the audit log records these writes as coming from the API
})
const must = <T>(r: { data: T | null; error: { message: string; code?: string } | null }) => {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as T
}

const store = {
  authenticate: async (hash: string) => must(await sb.rpc('api_authenticate', { p_hash: hash })),
  rateHit: async (keyId: string, limit: number) => must(await sb.rpc('api_rate_hit', { p_key: keyId, p_limit: limit })),
  record: async (r: any) =>
    must(await sb.rpc('api_record', { p_key: r.keyId, p_user: r.userId, p_request_id: r.requestId, p_method: r.method, p_path: r.path, p_status: r.status, p_ms: r.ms, p_error: r.error, p_slow_ms: r.slowMs })),
  ready: async () => Boolean(must(await sb.rpc('api_ready'))),
  list: async (table: string, userId: string, o: any) => {
    let q = sb.from(table).select(o.columns.join(',')).eq('user_id', userId)
    for (const [k, v] of Object.entries(o.filters)) q = q.eq(k, v as string)
    if (o.updatedSince) q = q.gte('updated_at', o.updatedSince)
    if (o.cursor) q = q.or(`created_at.lt.${o.cursor.createdAt},and(created_at.eq.${o.cursor.createdAt},id.lt.${o.cursor.id})`)
    return must(await q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(o.limit)) as any[]
  },
  get: async (table: string, userId: string, id: string, columns: string[]) => must(await sb.from(table).select(columns.join(',')).eq('user_id', userId).eq('id', id).maybeSingle()),
  insert: async (table: string, userId: string, values: Record<string, unknown>, columns: string[]) =>
    must(await sb.from(table).insert({ ...values, user_id: userId }).select(columns.join(',')).single()),
  update: async (table: string, userId: string, id: string, values: Record<string, unknown>, columns: string[]) =>
    must(await sb.from(table).update(values).eq('user_id', userId).eq('id', id).select(columns.join(',')).maybeSingle()),
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const at = url.pathname.indexOf('/api')
  const path = at >= 0 ? url.pathname.slice(at + 4) || '/' : url.pathname
  const method = req.method.toUpperCase()
  const bodyText = method === 'POST' || method === 'PATCH' ? await req.text() : null
  const out = await handleApiRequest(
    { method, path, query: url.searchParams, headers: (n: string) => req.headers.get(n), bodyText },
    { store, env: { API_SLOW_MS: Deno.env.get('API_SLOW_MS') ?? '', API_BASE_URL: Deno.env.get('API_BASE_URL') ?? '' } },
  )
  return new Response(JSON.stringify(out.body), { status: out.status, headers: out.headers })
})
