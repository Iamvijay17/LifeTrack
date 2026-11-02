import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Line, LineChart, ReferenceLine } from 'recharts'
import { Droplets, Footprints, Moon, Scale, Zap, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { DateNav } from '@/components/shared/DateNav'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { WaterDialog } from '@/features/health/WaterDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/form'
import { useConfirm } from '@/components/shared/Confirm'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { sleepMinutes } from '@/domain/sleep'
import { saveHealth } from '@/services/api'
import { addDays, eachDay, fmtDay, fmtDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'

const time = z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Use HH:MM')
const num = (min, max, label) =>
  z.string().refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), `${label}: ${min}–${max}`)
const schema = z
  .object({
    bedtime: time,
    wake_time: time,
    water_ml: num(0, 20000, 'Water'),
    steps: num(0, 200000, 'Steps'),
    energy_level: z.string(),
    weight_kg: num(20, 500, 'Weight'),
    notes: z.string().max(1000),
  })
  .superRefine((v, ctx) => {
    if (!!v.bedtime !== !!v.wake_time)
      ctx.addIssue({ code: 'custom', path: [v.bedtime ? 'wake_time' : 'bedtime'], message: 'Enter both bedtime and wake-up time' })
    if (v.bedtime && v.wake_time && sleepMinutes(v.bedtime, v.wake_time) == null)
      ctx.addIssue({ code: 'custom', path: ['wake_time'], message: 'Bedtime and wake-up time can’t be identical' })
  })
const toForm = (h) => ({
  bedtime: h?.bedtime?.slice(0, 5) ?? '',
  wake_time: h?.wake_time?.slice(0, 5) ?? '',
  water_ml: h ? String(h.water_ml ?? 0) : '',
  steps: h ? String(h.steps ?? 0) : '',
  energy_level: h?.energy_level ? String(h.energy_level) : '',
  weight_kg: h?.weight_kg != null ? String(h.weight_kg) : '',
  notes: h?.notes ?? '',
})

