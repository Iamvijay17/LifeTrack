import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as D from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  Compass,
  CornerDownLeft,
  Droplets,
  Dumbbell,
  GraduationCap,
  Keyboard,
  Loader2,
  LogOut,
  Moon,
  NotebookPen,
  Repeat,
  Salad,
  Search,
  Sparkles,
  Sun,
  Target,
  Timer,
  Wallet,
  Zap,
} from 'lucide-react'
import { AnimatePresence, LayoutGroup, duration, ease, m, spring } from '@/components/motion/primitives'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useOpenSound } from '@/hooks/useInteraction'
import { NAV } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { useQuick } from '@/features/quick/QuickActions'
import { useModuleLocks } from '@/features/security/useModuleLocks'
import { auth } from '@/services/auth'
import { createTask } from '@/services/api'
import { tableClosed } from '@lifetrack/core/moduleLocks'
import {
  CAPTURE_KINDS,
  CREATE_KEYS,
  CREATE_TARGETS,
  GO_KEYS,
  SEARCH_TABLES,
  captureRow,
  contextActions,
  filterCommands,
  highlightParts,
  parseCapture,
  searchData,
} from './model'
import { useRecents } from './useRecents'
import { useShortcuts } from './useShortcuts'

const Ctx = createContext({ open: () => {}, close: () => {}, toggle: () => {}, help: () => {} })
/** `open()` shows the palette from anywhere (the header button uses it). */
export const useCommandCenter = () => useContext(Ctx)

const isMac = () => /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? '')
export const shortcutLabel = () => (isMac() ? '⌘ K' : 'Ctrl K')

const KIND_ICON = {
  page: Compass,
  task: CheckSquare,
  note: NotebookPen,
  goal: Target,
  application: Briefcase,
  habit: Repeat,
  transaction: Wallet,
  reminder: Bell,
  event: CalendarDays,
  food: Salad,
  workout: Dumbbell,
  topic: GraduationCap,
}
const CAPTURE_ICON = { task: CheckSquare, note: NotebookPen, reminder: Bell }
const CAPTURE_MODULE = { task: 'planner', note: 'notes', reminder: 'notifications' }
const CAPTURE_TABLE = { task: 'tasks', note: 'notes', reminder: 'reminders' }

/** The actions offered when nothing is typed (and matched by name when something is). `keys` is the chord shown beside it. */
const ACTIONS = [
  { id: 'a-task', label: 'Add task', icon: CheckSquare, module: 'planner', create: 'task', keywords: 'new todo create' },
  { id: 'a-food', label: 'Log food', icon: Salad, module: 'nutrition', create: 'food', keywords: 'meal eat calories nutrition' },
  { id: 'a-workout', label: 'Record workout', icon: Dumbbell, module: 'fitness', create: 'workout', keywords: 'log gym exercise training' },
  { id: 'a-focus', label: 'Start focus session', icon: Timer, module: 'focus', create: 'focus', keywords: 'pomodoro timer deep work' },
  { id: 'a-note', label: 'New note', icon: NotebookPen, module: 'notes', create: 'note', keywords: 'write journal idea' },
  { id: 'a-reminder', label: 'New reminder', icon: Bell, module: 'notifications', create: 'reminder', keywords: 'remind alert' },
  { id: 'a-expense', label: 'Add expense', icon: Wallet, module: 'finance', create: 'expense', keywords: 'spend money transaction' },
  { id: 'a-water', label: 'Log water', icon: Droplets, module: 'health', quick: 'water', keywords: 'drink hydration' },
  { id: 'a-habit', label: 'Complete habit', icon: Check, module: 'habits', quick: 'habit', keywords: 'check in routine' },
  { id: 'a-study', label: 'Start study session', icon: BookOpen, module: 'learning', quick: 'study', keywords: 'learn timer' },
  { id: 'a-app', label: 'Add job application', icon: Briefcase, module: 'jobs', quick: 'application', keywords: 'career apply' },
].map((a) => {
  const key = a.create && Object.keys(CREATE_KEYS).find((k) => CREATE_KEYS[k] === a.create)
  return { ...a, keys: key ? `c ${key}` : undefined, ...(a.create ? CREATE_TARGETS[a.create] : {}) }
})

