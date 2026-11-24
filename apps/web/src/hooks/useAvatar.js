import { useAuth } from './useAuth'
import * as store from './store'
import { isAvatar } from '@/lib/avatar'

/** The signed-in person's profile picture (a small data URL) and a way to change or remove it. */
export function useAvatar() {
  const { user, displayName } = useAuth()
  const { rows } = store.useTable('profiles')
  const row = rows.find((r) => r.id === user?.id) ?? rows[0]
  const raw = row?.avatar
  return {
    avatar: isAvatar(raw) ? raw : null,
    /** Save a new picture (a data URL from fitAvatar), or null to remove it. Throws if the account cannot store it yet. */
    async save(dataUrl) {
      if (dataUrl !== null && !isAvatar(dataUrl)) throw new Error('That is not a usable picture.')
      if (row) await store.update('profiles', row.id, { avatar: dataUrl })
      else await store.insert('profiles', { id: user.id, display_name: displayName, avatar: dataUrl })
    },
  }
}
