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

export const StatusBadge = ({ status }) => <Badge tone={APPLICATION_TONE[status] ?? 'neutral'}>{STATUS_LABEL[status]}</Badge>
export const InterviewStatusBadge = ({ status }) => <Badge tone={INTERVIEW_TONE[status] ?? 'primary'}>{status}</Badge>