const goKeyFor = (to) => Object.keys(GO_KEYS).find((k) => GO_KEYS[k] === to)

/** Runs a quick-add `quick` kind or opens a `to`. Shared by the shortcuts, the palette's actions and the context actions. */
function useDo() {
  const nav = useNavigate()
  const quick = useQuick()
  return useCallback(
    (target) => {
      if (target.quick) quick.open(target.quick)
      else if (target.to) nav(target.to)
    },
    [nav, quick],
  )
}

export function CommandCenterProvider({ children }) {
  const [state, setState] = useState({ open: false, view: 'main' })
  const nav = useNavigate()
  const today = useToday()
  const run = useDo()
  const { recents, remember, clear } = useRecents()

  const api = useMemo(
    () => ({
      open: () => setState({ open: true, view: 'main' }),
      close: () => setState((s) => ({ ...s, open: false })),
      toggle: () => setState((s) => ({ open: !s.open, view: 'main' })),
      help: () => setState({ open: true, view: 'shortcuts' }),
    }),
    [],
  )

  // A capture saves through the same code the forms use (createTask / the store), so nothing here re-implements business rules.
  const [capture] = useAction(async (kind, text) => {
    const c = captureRow(kind, text, today)
    if (!c) return
    if (kind === 'task') await createTask(c.row)
    else await store.insert(c.table, c.row)
    toast.success({ task: 'Task added', note: 'Note saved', reminder: 'Reminder set' }[kind], { description: c.label })
  })

  const create = useCallback((kind) => CREATE_TARGETS[kind] && run(CREATE_TARGETS[kind]), [run])
  useShortcuts({ toggle: api.toggle, open: api.open, help: api.help, go: nav, create, paletteOpen: state.open })

  const execute = useCallback(
    (item) => {
      setState((s) => ({ ...s, open: false }))
      if (item.kind && item.to)
        remember({ id: String(item.id), kind: item.kind, label: item.label, sub: item.sub, to: item.to, module: item.module })
      if (item.capture) capture(item.capture.kind, item.capture.text)
      else if (item.run) item.run()
      else run(item)
    },
    [capture, remember, run],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <Palette
        open={state.open}
        view={state.view}
        setView={(view) => setState((s) => ({ ...s, view }))}
        onOpenChange={(open) => setState((s) => ({ ...s, open, view: 'main' }))}
        recents={recents}
        clearRecents={clear}
        execute={execute}
        today={today}
      />
    </Ctx.Provider>
  )
}

/** The value, `ms` after it stops changing. `flush()` catches up at once (Enter must not run a list that is out of date). */
function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    if (!value) return setV(value) // clearing the box is immediate; only typing waits
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  const latest = useRef(value)
  latest.current = value
  const flush = useCallback(() => setV(latest.current), [])
  return [v, flush]
}

const Key = ({ children }) => (
  <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-border bg-surface-2 px-1 font-sans text-[10px] font-medium text-muted-foreground">
    {children}
  </kbd>
)

