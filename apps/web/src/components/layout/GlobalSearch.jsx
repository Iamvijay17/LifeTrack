import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as D from '@radix-ui/react-dialog'
import { Search, CheckSquare, NotebookPen, Target, Briefcase, Repeat, Wallet, CornerDownLeft } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useTables } from '@/hooks/store'
import { cn } from '@/lib/utils'

const norm = (s) => String(s ?? '').toLowerCase()

/** Pure matcher (exported for tests): returns grouped results for a query across the user's own data and the app's pages. */
export function searchAll(q, data, limit = 5) {
  const s = norm(q).trim()
  if (!s) return []
  const has = (...f) => f.some((x) => norm(x).includes(s))
  const groups = [
    { title: 'Pages', icon: Search, items: NAV.filter((n) => has(n.label)).map((n) => ({ id: n.to, label: n.label, to: n.to })) },
    { title: 'Tasks', icon: CheckSquare, items: (data.tasks ?? []).filter((t) => has(t.title, t.notes)).map((t) => ({ id: t.id, label: t.title, sub: t.due_date ?? 'No date', to: '/planner' })) },
    { title: 'Notes', icon: NotebookPen, items: (data.notes ?? []).filter((n) => has(n.title, n.body, n.category, (n.tags ?? []).join(' '))).map((n) => ({ id: n.id, label: n.title || n.body.slice(0, 60), sub: n.category, to: `/notes?note=${n.id}` })) },
    { title: 'Goals', icon: Target, items: (data.goals ?? []).filter((g) => has(g.title, g.notes)).map((g) => ({ id: g.id, label: g.title, sub: g.status, to: '/goals' })) },
    { title: 'Job applications', icon: Briefcase, items: (data.job_applications ?? []).filter((a) => has(a.company, a.job_title, a.location)).map((a) => ({ id: a.id, label: `${a.company} — ${a.job_title}`, sub: a.status, to: '/jobs' })) },
    { title: 'Habits', icon: Repeat, items: (data.habits ?? []).filter((h) => has(h.name)).map((h) => ({ id: h.id, label: h.name, to: '/habits' })) },
    { title: 'Transactions', icon: Wallet, items: (data.transactions ?? []).filter((t) => has(t.note, t.category)).map((t) => ({ id: t.id, label: t.note || t.category, sub: t.txn_date, to: '/finance' })) },
  ]
  return groups.map((g) => ({ ...g, items: g.items.slice(0, limit) })).filter((g) => g.items.length)
}

function Results({ q, onPick }) {
  const { data, loading } = useTables('tasks', 'notes', 'goals', 'job_applications', 'habits', 'transactions')
  const groups = useMemo(() => searchAll(q, data), [q, data])
  const flat = groups.flatMap((g) => g.items)
  const [cursor, setCursor] = useState(0)
  useEffect(() => setCursor(0), [q])
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(flat.length - 1, c + 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
      if (e.key === 'Enter' && flat[cursor]) { e.preventDefault(); onPick(flat[cursor].to) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [flat, cursor, onPick])
  if (!q.trim()) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Search tasks, notes, goals, job applications, habits, transactions and pages.</p>
  if (loading && !flat.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Searching…</p>
  if (!flat.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No results for “{q}”.</p>
  let idx = -1
  return (
    <div role="listbox" aria-label="Search results" className="max-h-[50dvh] overflow-y-auto p-2">
      {groups.map((g) => (
        <section key={g.title} className="mb-2">
          <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</h3>
          {g.items.map((it) => { idx++; const mine = idx; return (
            <button key={g.title + it.id} role="option" aria-selected={cursor === mine} onMouseEnter={() => setCursor(mine)} onClick={() => onPick(it.to)}
              className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm', cursor === mine ? 'bg-muted' : 'hover:bg-muted/60')}>
              <g.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.sub && <span className="shrink-0 text-xs text-muted-foreground">{it.sub}</span>}
              {cursor === mine && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>) })}
        </section>))}
    </div>
  )
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const input = useRef(null)
  useEffect(() => {
    const key = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => { if (!open) setQ('') }, [open])
  const pick = (to) => { setOpen(false); nav(to) }
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search" className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5 text-sm text-muted-foreground hover:bg-muted/60 md:w-56">
        <Search className="h-4 w-4" /><span className="hidden flex-1 text-left md:inline">Search…</span><kbd className="hidden rounded border border-border px-1.5 text-[10px] md:inline">Ctrl K</kbd>
      </button>
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
          <D.Content onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus() }} className="fixed left-1/2 top-[12dvh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-fade-in">
            <D.Title className="sr-only">Search</D.Title><D.Description className="sr-only">Search your data and pages</D.Description>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything…" aria-label="Search everything" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <Results q={q} onPick={pick} />
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  )
}