export default function HealthPage() {
  const today = useToday()
  const confirm = useConfirm()
  const { settings } = useSettings()
  const { data, loading, error, refetch } = useTables('health_logs')
  const [date, setDate] = useState(null)
  const day = date ?? today
  const [water, setWater] = useState(false)
  const log = data.health_logs.find((h) => h.log_date === day)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toForm(null) })
  useEffect(() => {
    reset(toForm(log))
  }, [day, log?.id, log?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const energy = watch('energy_level')
  const liveSleep = sleepMinutes(watch('bedtime'), watch('wake_time'))

  const [save, saving] = useAction(
    async (v) => {
      const n = (s) => (s === '' ? null : Number(s))
      await saveHealth(day, {
        bedtime: v.bedtime || null,
        wake_time: v.wake_time || null,
        sleep_minutes: v.bedtime ? sleepMinutes(v.bedtime, v.wake_time) : null,
        water_ml: n(v.water_ml) ?? 0,
        steps: n(v.steps) ?? 0,
        energy_level: n(v.energy_level),
        weight_kg: n(v.weight_kg),
        notes: v.notes,
      })
    },
    { success: 'Health log saved' },
  )
  const [del] = useAction((id) => store.remove('health_logs', id), { success: 'Log deleted' })

  const week = useMemo(
    () =>
      eachDay(addDays(today, -6), today).map((d) => {
        const h = data.health_logs.find((x) => x.log_date === d)
        return {
          d,
          label: fmtDay(d, 'EEE'),
          sleep: h?.sleep_minutes != null ? Math.round((h.sleep_minutes / 60) * 10) / 10 : null,
          water: h?.water_ml || null,
          steps: h?.steps || null,
        }
      }),
    [data.health_logs, today],
  )
  const sleepVals = week.filter((w) => w.sleep != null)
  const avgSleep = sleepVals.length ? (sleepVals.reduce((a, b) => a + b.sleep, 0) / sleepVals.length) * 60 : null
  const todayLog = data.health_logs.find((h) => h.log_date === today)
  const weights = data.health_logs.filter((h) => h.weight_kg != null).sort((a, b) => a.log_date.localeCompare(b.log_date))
  const weightData = weights.slice(-30).map((h) => ({ label: fmtDay(h.log_date, 'd MMM'), kg: Number(h.weight_kg) }))
  const history = [...data.health_logs].sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, 14)

  return (
    <>
      <PageHeader
        title="Sleep & Health"
        description="Log once a day. Sleep is saved under the date you woke up."
        actions={
          <Button variant="outline" onClick={() => setWater(true)}>
            <Droplets className="h-4 w-4" />
            Log water
          </Button>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={Moon}
              label="Avg sleep (7 days)"
              value={avgSleep == null ? '—' : fmtDuration(avgSleep)}
              sub={sleepVals.length ? `${sleepVals.length} nights logged` : 'No sleep logged'}
            />
            <StatCard
              icon={Droplets}
              label="Water today"
              value={`${todayLog?.water_ml ?? 0} ml`}
              sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml} ml` : undefined}
              progress={settings.water_goal_ml ? ((todayLog?.water_ml ?? 0) / settings.water_goal_ml) * 100 : null}
              tone="success"
            />
            <StatCard
              icon={Footprints}
              label="Steps today"
              value={(todayLog?.steps ?? 0).toLocaleString('en-IN')}
              sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined}
              progress={settings.steps_goal ? ((todayLog?.steps ?? 0) / settings.steps_goal) * 100 : null}
            />
            <StatCard
              icon={Scale}
              label="Latest weight"
              value={weights.length ? `${weights.at(-1).weight_kg} kg` : '—'}
              sub={
                weights.length > 1
                  ? `${weights.at(-1).weight_kg - weights[0].weight_kg > 0 ? '+' : ''}${(weights.at(-1).weight_kg - weights[0].weight_kg).toFixed(1)} kg since first log`
                  : undefined
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Daily log</CardTitle>
                <DateNav date={day} onChange={setDate} today={today} />
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(save)} noValidate className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Bedtime" error={errors.bedtime?.message}>
                      <Input type="time" {...register('bedtime')} />
                    </Field>
                    <Field label="Wake-up" error={errors.wake_time?.message}>
                      <Input type="time" {...register('wake_time')} />
                    </Field>
                  </div>
                  {liveSleep != null && (
                    <p className="rounded-md bg-muted/50 px-3 py-1.5 text-sm" data-testid="sleep-duration">
                      Sleep: <b>{fmtDuration(liveSleep)}</b>
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Water (ml)" error={errors.water_ml?.message}>
                      <Input type="number" inputMode="numeric" min={0} {...register('water_ml')} />
                    </Field>
                    <Field label="Steps" error={errors.steps?.message}>
                      <Input type="number" inputMode="numeric" min={0} {...register('steps')} />
                    </Field>
                  </div>
                  <Field label="Energy level">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={energy === String(n)}
                          onClick={() => setValue('energy_level', energy === String(n) ? '' : String(n), { shouldDirty: true })}
                          className={cn(
                            'h-10 flex-1 rounded-md border border-border text-sm',
                            energy === String(n) ? 'border-primary bg-primary/15 text-secondary' : 'text-muted-foreground',
                          )}
                        >
                          <Zap className="mx-auto h-4 w-4" />
                          <span className="sr-only">Energy {n}</span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Weight (kg)" error={errors.weight_kg?.message}>
                    <Input type="number" inputMode="decimal" step="0.1" {...register('weight_kg')} />
                  </Field>
                  <Field label="Notes">
                    <Textarea rows={2} {...register('notes')} />
                  </Field>
                  <div className="flex justify-between gap-2">
                    {log ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={async () => {
                          if (await confirm({ title: `Delete the log for ${fmtDay(day, 'd MMM')}?` })) del(log.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button type="submit" loading={saving} disabled={!isDirty && !!log}>
                      {log ? 'Update log' : 'Save log'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4 lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle>Sleep — last 7 days (hours)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Chart height={190} empty={sleepVals.length === 0} emptyText="Log bedtime and wake-up time to see your sleep.">
                    <BarChart data={week}>
                      {grid()}
                      {xAxis({ dataKey: 'label' })}
                      {yAxis({ domain: [0, 10] })}
                      {tooltip({ formatter: (v) => [`${v} h`, 'Sleep'] })}
                      <ReferenceLine y={8} stroke={C.grid} strokeDasharray="4 4" />
                      <Bar dataKey="sleep" fill={C.secondary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </Chart>
                </CardContent>
              </Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Water (ml)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart height={150} empty={week.every((w) => !w.water)} emptyText="No water logged this week.">
                      <BarChart data={week}>
                        {xAxis({ dataKey: 'label' })}
                        {tooltip({ formatter: (v) => [`${v} ml`, 'Water'] })}
                        {settings.water_goal_ml > 0 && (
                          <ReferenceLine y={settings.water_goal_ml} stroke={C.success} strokeDasharray="4 4" />
                        )}
                        <Bar dataKey="water" fill={C.success} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </Chart>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Weight trend (kg)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart height={150} empty={weightData.length < 2} emptyText="Log weight on two or more days.">
                      <LineChart data={weightData}>
                        {xAxis({ dataKey: 'label' })}
                        {yAxis({ domain: ['dataMin - 1', 'dataMax + 1'] })}
                        {tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}
                        <Line dataKey="kg" stroke={C.primary} strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </Chart>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {history.length === 0 ? (
                <p className="px-4 pb-6 pt-2 text-center text-sm text-muted-foreground">Your daily logs will appear here.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={() => {
                          setDate(h.log_date)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm hover:bg-muted/30"
                      >
                        <span className="font-medium">{fmtDay(h.log_date, 'EEE, d MMM')}</span>
                        <span className="text-xs text-muted-foreground">
                          {[
                            h.sleep_minutes != null && `😴 ${fmtDuration(h.sleep_minutes)}`,
                            h.water_ml > 0 && `💧 ${h.water_ml} ml`,
                            h.steps > 0 && `👟 ${h.steps.toLocaleString('en-IN')}`,
                            h.energy_level && `⚡ ${h.energy_level}/5`,
                            h.weight_kg != null && `${h.weight_kg} kg`,
                          ]
                            .filter(Boolean)
                            .join('  ·  ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </DataGate>
      <WaterDialog open={water} onOpenChange={setWater} date={today} />
    </>
  )
}
