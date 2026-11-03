// Small, dependency-free Markdown renderer that builds React elements (never raw HTML), so note content can't inject markup.
// Supports: # headings, **bold**, *italic*, `code`, fenced code, > quotes, - / 1. lists, - [ ] checklists, [links](https://…), --- rules.
import { Fragment } from 'react'

const SAFE_URL = /^(https?:\/\/|mailto:)/i

export function renderInline(text, keyPrefix = 'i') {
  const out = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g
  let last = 0,
    m,
    n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0],
      key = `${keyPrefix}${n++}`
    if (m[1])
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {t.slice(1, -1)}
        </code>,
      )
    else if (m[2]) out.push(<strong key={key}>{t.slice(2, -2)}</strong>)
    else if (m[3]) out.push(<em key={key}>{t.slice(1, -1)}</em>)
    else {
      const [, label, url] = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(t)
      out.push(
        SAFE_URL.test(url) ? (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="text-secondary underline">
            {label}
          </a>
        ) : (
          label
        ),
      )
    }
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Block parser → array of { type, ... } (exported for tests). */
export function parseBlocks(src) {
  const lines = String(src ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const blocks = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const body = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({ type: 'h', level: h[1].length, text: h[2] })
      i++
      continue
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }
    if (line.startsWith('>')) {
      const body = []
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: body.join(' ') })
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line),
        items = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const raw = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '')
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(raw)
        items.push(task ? { text: task[2], checked: task[1] !== ' ' } : { text: raw })
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }
    const body = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|---+$|\s*([-*]|\d+\.)\s)/.test(lines[i])) body.push(lines[i++])
    blocks.push({ type: 'p', text: body.join(' ') })
  }
  return blocks
}

export function Markdown({ source, className }) {
  const blocks = parseBlocks(source)
  if (!blocks.length) return <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
  return (
    <div className={`space-y-2.5 text-sm leading-relaxed ${className ?? ''}`}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const Tag = `h${b.level + 1}`
          return (
            <Tag key={i} className={b.level === 1 ? 'text-lg font-semibold' : 'text-base font-semibold'}>
              {renderInline(b.text, `h${i}`)}
            </Tag>
          )
        }
        if (b.type === 'p') return <p key={i}>{renderInline(b.text, `p${i}`)}</p>
        if (b.type === 'quote')
          return (
            <blockquote key={i} className="border-l-2 border-primary/60 pl-3 text-muted-foreground">
              {renderInline(b.text, `q${i}`)}
            </blockquote>
          )
        if (b.type === 'code')
          return (
            <pre key={i} className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              <code>{b.text}</code>
            </pre>
          )
        if (b.type === 'hr') return <hr key={i} className="border-border" />
        const List = b.type === 'ol' ? 'ol' : 'ul'
        return (
          <List key={i} className={`space-y-1 pl-5 ${b.type === 'ol' ? 'list-decimal' : 'list-disc'}`}>
            {b.items.map((it, j) => (
              <li key={j} className={it.checked != null ? 'list-none -ml-5 flex items-start gap-2' : undefined}>
                {it.checked != null && (
                  <input
                    type="checkbox"
                    checked={it.checked}
                    readOnly
                    aria-label={it.checked ? 'done' : 'not done'}
                    className="mt-1 accent-[rgb(var(--primary))]"
                  />
                )}
                <Fragment>{renderInline(it.text, `l${i}${j}`)}</Fragment>
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
