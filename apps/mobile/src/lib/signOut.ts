import { pushService } from '../features/notifications'
import { authService } from './supabase'

/** Sign out, first removing this device's push token from the account so the next user on a shared phone never receives it. */
export async function signOutCleanly() {
  // Best effort and bounded: an offline phone must still be able to sign out.
  await Promise.race([pushService.unregister().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])
  await authService!.signOut()
}
