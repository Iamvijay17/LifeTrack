import { useCallback } from 'react'
import { useSettings } from './useSettings'

export const REPORT_PREFS_LIMIT = 20

const KINDS = ['day', 'week', 'month', 'quarter', 'year', 'custom']
const TABS = ['overview', 'learning', 'fitness', 'finance', 'habits']
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Keeps only well-formed saved configurations (the account's copy may come from an older or newer app). */
export function normalizeSaved(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && s.name.trim() && KINDS.includes(s.kind))
    .map((s) => ({
      id: s.id,
      name: s.name.trim().slice(0, 40),
      kind: s.kind,
      tab: TABS.includes(s.tab) ? s.tab : 'overview',
      ...(s.kind === 'custom' && DATE.test(s.from ?? '') && DATE.test(s.to ?? '') && s.from <= s.to ? { from: s.from, to: s.to } : {}),
    }))
    .filter((s) => s.kind !== 'custom' || s.from)
    .slice(0, REPORT_PREFS_LIMIT)
}

/** Saved report configurations (period kind, tab and, for custom, the range) stored in `user_settings.report_prefs.saved`: they follow the account. */
export function useSavedReports() {
  const { settings, save } = useSettings()
  const saved = normalizeSaved(settings.report_prefs?.saved)
  const write = useCallback(
    (next) => save({ report_prefs: { ...(settings.report_prefs ?? {}), saved: next } }),
    [save, settings.report_prefs],
  )
  return {
    saved,
    add: async (config) => {
      if (saved.length >= REPORT_PREFS_LIMIT) throw new Error(`You can save up to ${REPORT_PREFS_LIMIT} reports. Delete one first.`)
      const entry = normalizeSaved([{ ...config, id: crypto.randomUUID() }])[0]
      if (!entry) throw new Error('That report cannot be saved.')
      await write([...saved.filter((s) => s.name.toLowerCase() !== entry.name.toLowerCase()), entry])
      return entry
    },
    remove: (id) => write(saved.filter((s) => s.id !== id)),
  }
}
