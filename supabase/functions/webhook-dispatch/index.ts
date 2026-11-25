// Supabase Edge Function (Deno): sends the queued webhook deliveries. Two callers:
//   * the scheduler (every minute): `Authorization: Bearer <CRON_SECRET>` sends everything that is due and runs the daily retention clean-up;
//   * the signed-in app ("Deliver now", "Send test"): a user's own access token sends only that person's due deliveries.
// Deploy with:  supabase functions deploy webhook-dispatch --no-verify-jwt     (the function checks the caller itself, so both callers work)
// Schedule it like send-reminders (docs/WEBHOOKS_API.md): a Supabase Cron / pg_cron job that POSTs here each minute with the CRON_SECRET.
// Secrets: CRON_SECRET (required for the scheduler; unset = only signed-in users can flush their own). Optional: WEBHOOK_ALLOW_HTTP=true (development only),
// RETAIN_API_LOG_DAYS, RETAIN_METRICS_DAYS, RETAIN_ERROR_DAYS, RETAIN_JOB_DAYS, RETAIN_WEBHOOK_DAYS, RETAIN_AUDIT_DAYS (0 keeps audit history forever).
import { createClient } from '@supabase/supabase-js'
import { runDispatch } from './logic.js'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const must = <T>(r: { data: T | null; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}
const equal = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const store = {
  claim: async (limit: number, userId: string | null) => (must(await sb.rpc('claim_webhook_deliveries', { p_limit: limit, p_user: userId })) as any[]) ?? [],
  complete: async (r: any) =>
    must(await sb.rpc('complete_webhook_delivery', { p_id: r.id, p_ok: r.ok, p_status: r.status, p_error: r.error, p_duration_ms: r.durationMs, p_next: r.next, p_dead: r.dead })),
  lastJobRun: async (job: string) => {
    const rows = must(await sb.from('job_runs').select('started_at').eq('job', job).eq('status', 'ok').order('started_at', { ascending: false }).limit(1)) as any[]
    return rows[0]?.started_at ?? null
  },
  recordJob: async (job: string, status: string, ms: number, detail: string, error: string) =>
    must(await sb.rpc('record_job_run', { p_job: job, p_status: status, p_duration_ms: ms, p_detail: detail, p_error: error })),
  purge: async (args: Record<string, number>) => must(await sb.rpc('purge_platform_data', args)) as Record<string, number>,
}

// Resolves a host name to its addresses (A and AAAA), so every one can be checked before anything is sent.
const resolve = async (host: string) => {
  const [a, aaaa] = await Promise.allSettled([Deno.resolveDns(host, 'A'), Deno.resolveDns(host, 'AAAA')])
  return [...(a.status === 'fulfilled' ? a.value : []), ...(aaaa.status === 'fulfilled' ? aaaa.value : [])]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'method_not_allowed' })
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  let userId: string | null = null
  if (secret && equal(token, secret)) {
    userId = null // the scheduler
  } else {
    const { data, error } = token ? await sb.auth.getUser(token) : { data: null, error: new Error('none') }
    if (error || !data?.user) return reply(401, { ok: false, error: 'unauthorized' })
    userId = data.user.id
  }
  try {
    const env = Object.fromEntries(
      ['WEBHOOK_ALLOW_HTTP', 'RETAIN_API_LOG_DAYS', 'RETAIN_METRICS_DAYS', 'RETAIN_ERROR_DAYS', 'RETAIN_JOB_DAYS', 'RETAIN_WEBHOOK_DAYS', 'RETAIN_AUDIT_DAYS'].map((k) => [k, Deno.env.get(k) ?? '']),
    )
    const result = await runDispatch({ userId, limit: userId ? 25 : 50 }, { store, fetch: (u: string, i?: RequestInit) => fetch(u, i), resolve, env })
    return reply(200, { ok: true, ...result })
  } catch {
    return reply(500, { ok: false, error: 'server_error' })
  }
})
