// Notes & journal logic shared by web and mobile. Markdown is parsed to plain data here; each platform renders it
// with its own UI components (never raw HTML), so note content can't inject markup.
export { parseTags } from '@lifetrack/utils'

export const NOTE_CATEGORIES = ['General', 'Learning', 'Career', 'Ideas', 'Health', 'Finance', 'Personal']
export const JOURNAL_MOODS = [{ value: 1, label: 'Rough' }, { value: 2, label: 'Low' }, { value: 3, label: 'Okay' }, { value: 4, label: 'Good' }, { value: 5, label: 'Great' }]

const SAFE_URL = /^(https?:\/\/|mailto:)/i
export const isSafeUrl = (u) => SAFE_URL.test(u)

/** Inline Markdown → tokens: { type: 'text'|'code'|'bold'|'italic'|'link', text, url? }. Unsafe link targets degrade to text. */
export function tokenizeInline(text) {
  const out = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g
  let last = 0, m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    const t = m[0]
    if (m[1]) out.push({ type: 'code', text: t.slice(1, -1) })
    else if (m[2]) out.push({ type: 'bold', text: t.slice(2, -2) })
    else if (m[3]) out.push({ type: 'italic', text: t.slice(1, -1) })
    else {
      const [, label, url] = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(t)
      out.push(isSafeUrl(url) ? { type: 'link', text: label, url } : { type: 'text', text: label })
    }
    last = m.index + t.length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

/** Block parser → array of { type: h|p|quote|code|hr|ul|ol, ... }. */
export function parseBlocks(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      const body = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i++; blocks.push({ type: 'code', text: body.join('\n') }); continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) { blocks.push({ type: 'h', level: h[1].length, text: h[2] }); i++; continue }
    if (/^---+$/.test(line.trim())) { blocks.push({ type: 'hr' }); i++; continue }
    if (line.startsWith('>')) {
      const body = []
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: body.join(' ') }); continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line), items = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const raw = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '')
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(raw)
        items.push(task ? { text: task[2], checked: task[1] !== ' ' } : { text: raw })
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items }); continue
    }
    const body = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|---+$|\s*([-*]|\d+\.)\s)/.test(lines[i])) body.push(lines[i++])
    blocks.push({ type: 'p', text: body.join(' ') })
  }
  return blocks
}

export const noteCategories = (notes) => [...new Set(notes.map((n) => n.category))].sort()
export const noteTags = (notes) => [...new Set(notes.flatMap((n) => n.tags ?? []))].sort()
/** Pinned first, then most recently updated; filtered by text, category and tag. */
export function filterNotes(notes, { q = '', category = '', tag = '' } = {}) {
  const s = q.trim().toLowerCase()
  return notes
    .filter((n) => (!category || n.category === category) && (!tag || (n.tags ?? []).includes(tag)) && (!s || `${n.title} ${n.body} ${(n.tags ?? []).join(' ')}`.toLowerCase().includes(s)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
}
/** Plain-text preview of a Markdown body for list cards. */
export const notePreview = (body) => body.replace(/[#*`>\-\[\]]/g, '').trim()

// ---- journal
export const journalDraft = (entry) => ({ mood: entry?.mood ?? null, content: entry?.content ?? '', wins: entry?.wins ?? '' })
export const journalDirty = (form, entry) => { const d = journalDraft(entry); return form.mood !== d.mood || form.content !== d.content || form.wins !== d.wins }
export const journalCanSave = (form, entry) => journalDirty(form, entry) && (!!form.content.trim() || !!form.wins.trim() || form.mood != null)
