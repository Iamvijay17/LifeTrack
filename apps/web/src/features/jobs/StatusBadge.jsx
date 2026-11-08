import { Badge } from '@/components/ui/misc'
import { STATUS_LABEL } from '@/domain/jobs'

const APPLICATION_TONE = {
  selected: 'success',
  offer: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
  interview: 'primary',
  assessment: 'warning',
}
const INTERVIEW_TONE = { completed: 'success', cancelled: 'neutral', scheduled: 'primary' }

/** Each stage of the pipeline has its own colour, on the board's columns and in the pipeline bar alike. */
export const STAGE_COLOR = {
  interested: '#94A3B8',
  preparing: '#38BDF8',
  applied: '#6366F1',
  assessment: '#F59E0B',
  interview: '#A855F7',
  selected: '#22C55E',
  offer: '#10B981',
  rejected: '#F43F5E',
  withdrawn: '#71717A',
}

export const StatusBadge = ({ status }) => <Badge tone={APPLICATION_TONE[status] ?? 'neutral'}>{STATUS_LABEL[status]}</Badge>
export const InterviewStatusBadge = ({ status }) => <Badge tone={INTERVIEW_TONE[status] ?? 'primary'}>{status}</Badge>
