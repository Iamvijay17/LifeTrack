import { setApplicationStatus } from '@/services/api'
import { celebrate } from '@/lib/celebrate'

const WINS = ['offer', 'selected']

/** Changes an application's status. Landing an offer is exactly what confetti is for. */
export async function moveApplication(app, status, today) {
  const out = await setApplicationStatus(app, status, today)
  if (WINS.includes(status) && !WINS.includes(app.status)) celebrate()
  return out
}
