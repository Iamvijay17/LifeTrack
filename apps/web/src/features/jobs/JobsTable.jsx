import { Card, CardContent } from '@/components/ui/card'
import { formatLpa } from '@/lib/money'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { MoveMenu } from './MoveMenu'

const COLUMNS = ['Company', 'Role', 'Status', 'Applied', 'Package', 'Follow-up']

/** Table on desktop, stacked cards on phones and tablets. */
export function JobsTable({ apps, today, onOpen }) {
  return (
    <>
      <Card className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              {COLUMNS.map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
              <th className="px-2 py-2.5 font-medium">
                <span className="sr-only">Move</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30" onClick={() => onOpen(a)}>
                <td className="px-4 py-2.5 font-medium">
                  {/* The row is clickable for the mouse; this is the same action for keyboards and screen readers. */}
                  <button type="button" className="rounded text-left hover:underline" onClick={() => onOpen(a)}>
                    {a.company}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.job_title}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={a.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {a.applied_date ? fmtDay(a.applied_date, 'd MMM') : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatLpa(a.salary_paise) ?? '—'}</td>
                <td className={cn('whitespace-nowrap px-4 py-2.5', a.followup_date && a.followup_date <= today && 'text-warning')}>
                  {a.followup_date ? fmtDay(a.followup_date, 'd MMM') : '—'}
                </td>
                <td className="px-2" onClick={(e) => e.stopPropagation()}>
                  <MoveMenu app={a} today={today} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="space-y-2 lg:hidden">
        {apps.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-3">
              <button className="block w-full text-left" onClick={() => onOpen(a)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.company}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.job_title}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {[a.applied_date && `Applied ${fmtDay(a.applied_date, 'd MMM')}`, formatLpa(a.salary_paise), a.location]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </button>
              <div className="mt-1 flex justify-end">
                <MoveMenu app={a} today={today} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
