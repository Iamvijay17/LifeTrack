import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart } from 'recharts'
import { Coffee, Pause, Play, SkipForward, Square, Timer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { recordFocus } from '@/services/api'
import { useFocusTimer } from '@/features/focus/useFocusTimer'
import { completedCount, dailyFocus, fmtClock, focusMinutes, nextBreak, PRESETS, weekRange } from '@/domain/focus'
import { fmtDay, fmtDuration, timeStrInTz } from '@/lib/dates'
import { cn } from '@/lib/utils'

const MODE_LABEL = { focus: 'Focus', short_break: 'Short break', long_break: 'Long break' }

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 660; g.gain.value = 0.08
    o.start(); o.stop(ctx.currentTime + 0.35)
  } catch { /* sound is optional */ }
}

function Dial({ left, total, mode }) {
  const r = 88, c = 2 * Math.PI * r, pct = total ? Math.max(0, Math.min(1, left / total)) : 1
  return (
    <svg viewBox="0 0 200 200" className="mx-auto h-56 w-56 -rotate-90" role="timer" aria-label={`${fmtClock(left)} remaining`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="rgb(var(--muted))" strokeWidth="8" />
      <circle cx="100" cy="100" r={r} fill="none" stroke={mode === 'focus' ? 'var(--c-primary)' : 'var(--c-success)'} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      <text x="100" y="100" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[40px] font-semibold tabular-nums" style={{ transform: 'rotate(90deg)', transformOrigin: '100px 100px' }}>{fmtClock(left)}</text>
    </svg>
  )
}

export default function FocusPage() {
  const today = useToday()
  const { settings } = useSettings()
  const prefs = settings.focus_prefs
  const { data, loading, error, refetch } = useTables('focus_sessions', 'tasks', 'learning_topics')
  const [mode, setMode] = useState('focus')
  const [preset, setPreset] = useState('25')
  const [custom, setCustom] = useState('30')
  const [target, setTarget] = useState('') // 'task:<id>' | 'topic:<id>'
  const [label, setLabel] = useState('')

  const todays = useMemo(() => data.focus_sessions.filter((s) => s.session_date === today), [data.focus_sessions, today])
  const doneToday = completedCount(todays)

  const [save] = useAction(recordFocus)
  const timer = useFocusTimer({
    onFinish: async (t, completed) => {
      beep()
      if (t.mode === 'focus') {
        const r = await save({ plannedMinutes: t.plannedMinutes, actualSeconds: t.plannedMinutes * 60, completed, taskId: t.taskId, topicId: t.topicId, label: t.label, date: today })
        if (r) toast.success('Focus session complete', { description: `${t.plannedMinutes} minutes recorded.` })
        const next = nextBreak(doneToday + 1, prefs.long_every)
        setMode(next)
      } else { toast('Break over — ready for the next focus block?'); setMode('focus') }
    },
  })

  const minutes = mode === 'focus' ? (preset === 'custom' ? Number(custom) : Number(preset)) : mode === 'short_break' ? prefs.short_break : prefs.long_break
  const validMinutes = Number.isInteger(minutes) && minutes >= 1 && minutes <= 240

  useEffect(() => {
    document.title = timer.timer ? `${fmtClock(timer.left)} · ${MODE_LABEL[timer.timer.mode]} — LifeTrack` : 'LifeTrack'
    return () => { document.title = 'LifeTrack' }
  }, [timer.timer, timer.left])

  const begin = () => {
    if (!validMinutes) return toast.error('Choose a duration between 1 and 240 minutes.')
    const [kind, id] = target.split(':')
    timer.start({ mode, plannedMinutes: minutes, taskId: kind === 'task' ? id : null, topicId: kind === 'topic' ? id : null, label })
  }
  const [stopEarly] = useAction(async () => {
    const t = timer.timer
    const spent = timer.stop()
    if (t.mode !== 'focus') return
    const r = await recordFocus({ plannedMinutes: t.plannedMinutes, actualSeconds: spent, completed: false, taskId: t.taskId, topicId: t.topicId, label: t.label, date: today })
    if (!r) toast('Stopped — under a minute, so nothing was recorded.')
  }, { success: 'Stopped and saved' })
  const [remove] = useAction((id) => store.remove('focus_sessions', id), { success: 'Session deleted' })

  const { from, to } = weekRange(today, settings.week_starts_on)
  const week = useMemo(() => dailyFocus(data.focus_sessions, from, to).map((d) => ({ ...d, label: fmtDay(d.date, 'EEE') })), [data.focus_sessions, from, to])
  const weekTotal = week.reduce((a, d) => a + d.minutes, 0)
  const openTasks = data.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')
  const nameOf = (s) => data.tasks.find((t) => t.id === s.task_id)?.title ?? data.learning_topics.find((t) => t.id === s.topic_id)?.name ?? s.label ?? 'Focus'
  const active = timer.timer
  const shownMode = active?.mode ?? mode
  const total = (active?.plannedMinutes ?? (validMinutes ? minutes : 25)) * 60

  return (
    <>
      <PageHeader title="Focus Mode" description="Pomodoro timer — every finished block is saved to your account." />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3"><CardContent className="space-y-5 py-6">
            {!active && <Segmented className="mx-auto flex w-fit" value={mode} onChange={setMode} options={[{ value: 'focus', label: 'Focus' }, { value: 'short_break', label: 'Short break' }, { value: 'long_break', label: 'Long break' }]} />}
            {active && <p className="text-center text-sm font-medium text-secondary">{MODE_LABEL[active.mode]}{active.label ? ` · ${active.label}` : ''}</p>}
            <Dial left={active ? timer.left : (validMinutes ? minutes * 60 : 0)} total={total} mode={shownMode} />
            {!active ? (
              <div className="mx-auto max-w-sm space-y-3">
                {mode === 'focus' && (<>
                  <div className="flex flex-wrap items-end justify-center gap-2">
                    <Segmented value={preset} onChange={setPreset} options={[...PRESETS.map((p) => ({ value: String(p.minutes), label: p.label })), { value: 'custom', label: 'Custom' }]} />
                    {preset === 'custom' && <Field label="Minutes" className="w-24"><Input type="number" min={1} max={240} value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
                  </div>
                  <Field label="Working on"><Select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Nothing specific</option>
                    {openTasks.length > 0 && <optgroup label="Tasks">{openTasks.map((t) => <option key={t.id} value={`task:${t.id}`}>{t.title}</option>)}</optgroup>}
                    <optgroup label="Learning topics">{data.learning_topics.filter((t) => !t.archived).map((t) => <option key={t.id} value={`topic:${t.id}`}>{t.group_name} · {t.name}</option>)}</optgroup>
                  </Select></Field>
                  <Field label="Note (optional)"><Input maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Chapter 4 exercises" /></Field>
                </>)}
                {mode !== 'focus' && <p className="text-center text-sm text-muted-foreground">{mode === 'short_break' ? prefs.short_break : prefs.long_break}-minute break. Change break lengths in Settings.</p>}
                <Button size="lg" className="w-full" onClick={begin} disabled={!validMinutes}>{mode === 'focus' ? <Timer className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}Start {MODE_LABEL[mode].toLowerCase()}</Button>
              </div>
            ) : (
              <div className="flex justify-center gap-2">
                {timer.running ? <Button variant="outline" onClick={timer.pause}><Pause className="h-4 w-4" />Pause</Button> : <Button onClick={timer.resume}><Play className="h-4 w-4" />Resume</Button>}
                {active.mode === 'focus' ? <Button variant="outline" onClick={() => stopEarly()}><Square className="h-4 w-4" />Stop &amp; save</Button> : <Button variant="outline" onClick={() => { timer.stop(); setMode('focus') }}><SkipForward className="h-4 w-4" />Skip break</Button>}
              </div>
            )}
          </CardContent></Card>

          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Timer} label="Focus today" value={fmtDuration(Math.round(focusMinutes(todays)))} sub={`${doneToday} completed block${doneToday === 1 ? '' : 's'}`} />
              <StatCard icon={Timer} label="This week" value={fmtDuration(Math.round(weekTotal))} sub={`${fmtDay(from, 'd MMM')} – ${fmtDay(to, 'd MMM')}`} />
            </div>
            <Card><CardHeader><CardTitle>Weekly focus (minutes)</CardTitle></CardHeader><CardContent>
              <Chart height={150} empty={weekTotal === 0} emptyText="Finish a focus block to see your week."><BarChart data={week}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis()}{tooltip({ formatter: (v) => [`${v} min`, 'Focus'] })}<Bar dataKey="minutes" fill={C.primary} radius={[4, 4, 0, 0]} /></BarChart></Chart>
            </CardContent></Card>
          </div>

          <Card className="lg:col-span-5"><CardHeader><CardTitle>Today's sessions</CardTitle></CardHeader><CardContent>
            {todays.length === 0 ? <EmptyState icon={Timer} title="No focus sessions yet today" description="Start a 25-minute block — short, distraction-free work adds up." />
              : <ul className="divide-y divide-border">{[...todays].sort((a, b) => b.started_at.localeCompare(a.started_at)).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5"><span className={cn('h-2 w-2 rounded-full', s.completed ? 'bg-success' : 'bg-warning')} aria-label={s.completed ? 'completed' : 'stopped early'} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{nameOf(s) || 'Focus'}{s.label && s.label !== nameOf(s) ? ` — ${s.label}` : ''}</p><p className="text-xs text-muted-foreground">{timeStrInTz(s.started_at, settings.timezone)} · {Math.round(s.actual_seconds / 60)} of {s.planned_minutes} min{s.completed ? '' : ' (stopped early)'}</p></div>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete session" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button></li>))}</ul>}
          </CardContent></Card>
        </div>
      </DataGate>
    </>
  )
}
