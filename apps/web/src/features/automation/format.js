import {
  Bell,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  ListChecks,
  ListPlus,
  Loader2,
  MinusCircle,
  Pencil,
  Target,
  XCircle,
  Zap,
  GitBranch,
  AlarmClock,
  ListTodo,
} from 'lucide-react'
import { fmtDateTime } from '@lifetrack/utils'

/** How an execution status looks and reads. */
export const STATUS = {
  completed: { label: 'Completed', tone: 'success', icon: CheckCircle2, text: 'text-success' },
  failed: { label: 'Failed', tone: 'danger', icon: XCircle, text: 'text-danger' },
  skipped: { label: 'Skipped', tone: 'neutral', icon: MinusCircle, text: 'text-muted-foreground' },
  running: { label: 'Running', tone: 'primary', icon: Loader2, text: 'text-mod-text' },
  pending: { label: 'Pending', tone: 'neutral', icon: CircleDashed, text: 'text-muted-foreground' },
}
export const statusMeta = (s) => STATUS[s] ?? STATUS.pending

/** Node look by type. */
export const NODE_STYLE = {
  trigger: { label: 'Trigger', icon: Zap, chip: 'bg-warning/15 text-warning', ring: 'border-warning/40', dot: 'bg-warning' },
  condition: { label: 'Condition', icon: GitBranch, chip: 'bg-mod/15 text-mod-text', ring: 'border-mod/40', dot: 'bg-mod' },
  action: { label: 'Action', icon: ListTodo, chip: 'bg-success/15 text-success', ring: 'border-success/40', dot: 'bg-success' },
}
export const ACTION_ICON = {
  notify: Bell,
  create_task: ListPlus,
  update_task: Pencil,
  create_reminder: AlarmClock,
  update_goal_progress: Target,
  create_review_task: ClipboardCheck,
  add_checklist_item: ListChecks,
  complete: CheckCircle2,
}
export const nodeIcon = (n) => (n.type === 'action' ? (ACTION_ICON[n.kind] ?? ListTodo) : (NODE_STYLE[n.type]?.icon ?? Zap))

export const when = (iso, tz) => (iso ? fmtDateTime(iso, tz) : '')
/** "3 min ago", "2 h ago", or the date. */
export function ago(iso, nowMs = Date.now()) {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86_400)} d ago`
}
