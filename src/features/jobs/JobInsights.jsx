import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WeeklyApplicationsChart, SalaryChart } from '@/features/analytics/JobCharts'

export function JobInsights({ apps, today, weekStartsOn, tz }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Applications per week</CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyApplicationsChart apps={apps} today={today} weekStartsOn={weekStartsOn} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Package progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalaryChart apps={apps} tz={tz} />
        </CardContent>
      </Card>
    </div>
  )
}
