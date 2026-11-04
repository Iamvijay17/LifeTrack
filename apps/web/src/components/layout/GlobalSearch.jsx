import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as D from '@radix-ui/react-dialog'
import {
  Search,
  CheckSquare,
  NotebookPen,
  Target,
  Briefcase,
  Repeat,
  Wallet,
  CornerDownLeft,
  LogOut,
  Moon,
  Sun,
  Zap,
  Compass,
} from 'lucide-react'
import { AnimatePresence, LayoutGroup, duration, ease, m, spring } from '@/components/motion/primitives'
import { NAV } from '@/lib/nav'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { cn } from '@/lib/utils'
import { SectionLoader } from '@/components/loaders/SectionLoader'
import { QUICK, useQuick } from '@/features/quick/QuickActions'
import { auth } from '@/services/auth'

const norm = (s) => String(s ?? '').toLowerCase()
const isMac = () => /mac|iphone|ipad/i.test(navigator.platform ?? '')

/** Pure matcher (exported for tests): returns grouped results for a query across the user's own data and the app's pages. */
export function searchAll(q, data, limit = 5) {
  const s = norm(q).trim()
  if (!s) return []
  const has = (...f) => f.some((x) => norm(x).includes(s))
  const groups = [
    { title: 'Pages', icon: Search, items: NAV.filter((n) => has(n.label)).map((n) => ({ id: n.to, label: n.label, to: n.to })) },
    {
      title: 'Tasks',
      icon: CheckSquare,
      items: (data.tasks ?? [])
        .filter((t) => has(t.title, t.notes))
        .map((t) => ({
          id: t.id,
          label: t.title,
          sub: t.due_date ?? 'No date',
          to: t.due_date ? `/planner?date=${t.due_date}` : '/planner',
        })),
    },
    {
      title: 'Notes',
      icon: NotebookPen,
      items: (data.notes ?? [])
        .filter((n) => has(n.title, n.body, n.category, (n.tags ?? []).join(' ')))
        .map((n) => ({ id: n.id, label: n.title || n.body.slice(0, 60), sub: n.category, to: `/notes?note=${n.id}` })),
    },
    {
      title: 'Goals',
      icon: Target,
      items: (data.goals ?? [])
        .filter((g) => has(g.title, g.notes))
        .map((g) => ({ id: g.id, label: g.title, sub: g.status, to: '/goals' })),
    },
    {
      title: 'Job applications',
      icon: Briefcase,
      items: (data.job_applications ?? [])
        .filter((a) => has(a.company, a.job_title, a.location))
        .map((a) => ({ id: a.id, label: `${a.company} — ${a.job_title}`, sub: a.status, to: `/jobs?app=${a.id}` })),
    },
    {
      title: 'Habits',
      icon: Repeat,
      items: (data.habits ?? []).filter((h) => has(h.name)).map((h) => ({ id: h.id, label: h.name, to: '/habits' })),
    },
    {
      title: 'Transactions',
      icon: Wallet,
      items: (data.transactions ?? [])
        .filter((t) => has(t.note, t.category))
        .map((t) => ({ id: t.id, label: t.note || t.category, sub: t.txn_date, to: `/finance?month=${t.txn_date.slice(0, 7)}-01` })),
    },
  ]
  return groups.map((g) => ({ ...g, items: g.items.slice(0, limit) })).filter((g) => g.items.length)
}

/** What the palette can do besides search: quick actions, theme, sign out. Each item has a `run`, instead of a `to`. */
function useCommands() {
  const quick = useQuick()
  const { settings, save } = useSettings()
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && document.documentElement.classList.contains('dark'))
  return useMemo(
    () => ({
      actions: {
        title: 'Quick actions',
        icon: Zap,
        items: QUICK.map(({ kind, label, icon, module }) => ({ id: kind, label, icon, module, run: () => quick.open(kind) })),
      },
      pages: {
        title: 'Go to',
        icon: Compass,
        items: NAV.map((n) => ({ id: n.to, label: n.label, icon: n.icon, module: n.module, to: n.to })),
      },
      system: {
        title: 'Preferences',
        icon: Moon,
        items: [
          {
            id: 'theme',
            label: dark ? 'Switch to light theme' : 'Switch to dark theme',
            icon: dark ? Sun : Moon,
            run: () => save({ theme: dark ? 'light' : 'dark' }),
          },
          { id: 'signout', label: 'Sign out', icon: LogOut, run: () => auth.signOut() },
        ],
      },
    }),
    [quick, save, dark],
  )
}

