import { TaskDialog } from '@/features/planner/TaskDialog'
import { TransactionDialog } from '@/features/finance/TransactionDialog'
import { ApplicationDialog } from '@/features/jobs/ApplicationDialog'
import { WaterDialog } from '@/features/health/WaterDialog'
import { useToday } from '@/hooks/useToday'
import { HabitQuick } from './HabitQuick'
import { QuickWorkout } from './QuickWorkout'
import { StudyStart } from './StudyStart'

/**
 * The dialog for one quick-add `kind`. Kept in its own module so the app shell can load it on first use: it pulls in
 * every form's schema and the forms themselves, none of which are needed to draw the page.
 */
export default function QuickDialogs({ kind, onClose }) {
  const today = useToday()
  const onOpenChange = (o) => !o && onClose()
  switch (kind) {
    case 'task':
      return <TaskDialog open onOpenChange={onOpenChange} defaultDate={today} />
    case 'expense':
      return <TransactionDialog open onOpenChange={onOpenChange} today={today} defaultType="expense" />
    case 'application':
      return <ApplicationDialog open onOpenChange={onOpenChange} today={today} />
    case 'water':
      return <WaterDialog open onOpenChange={onOpenChange} date={today} />
    case 'study':
      return <StudyStart onClose={onClose} />
    case 'habit':
      return <HabitQuick onClose={onClose} />
    case 'workout':
      return <QuickWorkout onClose={onClose} />
    default:
      return null
  }
}