function Marked({ text, query }) {
  return highlightParts(text, query).map((p, i) =>
    p.hit ? (
      <mark key={i} className="rounded-[3px] bg-primary-solid/25 px-px text-foreground">
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  )
}

/** The sections of the list for what is typed and where the person is. Pure of React state except for the data it is handed. */
function useSections({ q, dq, data, closed, pathname, recents, clearRecents, today }) {
  const { settings, save } = useSettings()
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && document.documentElement.classList.contains('dark'))
  return useMemo(() => {
    const open = (item) => !item.module || !closed.includes(item.module)
    const pageModule = NAV.find((n) => n.to !== '/' && pathname.startsWith(n.to))?.module
    const same = (a, c) => (c.quick && a.quick === c.quick) || (c.to && a.to === c.to)
    const here = contextActions(pathname).map((c) => ({
      ...c,
      icon: ACTIONS.find((a) => same(a, c))?.icon ?? Sparkles,
      module: ACTIONS.find((a) => same(a, c))?.module ?? pageModule,
    }))
    const prefs = [
      {
        id: 'p-theme',
        label: dark ? 'Switch to light theme' : 'Switch to dark theme',
        icon: dark ? Sun : Moon,
        keywords: 'appearance mode',
        run: () => save({ theme: dark ? 'light' : 'dark' }),
      },
      { id: 'p-keys', label: 'Keyboard shortcuts', icon: Keyboard, keywords: 'keys hotkeys help', view: 'shortcuts', keys: '?' },
      ...(recents.length ? [{ id: 'p-clear', label: 'Clear recent items', icon: Clock, keywords: 'history', run: clearRecents }] : []),
      { id: 'p-out', label: 'Sign out', icon: LogOut, keywords: 'log out logout', run: () => auth.signOut() },
    ]
    const actions = ACTIONS.filter(open)
    const others = actions.filter((a) => !here.some((c) => same(a, c))) // what is on this page is offered once, under "On this page"
    const sections = []

    if (!q.trim()) {
      const recent = recents
        .filter((r) => !(r.kind === 'page' && r.to === pathname) && (!r.module || !closed.includes(r.module)))
        .slice(0, 6)
        .map((r) => ({ ...r, icon: KIND_ICON[r.kind] ?? Clock }))
      if (recent.length) sections.push({ key: 'recent', title: 'Recent', items: recent })
      if (here.length) sections.push({ key: 'here', title: 'On this page', items: here.filter(open) })
      sections.push({ key: 'actions', title: 'Quick actions', items: others })
      sections.push({
        key: 'go',
        title: 'Go to',
        items: NAV.map((n) => ({
          id: n.to,
          kind: 'page',
          label: n.label,
          icon: n.icon,
          module: n.module,
          to: n.to,
          keys: goKeyFor(n.to) && `g ${goKeyFor(n.to)}`,
        })),
      })
      sections.push({ key: 'prefs', title: 'Preferences', items: prefs })
      return sections
    }

    const cap = parseCapture(q)
    const captureItems = CAPTURE_KINDS.filter((k) => !cap?.kind || k.kind === cap.kind)
      .filter((k) => !closed.includes(CAPTURE_MODULE[k.kind]) && !tableClosed(closed, CAPTURE_TABLE[k.kind]))
      .map((k) => {
        const row = captureRow(k.kind, cap.text, today)
        return (
          row && {
            id: `cap-${k.kind}`,
            label: `${k.label} “${row.label}”`,
            sub: row.when,
            icon: CAPTURE_ICON[k.kind],
            module: CAPTURE_MODULE[k.kind],
            capture: { kind: k.kind, text: cap.text },
            plain: true,
          }
        )
      })
      .filter(Boolean)
    if (cap?.kind && captureItems.length) sections.push({ key: 'capture', title: 'Quick capture', items: captureItems })
    const found = searchData(dq, data, { closed })
    const commands = filterCommands([...here.filter(open), ...others, ...prefs], q)
    sections.push(...found.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, icon: i.icon ?? KIND_ICON[i.kind] })) })))
    if (commands.length) sections.push({ key: 'commands', title: 'Actions', items: commands })
    if (!cap?.kind && captureItems.length) sections.push({ key: 'capture', title: 'Quick capture', items: captureItems })
    return sections
  }, [q, dq, data, closed, pathname, recents, clearRecents, today, dark, save])
}

