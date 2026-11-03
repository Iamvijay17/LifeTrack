import { useMemo } from 'react'
import { DEFAULTS } from '@lifetrack/constants/schema'
import { store } from '../data/client'
import { useTable } from '../data/useTable'

export interface Settings { timezone: string; currency: string; week_starts_on: 0 | 1; daily_study_target_minutes: number; water_goal_ml: number; steps_goal: number; monthly_budget_paise: number; [k: string]: any }

/** The user's settings merged over defaults (a brand-new account may not have loaded its row yet). */
export function useSettings() {
  const { rows, loading, error } = useTable<{ id: string }>('user_settings')
  const settings = useMemo(() => ({ ...DEFAULTS.user_settings, ...(rows[0] ?? {}) }) as Settings, [rows])
  const save = (patch: Record<string, unknown>) => store.upsert('user_settings', patch, { onConflict: 'user_id' })
  /** `row` is null until the account's settings have actually loaded (use it before acting on timezone-dependent data). */
  return { settings, row: (rows[0] as { id: string } | undefined) ?? null, loading, error, save }
}
