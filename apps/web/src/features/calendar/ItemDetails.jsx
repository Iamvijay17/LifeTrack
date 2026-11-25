import { Bell, CalendarDays, ExternalLink, Link2, MapPin, Repeat } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { PRIORITY_META, alertLabel, categoryMeta, describeRule } from '@/domain/calendar'
import { RECURRENCES } from '@/domain/recurrence'
import { useTables } from '@/hooks/store'
import { fmtDay } from '@/lib/dates'
import { timeText } from './format'

const KIND = { task: 'Task', event: 'Event', interview: 'Interview', reminder: 'Reminder', deadline: 'Deadline' }
const SOURCE_NAME = {
  '/jobs': 'Job Switch',
  '/goals': 'Goals',
  '/learning': 'Career & Learning',
  '/finance': 'Finance',
  '/notifications': 'Notifications',
}
const LINK_COLUMNS = [
  ['goal_id', 'goals', 'Goal', '/goals', (r) => r.title],
  ['topic_id', 'learning_topics', 'Topic', '/learning', (r) => `${r.group_name} · ${r.name}`],
  ['application_id', 'job_applications', 'Application', '/jobs', (r) => `${r.company} · ${r.job_title}`],
  ['routine_id', 'routines', 'Routine', '/fitness', (r) => r.name],
]

/** The record an event is linked to, with a way to open it. Only rendered for events that have a link, so other items never load these tables. */
function LinkedRecord({ row, onNavigate }) {
  const { data } = useTables('goals', 'learning_topics', 'job_applications', 'routines')
  const hit = LINK_COLUMNS.find(([col]) => row[col])
  if (!hit) return null
  const [col, table, label, to, name] = hit
  const record = data[table].find((r) => r.id === row[col])
  return (
    <Detail icon={Link2} label="Linked to">
      {record ? (
        <button
          type="button"
          className="text-left font-medium text-mod-text underline-offset-2 hover:underline"
          onClick={() => onNavigate(to)}
        >
          {label}: {name(record)}
        </button>
      ) : (
        <span className="text-muted-foreground">{label} (no longer exists)</span>
      )}
    </Detail>
  )
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 text-sm">
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </div>
  )
}

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s)

/** Everything about one item, and what can be done with it. Anything can be opened; tasks and events can also be edited, finished and deleted here. */
export function ItemDetails({ item, open, onOpenChange, prefs, onEdit, onDelete, onToggle, onNavigate }) {
  if (!item) return <Dialog open={false} onOpenChange={onOpenChange} title="" />
  const cat = categoryMeta(item.category)
  const pr = item.priority ? PRIORITY_META[item.priority] : null
  const repeat =
    item.kind === 'event' && item.row.rrule
      ? describeRule(item.row.rrule, item.occurrenceDate ?? item.date, (d) => fmtDay(d, 'd MMM yyyy'))
      : item.kind === 'task' && item.recurring
        ? RECURRENCES.find((r) => r.value === item.row.recurrence)?.label
        : item.kind === 'reminder' && item.recurring
          ? `Repeats ${item.row.repeat}`
          : null
  const moduleName = item.href ? (SOURCE_NAME[item.href] ?? 'its page') : null
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item.title}
      description={`${KIND[item.kind]} · ${cat.label}`}
      footer={
        <>
          {item.deletable && (
            <Button variant="ghost" className="mr-auto text-danger hover:bg-danger/10" onClick={() => onDelete(item)}>
              Delete
            </Button>
          )}
          {item.completable && (
            <Button variant="outline" onClick={() => onToggle(item)}>
              {item.done ? 'Mark as not done' : 'Mark as done'}
            </Button>
          )}
          {item.editable && <Button onClick={() => onEdit(item)}>Edit</Button>}
          {!item.editable && item.href && (
            <Button onClick={() => onNavigate(item.href)}>
              <ExternalLink className="h-4 w-4" />
              Open {moduleName}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3.5" data-testid="item-details">
        <div className="flex flex-wrap gap-1.5">
          {item.done && <Badge tone="success">Done</Badge>}
          {item.overdue && <Badge tone="danger">Overdue</Badge>}
          {item.modified && <Badge>Edited</Badge>}
          {pr && item.kind !== 'reminder' && item.kind !== 'interview' && (
            <Badge tone={item.priority === 'urgent' || item.priority === 'high' ? 'warning' : 'neutral'}>{pr.label}</Badge>
          )}
        </div>
        <Detail icon={CalendarDays} label="When">
          <p className="font-medium">
            {fmtDay(item.date, 'EEEE, d MMMM yyyy')}
            {item.endDate !== item.date && ` – ${fmtDay(item.endDate, 'EEEE, d MMMM yyyy')}`}
          </p>
          <p className="text-muted-foreground">{timeText(item, prefs)}</p>
        </Detail>
        {repeat && (
          <Detail icon={Repeat} label="Repeats">
            {repeat}
          </Detail>
        )}
        {item.location && (
          <Detail icon={MapPin} label="Where">
            {isUrl(item.location) ? (
              <a
                href={item.location}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all text-mod-text underline-offset-2 hover:underline"
              >
                {item.location}
              </a>
            ) : (
              item.location
            )}
          </Detail>
        )}
        {item.alertMinutes?.length > 0 && (
          <Detail icon={Bell} label="Alerts">
            {item.alertMinutes.map(alertLabel).join(', ')}
          </Detail>
        )}
        {item.kind === 'event' && <LinkedRecord row={item.row} onNavigate={onNavigate} />}
        {item.description && <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{item.description}</p>}
      </div>
    </Dialog>
  )
}
