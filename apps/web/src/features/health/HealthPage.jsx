import { useMemo, useState } from 'react'
import { Droplets } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { averageSleep, healthWeek, recentLogs, weightSeries } from '@/domain/health'
import { averageEnergy, sleepConsistency, sleepGoalOf } from '@lifetrack/core/sleep'
import { DailyLogForm } from './DailyLogForm'
import { HealthCharts } from './HealthCharts'
import { HealthHistory } from './HealthHistory'
import { HealthStats } from './HealthStats'
import { WaterDialog } from './WaterDialog'

export default function HealthPage() {
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading, error, refetch } = useTables('health_logs')
  const [date, setDate] = useState(null)
  const day = date ?? today
  const [waterOpen, setWaterOpen] = useState(false)

  const logs = data.health_logs
  const week = useMemo(() => healthWeek(logs, today), [logs, today])
  const sleep = useMemo(() => averageSleep(week), [week])
  const weight = useMemo(() => weightSeries(logs, 30), [logs])
  const history = useMemo(() => recentLogs(logs), [logs])
  const todayLog = logs.find((h) => h.log_date === today)
  const sleepGoal = sleepGoalOf(settings)
  // Consistency over the last 14 logged days, so one late night doesn't define the picture.
  const recent = useMemo(() => recentLogs(logs).slice(0, 14), [logs])
  const consistency = useMemo(() => sleepConsistency(recent, { goalMinutes: sleepGoal }), [recent, sleepGoal])
  const energy = useMemo(() => averageEnergy(recent), [recent])

  const openDay = (d) => {
    setDate(d)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <PageHeader
        title="Sleep & Health"
        description="Log once a day. Sleep is saved under the date you woke up."
        actions={
          <Button variant="outline" onClick={() => setWaterOpen(true)}>
            <Droplets className="h-4 w-4" />
            Log water
          </Button>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <HealthStats sleep={sleep} weight={weight} todayLog={todayLog} settings={settings} sleepGoal={sleepGoal} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <DailyLogForm day={day} today={today} log={logs.find((h) => h.log_date === day)} onDayChange={setDate} />
            <HealthCharts
              week={week}
              weightData={weight.data}
              waterGoal={settings.water_goal_ml}
              sleepGoal={sleepGoal}
              consistency={consistency}
              energy={energy}
            />
          </div>
          <HealthHistory logs={history} onSelect={openDay} />
        </div>
      </DataGate>
      <WaterDialog open={waterOpen} onOpenChange={setWaterOpen} date={today} />
    </>
  )
}
