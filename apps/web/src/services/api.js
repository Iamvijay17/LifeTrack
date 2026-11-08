// Domain operations that span more than one row live in @lifetrack/data (shared with mobile).
// Web injects its cache/mutation store; UI components call these (never the adapters directly).
import { createApi } from '@lifetrack/data'
import * as store from '@/hooks/store'

export const {
  saveRow,
  deleteRow,
  createTask,
  setTaskStatus,
  setHabitStatus,
  startStudy,
  stopStudy,
  discardStudy,
  saveWorkout,
  saveHealth,
  addWater,
  setApplicationStatus,
  setMonthBudget,
  addSavingsFunds,
  seedDefaults,
  setGoalStatus,
  toggleMilestone,
  recordFocus,
  postDueRecurring,
  toggleRecurringRule,
  fireDueReminders,
  toggleReminder,
  clearReadNotifications,
  markNotificationRead,
  markAllRead,
} = createApi(store)
