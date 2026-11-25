import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { challengeAnalytics, challengeCards } from '@/domain/challenges'
import { celebrate } from '@/lib/celebrate'
import { settleChallenges } from '@/services/api'

/**
 * Everything the Challenges page shows, from one set of tables: challenges with their progress, the analytics, and the person's templates.
 * Two things happen on their own, once the data is in: challenges whose time is up are closed (settleChallenges, safe on any device), and a
 * milestone that was just reached says so.
 */
export function useChallenges() {
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading, error, refetch } = useTables('challenges', 'challenge_checkins', 'challenge_templates', 'habit_logs', 'habits')
  const cards = useMemo(() => challengeCards(data.challenges, data.challenge_checkins, data.habit_logs, today), [data, today])
  const analytics = useMemo(
    () => challengeAnalytics(data.challenges, data.challenge_checkins, data.habit_logs, today, { weekStartsOn: settings.week_starts_on }),
    [data, today, settings.week_starts_on],
  )

  // Close what has finished: once per day, after everything has loaded.
  const settledFor = useRef(null)
  useEffect(() => {
    if (loading || error || settledFor.current === today) return
    settledFor.current = today
    settleChallenges(today)
      .then((done) => {
        for (const c of done)
          toast.success(c.final_pct >= 100 ? `Challenge complete: ${c.title}` : `${c.title} finished at ${c.final_pct}%`)
        if (done.some((c) => c.final_pct >= 100)) celebrate()
      })
      .catch(() => {
        settledFor.current = null // try again on the next refresh rather than leaving it undone
      })
  }, [loading, error, today])

  // Announce a milestone the moment it is reached (not for ones already reached when the page opened).
  const seen = useRef(null)
  useEffect(() => {
    if (loading) return
    const now = new Map()
    for (const x of cards) now.set(x.challenge.id, new Set(x.milestones.filter((m) => m.reached).map((m) => m.pct)))
    if (seen.current) {
      for (const x of cards) {
        const before = seen.current.get(x.challenge.id)
        if (!before || x.challenge.status === 'completed') continue
        const fresh = x.milestones.filter((m) => m.reached && !before.has(m.pct) && m.pct < 100)
        if (fresh.length) {
          toast.success(`Milestone reached in ${x.challenge.title}: ${fresh[fresh.length - 1].title}`)
          celebrate({ count: 36 })
        }
      }
    }
    seen.current = now
  }, [cards, loading])

  return {
    today,
    cards,
    analytics,
    templates: data.challenge_templates,
    habits: data.habits,
    habitLogs: data.habit_logs,
    checkins: data.challenge_checkins,
    loading,
    error,
    refetch,
  }
}
