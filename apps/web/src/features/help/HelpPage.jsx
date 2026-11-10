import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, Download, LayoutDashboard, Bell, Plus, Search, Settings } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/states'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { NAV } from '@/lib/nav'
import { FAQ, FAQ_CATEGORIES, GUIDES, QUICK_START, SHORTCUTS, matches, textOf } from './helpContent'

const QUICK_ICONS = {
  search: Search,
  'quick-add': Plus,
  dashboard: LayoutDashboard,
  settings: Settings,
  reminders: Bell,
  backup: Download,
}

const Kbd = ({ children }) => (
  <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
    {children}
  </kbd>
)

/** A closed-by-default row that opens in place. Native <details>, so it is keyboard and screen-reader friendly with no extra code. */
function Disclosure({ summary, lead, open, children }) {
  return (
    <details open={open || undefined} className="group px-[var(--pad)] py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          {lead}
          {summary}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

function Guide({ guide, open }) {
  const { icon: Icon, label, to } = guide.nav
  return (
    <div data-module={guide.nav.module}>
      <Disclosure
        open={open}
        lead={
          <span className="lt-icon-soft h-8 w-8 shrink-0 rounded-md">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        }
        summary={
          <span className="min-w-0">
            <span className="block truncate">{label}</span>
            <span className="line-clamp-2 block text-xs font-normal text-muted-foreground">{guide.summary}</span>
          </span>
        }
      >
        <div className="space-y-3 pl-11 text-sm">
          <div>
            <h4 className="lt-eyebrow mb-1">How it works</h4>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground marker:text-foreground">
              {guide.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          {guide.tips?.length > 0 && (
            <div>
              <h4 className="lt-eyebrow mb-1">Good to know</h4>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {guide.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-mod-text underline-offset-2 hover:underline">
            Open {label}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </Disclosure>
    </div>
  )
}

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('All')
  const q = query.trim()

  const guides = useMemo(
    () =>
      GUIDES.map((g) => ({ ...g, nav: NAV.find((n) => n.module === g.module) })).filter(
        (g) => g.nav && (!q || matches(q, textOf(g.nav.label, g.module, g.summary, g.steps, g.tips))),
      ),
    [q],
  )
  const faqs = useMemo(() => FAQ.filter((f) => (q ? matches(q, textOf(f.cat, f.q, f.a)) : cat === 'All' || f.cat === cat)), [q, cat])
  const shortcuts = useMemo(() => SHORTCUTS.filter((s) => !q || matches(q, textOf(s.keys, s.label, 'keyboard shortcut'))), [q])
  const quick = useMemo(() => QUICK_START.filter((s) => !q || matches(q, textOf(s.title, s.body))), [q])
  const total = guides.length + faqs.length + shortcuts.length + quick.length

  return (
    <>
      <PageHeader title="Help & Support" description="Guides, answers and tips for getting the most out of LifeTrack." />
      <Stagger gap={0.05} className="mx-auto max-w-3xl space-y-8">
        <StaggerItem>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help: habits, backup, reminders…"
              aria-label="Search help"
              className="pl-9"
            />
          </div>
          {q && (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {total === 0 ? 'No matches' : `${total} ${total === 1 ? 'match' : 'matches'}`} for “{q}”
            </p>
          )}
        </StaggerItem>

        {q && total === 0 && (
          <StaggerItem>
            <EmptyState
              title="Nothing found"
              description="Try a shorter or different word, such as “backup”, “streak” or “reminder”."
              action={
                <button type="button" onClick={() => setQuery('')} className="text-sm font-medium underline-offset-2 hover:underline">
                  Clear search
                </button>
              }
            />
          </StaggerItem>
        )}

        {quick.length > 0 && (
          <StaggerItem>
            <h2 className="lt-eyebrow mb-2">Getting started</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quick.map(({ id, title, body, to }) => {
                const Icon = QUICK_ICONS[id]
                const inner = (
                  <CardContent className="space-y-2">
                    <span className="lt-icon-tile h-9 w-9">
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <CardTitle as="h3">{title}</CardTitle>
                    <p className="text-xs text-muted-foreground">{body}</p>
                  </CardContent>
                )
                return to ? (
                  <Link key={id} to={to} className="block rounded-lg">
                    <Card interactive className="h-full">
                      {inner}
                    </Card>
                  </Link>
                ) : (
                  <Card key={id} className="h-full">
                    {inner}
                  </Card>
                )
              })}
            </div>
          </StaggerItem>
        )}

        {guides.length > 0 && (
          <StaggerItem>
            <h2 className="lt-eyebrow mb-2">Guides by module</h2>
            <Card className="divide-y divide-border">
              {guides.map((g) => (
                <Guide key={g.module} guide={g} open={Boolean(q) && guides.length <= 3} />
              ))}
            </Card>
          </StaggerItem>
        )}

        {(faqs.length > 0 || !q) && (
          <StaggerItem>
            <h2 className="lt-eyebrow mb-2">Frequently asked questions</h2>
            {!q && (
              <Segmented className="mb-3" value={cat} onChange={setCat} options={FAQ_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            )}
            <Card className="divide-y divide-border">
              {faqs.map(({ q: question, a, cat: c }) => (
                <Disclosure key={question} open={Boolean(q) && faqs.length <= 3} summary={question}>
                  <p className="text-sm text-muted-foreground">{a}</p>
                  {q && <p className="mt-1 text-[11px] text-muted-foreground/70">{c}</p>}
                </Disclosure>
              ))}
            </Card>
          </StaggerItem>
        )}

        {shortcuts.length > 0 && (
          <StaggerItem>
            <h2 className="lt-eyebrow mb-2">Keyboard shortcuts</h2>
            <Card>
              <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {shortcuts.map(({ keys, label }) => (
                  <div key={label} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      {keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[11px] text-muted-foreground">or</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </StaggerItem>
        )}

        <StaggerItem>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/privacy" className="underline-offset-2 hover:underline">
              Privacy
            </Link>
            {' · '}
            <Link to="/terms" className="underline-offset-2 hover:underline">
              Terms
            </Link>
          </p>
        </StaggerItem>
      </Stagger>
    </>
  )
}
