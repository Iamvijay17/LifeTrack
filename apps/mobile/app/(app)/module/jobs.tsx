import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDateTime, fmtDay, paiseToLpa } from '@lifetrack/utils'
import { JOB_STATUSES, STATUS_LABEL, applicationSources, filterApplications, interviewAgenda, interviewTone, jobsOverview, salaryProgression, weeklyApplications } from '@lifetrack/core/jobs'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { ApplicationForm, InterviewForm } from '../../../src/features/jobs/forms'
import { ApplicationDetail, StatusBadge } from '../../../src/features/jobs/ApplicationDetail'
import { BarChart, LineChart } from '../../../src/ui/charts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { Badge, Chip, DataGate, EmptyState, Segmented, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Field, Txt } from '../../../src/ui'

type View_ = 'pipeline' | 'interviews' | 'insights'
export default function Jobs() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const tz = settings.timezone, w = settings.week_starts_on
  const { data, loading, refreshing, error, refetch } = useTables('job_applications', 'application_history', 'interview_events')
  const [view, setView] = useState<View_>('pipeline')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [appForm, setAppForm] = useState<{ open: boolean; app: any | null; status: string }>({ open: false, app: null, status: 'interested' })
  const [intForm, setIntForm] = useState<{ open: boolean; event: any | null; appId: string | null }>({ open: false, event: null, appId: null })
  const [openId, setOpenId] = useState<string | null>(null)

  const apps: any[] = data.job_applications
  const detail = apps.find((a) => a.id === openId) ?? null
  const [limit, setLimit] = useState(40)
  const filtered: any[] = useMemo(() => filterApplications(apps, { q, status, source }), [apps, q, status, source])
  const sources = applicationSources(apps) as string[]
  const o: any = useMemo(() => jobsOverview(apps, data.application_history, data.interview_events, today, w), [apps, data.application_history, data.interview_events, today, w])
  const agenda: any = useMemo(() => interviewAgenda(data.interview_events, apps, tz), [data.interview_events, apps, tz])
  const weekly = useMemo(() => weeklyApplications(apps, today, w).map((x: any) => ({ label: x.label, value: x.count })), [apps, today, w])
  const salary = useMemo(() => (salaryProgression(apps, tz) as any[]).map((d) => ({ label: fmtDay(d.date, 'd MMM'), value: d.lpa })), [apps, tz])
  const openApp = (a: any) => setOpenId(a.id)

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Job Switch" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Interview" variant="ghost" disabled={apps.length === 0} onPress={() => setIntForm({ open: true, event: null, appId: null })} /></View>
          <View style={{ flex: 1 }}><Button title="＋ Application" onPress={() => setAppForm({ open: true, app: null, status: 'interested' })} /></View>
        </View>
        <DataGate loading={loading} error={error} onRetry={refetch}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Applied this week" value={o.thisWeek} sub={`${o.funnel.applied} all time`} />
            <StatTile label="Active pipeline" value={o.active} sub={`${o.total} total tracked`} />
            <StatTile label="Interview rate" value={o.funnel.conversion == null ? '—' : `${Math.round(o.funnel.conversion * 100)}%`} sub={`${o.funnel.interviews} of ${o.funnel.applied} applied`} />
            <StatTile label="Offers" value={o.funnel.offers} sub={`${o.funnel.rejections} rejections`} />
          </View>
          {o.followups.length || o.upcoming.length ? (
            <Card>
              <Txt variant="heading">Reminders</Txt>
              {o.followups.map((a: any) => <Pressable key={a.id} accessibilityRole="button" onPress={() => openApp(a)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.foreground }}>Follow up with <Text style={{ fontWeight: '700' }}>{a.company}</Text> <Text style={{ color: colors.mutedForeground }}>({fmtDay(a.followup_date, 'd MMM')})</Text></Text></Pressable>)}
              {o.upcoming.map((e: any) => <Pressable key={e.id} accessibilityRole="button" onPress={() => openApp(e.app)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.foreground }}>Interview: <Text style={{ fontWeight: '700' }}>{e.app.company}</Text> · {e.round_name} <Text style={{ color: colors.mutedForeground }}>({fmtDateTime(e.scheduled_at, tz)})</Text></Text></Pressable>)}
            </Card>
          ) : null}
          <Segmented value={view} onChange={setView} options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'interviews', label: 'Interviews' }, { value: 'insights', label: 'Insights' }]} />

          {view === 'pipeline' ? (apps.length === 0
            ? <EmptyState title="No applications yet" description="Add the roles you're interested in and move them through the pipeline as they progress. Status history is kept automatically." action={{ label: 'Add your first application', onPress: () => setAppForm({ open: true, app: null, status: 'interested' }) }} />
            : (<>
              <Field label="Search applications" value={q} onChangeText={setQ} placeholder="Company, role, notes…" autoCapitalize="none" returnKeyType="search" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip label="All" selected={status === ''} onPress={() => setStatus('')} />
                {JOB_STATUSES.map((s: string) => <Chip key={s} label={`${(STATUS_LABEL as any)[s]} ${apps.filter((a) => a.status === s).length}`} selected={status === s} onPress={() => setStatus(status === s ? '' : s)} />)}
              </ScrollView>
              {sources.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {sources.map((s) => <Chip key={s} label={s} selected={source === s} onPress={() => setSource(source === s ? '' : s)} />)}
                </ScrollView>
              ) : null}
              {filtered.length === 0 ? <EmptyState title="No matches" description="Try clearing the search or filters." /> : filtered.slice(0, limit).map((a) => {
                const overdue = a.followup_date && a.followup_date <= today && ['interested', 'preparing', 'applied', 'assessment', 'interview'].includes(a.status)
                return (
                  <Card key={a.id} onPress={() => openApp(a)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '600', fontSize: 16 }}>{a.company}</Text>
                        <Text numberOfLines={1} style={{ color: colors.mutedForeground }}>{a.job_title}</Text>
                      </View>
                      <StatusBadge status={a.status} />
                    </View>
                    <Txt variant="small" muted>{[a.applied_date && `Applied ${fmtDay(a.applied_date, 'd MMM')}`, a.salary_paise != null && `${paiseToLpa(a.salary_paise)} LPA`, a.location].filter(Boolean).join(' · ')}</Txt>
                    {overdue ? <View style={{ flexDirection: 'row' }}><Badge tone="warning">Follow up</Badge></View> : null}
                  </Card>
                )
              })}
              {filtered.length > limit ? <Button title={`Show more (${filtered.length - limit})`} variant="ghost" onPress={() => setLimit(limit + 40)} /> : null}
            </>)) : null}

          {view === 'interviews' ? (agenda.upcoming.length === 0 && agenda.past.length === 0
            ? <EmptyState title="No interviews yet" description="Schedule one from here or from an application." />
            : (<>
              {[['Upcoming', agenda.upcoming], ['Past', agenda.past]].map(([title, groups]: any) => groups.length ? (
                <View key={title} style={{ gap: 8 }}>
                  <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
                  {groups.map((g: any) => (
                    <View key={g.date} style={{ gap: 6 }}>
                      <Text style={{ color: colors.foreground, fontWeight: '600' }}>{fmtDay(g.date, 'EEEE, d MMM')}</Text>
                      {g.items.map((e: any) => (
                        <Card key={e.id} onPress={() => setIntForm({ open: true, event: e, appId: e.application_id })}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                            <Text style={{ color: colors.foreground, fontWeight: '600', flex: 1 }}>{e.app.company} · {e.round_name}</Text>
                            <Badge tone={interviewTone(e.status) as any}>{e.status}</Badge>
                          </View>
                          <Txt variant="small" muted>{fmtDateTime(e.scheduled_at, tz)} · {e.mode}</Txt>
                        </Card>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null)}
            </>)) : null}

          {view === 'insights' ? (<>
            <Card><Txt variant="heading">Applications per week</Txt><BarChart data={weekly} summary={`Applications per week: ${weekly.map((d: any) => `${d.label} ${d.value}`).join(', ')}`} /></Card>
            <Card><Txt variant="heading">Package progression (LPA)</Txt>
              {salary.length === 0 ? <Txt muted>Add a package (LPA) to applications to see the progression.</Txt> : <LineChart data={salary} unit="L" summary={`Package progression in LPA, latest ${salary.at(-1)!.value}`} />}</Card>
          </>) : null}
        </DataGate>
      </ScrollView>
      <ApplicationDetail app={detail} history={data.application_history} events={data.interview_events} tz={tz} today={today} onClose={() => setOpenId(null)}
        onEdit={(a) => setAppForm({ open: true, app: a, status: a.status })} onSchedule={(id) => setIntForm({ open: true, event: null, appId: id })} onEditInterview={(e) => setIntForm({ open: true, event: e, appId: e.application_id })} />
      <ApplicationForm visible={appForm.open} app={appForm.app} defaultStatus={appForm.status} today={today} onClose={() => setAppForm({ open: false, app: null, status: 'interested' })} />
      <InterviewForm visible={intForm.open} event={intForm.event} applicationId={intForm.appId} apps={apps} tz={tz} today={today} onClose={() => setIntForm({ open: false, event: null, appId: null })} />
    </SafeAreaView>
  )
}
