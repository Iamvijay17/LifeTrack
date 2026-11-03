// Small, dependency-free Markdown renderer that builds React elements (never raw HTML), so note content can't inject markup.
// Supports: # headings, **bold**, *italic*, `code`, fenced code, > quotes, - / 1. lists, - [ ] checklists, [links](https://…), --- rules.
import { Fragment } from 'react'
import { parseBlocks, tokenizeInline } from '@lifetrack/core/notes'

export function renderInline(text, keyPrefix = 'i') {
  return tokenizeInline(text).map((t, n) => {
    const key = `${keyPrefix}${n}`
    if (t.type === 'code')
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {t.text}
        </code>
      )
    if (t.type === 'bold') return <strong key={key}>{t.text}</strong>
    if (t.type === 'italic') return <em key={key}>{t.text}</em>
    if (t.type === 'link')
      return (
        <a key={key} href={t.url} target="_blank" rel="noopener noreferrer" className="text-secondary underline">
          {t.text}
        </a>
      )
    return t.text
  })
}

export { parseBlocks }

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
