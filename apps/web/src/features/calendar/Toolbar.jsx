import { useId } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Keyboard, Plus, Search, Settings2, SlidersHorizontal, X } from 'lucide-react'
import { CALENDAR_CATEGORIES, PRIORITY_META } from '@/domain/calendar'
import { DatePicker } from '@/components/ui/pickers'
import { Segmented } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Popup, usePopup } from '@/components/ui/popup'
import { cn } from '@/lib/utils'
import { VIEWS } from './format'

const STATUSES = [
  ['all', 'All'],
  ['open', 'Open'],
  ['done', 'Done'],
  ['overdue', 'Overdue'],
]

/** Show or hide categories, narrow by priority and by whether things are done. Kept in this browser only. */
export function FiltersMenu({ filters }) {
  const [open, setOpen, anchor, popup] = usePopup()
  const { filters: f, active, toggleCategory, togglePriority, setStatus, clear } = filters
  return (
    <div ref={anchor} className="relative">
      <Button
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="filters-button"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden xl:inline">Filters</span>
        {active > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-mod px-1 text-[11px] font-semibold text-white">
            {active}
          </span>
        )}
      </Button>
      <Popup open={open} anchorRef={anchor} popupRef={popup} align="right" role="dialog" aria-label="Filters" className="w-72 p-3">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Show categories</legend>
            <div className="space-y-0.5">
              {CALENDAR_CATEGORIES.map((c) => {
                const on = !f.hiddenCategories.includes(c.key)
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleCategory(c.key)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted md:py-1.5"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: on ? c.color : 'transparent', boxShadow: `inset 0 0 0 2px ${c.color}` }}
                      aria-hidden
                    />
                    <span className={cn('flex-1', !on && 'text-muted-foreground line-through')}>{c.label}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Priority</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PRIORITY_META).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={f.priorities.includes(key)}
                  onClick={() => togglePriority(key)}
                  className={cn(
                    'lt-press rounded-full border px-3 py-1.5 text-xs font-medium',
                    f.priorities.includes(key) ? 'border-mod bg-mod/10 text-mod-text' : 'border-border hover:bg-muted',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</legend>
            <div role="radiogroup" aria-label="Status" className="grid grid-cols-4 gap-1">
              {STATUSES.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={f.status === key}
                  onClick={() => setStatus(key)}
                  className={cn(
                    'lt-press rounded-md border px-2 py-1.5 text-xs font-medium',
                    f.status === key ? 'border-mod bg-mod/10 text-mod-text' : 'border-border hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-between border-t border-border pt-2">
            <Button variant="ghost" size="sm" onClick={clear} disabled={!active}>
              Reset filters
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Popup>
    </div>
  )
}

/** The calendar's controls: where you are (Today, back, forward, jump to a date), which view, search, filters and settings. */
export function Toolbar({
  view,
  date,
  title,
  today,
  query,
  searchRef,
  filters,
  trayCount,
  trayOpen,
  onView,
  onStep,
  onToday,
  onJump,
  onQuery,
  onToggleTray,
  onSettings,
  onShortcuts,
  onCreate,
  hideNav,
}) {
  const searchId = useId()
  return (
    <div className="space-y-2.5 border-b border-border p-2.5 md:p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            disabled={date === today && view !== 'agenda'}
            data-testid="today-button"
            aria-keyshortcuts="t"
          >
            Today
          </Button>
          {!hideNav && (
            <>
              <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={() => onStep(-1)} data-testid="prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={() => onStep(1)} data-testid="next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-32 md:flex-none">
          <DatePicker
            id="cal-jump"
            value={date}
            display={title}
            clearable={false}
            onChange={(e) => e.target.value && onJump(e.target.value)}
            aria-label={`${title}. Jump to a date`}
            className="h-10 w-full min-w-[9rem] border-transparent bg-transparent text-[15px] font-semibold hover:bg-muted md:h-9 md:w-auto md:max-w-[22rem]"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => onCreate()} aria-keyshortcuts="n" aria-label="New event">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={onView} options={VIEWS.map((v) => ({ value: v.value, label: v.label }))} className="order-1" />
        <div className="relative order-3 min-w-0 flex-1 basis-40 md:order-2 md:max-w-xs">
          <label htmlFor={searchId} className="sr-only">
            Search events and tasks
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search events and tasks"
            aria-keyshortcuts="/"
            className="lt-field h-10 w-full pl-8 pr-8 md:h-9"
            data-testid="search"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQuery('')}
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="order-2 ml-auto flex items-center gap-1.5 md:order-3">
          <FiltersMenu filters={filters} />
          <Button
            variant={trayOpen ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={trayOpen}
            onClick={onToggleTray}
            data-testid="tray-toggle"
          >
            <Inbox className="h-4 w-4" />
            <span className="hidden xl:inline">Unscheduled</span>
            {trayCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1 text-[11px] font-semibold tabular-nums">
                {trayCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Calendar settings" onClick={onSettings} data-testid="settings-button">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" aria-label="Keyboard shortcuts" onClick={onShortcuts}>
            <Keyboard className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
