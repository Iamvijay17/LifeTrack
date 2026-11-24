import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Flag, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { activeCards } from '@/domain/challenges'
import { celebrate } from '@/lib/celebrate'
import { checkInChallenge, removeCheckin, resumeChallenge } from '@/services/api'
import { CalendarPanel, AnalyticsPanel, HistoryPanel, TemplatesPanel } from './Panels'
import { ChallengeCard } from './ChallengeCard'
import { ChallengeDetail } from './ChallengeDetail'
import { ChallengeDialog } from './ChallengeDialog'
import { CheckInDialog } from './CheckInDialog'
import { useChallenges } from './useChallenges'

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'history', label: 'History' },
  { value: 'templates', label: 'Templates' },
]

export default function ChallengesPage() {
  const [params, setParams] = useSearchParams()
  const { today, cards, analytics, templates, habits, habitLogs, checkins, loading, error, refetch } = useChallenges()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'active'
  const openId = params.get('c')
  const [form, setForm] = useState({ open: false, challenge: null, prefill: null })
  const [ci, setCi] = useState({ open: false, id: null, date: null, existing: null })
  const setTab = (value) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        value === 'active' ? n.delete('tab') : n.set('tab', value)
        return n
      },
      { replace: true },
    )
  const open = (id) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        id ? n.set('c', id) : n.delete('c')
        return n
      },
      { replace: true },
    )

  const live = useMemo(() => activeCards(cards), [cards])
  const detail = cards.find((x) => x.challenge.id === openId) ?? null
  const ciCard = cards.find((x) => x.challenge.id === ci.id) ?? null
  // a link to a challenge that was deleted (or never existed) just closes
  useEffect(() => {
    if (openId && !loading && !detail) open(null)
  }, [openId, loading, detail]) // eslint-disable-line react-hooks/exhaustive-deps

  const [quick, quickBusy] = useAction(async (card, el) => {
    const out = await checkInChallenge(card.challenge.id, { date: today, today })
    if (out.completed) {
      celebrate({ origin: el })
      toast.success(`Challenge complete: ${card.challenge.title}`)
    } else celebrate({ origin: el, count: 18 })
  })
  const [undo] = useAction(async (k) => {
    await removeCheckin(k.id)
  })
  const [resume, resumeBusy] = useAction(
    async (c) => {
      await resumeChallenge(c.id, today)
    },
    { success: 'Challenge resumed' },
  )

  const newChallenge = (prefill = null) => setForm({ open: true, challenge: null, prefill })
  const busy = quickBusy || resumeBusy
  const emptyActive = live.length === 0

  return (
    <>
      <PageHeader
        title="Challenges"
        description="Time-boxed commitments with a start, an end and a result."
        actions={
          <Button onClick={() => newChallenge()}>
            <Plus className="h-4 w-4" /> New challenge
          </Button>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-4">
          <Segmented aria-label="Challenge views" value={tab} onChange={setTab} options={TABS} />
          {tab === 'active' &&
            (emptyActive ? (
              <EmptyState
                icon={Flag}
                title="No active challenges"
                description="Pick a template or build your own: 30 days of reading, four gym days a week, a total to reach by a date."
                action={
                  <div className="flex gap-2">
                    <Button onClick={() => newChallenge()}>
                      <Plus className="h-4 w-4" /> New challenge
                    </Button>
                    <Button variant="outline" onClick={() => setTab('templates')}>
                      Browse templates
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {live.map((card) => (
                  <ChallengeCard
                    key={card.challenge.id}
                    card={card}
                    today={today}
                    busy={busy}
                    onOpen={() => open(card.challenge.id)}
                    onCheckIn={(date) =>
                      setCi({ open: true, id: card.challenge.id, date, existing: card.progress.map.get(date)?.checkin ?? null })
                    }
                    onQuickCheckIn={() => quick(card, document.activeElement)}
                    onUndo={undo}
                    onResume={() => resume(card.challenge)}
                  />
                ))}
              </div>
            ))}
          {tab === 'calendar' && (
            <CalendarPanel
              challenges={cards.map((x) => x.challenge)}
              checkins={checkins}
              habitLogs={habitLogs}
              today={today}
              onOpen={open}
            />
          )}
          {tab === 'analytics' && <AnalyticsPanel analytics={analytics} cards={cards} today={today} />}
          {tab === 'history' && (
            <HistoryPanel
              cards={cards}
              onOpen={open}
              onRepeat={(c) =>
                newChallenge({
                  ...c,
                  name: c.title,
                  duration_days: Math.round((Date.parse(c.end_date) - Date.parse(c.start_date)) / 86400000) + 1,
                })
              }
            />
          )}
          {tab === 'templates' && <TemplatesPanel templates={templates} onUse={newChallenge} />}
        </div>
      </DataGate>

      <ChallengeDetail
        card={detail}
        today={today}
        open={!!detail}
        onOpenChange={(o) => !o && open(null)}
        onEdit={(challenge) => setForm({ open: true, challenge, prefill: null })}
        onCheckIn={(date) => detail && setCi({ open: true, id: detail.challenge.id, date, existing: null })}
        onEditCheckin={(existing) => detail && setCi({ open: true, id: detail.challenge.id, date: existing.checkin_date, existing })}
      />
      <ChallengeDialog
        open={form.open}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
        challenge={form.challenge}
        prefill={form.prefill}
        templates={templates}
        habits={habits}
        today={today}
        checkinCount={form.challenge ? checkins.filter((k) => k.challenge_id === form.challenge.id).length : 0}
        onCreated={(c) => {
          setTab('active')
          open(null)
          toast.success(`“${c.title}” starts ${c.start_date === today ? 'today' : `on ${c.start_date}`}`)
        }}
      />
      <CheckInDialog
        open={ci.open}
        onOpenChange={(o) => setCi((s) => ({ ...s, open: o }))}
        card={ciCard}
        habitLogs={habitLogs}
        checkins={checkins}
        today={today}
        date={ci.date}
        existing={ci.existing}
      />
    </>
  )
}