const SHEET = [
  {
    title: 'Command Center',
    rows: [
      [shortcutLabel(), 'Open or close'],
      ['/', 'Open the search'],
      ['?', 'Show this sheet'],
      ['↑ ↓', 'Move through results'],
      ['↵', 'Run the selected result'],
      ['Esc', 'Clear, go back, close'],
    ],
  },
  { title: 'Go to  ·  g then …', rows: Object.entries(GO_KEYS).map(([k, to]) => [`g ${k}`, NAV.find((n) => n.to === to)?.label ?? to]) },
  {
    title: 'Create  ·  c then …',
    rows: Object.entries(CREATE_KEYS).map(([k, kind]) => [`c ${k}`, ACTIONS.find((a) => a.create === kind)?.label ?? kind]),
  },
  {
    title: 'Quick capture  ·  type in the search',
    rows: [
      ['task: call the bank tomorrow', 'Add a task'],
      ['note: idea for the book', 'Save a note'],
      ['remind: pay rent 5pm', 'Set a reminder'],
    ],
  },
]

function Shortcuts() {
  return (
    <div id="search-results" className="max-h-[min(58dvh,28rem)] space-y-4 overflow-y-auto overscroll-contain p-4">
      {SHEET.map((s) => (
        <section key={s.title} aria-label={s.title}>
          <h3 className="lt-eyebrow pb-1.5 text-[10px]">{s.title}</h3>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {s.rows.map(([k, label]) => (
              <li key={k + label} className="flex items-center justify-between gap-3 py-0.5 text-sm">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className="flex shrink-0 gap-1">
                  {k.split(' ').length > 3 ? <Key>{k}</Key> : k.split(' ').map((p, i) => <Key key={i}>{p}</Key>)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Results({ q, handle, onActive, onHelp, execute, recents, clearRecents, today }) {
  const [dq, flush] = useDebounced(q, 120)
  const { pathname } = useLocation()
  const locks = useModuleLocks()
  const { data, loading, error, refetch } = useTables(...SEARCH_TABLES)
  const closed = locks.closed
  const sections = useSections({ q, dq, data, closed, pathname, recents, clearRecents, today })
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
  const [cursor, setCursor] = useState(0)
  useEffect(() => setCursor(0), [q])
  useEffect(() => {
    if (cursor >= flat.length) setCursor(Math.max(0, flat.length - 1))
  }, [flat.length, cursor])
  useEffect(() => {
    onActive?.(flat[cursor] ? `cmd-opt-${cursor}` : undefined)
    document.getElementById(`cmd-opt-${cursor}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [flat, cursor, onActive])
  // The input owns the keyboard: it hands arrows and Enter to the list through this ref, so nothing listens on `window`.
  const settled = dq === q
  const enterWaiting = useRef(false)
  const choose = () => flat[cursor] && (flat[cursor].view ? onHelp() : execute(flat[cursor]))
  useEffect(() => {
    handle.current = {
      move: (d) => setCursor((c) => (flat.length ? (c + d + flat.length) % flat.length : 0)),
      enter: () => {
        if (settled) return choose()
        enterWaiting.current = true // typed and Enter within the debounce: run the result of what is on screen once it catches up
        flush()
      },
    }
  })
  useEffect(() => {
    if (!settled || !enterWaiting.current) return
    enterWaiting.current = false
    choose()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per settle, on the list that has just been built
  }, [settled, flat])
  const searching = q.trim() && (loading || dq !== q)
  const failed = q.trim() && error && !closed.length
  const matched = sections.some((s) => s.key !== 'capture')
  let idx = -1
  return (
    <LayoutGroup id="palette">
      <div
        id="search-results"
        role="listbox"
        aria-label="Command Center results"
        className="max-h-[min(58dvh,28rem)] overflow-y-auto overscroll-contain p-2"
      >
        {q.trim() && !matched && !searching && (
          <p className="px-3 pb-2 pt-3 text-center text-sm text-muted-foreground">
            No matches for “{q.trim()}”. You can capture it instead:
          </p>
        )}
        {sections.map((s) => (
          <div key={s.key} role="group" aria-label={s.title} className="mb-1.5">
            <div aria-hidden="true" className="lt-eyebrow px-2.5 pb-1 pt-1.5 text-[10px]">
              {s.title}
            </div>
            {s.items.map((it) => {
              idx++
              const mine = idx
              const active = cursor === mine
              const Icon = it.icon ?? Zap
              return (
                <button
                  key={s.key + it.id}
                  type="button"
                  tabIndex={-1}
                  id={`cmd-opt-${mine}`}
                  role="option"
                  aria-label={it.sub ? `${it.label}, ${it.sub}` : it.label}
                  data-module={it.module}
                  aria-selected={active}
                  onMouseMove={() => cursor !== mine && setCursor(mine)}
                  onClick={() => (it.view ? onHelp() : execute(it))}
                  className="relative flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left text-sm md:py-2"
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
                  <span className="relative min-w-0 flex-1 truncate">{it.plain ? it.label : <Marked text={it.label} query={q} />}</span>
                  {it.sub && <span className="relative shrink-0 text-xs text-muted-foreground">{it.sub}</span>}
                  {it.keys && !active && (
                    <span aria-hidden className="relative hidden shrink-0 gap-1 md:flex">
                      {it.keys.split(' ').map((k, i) => (
                        <Key key={i}>{k}</Key>
                      ))}
                    </span>
                  )}
                  {active && <CornerDownLeft className="relative h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                </button>
              )
            })}
          </div>
        ))}
        {searching && (
          <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Searching your data…
          </p>
        )}
        {failed && (
          <div role="alert" className="mx-1 mt-1 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden />
            <span className="min-w-0 flex-1">Some of your data could not be searched.</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </LayoutGroup>
  )
}

function Palette({ open, view, setView, onOpenChange, recents, clearRecents, execute, today }) {
  const [q, setQ] = useState('')
  const input = useRef(null)
  const list = useRef({})
  const [activeId, setActiveId] = useState()
  useOpenSound(open)
  useEffect(() => {
    if (!open) setQ('')
  }, [open])
  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return // a word being composed (IME) is not a command yet
    if (view === 'shortcuts') return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      list.current.move?.(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      list.current.enter?.()
    }
  }
  const help = view === 'shortcuts'
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
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
              onEscapeKeyDown={(e) => {
                // Esc steps back before it closes: the shortcut sheet, then what was typed, then the palette.
                if (help) {
                  e.preventDefault()
                  setView('main')
                } else if (q) {
                  e.preventDefault()
                  setQ('')
                }
              }}
            >
              <m.div
                className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-overlay ring-1 ring-black/5 backdrop-blur-xl md:inset-x-4 md:top-[11dvh]"
                initial={{ opacity: 0, scale: 0.97, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: duration.fast, ease: ease.in } }}
                transition={{ duration: duration.base, ease: ease.out }}
              >
                <D.Title className="sr-only">Command Center</D.Title>
                <D.Description className="sr-only">
                  Search your data, jump to any page, run quick actions and capture tasks, notes and reminders.
                </D.Description>
                <div className="flex items-center gap-2.5 border-b border-border px-4">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <input
                    ref={input}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value)
                      if (help) setView('main')
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={help ? 'Keyboard shortcuts — type to search instead' : 'Search, jump to, or type task: / note: / remind:'}
                    aria-label="Search everything"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="search-results"
                    aria-autocomplete="list"
                    aria-activedescendant={help ? undefined : activeId}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 md:text-[15px]"
                  />
                  <Key>Esc</Key>
                </div>
                {help ? (
                  <Shortcuts />
                ) : (
                  <Results
                    q={q}
                    handle={list}
                    onActive={setActiveId}
                    onHelp={() => setView('shortcuts')}
                    execute={execute}
                    recents={recents}
                    clearRecents={clearRecents}
                    today={today}
                  />
                )}
                <div className="hidden items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground md:flex">
                  <span className="flex items-center gap-1">
                    <Key>↑</Key>
                    <Key>↓</Key> move
                  </span>
                  <span className="flex items-center gap-1">
                    <Key>↵</Key> select
                  </span>
                  <span className="flex items-center gap-1">
                    <Key>?</Key> shortcuts
                  </span>
                  <span className="ml-auto truncate">Tasks, notes, goals, jobs, habits, money, food, workouts, events and pages.</span>
                </div>
              </m.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  )
}
