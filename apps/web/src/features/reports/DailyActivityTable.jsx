import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDay } from '@/lib/dates'

const HEADERS = ['Date', 'Score', 'Tasks', 'Study', 'Focus', 'Workout', 'Habits', 'Sleep', 'Spent']

/** One row per day of the range, newest first. `daily` is buildReport().daily (oldest first). */
export function DailyActivityTable({ daily, money }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily activity summary</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 pt-2" role="region" aria-label="Daily activity summary" tabIndex={0}>
        {daily.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No days in this range yet.</p>
        ) : (
          <table className="lt-table min-w-[640px]">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{fmtDay(d.date, 'EEE, d MMM')}</td>
                  <td className="font-medium tabular-nums">{d.score ?? '—'}</td>
                  <td className="tabular-nums">
                    {d.tasksDone}/{d.tasksPlanned}
                  </td>
                  <td className="tabular-nums">{d.studyMinutes}m</td>
                  <td className="tabular-nums">{d.focusMinutes}m</td>
                  <td>{d.workout ? '✓' : '—'}</td>
                  <td className="tabular-nums">{d.habitsDone}</td>
                  <td className="tabular-nums">{d.sleepHours ?? '—'}</td>
                  <td className="tabular-nums">{money(d.spentPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
