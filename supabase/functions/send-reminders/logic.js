// Pure reminder → notification → push pipeline. No imports and no I/O: everything is injected, so it runs the same in
// Deno (index.ts) and in Node tests. The reminder rules themselves come from @lifetrack/core via `core` (see scripts/sync-function-core.mjs).

export const CHUNK = 100 // Expo accepts up to 100 messages per request

/**
 * @param deps.db   { listActiveReminders(maxDate), listSettings(userIds), insertNotification(row), updateReminder(id, patch), listTokens(userIds), deleteTokens(tokens) }
 *                  insertNotification returns the inserted row, or null when the dedupe key already exists.
 * @param deps.push { send(messages) → Promise<Array<{status:'ok'|'error', details?:{error?:string}}>> } (same order as messages)
 * @param deps.core { dueReminders, afterFire, KIND_LINK, todayStr, timeStrInTz }
 */
export async function runReminders({ db, push, core, nowMs = Date.now() }) {
  const now = new Date(nowMs)
  // Anything due in the user's local time is on or before (UTC today + 1): covers every timezone up to UTC+14.
  const maxDate = new Date(nowMs + 86_400_000).toISOString().slice(0, 10)
  const reminders = await db.listActiveReminders(maxDate)
  const settings = await db.listSettings([...new Set(reminders.map((r) => r.user_id))])

  const stats = { checked: reminders.length, fired: 0, skippedByPrefs: 0, duplicates: 0, pushed: 0, pushErrors: 0, tokensRemoved: 0 }
  const created = [] // newly inserted notifications to push

  for (const r of reminders) {
    const s = settings.get(r.user_id)
    const tz = s?.timezone || 'Asia/Kolkata'
    const today = core.todayStr(tz, now)
    const nowTime = core.timeStrInTz(now, tz)
    if (core.dueReminders([r], today, nowTime).length === 0) continue

    const prefs = s?.notification_prefs ?? {}
    if (prefs[r.kind] !== false) {
      const row = await db.insertNotification({ user_id: r.user_id, kind: r.kind, title: r.title, link: core.KIND_LINK[r.kind] ?? '', dedupe_key: `reminder:${r.id}:${today}` })
      if (row) { created.push(row); stats.fired++ } else stats.duplicates++
    } else stats.skippedByPrefs++
    // Always advance the reminder (one-off → inactive, repeating → next date), exactly like the app does.
    await db.updateReminder(r.id, core.afterFire(r, today))
  }

  if (created.length) {
    const tokens = await db.listTokens([...new Set(created.map((n) => n.user_id))])
    const byUser = new Map()
    for (const t of tokens) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token])
    const messages = created.flatMap((n) => (byUser.get(n.user_id) ?? []).map((to) => ({
      to, title: n.title, body: n.body || '', sound: 'default', priority: 'high', channelId: 'reminders',
      data: { notificationId: n.id, kind: n.kind, link: n.link },
    })))
    const dead = new Set()
    for (let i = 0; i < messages.length; i += CHUNK) {
      const batch = messages.slice(i, i + CHUNK)
      let tickets
      try { tickets = await push.send(batch) } catch { stats.pushErrors += batch.length; continue } // inbox rows are saved; push is best-effort
      tickets.forEach((t, k) => {
        if (t.status === 'ok') stats.pushed++
        else { stats.pushErrors++; if (t.details?.error === 'DeviceNotRegistered') dead.add(batch[k].to) }
      })
    }
    if (dead.size) { await db.deleteTokens([...dead]); stats.tokensRemoved = dead.size }
  }
  return stats
}
