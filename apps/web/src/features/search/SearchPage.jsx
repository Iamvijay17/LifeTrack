import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, History, Lock, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { PAGE_SIZE, SEARCH_MODULES, SOURCE_BY_KIND, hasCriteria, parseQuery } from '@lifetrack/core/globalSearch'
import { PageHeader } from '@/components/shared/PageHeader'
import { FirstUseHint } from '@/components/shared/FirstUseHint'
import { EmptyState, ErrorState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { useModuleLocks } from '@/features/security/useModuleLocks'
import { LOCKABLE_MODULES } from '@lifetrack/core/moduleLocks'
import { cn } from '@/lib/utils'
import { clearQueries, clearViewed, forgetQuery, readQueries, readViewed, rememberQuery, rememberViewed, HISTORY_EVENT } from './history'
import { KIND_ICON, MultiFilter, ResultCard, ResultsSkeleton, prettify } from './parts'
import { useDebounced, useGlobalSearch, useSuggestions } from './useSearch'

const CSV = (v) => (v ? v.split(',').filter(Boolean) : [])
const STATUS = [
  'pending',
  'in_progress',
  'done',
  'skipped',
  'cancelled',
  'active',
  'completed',
  'archived',
  'running',
  'pinned',
  'income',
  'expense',
  'savings',
  'interested',
  'preparing',
  'applied',
  'assessment',
  'interview',
  'selected',
  'rejected',
  'withdrawn',
  'breakfast',
  'lunch',
  'snack',
  'dinner',
].map((value) => ({ value, label: prettify(value) }))
const CATEGORY = [
  'Learning',
  'Job Search',
  'Gym',
  'Health',
  'Personal',
  'Finance',
  'Routine',
  'Custom',
  'Food',
  'learning',
  'jobs',
  'fitness',
  'health',
  'finance',
  'routine',
  'personal',
]
  .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
  .map((value) => ({ value, label: prettify(value) }))
const PRIORITY = ['low', 'medium', 'high', 'urgent'].map((value) => ({ value, label: prettify(value) }))

/** The search the address describes. The address is the single source of truth, so a result list can be bookmarked, shared and gone back to. */
function readParams(sp) {
  return {
    q: sp.get('q') ?? '',
    modules: CSV(sp.get('m')),
    status: CSV(sp.get('st')),
    category: CSV(sp.get('cat')),
    priority: CSV(sp.get('pr')),
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    sort: sp.get('sort') ?? 'relevance',
    page: Math.max(1, Math.trunc(Number(sp.get('page'))) || 1),
  }
}

export default function SearchPage() {
  const [sp, setSp] = useSearchParams()
  const p = useMemo(() => readParams(sp), [sp])
  const locks = useModuleLocks()
  const [recent, setRecent] = useState(readQueries)
  const [viewed, setViewed] = useState(readViewed)
  useEffect(() => {
    const again = () => {
      setRecent(readQueries())
      setViewed(readViewed())
    }
    window.addEventListener(HISTORY_EVENT, again)
    return () => window.removeEventListener(HISTORY_EVENT, again)
  }, [])

  /** Changes the search: `patch` is merged into what the address holds; blank values leave the address. Any change but paging goes back to page 1. */
  const update = useCallback(
    (patch, { keepPage = false } = {}) =>
      setSp(
        (cur) => {
          const next = { ...readParams(cur), ...patch }
          if (!keepPage && !('page' in patch)) next.page = 1
          const q = new URLSearchParams()
          const put = (k, v) => v && v.length && q.set(k, Array.isArray(v) ? v.join(',') : v)
          put('q', next.q.trim() ? next.q : '')
          put('m', next.modules)
          put('st', next.status)
          put('cat', next.category)
          put('pr', next.priority)
          put('from', next.from)
          put('to', next.to)
          if (next.sort !== 'relevance') q.set('sort', next.sort)
          if (next.page > 1) q.set('page', String(next.page))
          return q
        },
        { replace: true },
      ),
    [setSp],
  )

  // ------------------------------------------------------------------------------------------------ the search box
  const [text, setText] = useState(p.q)
  const [focused, setFocused] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const inputRef = useRef(null)
  const listId = useId()
  // Typing searches by itself after a short pause; the box follows the address when it changes from outside (back button, a link).
  const pause = useDebounced(text, 250)
  useEffect(() => {
    if (pause.trim() !== p.q.trim()) update({ q: pause })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause])
  useEffect(() => setText((t) => (t.trim() === p.q.trim() ? t : p.q)), [p.q])
  useEffect(() => inputRef.current?.focus(), [])

  const suggestions = useSuggestions(text, recent, focused)
  const showList = focused && suggestions.length > 0
  useEffect(() => setCursor(-1), [text])
  const commit = (value) => {
    setText(value)
    setCursor(-1)
    update({ q: value })
    rememberQuery(value)
    inputRef.current?.blur()
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown' && showList) {
      e.preventDefault()
      setCursor((c) => (c + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && showList) {
      e.preventDefault()
      setCursor((c) => (c <= 0 ? suggestions.length - 1 : c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(showList && cursor >= 0 ? suggestions[cursor].text : text)
    } else if (e.key === 'Escape') {
      if (showList) {
        e.stopPropagation()
        setFocused(false)
      } else if (text) setText('')
    }
  }

  // ----------------------------------------------------------------------------------------------------- results
  const { status, data, error, retry } = useGlobalSearch({
    q: p.q,
    modules: p.modules,
    status: p.status,
    category: p.category,
    priority: p.priority,
    from: p.from,
    to: p.to,
    sort: p.sort,
    limit: PAGE_SIZE,
    offset: (p.page - 1) * PAGE_SIZE,
  })
  const terms = useMemo(() => parseQuery(p.q), [p.q])
  const filtered = p.modules.length + p.status.length + p.category.length + p.priority.length + (p.from ? 1 : 0) + (p.to ? 1 : 0)
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  // A page past the end (the data shrank, or an old link) goes to the last one.
  useEffect(() => {
    if (status === 'ready' && data.total > 0 && p.page > pages) update({ page: pages }, { keepPage: true })
  }, [status, data, p.page, pages, update])
  const top = useRef(null)
  const goPage = (n) => {
    update({ page: n }, { keepPage: true })
    top.current?.scrollIntoView?.({ block: 'start' })
  }
  const open = (r) => {
    rememberViewed({ id: String(r.id), kind: r.kind, label: r.title, sub: SOURCE_BY_KIND[r.kind]?.label, to: r.to, module: r.module })
    if (p.q.trim()) rememberQuery(p.q)
  }
  const clearFilters = () => update({ modules: [], status: [], category: [], priority: [], from: '', to: '' })
  const toggleModule = (key) => update({ modules: p.modules.includes(key) ? p.modules.filter((m) => m !== key) : [...p.modules, key] })
  const [showFilters, setShowFilters] = useState(false)
  const lockedLabels = locks.closed.map((k) => LOCKABLE_MODULES.find((m) => m.key === k)?.label ?? k)

  return (
    <div className="mx-auto max-w-4xl" data-testid="search-page">
      <PageHeader title="Search" description="Find anything you have saved in LifeTrack." icon={Search} />
      <FirstUseHint id="search" title="Search from anywhere" keys={['Mod', 'K']}>
        Open the command palette from any page to jump to things quickly.
      </FirstUseHint>
      <div ref={top} />

      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && cursor >= 0 ? `${listId}-${cursor}` : undefined}
          aria-label="Search all records"
          placeholder="Search tasks, notes, goals, expenses, workouts…"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          className="lt-field h-12 w-full pl-10 pr-10 text-[15px]"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setText('')
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-overlay"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.text}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === cursor}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(s.text)}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm',
                  i === cursor ? 'bg-mod/15' : 'hover:bg-muted/50',
                )}
              >
                {s.type === 'recent' ? (
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{s.text}</span>
                {s.type === 'recent' && <span className="text-[11px] text-muted-foreground">Recent</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Search in">
        {SEARCH_MODULES.map((m) => {
          const on = p.modules.includes(m.key)
          const Icon = KIND_ICON[Object.values(SOURCE_BY_KIND).find((s) => s.module === m.key)?.kind]
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleModule(m.key)}
              className={cn(
                'lt-press inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors md:h-8',
                on
                  ? 'border-mod/60 bg-mod/15 text-mod-text'
                  : 'border-border bg-card/50 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
              {m.label}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="md:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Filters
        </Button>
        <div className={cn('flex flex-wrap items-center gap-2', showFilters ? 'flex' : 'hidden md:flex')}>
          <MultiFilter label="Status" options={STATUS} value={p.status} onChange={(v) => update({ status: v })} />
          <MultiFilter label="Category" options={CATEGORY} value={p.category} onChange={(v) => update({ category: v })} custom />
          <MultiFilter label="Priority" options={PRIORITY} value={p.priority} onChange={(v) => update({ priority: v })} />
          <Input
            type="date"
            value={p.from}
            onChange={(e) => update({ from: e.target.value })}
            placeholder="From date"
            aria-label="From date"
            className="w-40"
            max={p.to || undefined}
          />
          <Input
            type="date"
            value={p.to}
            onChange={(e) => update({ to: e.target.value })}
            placeholder="To date"
            aria-label="To date"
            className="w-40"
            min={p.from || undefined}
          />
          {filtered > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
            </Button>
          )}
        </div>
        <div className="ml-auto w-40">
          <Select value={p.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort by">
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </div>
      </div>

      {lockedLabels.length > 0 && (
        <p
          className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[13px] text-muted-foreground"
          data-testid="search-locked"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {lockedLabels.join(', ')} {lockedLabels.length > 1 ? 'are' : 'is'} locked, so {lockedLabels.length > 1 ? 'they are' : 'it is'}{' '}
            left out of the results.
          </span>
          <button
            type="button"
            className="shrink-0 font-medium text-mod-text hover:underline"
            onClick={() => locks.unlock(locks.closed[0])}
          >
            Unlock
          </button>
        </p>
      )}

      <section className="mt-5" aria-live="polite" aria-busy={status === 'loading' || status === 'refreshing'}>
        {status === 'idle' && (
          <Landing
            recent={recent}
            viewed={viewed}
            onPick={commit}
            onForget={(q) => (forgetQuery(q), setRecent(readQueries()))}
            onClearQueries={() => (clearQueries(), setRecent([]))}
            onClearViewed={() => (clearViewed(), setViewed([]))}
            onOpen={open}
          />
        )}
        {status === 'loading' && <ResultsSkeleton />}
        {status === 'error' && <ErrorState message={error?.message ?? 'The search did not work.'} onRetry={retry} />}
        {data && status !== 'error' && (
          <>
            <p className="mb-3 text-[13px] text-muted-foreground" data-testid="search-count">
              {data.total === 0
                ? 'No results'
                : `${(p.page - 1) * PAGE_SIZE + 1}–${Math.min(data.total, p.page * PAGE_SIZE)} of ${data.total} result${data.total === 1 ? '' : 's'}`}
              {p.q.trim() && <> for “{p.q.trim()}”</>}
            </p>
            {data.total === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Nothing found"
                description={
                  hasCriteria({ q: p.q }) && filtered > 0
                    ? 'Nothing matches that text with these filters. Try fewer filters or a different word.'
                    : 'Check the spelling, or try a shorter or more general word.'
                }
                action={
                  filtered > 0 ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className={cn('space-y-2.5 transition-opacity', status === 'refreshing' && 'opacity-60')} data-testid="search-results">
                {data.rows.map((r) => (
                  <ResultCard key={`${r.kind}:${r.id}`} result={r} terms={terms} onOpen={open} />
                ))}
              </ul>
            )}
            {pages > 1 && (
              <nav aria-label="Pages of results" className="mt-5 flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" disabled={p.page <= 1} onClick={() => goPage(p.page - 1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
                </Button>
                <span className="text-[13px] tabular-nums text-muted-foreground">
                  Page {p.page} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={p.page >= pages} onClick={() => goPage(p.page + 1)}>
                  Next <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/** Before anything is typed: the person's own recent searches and records, then a few tips. */
function Landing({ recent, viewed, onPick, onForget, onClearQueries, onClearViewed, onOpen }) {
  return (
    <div className="space-y-6" data-testid="search-landing">
      {recent.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" aria-hidden /> Recent searches
            </h2>
            <button type="button" onClick={onClearQueries} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {recent.map((q) => (
              <li key={q} className="inline-flex items-center rounded-full border border-border bg-card/60">
                <button
                  type="button"
                  onClick={() => onPick(q)}
                  className="h-9 rounded-l-full pl-3.5 pr-2 text-[13px] hover:text-mod-text md:h-8"
                >
                  {q}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${q} from recent searches`}
                  onClick={() => onForget(q)}
                  className="grid h-9 w-8 place-items-center rounded-r-full text-muted-foreground hover:text-foreground md:h-8"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {viewed.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden /> Recently viewed
            </h2>
            <button type="button" onClick={onClearViewed} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="search-viewed">
            {viewed.slice(0, 8).map((r) => {
              const Icon = KIND_ICON[r.kind] ?? Search
              return (
                <li key={`${r.kind}:${r.id}`}>
                  <Link
                    to={r.to}
                    onClick={() => onOpen({ ...r, title: r.label })}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm hover:border-mod/40"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-mod-text" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {r.sub && <span className="shrink-0 text-[11px] text-muted-foreground">{r.sub}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <EmptyState
        icon={Search}
        title="Search across all of LifeTrack"
        description="Type a word to look through your tasks, goals, habits, expenses, workouts, study sessions, events, notes and more. Narrow it with the filters, or leave the box empty and pick a filter to browse."
      />
    </div>
  )
}
