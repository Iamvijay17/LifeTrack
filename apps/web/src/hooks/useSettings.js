import { useMemo } from 'react'
import { useTable, upsert } from './store'
import { DEFAULTS } from '@lifetrack/constants/schema'
import { useAuth } from './useAuth'

export function useSettings() {
  const { rows, loading, error } = useTable('user_settings')
  const settings = useMemo(() => ({ ...DEFAULTS.user_settings, ...(rows[0] ?? {}) }), [rows])
  const save = (patch) => upsert('user_settings', { ...patch }, { onConflict: 'user_id' })
  return { settings, row: rows[0] ?? null, loading, error, save }
}
