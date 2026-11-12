import { BellPlus, CalendarClock, CalendarPlus, Copy, ExternalLink, ListChecks, MoveRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { SEPARATOR } from '@/components/context-menu/items'
import { bulkDelete, changeField, copyDetails, count } from '@/components/context-menu/helpers'
import { JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'
import { addDays, fmtDay } from '@/lib/dates'
import { formatLpa } from '@/lib/money'
import * as store from '@/hooks/store'
import { moveApplication } from './moveStatus'

/** `status` is the current one (checked), or null for a bulk menu. */
const statusItems = (current, apply) =>
  JOB_STATUSES.map((s) => ({ label: STATUS_LABEL[s], radio: true, checked: current === s, onSelect: () => apply(s) }))

/** One application. `d`: { today, onOpen, onEdit, onScheduleInterview, select } */
export function applicationItems(app, d) {
  const move = async (status) => {
    const was = app.status
    await moveApplication(app, status, d.today)
    return { message: `Moved to ${STATUS_LABEL[status]}`, undo: () => moveApplication({ ...app, status }, was, d.today) }
  }
  const followUp = (date, message) => changeField('job_applications', app, { followup_date: date }, message)
  return [
    { label: 'Open details', icon: ExternalLink, onSelect: () => d.onOpen(app) },
    { label: 'Edit application', icon: Pencil, onSelect: () => d.onEdit(app) },
    SEPARATOR,
    { label: 'Update status', icon: MoveRight, items: () => statusItems(app.status, move) },
    { label: 'Schedule interview', icon: CalendarPlus, onSelect: () => d.onScheduleInterview(app.id) },
    {
      label: 'Follow-up reminder',
      icon: BellPlus,
      items: () => [
        { label: 'In 3 days', onSelect: () => followUp(addDays(d.today, 3), `Follow up on ${fmtDay(addDays(d.today, 3), 'EEE d MMM')}`) },
        { label: 'In a week', onSelect: () => followUp(addDays(d.today, 7), `Follow up on ${fmtDay(addDays(d.today, 7), 'EEE d MMM')}`) },
        {
          label: 'In two weeks',
          onSelect: () => followUp(addDays(d.today, 14), `Follow up on ${fmtDay(addDays(d.today, 14), 'EEE d MMM')}`),
        },
        SEPARATOR,
        { label: 'Clear follow-up', hidden: !app.followup_date, onSelect: () => followUp(null, 'Follow-up cleared') },
      ],
    },
    SEPARATOR,
    {
      label: 'Open job posting',
      icon: ExternalLink,
      hidden: !app.jd_url,
      onSelect: () => void window.open(app.jd_url, '_blank', 'noopener,noreferrer'),
    },
    {
      label: 'Copy job details',
      icon: Copy,
      onSelect: () =>
        copyDetails(`${app.job_title} at ${app.company}`, [
          ['Status', STATUS_LABEL[app.status]],
          ['Location', app.location],
          ['Package', formatLpa(app.salary_paise)],
          ['Source', app.source],
          ['Applied', app.applied_date && fmtDay(app.applied_date, 'd MMM yyyy')],
          ['Contact', app.contact_person],
          ['Posting', app.jd_url],
          ['Notes', app.notes],
        ]),
    },
    { label: 'Select', icon: ListChecks, onSelect: () => d.select?.(app.id) },
    SEPARATOR,
    {
      label: 'Delete application',
      icon: Trash2,
      danger: true,
      confirm: {
        title: `Delete ${app.company}?`,
        description: 'Its interviews and status history are deleted too. This cannot be undone.',
        confirmLabel: 'Delete',
      },
      onSelect: async () => {
        await store.remove('job_applications', app.id)
        return { message: 'Application deleted' }
      },
    },
  ]
}

/** Several selected applications. */
export function applicationBulkItems(apps, { today }) {
  const move = async (status) => {
    for (const a of apps) await moveApplication(a, status, today)
    return { message: `${count(apps.length, 'application')} moved to ${STATUS_LABEL[status]}` }
  }
  return [
    { label: 'Update status', icon: CalendarClock, items: () => statusItems(null, move) },
    SEPARATOR,
    bulkDelete(
      'job_applications',
      apps.map((a) => a.id),
      'application',
    ),
  ]
}

/** Empty space on the page. */
export function jobsPageItems({ addApplication, scheduleInterview, hasApps }) {
  return [
    { label: 'Add application', icon: Plus, onSelect: () => addApplication() },
    { label: 'Schedule interview', icon: CalendarPlus, hidden: !hasApps, onSelect: () => scheduleInterview(null) },
  ]
}

/** A board column. */
export const jobsColumnItems = (status, addApplication) => [
  { label: `Add application · ${STATUS_LABEL[status]}`, icon: Plus, onSelect: () => addApplication(status) },
]
