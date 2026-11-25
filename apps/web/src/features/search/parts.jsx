import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  BookOpen,
  Bell,
  Briefcase,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  Dumbbell,
  GraduationCap,
  Library,
  NotebookPen,
  Repeat,
  Salad,
  Target,
  Wallet,
} from 'lucide-react'
import { highlightParts, SOURCE_BY_KIND } from '@lifetrack/core/globalSearch'
import { Badge, Skeleton } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Popup, usePopup } from '@/components/ui/popup'
import { cn } from '@/lib/utils'

export const KIND_ICON = {
  task: CheckSquare,
  goal: Target,
  habit: Repeat,
  transaction: Wallet,
  workout: Dumbbell,
  study: GraduationCap,
  event: CalendarDays,
  note: NotebookPen,
  journal: BookOpen,
  application: Briefcase,
  reminder: Bell,
  food: Salad,
  topic: Library,
}

/** "in_progress" → "In progress". */
export const prettify = (v) => {
  const s = String(v ?? '').replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const TONE = {
  done: 'success',
  completed: 'success',
  selected: 'success',
  income: 'success',
  rejected: 'danger',
  cancelled: 'danger',
  withdrawn: 'danger',
  expense: 'warning',
  running: 'warning',
  urgent: 'danger',
  high: 'warning',
}
const dayLabel = (day) => {
  try {
    return format(parseISO(day), 'd MMM yyyy')
  } catch {
    return day
  }
}

/** Text with the searched words marked. */
export function Highlight({ text, terms, className }) {
  return (
    <span className={className}>
      {highlightParts(text, terms).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-[3px] bg-mod/25 px-0.5 font-semibold text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  )
}

/** One result. It is a real link to the record's page; `onOpen` remembers it as recently viewed. */
export function ResultCard({ result, terms, onOpen }) {
  const src = SOURCE_BY_KIND[result.kind]
  const Icon = KIND_ICON[result.kind] ?? Library
  return (
    <li>
      <Link
        to={result.to}
        onClick={() => onOpen(result)}
        data-testid="search-result"
        data-kind={result.kind}
        data-module={result.module}
        className="lt-lift group flex gap-3 rounded-xl border border-border bg-card/70 p-3.5 transition-colors hover:border-mod/40 hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mod md:p-4"
      >
        <span className="lt-icon-tile mt-0.5 h-10 w-10 shrink-0 rounded-xl">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Highlight text={result.title} terms={terms} className="min-w-0 break-words text-sm font-semibold leading-snug" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{src?.label ?? result.kind}</span>
          </span>
          {result.snippet && (
            <Highlight
              text={result.snippet}
              terms={terms}
              className="mt-1 line-clamp-2 block break-words text-[13px] leading-relaxed text-muted-foreground"
            />
          )}
          <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {result.day && <span className="tabular-nums">{dayLabel(result.day)}</span>}
            {result.status && <Badge tone={TONE[result.status] ?? 'neutral'}>{prettify(result.status)}</Badge>}
            {result.category && <Badge>{prettify(result.category)}</Badge>}
            {result.priority && <Badge tone={TONE[result.priority] ?? 'neutral'}>{prettify(result.priority)} priority</Badge>}
          </span>
        </span>
      </Link>
    </li>
  )
}

export function ResultsSkeleton({ rows = 6 }) {
  return (
    <ul aria-hidden className="space-y-2.5" data-testid="search-loading">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-xl border border-border bg-card/50 p-4" style={{ animationDelay: `${i * 40}ms` }}>
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** A filter with several choices, in a popup. `custom` also lets the person type a value that is not listed (a category of their own). */
export function MultiFilter({ label, options, value, onChange, custom }) {
  const [open, setOpen, anchor, popup] = usePopup()
  const [draft, setDraft] = useState('')
  const known = new Set(options.map((o) => o.value))
  const all = [...options, ...value.filter((v) => !known.has(v)).map((v) => ({ value: v, label: prettify(v) }))]
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const add = () => {
    const v = draft.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setDraft('')
  }
  return (
    <div className="inline-block">
      <Button
        ref={anchor}
        variant="outline"
        size="sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(value.length && 'border-mod/50 text-foreground')}
      >
        {label}
        {value.length > 0 && <span className="rounded-full bg-mod/20 px-1.5 text-[11px] tabular-nums text-mod-text">{value.length}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </Button>
      <Popup
        open={open}
        anchorRef={anchor}
        popupRef={popup}
        className="z-50 w-60 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-overlay"
      >
        <ul role="listbox" aria-label={label} aria-multiselectable>
          {all.map((o) => {
            const on = value.includes(o.value)
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.value)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      'grid h-4 w-4 shrink-0 place-items-center rounded border',
                      on ? 'border-mod bg-mod text-primary-foreground' : 'border-border',
                    )}
                  >
                    {on && <Check className="h-3 w-3" aria-hidden />}
                  </span>
                  {o.label}
                </button>
              </li>
            )
          })}
        </ul>
        {custom && (
          <form
            className="mt-1 flex gap-1 border-t border-border p-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Other…"
              aria-label={`Add another ${label.toLowerCase()}`}
              maxLength={40}
              className="lt-field h-8 min-w-0 flex-1"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>
              Add
            </Button>
          </form>
        )}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          >
            Clear {label.toLowerCase()}
          </button>
        )}
      </Popup>
    </div>
  )
}
