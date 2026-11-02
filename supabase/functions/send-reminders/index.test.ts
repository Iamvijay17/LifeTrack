// Runs the real Edge Function under Deno with the network stubbed. Run:  deno test --config deno.json --allow-env --allow-net --allow-read index.test.ts
import { assertEquals } from 'jsr:@std/assert@1'

const SB = 'https://project.supabase.co'
Deno.env.set('SUPABASE_URL', SB)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role') // test value only
Deno.env.set('CRON_SECRET', 'cron-secret-123')

type Call = { method: string; url: string; body?: unknown }
const calls: Call[] = []
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })

// Reminder due at 09:00 IST on 2 Nov 2026 (= 03:30Z); "now" is faked by stubbing Date.
const NOW = Date.parse('2026-11-02T03:30:00Z')
const RealDate = Date
class FakeDate extends RealDate {
  // deno-lint-ignore no-explicit-any
  constructor(...a: any[]) { super(...((a.length ? a : [NOW]) as [number])) }
  static override now() { return NOW }
}
// deno-lint-ignore no-explicit-any
;(globalThis as any).Date = FakeDate

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  calls.push({ method, url, body })
  if (url.startsWith(`${SB}/rest/v1/reminders`) && method === 'GET') return json([{ id: 'r1', user_id: 'u1', kind: 'task', title: 'Pay rent', remind_date: '2026-11-02', remind_time: '09:00', repeat: 'none', active: true, last_fired_on: null }])
  if (url.startsWith(`${SB}/rest/v1/user_settings`)) return json([{ user_id: 'u1', timezone: 'Asia/Kolkata', notification_prefs: {} }])
  if (url.startsWith(`${SB}/rest/v1/notifications`) && method === 'POST') return json({ id: 'n1', user_id: 'u1', kind: 'task', title: 'Pay rent', body: '', link: '/planner' }, 201)
  if (url.startsWith(`${SB}/rest/v1/reminders`) && method === 'PATCH') return json([{ id: 'r1' }])
  if (url.startsWith(`${SB}/rest/v1/device_push_tokens`) && method === 'GET') return json([{ user_id: 'u1', token: 'ExpoPushToken[abc]' }])
  if (url === 'https://exp.host/--/api/v2/push/send') return json({ data: [{ status: 'ok' }] })
  return realFetch(input, init)
}) as typeof fetch

await import('./index.ts') // starts Deno.serve on the default port; we call its handler through a local request below
const port = 8000

Deno.test('rejects requests without the cron secret (fails closed)', async () => {
  const noAuth = await realFetch(`http://localhost:${port}/`, { method: 'POST' })
  assertEquals(noAuth.status, 401); await noAuth.body?.cancel()
  const wrong = await realFetch(`http://localhost:${port}/`, { method: 'POST', headers: { Authorization: 'Bearer nope' } })
  assertEquals(wrong.status, 401); await wrong.body?.cancel()
})

Deno.test('fires a due reminder end to end: REST queries, notification insert, reminder advance, Expo push', async () => {
  const res = await realFetch(`http://localhost:${port}/`, { method: 'POST', headers: { Authorization: 'Bearer cron-secret-123' } })
  const stats = await res.json()
  assertEquals(res.status, 200)
  assertEquals(stats, { checked: 1, fired: 1, skippedByPrefs: 0, duplicates: 0, pushed: 1, pushErrors: 0, tokensRemoved: 0 })

  const insert = calls.find((c) => c.method === 'POST' && c.url.includes('/rest/v1/notifications'))!
  assertEquals(insert.body, { user_id: 'u1', kind: 'task', title: 'Pay rent', link: '/planner', dedupe_key: 'reminder:r1:2026-11-02' })
  const patch = calls.find((c) => c.method === 'PATCH')!
  assertEquals(patch.body, { last_fired_on: '2026-11-02', active: false })
  assertEquals(calls.some((c) => c.url.includes('active=eq.true') && c.url.includes('remind_date=lte.2026-11-03')), true)
  const expo = calls.find((c) => c.url.includes('exp.host'))!
  assertEquals((expo.body as { to: string }[])[0].to, 'ExpoPushToken[abc]')
  assertEquals((expo.body as { data: { link: string } }[])[0].data.link, '/planner')
})
