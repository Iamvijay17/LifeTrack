import { useEffect, useMemo, useState } from 'react'
import { Keyboard, RotateCcw, Search } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { resetChordKey, resetShortcuts, setChordKey, useShortcutOverrides } from '@/hooks/useShortcutPrefs'
import { NAV } from '@/lib/nav'
import { DEFAULT_CHORDS, PAGE_SHORTCUTS, buildRegistry, findConflicts, isMacPlatform, keycaps, pageOverlaps } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

const CREATE_LABELS = {
  task: 'New task',
  workout: 'Log a workout',
  food: 'Log food',
  note: 'New note',
  reminder: 'New reminder',
  expense: 'Add an expense',
  focus: 'Start a focus session',
  habit: 'New habit',
  event: 'New calendar event',
}
const labelFor = (group, target) =>
  group === 'go' ? (NAV.find((n) => n.to === target)?.label ?? target) : (CREATE_LABELS[target] ?? target)

export const Caps = ({ keys, mac }) => (
  <span className="flex shrink-0 items-center gap-1">
    {keycaps(keys, mac).map((k, i) => (
      <kbd
        key={i}
        className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-border bg-surface-2 px-1.5 font-sans text-[11px] font-medium text-foreground/90"
      >
        {k}
      </kbd>
    ))}
  </span>
)

/** Press the new key for one chord shortcut. Esc cancels. */
function Remap({ row, overrides, onDone }) {
  const [problem, setProblem] = useState(null)
  useEffect(() => {
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return onDone()
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return setProblem('Press a single letter, number or punctuation key.')
      const err = setChordKey(row.customizable.group, row.customizable.target, e.key.toLowerCase())
      if (err) setProblem(err)
      else onDone()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [row, onDone, overrides])
  return (
    <span role="status" className="text-xs text-primary-solid">
      {problem ?? `Press the new key after "${row.keys[0]}"…`} <span className="text-muted-foreground">(Esc to cancel)</span>
    </span>
  )
}

export default function ShortcutsPage() {
  const overrides = useShortcutOverrides()
  const [mac, setMac] = useState(isMacPlatform())
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const rows = useMemo(() => buildRegistry(overrides, labelFor), [overrides])
  const conflicts = useMemo(() => findConflicts(rows), [rows])
  const overlaps = useMemo(() => pageOverlaps(rows), [rows])
  const customised = Object.keys(overrides.go).length + Object.keys(overrides.create).length > 0
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => !needle || `${r.label} ${r.group} ${r.keys.join(' ')}`.toLowerCase().includes(needle))
  const groups = [...new Set(shown.map((r) => r.group))]
  return (
    <>
      <PageHeader
        title="Keyboard shortcuts"
        description="Every shortcut in one place. They are ignored while you type in a box or have a dialog open."
        icon={Keyboard}
        actions={
          <>
            <Segmented
              aria-label="Keys for"
              value={mac ? 'mac' : 'win'}
              onChange={(v) => setMac(v === 'mac')}
              options={[
                { value: 'mac', label: 'Mac' },
                { value: 'win', label: 'Windows / Linux' },
              ]}
            />
            <Button variant="outline" disabled={!customised} onClick={resetShortcuts}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset my keys
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search shortcuts"
            placeholder="Search shortcuts"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {conflicts.length > 0 && (
          <div
            role="alert"
            data-testid="shortcut-conflicts"
            className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px] text-warning"
          >
            <p className="font-medium">Some shortcuts use the same keys</p>
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((g) => (
                <li key={g[0].id}>{g.map((r) => r.label).join(' and ')}</li>
              ))}
            </ul>
          </div>
        )}
        {groups.map((g) => (
          <section key={g} aria-label={g}>
            <h2 className="lt-eyebrow pb-2 text-[11px]">{g}</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card/60">
              {shown
                .filter((r) => r.group === g)
                .map((r) => {
                  const changed = r.customizable && overrides[r.customizable.group][r.customizable.target]
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3.5 py-2 text-sm">
                      <span className="min-w-0">
                        {r.label}
                        {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        {editing === r.id ? (
                          <Remap row={r} overrides={overrides} onDone={() => setEditing(null)} />
                        ) : (
                          <>
                            <Caps keys={r.keys} mac={mac} />
                            {r.customizable && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Change the key for ${r.label}`}
                                  onClick={() => setEditing(r.id)}
                                >
                                  Change
                                </Button>
                                {changed && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Reset ${r.label} to ${DEFAULT_CHORDS[r.customizable.group][r.customizable.target]}`}
                                    onClick={() => resetChordKey(r.customizable.group, r.customizable.target)}
                                  >
                                    <RotateCcw className={cn('h-3.5 w-3.5')} aria-hidden />
                                  </Button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  )
                })}
            </ul>
          </section>
        ))}
        {!needle &&
          PAGE_SHORTCUTS.map((p) => (
            <section key={p.page} aria-label={`${p.label} page`}>
              <h2 className="lt-eyebrow pb-2 text-[11px]">On the {p.label} page</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card/60">
                {p.rows.map(([k, what]) => (
                  <li key={k} className="flex items-center justify-between gap-4 px-3.5 py-2 text-sm">
                    <span>{what}</span>
                    <Caps keys={k.split(' ')} mac={mac} />
                  </li>
                ))}
              </ul>
              {overlaps.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  A few of these keys ({[...new Set(overlaps.map((o) => o.key))].join(', ')}) are also the first key of a global shortcut.
                  Page keys apply only while you are on that page.
                </p>
              )}
            </section>
          ))}
        {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No shortcut matches "{q}".</p>}
        <p className="text-xs text-muted-foreground">
          Remapped keys are saved on this device only. Mod means ⌘ on a Mac and Ctrl elsewhere.
        </p>
      </div>
    </>
  )
}
