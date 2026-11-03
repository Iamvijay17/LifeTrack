// Pure note helpers (no React, no Supabase).
export const NOTE_CATEGORIES = ['General', 'Learning', 'Career', 'Ideas', 'Health', 'Finance', 'Personal']

/** "#React, react , Interview,," -> ['react', 'interview'] (lower-cased, de-duplicated, max 12). */
export const parseTags = (s) =>
  [
    ...new Set(
      String(s ?? '')
        .split(',')
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ].slice(0, 12)

export const noteCategories = (notes) => [...new Set(notes.map((n) => n.category))].sort()
export const noteTags = (notes) => [...new Set(notes.flatMap((n) => n.tags ?? []))].sort()

/** Filter by category / tag / free text (title, body, tags); pinned first, then most recently updated. */
export function filterNotes(notes, { q = '', category = '', tag = '' } = {}) {
  const s = q.trim().toLowerCase()
  return notes
    .filter(
      (n) =>
        (!category || n.category === category) &&
        (!tag || (n.tags ?? []).includes(tag)) &&
        (!s || `${n.title} ${n.body} ${(n.tags ?? []).join(' ')}`.toLowerCase().includes(s)),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
}

/** Plain-text preview of Markdown for cards. */
export const notePreview = (body) => body.replace(/[#*`>[\]-]/g, '').trim()
