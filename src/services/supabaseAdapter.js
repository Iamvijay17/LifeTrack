import { supabase } from '@/lib/supabase'
import { getUserId } from './session'
import { toAppError } from './errors'

const PAGE = 1000 // PostgREST returns at most 1000 rows per request: page through everything.

const check = ({ data, error }) => {
  if (error) throw toAppError(error)
  return data
}
const guard = async (fn) => {
  try { return await fn() } catch (e) { throw toAppError(e) }
}

export const supabaseAdapter = {
  name: 'supabase',

  list: (table) => guard(async () => {
    const rows = []
    for (let from = 0; ; from += PAGE) {
      const data = check(await supabase.from(table).select('*').order('created_at', { ascending: true }).order('id').range(from, from + PAGE - 1))
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }),

  insert: (table, rows) => guard(async () => {
    const list = rows.map((r) => ({ ...r, user_id: getUserId() }))
    return check(await supabase.from(table).insert(list).select())
  }),

  update: (table, id, patch) => guard(async () => {
    const { user_id, id: _id, ...clean } = patch
    return check(await supabase.from(table).update(clean).eq('id', id).select().single())
  }),

  upsert: (table, rows, { onConflict = 'id', ignoreDuplicates = false } = {}) => guard(async () => {
    const list = rows.map((r) => ({ ...r, user_id: getUserId() }))
    return check(await supabase.from(table).upsert(list, { onConflict, ignoreDuplicates }).select())
  }),

  remove: (table, id) => guard(async () => {
    check(await supabase.from(table).delete().eq('id', id).select('id'))
  }),

  removeMany: (table, ids) => guard(async () => {
    if (ids.length) check(await supabase.from(table).delete().in('id', ids).select('id'))
  }),

  /** Realtime: one channel for all public tables. Row Level Security filters what this user receives. */
  subscribe: (onChange, onStatus) => {
    const channel = supabase
      .channel('lifetrack-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, (p) => onChange(p.table))
      .subscribe((status) => onStatus?.(status))
    return () => { supabase.removeChannel(channel) }
  },
}
