import { toast } from 'sonner'
import { deleteRow, saveRow } from '@/services/api'
import { MEAL_LABEL } from '@/domain/nutrition'
import { toAppError } from '@/services/errors'

/** Saves a food entry and offers to take it straight back ("Undo"), so a mis-tap in the quick flow costs nothing. */
export async function logEntry(row) {
  const saved = await saveRow('food_logs', null, row)
  toast.success(`Added ${saved.name} to ${MEAL_LABEL[saved.meal_type]}`, {
    action: {
      label: 'Undo',
      onClick: () => deleteRow('food_logs', saved.id).catch((e) => toast.error(toAppError(e).message)),
    },
  })
  return saved
}
