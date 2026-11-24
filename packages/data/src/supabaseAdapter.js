import { getUserId } from './session'
import { AppError, toAppError } from './errors'
import { ALL_TABLES } from '@lifetrack/constants/schema'

// Stable paging order per table (application_history has changed_at, not created_at).
const ORDER_COLUMN = { application_history: 'changed_at' }
const PAGE = 1000 // PostgREST returns at most 1000 rows per request: page through everything.
const DELETE_SLICE = 100 // ids per delete request (~4 KB of URL)

const check = ({ data, error }) => {
  if (error) throw toAppError(error)
  return data
}
// A row that Row Level Security lets you see but not delete (a module locked by another device or the server's auto-lock) makes a delete
// report 0 rows instead of an error. Anything the delete did not return is looked up again: still there means it was refused.
const NOT_DELETED = () => new AppError('This could not be deleted. It may be locked: unlock it and try again.', { code: '42501' })
const confirmDeleted = async (supabase, table, asked, deleted) => {
  if (deleted.length >= asked.length) return
  const done = new Set(deleted.map((r) => r.id))
  const left = check(await supabase.from(table).select('id').in('id', asked.filter((id) => !done.has(id))))
  if (left.length) throw NOT_DELETED()
}
const CONFLICT = () => new AppError('This record was changed somewhere else.', { code: 'CONFLICT' })
const guard = async (fn) => {
  try {
    return await fn()
  } catch (e) {
    throw toAppError(e)
  }
}

/** Data adapter over a Supabase client. The client is injected so web and mobile can configure it differently. */
export const createSupabaseAdapter = (supabase) => ({
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
      // Offset paging while another device inserts can return a row on two pages: keep each id once so nothing is counted twice.
      const seen = new Set()
      return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    }),

  insert: (table, rows) =>
    guard(async () => {
      // user_id is filled by the column default (auth.uid()) and enforced by RLS; the client never sets it.
      const list = rows.map(({ user_id: _ignored, ...r }) => r)
      return check(await supabase.from(table).insert(list).select())
    }),

  /** One row by id, or null. Used by the offline sync engine to look at the server's current version. */
  get: (table, id) => guard(async () => check(await supabase.from(table).select('*').eq('id', id).maybeSingle()) ?? null),

  /** Rows matching column = value for every key of `match` (RLS already limits them to this user). */
  find: (table, match) =>
    guard(async () => {
      let q = supabase.from(table).select('*')
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
      return check(await q)
    }),

  // `ifUpdatedAt` makes the write conditional on the row not having changed since the caller last saw it (optimistic concurrency):
  // if it has, nothing is written and a CONFLICT error says so. The timestamp is passed back exactly as the server sent it.
  update: (table, id, patch, { ifUpdatedAt } = {}) =>
    guard(async () => {
      const { user_id, id: _id, ...clean } = patch
      if (!ifUpdatedAt) return check(await supabase.from(table).update(clean).eq('id', id).select().single())
      const rows = check(await supabase.from(table).update(clean).eq('id', id).eq('updated_at', ifUpdatedAt).select())
      if (!rows.length) throw CONFLICT()
      return rows[0]
    }),

  upsert: (table, rows, { onConflict = 'id', ignoreDuplicates = false } = {}) =>
    guard(async () => {
      const list = rows.map(({ user_id: _ignored, ...r }) => r)
      return check(await supabase.from(table).upsert(list, { onConflict, ignoreDuplicates }).select())
    }),

  remove: (table, id, { ifUpdatedAt } = {}) =>
    guard(async () => {
      if (!ifUpdatedAt) return void (await confirmDeleted(supabase, table, [id], check(await supabase.from(table).delete().eq('id', id).select('id'))))
      const gone = check(await supabase.from(table).delete().eq('id', id).eq('updated_at', ifUpdatedAt).select('id'))
      if (gone.length) return
      // Nothing deleted: the row is already gone (fine), or it changed (or is locked): the caller looks at the row to tell which.
      const left = check(await supabase.from(table).select('id').eq('id', id))
      if (left.length) throw CONFLICT()
    }),

  // The ids travel in the URL (`id=in.(…)`), so a long list is sent in slices: a few hundred uuids would pass the gateway's URL limit.
  removeMany: (table, ids) =>
    guard(async () => {
      for (let i = 0; i < ids.length; i += DELETE_SLICE) {
        const slice = ids.slice(i, i + DELETE_SLICE)
        await confirmDeleted(supabase, table, slice, check(await supabase.from(table).delete().in('id', slice).select('id')))
      }
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
})
