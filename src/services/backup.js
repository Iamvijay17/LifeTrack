import { z } from 'zod'
import { db } from './db'
import * as store from '@/hooks/store'
import { ALL_TABLES, CONFLICT_KEYS, TABLES } from './schema'
import { AppError } from './errors'

export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024
export const MAX_ROWS_PER_TABLE = 200_000

/** Full export, read straight from the database (not the cache) so it is always complete. */
export async function buildExport() {
  const tables = {}
  for (const t of ALL_TABLES) tables[t] = await db.list(t)
  return { app: 'lifetrack', version: BACKUP_VERSION, exported_at: new Date().toISOString(), tables }
}

const envelope = z.object({
  app: z.literal('lifetrack', { error: 'This is not a LifeTrack backup file.' }),
  version: z.number().int().max(BACKUP_VERSION, 'This backup was made by a newer version of LifeTrack.'),
  tables: z.record(z.string(), z.array(z.object({ id: z.string().min(1) }).passthrough()).max(MAX_ROWS_PER_TABLE, 'A table in this backup has too many rows.')),
})

export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES) throw new AppError('That backup file is too large.')
  let json
  try { json = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw new AppError('That file is not valid JSON.') }
  const r = envelope.safeParse(json)
  if (!r.success) throw new AppError(r.error.issues[0].message)
  const unknown = Object.keys(r.data.tables).filter((t) => !ALL_TABLES.includes(t))
  if (unknown.length) throw new AppError(`Unknown table(s) in backup: ${unknown.join(', ')}`)
  return r.data
}

export const summarizeBackup = (b) => Object.entries(b.tables).filter(([, rows]) => rows.length).map(([t, rows]) => ({ table: t, count: rows.length }))

const CHUNK = 200
const strip = ({ user_id, ...row }) => row

// Tables with a natural unique key (e.g. one health log per date, one topic per name). When the target account already
// has a row with that key (like the default topics created on first sign-in) we merge INTO the existing row (backup values
// win) instead of failing, and remap any foreign keys that pointed at the backup's id.
const NATURAL = ['learning_topics', 'exercises', 'health_logs', 'journal_entries', 'body_measurements', 'budgets']
const FK_REMAP = { goals: { topic_id: 'learning_topics' }, study_sessions: { topic_id: 'learning_topics' }, exercise_logs: { exercise_id: 'exercises' } }
const naturalKey = (table, row) => CONFLICT_KEYS[table].split(',').filter((c) => c !== 'user_id').map((c) => row[c]).join('\u0001')

/**
 * Restore = merge: rows are upserted by id into the CURRENT account (ownership is re-stamped),
 * so importing never deletes anything and running it twice is harmless. If it fails part-way,
 * the error names the table and the same file can simply be imported again to finish.
 */
export async function importBackup(backup, onProgress) {
  const order = [...TABLES.filter((t) => backup.tables[t]?.length), ...(backup.tables.user_settings?.length ? ['user_settings'] : [])]
  let done = 0
  const total = order.reduce((a, t) => a + backup.tables[t].length, 0)
  const remap = { learning_topics: new Map(), exercises: new Map() }
  for (const table of order) {
    let rows = backup.tables[table].map(strip)
    try {
      if (NATURAL.includes(table)) {
        const existing = new Map((await db.list(table)).map((r) => [naturalKey(table, r), r.id]))
        rows = rows.map((r) => {
          const id = existing.get(naturalKey(table, r))
          if (id && id !== r.id) { remap[table]?.set(r.id, id); return { ...r, id } }
          return r
        })
      }
      for (const [col, target] of Object.entries(FK_REMAP[table] ?? {})) {
        rows = rows.map((r) => (r[col] && remap[target].has(r[col]) ? { ...r, [col]: remap[target].get(r[col]) } : r))
      }
      if (table === 'user_settings') {
        const { id, created_at, updated_at, ...s } = rows[0]
        await store.upsert('user_settings', s, { onConflict: 'user_id' })
      } else {
        for (let i = 0; i < rows.length; i += CHUNK) await store.upsert(table, rows.slice(i, i + CHUNK), { onConflict: 'id' })
      }
    } catch (e) {
      throw new AppError(`Import stopped at "${table}": ${e.message} Nothing was deleted; you can import the same file again to continue.`, { cause: e })
    }
    done += rows.length
    onProgress?.(done, total, table)
  }
  // The DB trigger writes a "created as" history row for each newly inserted application; drop those duplicates
  // when the backup carries its own history for the same application.
  if (backup.tables.application_history?.length) {
    const backupIds = new Set(backup.tables.application_history.map((h) => h.id))
    const hasOwn = new Set(backup.tables.application_history.filter((h) => !h.from_status).map((h) => h.application_id))
    const all = await db.list('application_history')
    const extra = all.filter((h) => !h.from_status && hasOwn.has(h.application_id) && !backupIds.has(h.id)).map((h) => h.id)
    if (extra.length) await store.removeMany('application_history', extra)
  }
  await store.refetchLoaded()
}
