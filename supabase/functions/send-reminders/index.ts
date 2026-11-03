// Supabase Edge Function (Deno). Runs every minute (see docs/NATIVE.md): turns due reminders into notifications and pushes them
// to the user's devices via Expo. Deploy with:  supabase functions deploy send-reminders --no-verify-jwt
// Required secrets (supabase secrets set …): CRON_SECRET. Optional: EXPO_ACCESS_TOKEN (if "enhanced push security" is on).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions by Supabase itself and never leave the server.
import { createClient } from '@supabase/supabase-js'
import { runReminders } from './logic.js'
import { afterFire, dueReminders, KIND_LINK } from '../_shared/reminders.js'
import { timeStrInTz, todayStr } from '../_shared/dates.ts'

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!secret || !timingSafeEqual(given, secret)) return new Response('unauthorized', { status: 401 }) // fails closed when unset

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const must = <T>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data as T }

  const db = {
    listActiveReminders: async (maxDate: string) => must(await sb.from('reminders').select('*').eq('active', true).lte('remind_date', maxDate)),
    listSettings: async (ids: string[]) => {
      if (!ids.length) return new Map()
      const rows = must(await sb.from('user_settings').select('user_id,timezone,notification_prefs').in('user_id', ids)) as any[]
      return new Map(rows.map((r) => [r.user_id, r]))
    },
    insertNotification: async (row: Record<string, unknown>) => {
      const { data, error } = await sb.from('notifications').insert(row).select().single()
      if (error) { if (error.code === '23505') return null; throw new Error(error.message) } // duplicate dedupe_key: already notified
      return data
    },
    updateReminder: async (id: string, patch: Record<string, unknown>) => { must(await sb.from('reminders').update(patch).eq('id', id).select('id')) },
    listTokens: async (ids: string[]) => must(await sb.from('device_push_tokens').select('user_id,token').in('user_id', ids)),
    deleteTokens: async (tokens: string[]) => { must(await sb.from('device_push_tokens').delete().in('token', tokens).select('id')) },
  }
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  const push = {
    send: async (messages: unknown[]) => {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}) },
        body: JSON.stringify(messages),
      })
      if (!res.ok) throw new Error(`Expo push ${res.status}`)
      return (await res.json()).data
    },
  }

  try {
    const stats = await runReminders({ db, push, core: { afterFire, dueReminders, KIND_LINK, timeStrInTz, todayStr } })
    return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
