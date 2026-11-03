import { supabase } from '@/lib/supabase'
import { getUserId } from './session'
import { toAppError } from './errors'
import { ALL_TABLES } from './schema'

// Stable paging order per table (application_history has changed_at, not created_at).
const ORDER_COLUMN = { application_history: 'changed_at' }
const PAGE = 1000 // PostgREST returns at most 1000 rows per request: page through everything.

const check = ({ data, error }) => {
  if (error) throw toAppError(error)
  return data
}
const guard = async (fn) => {
  try {
    return await fn()
  } catch (e) {
    throw toAppError(e)
  }
}

export const supabaseAdapter = {
  name: 'supabase',

  list: (table) =>
    guard(async () => {
      const rows = []
      for (let from = 0; ; from += PAGE) {
        const data = check(
          await supabase
            .from(table)
            .select('*')
            .order(ORDER_COLUMN[table] ?? 'created_at', { ascending: true })
            .order('id')
            .range(from, from + PAGE - 1),
        )
        rows.push(...data)
        if (data.length < PAGE) break
      }
      return rows
    }),

  insert: (table, rows) =>
    guard(async () => {
      // user_id is filled by the column default (auth.uid()) and enforced by RLS; the client never sets it.
      const list = rows.map(({ user_id: _ignored, ...r }) => r)
      return check(await supabase.from(table).insert(list).select())
    }),

  update: (table, id, patch) =>
    guard(async () => {
      const { user_id, id: _id, ...clean } = patch
      return check(await supabase.from(table).update(clean).eq('id', id).select().single())
    }),

  upsert: (table, rows, { onConflict = 'id', ignoreDuplicates = false } = {}) =>
    guard(async () => {
      const list = rows.map(({ user_id: _ignored, ...r }) => r)
      return check(await supabase.from(table).upsert(list, { onConflict, ignoreDuplicates }).select())
    }),

  remove: (table, id) =>
    guard(async () => {
      check(await supabase.from(table).delete().eq('id', id).select('id'))
    }),

  removeMany: (table, ids) =>
    guard(async () => {
      if (ids.length) check(await supabase.from(table).delete().in('id', ids).select('id'))
    }),

  /** Calls a database function (security invoker, so RLS still applies). */
  rpc: (name, args) => guard(async () => check(await supabase.rpc(name, args))),

  /**
   * Realtime: one channel, one binding per table. INSERT/UPDATE are filtered to this user's rows server-side.
   * DELETE can't be filtered (the old row only carries its primary key), so it is subscribed unfiltered and carries ids only.
   */
  subscribe: (onChange, onStatus) => {
    const uid = getUserId()
    let channel = supabase.channel('lifetrack-changes')
    for (const table of ALL_TABLES) {
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `user_id=eq.${uid}` }, (p) => onChange(table, p))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `user_id=eq.${uid}` }, (p) => onChange(table, p))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => onChange(table, p))
    }
    channel.subscribe((status) => onStatus?.(status))
    return () => {
      supabase.removeChannel(channel)
    }
  },
}
