import { WorkoutDialog } from '@/features/fitness/WorkoutDialog'
import { useTables } from '@/hooks/store'
import { useToday } from '@/hooks/useToday'

/** Quick add → "Log workout": the normal workout dialog, loaded with the routines and exercise library. */
export function QuickWorkout({ onClose }) {
  const today = useToday()
  const { data } = useTables('routines', 'exercises')
  return (
    <WorkoutDialog
      open
      onOpenChange={(o) => !o && onClose()}
      routines={data.routines}
      library={data.exercises}
      today={today}
      date={today}
    />
  )
}
