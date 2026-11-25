// Plain-language descriptions of queued changes for the Sync Center.
const TITLE_FIELDS = ['title', 'name', 'description', 'text', 'content', 'category', 'log_date', 'entry_date', 'topic', 'company', 'role']
const pickTitle = (...sources) => {
  for (const src of sources) for (const f of TITLE_FIELDS) if (src?.[f] && typeof src[f] === 'string') return src[f]
  return null
}
const nice = (s) => String(s).replace(/_/g, ' ').replace(/s$/, '')

export function describeEntry(op) {
  const row = op.rows?.[0]
  const title = pickTitle(row, op.patch, op.base, op.conflict?.server) ?? `a ${nice(op.table)}`
  const what =
    {
      insert: `New ${nice(op.table)}`,
      update: `Edited ${nice(op.table)}`,
      upsert: `Saved ${nice(op.table)}`,
      remove: `Deleted ${nice(op.table)}`,
    }[op.kind] ?? 'Change'
  return { title, what }
}
export const fieldLabel = (key) =>
  String(key)
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
export const showValue = (v) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
export function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
