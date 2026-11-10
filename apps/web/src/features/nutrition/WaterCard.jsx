import { useState } from 'react'
import { Droplets, Plus, Trash2, Undo2 } from 'lucide-react'
import { AnimatedValue, ease, m } from '@/components/motion/primitives'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/shared/Confirm'
import { logWater, removeWaterLog } from '@/services/api'
import { MAX_WATER_ML, WATER_PRESETS, fmtMl, isValidWaterAmount, percentOfGoal } from '@/domain/nutrition'
import { fmtDay } from '@/lib/dates'

const timeLabel = (w) => (w.log_time ? w.log_time.slice(0, 5) : '')

/**
 * The day's water. The glass fills to today's share of the goal; +250 / +500 / custom add an entry, "Undo" takes the last one back.
 * `day` = { entries, total, other, last } from waterDay(); `date` is the day being viewed; `nowTime()` gives the time (HH:mm, user's timezone) that stamps a new entry.
 */
export function WaterCard({ day, goal, date, today, nowTime }) {
  const confirm = useConfirm()
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [add, adding] = useAction((ml) => logWater(date, ml, date === today ? nowTime() : null), { success: (_r) => 'Water added' })
  const [undo, undoing] = useAction((entry) => removeWaterLog(entry), { success: 'Last drink removed' })
  const [del] = useAction((entry) => removeWaterLog(entry), { success: 'Entry deleted' })
  const percent = Math.min(100, percentOfGoal(day.total, goal) ?? 0)
  const busy = adding || undoing
  const amount = Math.floor(Number(custom))
  const submitCustom = async (e) => {
    e.preventDefault()
    if (isValidWaterAmount(amount) && (await add(amount))) {
      setCustom('')
      setShowCustom(false)
    }
  }
  return (
    <Card className="relative isolate flex flex-col overflow-hidden">
      <div
        role="progressbar"
        aria-label="Water today"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="absolute inset-0 -z-10"
      >
        <m.div
          className="absolute inset-0"
          initial={{ y: '100%' }}
          animate={{ y: `${100 - percent}%` }}
          transition={{ duration: 1.1, ease: ease.out }}
        >
          <svg
            viewBox="0 0 400 20"
            preserveAspectRatio="none"
            className="lt-wave absolute -top-3 left-0 h-3 w-[200%] text-sky-400/25"
            aria-hidden
          >
            <path fill="currentColor" d="M0 10 Q 50 0 100 10 T 200 10 T 300 10 T 400 10 V 20 H 0 Z" />
          </svg>
          <div className="h-full bg-sky-400/25" />
        </m.div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="text-xs font-medium">Water{date === today ? ' today' : ` · ${fmtDay(date, 'd MMM')}`}</span>
          <span className="grid h-7 w-7 place-items-center rounded-md bg-sky-400/15 text-sky-500">
            <Droplets className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
        <div>
          <div className="lt-stat-value text-[1.625rem] leading-tight">
            <AnimatedValue value={fmtMl(day.total)} />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {goal > 0
              ? day.total >= goal
                ? `Goal of ${fmtMl(goal)} reached`
                : `${fmtMl(goal - day.total)} to go · goal ${fmtMl(goal)}`
              : 'No water goal set'}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {WATER_PRESETS.map((ml) => (
            <Button key={ml} variant="outline" size="sm" disabled={busy} onClick={() => add(ml)} aria-label={`Add ${ml} millilitres`}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {ml}
            </Button>
          ))}
          <Button variant="outline" size="sm" disabled={busy} aria-expanded={showCustom} onClick={() => setShowCustom((v) => !v)}>
            Custom
          </Button>
        </div>
        {showCustom && (
          <form className="flex gap-2" onSubmit={submitCustom}>
            <Input
              autoFocus
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_WATER_ML}
              placeholder="ml"
              aria-label="Custom amount in millilitres"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button type="submit" disabled={busy || !isValidWaterAmount(amount)}>
              Add
            </Button>
          </form>
        )}
        {day.last && (
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" disabled={busy} onClick={() => undo(day.last)}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Undo last ({day.last.amount_ml} ml)
          </Button>
        )}
        {(day.entries.length > 0 || day.other > 0) && (
          <ul className="mt-auto space-y-1 border-t border-border/60 pt-2 text-xs" aria-label="Water entries">
            {[...day.entries]
              .reverse()
              .slice(0, 5)
              .map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span className="tabular-nums text-muted-foreground">{timeLabel(w) || '—'}</span>
                  <span className="flex-1 tabular-nums">{w.amount_ml} ml</span>
                  <button
                    type="button"
                    aria-label={`Delete ${w.amount_ml} ml entry`}
                    className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
                    onClick={async () => {
                      if (
                        await confirm({ title: 'Delete this water entry?', description: `${w.amount_ml} ml will come off today's total.` })
                      )
                        del(w)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            {day.entries.length > 5 && <li className="text-muted-foreground">+ {day.entries.length - 5} earlier</li>}
            {day.other > 0 && <li className="text-muted-foreground">+ {fmtMl(day.other)} logged in Sleep &amp; Health</li>}
          </ul>
        )}
      </div>
    </Card>
  )
}
