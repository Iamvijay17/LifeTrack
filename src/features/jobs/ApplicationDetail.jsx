import { CalendarPlus, ExternalLink, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { STATUS_LABEL, JOB_STATUSES, checklistProgress } from '@/domain/jobs'
import { fmtDay } from '@/lib/dates'
import { formatLpa } from '@/lib/money'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { setApplicationStatus } from '@/services/api'
import { PrepChecklist, usePrepChecklist } from './PrepChecklist'
import { StatusHistory } from './StatusHistory'
import { ApplicationInterviews } from './ApplicationInterviews'

function Section({ title, icon: Icon, action, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Everything about one application: status, facts, interviews, preparation checklist and status history. */
export function ApplicationDetail({ app, history, events, tz, today, onClose, onEdit, onScheduleInterview, onEditInterview }) {
  const [move, moving] = useAction((s) => setApplicationStatus(app, s, today), { success: 'Status updated' })
  const removeApp = useConfirmedDelete('job_applications', 'Application deleted')
  const checklist = usePrepChecklist(app)
  const { done, total, percent } = checklistProgress(checklist.list)
  const hist = history.filter((h) => h.application_id === app.id).sort((a, b) => a.changed_at.localeCompare(b.changed_at))
  const evs = events.filter((e) => e.application_id === app.id).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  const facts = [
    ['Location', app.location],
    ['Package', formatLpa(app.salary_paise)],
    ['Applied', app.applied_date && fmtDay(app.applied_date, 'd MMM yyyy')],
    ['Source', app.source],
    ['Contact', app.contact_person],
    ['Follow-up', app.followup_date && fmtDay(app.followup_date, 'd MMM yyyy')],
    ['Resume', app.resume_version],
  ].filter(([, v]) => v)

  const askDelete = async () => {
    const deleted = await removeApp(app.id, {
      title: `Delete ${app.company}?`,
      description: 'This also deletes its status history and interviews.',
    })
    if (deleted) onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={app.company} description={app.job_title} className="md:max-w-2xl">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Status"
            className="h-9 w-40 md:h-9"
            disabled={moving}
            value={app.status}
            onChange={(e) => move(e.target.value)}
          >
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" onClick={() => onEdit(app)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          {app.jd_url && (
            <a
              href={app.jd_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] hover:bg-muted/60"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Job post
            </a>
          )}
          <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={askDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {app.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{app.notes}</p>}

        <Section
          title="Interviews"
          icon={CalendarPlus}
          action={
            <Button variant="ghost" size="sm" onClick={() => onScheduleInterview(app.id)}>
              <Plus className="h-3.5 w-3.5" />
              Schedule
            </Button>
          }
        >
          <ApplicationInterviews events={evs} tz={tz} onEdit={onEditInterview} />
        </Section>

        <Section
          title={`Preparation ${total ? `(${done}/${total} · ${percent}%)` : ''}`}
          icon={ListChecks}
          action={
            total === 0 && (
              <Button variant="ghost" size="sm" onClick={checklist.applyTemplate}>
                Use template
              </Button>
            )
          }
        >
          <PrepChecklist checklist={checklist} />
        </Section>

        <Section title="Status history">
          <StatusHistory history={hist} tz={tz} />
        </Section>
      </div>
    </Dialog>
  )
}