function Results({ q, onPick, onActive }) {
  const { data, loading } = useTables('tasks', 'notes', 'goals', 'job_applications', 'habits', 'transactions')
  const commands = useCommands()
  const query = q.trim()
  const groups = useMemo(() => {
    if (!query) return [commands.actions, commands.pages, commands.system]
    const s = norm(query)
    const matching = [commands.actions, commands.system]
      .map((g) => ({ ...g, items: g.items.filter((i) => norm(i.label).includes(s)) }))
      .filter((g) => g.items.length)
    return [...searchAll(query, data), ...matching]
  }, [query, data, commands])
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const [cursor, setCursor] = useState(0)
  const list = useRef(null)
  useEffect(() => setCursor(0), [q])
  useEffect(() => {
    onActive?.(flat[cursor] ? `search-opt-${cursor}` : undefined)
    document.getElementById(`search-opt-${cursor}`)?.scrollIntoView({ block: 'nearest' })
  }, [flat, cursor, onActive])
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(flat.length - 1, c + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(0, c - 1))
      }
      if (e.key === 'Enter' && flat[cursor]) {
        e.preventDefault()
        onPick(flat[cursor])
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [flat, cursor, onPick])
  if (query && loading && !flat.length) return <SectionLoader message="Searching your data..." minHeight={120} />
  if (!flat.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No results for “{q}”.</p>
  let idx = -1
  return (
    <LayoutGroup id="palette">
      <m.div
        ref={list}
        id="search-results"
        role="listbox"
        aria-label="Search results"
        layoutScroll
        className="max-h-[min(52dvh,26rem)] overflow-y-auto overscroll-contain p-2"
      >
        {groups.map((g) => (
          <div key={g.title} role="group" aria-label={g.title} className="mb-1.5">
            <div aria-hidden="true" className="lt-eyebrow px-2.5 pb-1 pt-1.5 text-[10px]">
              {g.title}
            </div>
            {g.items.map((it) => {
              idx++
              const mine = idx
              const active = cursor === mine
              const Icon = it.icon ?? g.icon
              return (
                <button
                  key={g.title + it.id}
                  id={`search-opt-${mine}`}
                  role="option"
                  data-module={it.module}
                  aria-selected={active}
                  onMouseMove={() => setCursor(mine)}
                  onClick={() => onPick(it)}
                  className="relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm"
                >
                  {active && (
                    <m.span
                      layoutId="palette-cursor"
                      aria-hidden
                      className="absolute inset-0 rounded-md bg-muted"
                      transition={spring.snappy}
                    />
                  )}
                  <span
                    className={cn(
                      'relative grid h-6 w-6 shrink-0 place-items-center rounded-[6px]',
                      it.module ? 'lt-icon-soft' : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="relative min-w-0 flex-1 truncate">{it.label}</span>
                  {it.sub && <span className="relative shrink-0 text-xs text-muted-foreground">{it.sub}</span>}
                  {active && <CornerDownLeft className="relative h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                </button>
              )
            })}
          </div>
        ))}
      </m.div>
    </LayoutGroup>
  )
}

const Key = ({ children }) => (
  <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-border bg-surface-2 px-1 font-sans text-[10px] font-medium text-muted-foreground">
    {children}
  </kbd>
)

/** The command palette (Ctrl/Cmd + K): search your data, jump anywhere, run a quick action. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const input = useRef(null)
  const [activeId, setActiveId] = useState()
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    if (!open) setQ('')
  }, [open])
  const pick = (item) => {
    setOpen(false)
    if (item.to) nav(item.to)
    else item.run()
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lt-press flex h-10 items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground md:h-9 md:w-64"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="sr-only md:not-sr-only md:flex-1 md:text-left">Search…</span>
        <kbd
          aria-hidden
          className="hidden rounded border border-border bg-surface-2 px-1.5 py-px font-sans text-[10px] font-medium md:inline"
        >
          {isMac() ? '⌘ K' : 'Ctrl K'}
        </kbd>
      </button>
      <D.Root open={open} onOpenChange={setOpen}>
        <AnimatePresence>
          {open && (
            <D.Portal forceMount>
              <D.Overlay asChild forceMount>
                <m.div
                  className="fixed inset-0 z-50 bg-black/60 md:backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: duration.fast } }}
                />
              </D.Overlay>
              <D.Content
                asChild
                forceMount
                onOpenAutoFocus={(e) => {
                  e.preventDefault()
                  input.current?.focus()
                }}
              >
                <m.div
                  className="fixed inset-x-4 top-[10dvh] z-50 mx-auto max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-overlay"
                  initial={{ opacity: 0, scale: 0.97, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: ease.in } }}
                  transition={{ duration: duration.base, ease: ease.out }}
                >
                  <D.Title className="sr-only">Search</D.Title>
                  <D.Description className="sr-only">Search your data and pages</D.Description>
                  <div className="flex items-center gap-2.5 border-b border-border px-4">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <input
                      ref={input}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search or jump to…"
                      aria-label="Search everything"
                      role="combobox"
                      aria-expanded={!!q.trim()}
                      aria-controls="search-results"
                      aria-autocomplete="list"
                      aria-activedescendant={activeId}
                      className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Key>Esc</Key>
                  </div>
                  <Results q={q} onPick={pick} onActive={setActiveId} />
                  <div className="hidden items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground md:flex">
                    <span className="flex items-center gap-1">
                      <Key>↑</Key>
                      <Key>↓</Key> move
                    </span>
                    <span className="flex items-center gap-1">
                      <Key>↵</Key> open
                    </span>
                    <span className="ml-auto truncate">Search tasks, notes, goals, job applications, habits, transactions and pages.</span>
                  </div>
                </m.div>
              </D.Content>
            </D.Portal>
          )}
        </AnimatePresence>
      </D.Root>
    </>
  )
}
