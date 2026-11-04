import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDay, formatMoney, monthStart, paiseToInput } from '@lifetrack/utils'
import { chartPalette, colors as tokens } from '@lifetrack/design-tokens'
import { frequencyLabel, ruleSchedule, ruleStatus, ruleTitle, sortRules } from '@lifetrack/core/recurring'
import { PAYMENT_METHODS, budgetAlert, budgetTone, filterTransactions, financeMonth, savingsGoalPercent, savingsShareOfIncome, signFor, TYPE_TONE } from '@lifetrack/core/finance'
import { api, store } from '../../../src/data/client'
import { useTable } from '../../../src/data/useTable'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { AmountSheet, RecurringRuleForm, SavingsGoalForm, TransactionForm } from '../../../src/features/finance/forms'
import { BarChart, DonutChart, GroupedBarChart } from '../../../src/ui/charts'
import { ActionSheet } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, Chip, DataGate, EmptyState, MonthNav, ProgressBar, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Field, Txt } from '../../../src/ui'

const PAGE = 40
type TxType = 'expense' | 'income' | 'savings'

export default function Finance() {
  const { colors, scheme } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const money = (p: number, o?: { compact?: boolean }) => formatMoney(p, settings.currency, o)
  const { data, loading, refreshing, error, refetch } = useTables('transactions', 'budgets', 'savings_goals')
  // Read on its own: until migration 0008 is applied the table is missing, and that must not take the whole screen down.
  const { rows: ruleRows } = useTable('recurring_rules')
  const rules: any[] = useMemo(() => sortRules(ruleRows), [ruleRows])
  const [month, setMonth] = useState<string | null>(null)
  const m = month ?? monthStart(today)
  const [txForm, setTxForm] = useState<{ open: boolean; txn: any | null; type: TxType }>({ open: false, txn: null, type: 'expense' })
  const [txMenu, setTxMenu] = useState<any | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [goalForm, setGoalForm] = useState<{ open: boolean; goal: any | null }>({ open: false, goal: null })
  const [goalMenu, setGoalMenu] = useState<any | null>(null)
  const [funds, setFunds] = useState<any | null>(null)
  const [ruleForm, setRuleForm] = useState<{ open: boolean; rule: any | null }>({ open: false, rule: null })
  const [ruleMenu, setRuleMenu] = useState<any | null>(null)
  const [f, setF] = useState({ type: '', category: '', method: '', q: '' })
  const [limit, setLimit] = useState(PAGE)

  const fin: any = useMemo(() => financeMonth({ transactions: data.transactions, budgets: data.budgets, defaultBudget: settings.monthly_budget_paise, month: m, today }), [data.transactions, data.budgets, settings.monthly_budget_paise, m, today])
  const { summary: sum, breakdown, monthTx } = fin
  const filtered: any[] = useMemo(() => filterTransactions(monthTx, f), [monthTx, f])
  const [del] = useAction((id: string) => store.remove('transactions', id))
  const [delGoal] = useAction((id: string) => store.remove('savings_goals', id))
  const [delRule] = useAction((id: string) => store.remove('recurring_rules', id))
  const [toggleRule] = useAction((r: any) => api.toggleRecurringRule(r, today))
  const used = sum.budgetUsed
  const alert: any = budgetAlert(sum)
  const toneKey = budgetTone(used) as 'primary' | 'success' | 'warning' | 'danger'
  const pal = chartPalette
  const raw = tokens[scheme]
  const series = [{ name: 'Income', color: colors.success }, { name: 'Expenses', color: colors.danger }, { name: 'Savings', color: colors.primary }]
  const g = goalMenu, t = txMenu, r = ruleMenu

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt variant="title">Finance</Txt>
          <Button title="＋ Add" onPress={() => setTxForm({ open: true, txn: null, type: 'expense' })} />
        </View>
        <DataGate loading={loading} error={error} onRetry={refetch}>
          <MonthNav month={m} thisMonth={monthStart(today)} onChange={(v) => { setMonth(v); setLimit(PAGE); setF({ type: '', category: '', method: '', q: '' }) }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Income" value={money(sum.income)} />
            <StatTile label="Expenses" value={money(sum.expense)} sub={`${fin.expenseCount} transactions`} />
            <StatTile label="Savings" value={money(sum.savings)} sub={sum.income ? `${savingsShareOfIncome(sum)}% of income` : undefined} />
            <Pressable accessibilityRole="button" accessibilityLabel="Edit monthly budget" onPress={() => setBudgetOpen(true)} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <StatTile label="Budget left" value={sum.remaining == null ? 'No budget' : money(sum.remaining)} sub={sum.budget ? `of ${money(sum.budget)}${fin.overall ? '' : ' (default)'} · tap to edit` : 'Tap to set a monthly budget'} progress={used == null ? null : Math.min(100, used * 100)} tone={toneKey === 'success' || toneKey === 'warning' ? toneKey : undefined} />
            </Pressable>
          </View>

          {alert ? (
            <View accessibilityRole="alert" style={{ borderWidth: 1, borderColor: alert.level === 'danger' ? colors.danger : colors.warning, borderRadius: 8, padding: 12 }}>
              <Txt>{alert.level === 'danger' ? `You're ${money(alert.overBy)} over this month's budget.` : `You've used ${alert.percent}% of this month's budget. ${money(alert.left)} left.`}</Txt>
            </View>
          ) : null}

          <Card>
            <Txt variant="heading">Spending by category</Txt>
            {breakdown.length === 0 ? <Txt muted>No expenses this month.</Txt> : (<>
              <DonutChart slices={breakdown.map((b: any, i: number) => ({ label: b.category, value: b.paise, color: pal[i % pal.length] }))} centerLabel={money(sum.expense, { compact: true })} summary={`Spending by category: ${breakdown.map((b: any) => `${b.category} ${money(b.paise)}`).join(', ')}`} />
              {breakdown.slice(0, 6).map((b: any, i: number) => (
                <View key={b.category} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pal[i % pal.length] }} /><Text style={{ color: colors.foreground }}>{b.category}</Text></View>
                  <Text style={{ color: colors.mutedForeground, fontVariant: ['tabular-nums'] }}>{money(b.paise)} · {Math.round(b.share * 100)}%</Text>
                </View>
              ))}
            </>)}
          </Card>
          <Card>
            <Txt variant="heading">Last 6 months</Txt>
            <GroupedBarChart data={fin.series.map((s: any) => ({ label: s.label, values: [s.income, s.expense, s.savings] }))} series={series} summary={`Income, expenses and savings, last 6 months: ${fin.series.map((s: any) => `${s.label} income ${money(s.income)} expenses ${money(s.expense)}`).join('; ')}`} />
          </Card>
          <Card>
            <Txt variant="heading">Daily spending</Txt>
            <BarChart data={fin.daily.filter((_: any, i: number, a: any[]) => a.length <= 16 || i % Math.ceil(a.length / 16) === 0).map((d: any) => ({ label: String(d.day), value: Math.round(d.paise / 100) }))} color={colors.danger} summary={`Daily spending this month, total ${money(sum.expense)}`} />
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="heading">Savings goals</Txt>
              <Button title="＋ Goal" variant="ghost" onPress={() => setGoalForm({ open: true, goal: null })} />
            </View>
            {data.savings_goals.length === 0 ? <EmptyState title="No savings goals" description="Set a target — an emergency fund, a laptop, a trip — and track what you've put aside." action={{ label: 'Create a savings goal', onPress: () => setGoalForm({ open: true, goal: null }) }} />
              : data.savings_goals.map((sg: any) => {
                const pct = savingsGoalPercent(sg)
                return (
                  <Pressable key={sg.id} accessibilityRole="button" accessibilityLabel={`Options for ${sg.name}`} onPress={() => setGoalMenu(sg)} style={{ paddingVertical: 10, gap: 6 }}>
                    <Text style={{ color: colors.foreground, fontWeight: '600' }}>{sg.name}</Text>
                    <Txt variant="small" muted>{money(sg.saved_paise)} of {money(sg.target_paise)}{sg.target_date ? ` · by ${fmtDay(sg.target_date, 'd MMM yyyy')}` : ''} · {pct}%</Txt>
                    <ProgressBar value={pct} color={pct >= 100 ? colors.success : colors.primary} label={`${sg.name} progress`} />
                  </Pressable>
                )
              })}
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="heading">Recurring</Txt>
              <Button title="＋ Rule" variant="ghost" onPress={() => setRuleForm({ open: true, rule: null })} />
            </View>
            {rules.length === 0 ? <EmptyState title="No recurring transactions" description="Add rent, EMI or a subscription once, and it's logged for you each time it falls due." action={{ label: 'Add a recurring rule', onPress: () => setRuleForm({ open: true, rule: null }) }} />
              : rules.map((rule: any) => {
                const status = ruleStatus(rule)
                return (
                  <Pressable key={rule.id} accessibilityRole="button" accessibilityLabel={`${ruleTitle(rule)}, ${signFor(rule.type)}${money(rule.amount_paise)}, ${frequencyLabel(rule.frequency)}. Options`} onPress={() => setRuleMenu(rule)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 56 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: status === 'active' ? colors.foreground : colors.mutedForeground, fontWeight: '500' }}>{ruleTitle(rule)}</Text>
                      <Txt variant="small" muted>{frequencyLabel(rule.frequency)} · {ruleSchedule(rule)}</Txt>
                    </View>
                    <Text style={{ color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{signFor(rule.type)}{money(rule.amount_paise)}</Text>
                  </Pressable>
                )
              })}
          </Card>

          <Card>
            <Txt variant="heading">Transactions</Txt>
            <Field label="Search" value={f.q} onChangeText={(q) => { setF({ ...f, q }); setLimit(PAGE) }} placeholder="Note, category…" autoCapitalize="none" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              <Chip label="All types" selected={f.type === ''} onPress={() => setF({ ...f, type: '' })} />
              {(['expense', 'income', 'savings'] as const).map((tt) => <Chip key={tt} label={tt[0].toUpperCase() + tt.slice(1)} selected={f.type === tt} onPress={() => setF({ ...f, type: f.type === tt ? '' : tt })} />)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {fin.categories.map((c: string) => <Chip key={c} label={c} selected={f.category === c} onPress={() => setF({ ...f, category: f.category === c ? '' : c })} />)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {(PAYMENT_METHODS as string[]).map((pm) => <Chip key={pm} label={pm} selected={f.method === pm} onPress={() => setF({ ...f, method: f.method === pm ? '' : pm })} />)}
            </ScrollView>
            {monthTx.length === 0 ? <EmptyState title="No transactions this month" description="Log expenses as they happen — it takes a few seconds." action={{ label: 'Add a transaction', onPress: () => setTxForm({ open: true, txn: null, type: 'expense' }) }} />
              : filtered.length === 0 ? <Txt muted style={{ textAlign: 'center' }}>No transactions match these filters.</Txt>
              : (<>
                {filtered.slice(0, limit).map((tx) => (
                  <Pressable key={tx.id} accessibilityRole="button" accessibilityLabel={`${tx.note || tx.category}, ${signFor(tx.type)}${money(tx.amount_paise)}. Options`} onPress={() => setTxMenu(tx)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 56 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '500' }}>{tx.note || tx.category}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Txt variant="small" muted>{fmtDay(tx.txn_date, 'EEE, d MMM')}</Txt>
                        <Badge tone={(TYPE_TONE as any)[tx.type]}>{tx.category}</Badge>
                        {tx.payment_method && tx.payment_method !== 'Other' ? <Txt variant="small" muted>· {tx.payment_method}</Txt> : null}
                        {tx.recurring_date ? <Txt variant="small" muted>· Recurring</Txt> : null}
                      </View>
                    </View>
                    <Text style={{ color: tx.type === 'income' ? colors.success : tx.type === 'savings' ? colors.secondary : colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{signFor(tx.type)}{money(tx.amount_paise)}</Text>
                  </Pressable>
                ))}
                {filtered.length > limit ? <Button title={`Show more (${filtered.length - limit})`} variant="ghost" onPress={() => setLimit(limit + PAGE)} /> : null}
              </>)}
          </Card>
        </DataGate>
      </ScrollView>

      <ActionSheet visible={!!t} title={t ? `${signFor(t.type)}${money(t.amount_paise)} · ${t.category}` : ''} onClose={() => setTxMenu(null)} actions={t ? [
        { label: 'Edit', onPress: () => setTxForm({ open: true, txn: t, type: t.type }) },
        { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this transaction?', `${money(t.amount_paise)} · ${t.category}`)) del(t.id) } },
      ] : []} />
      <ActionSheet visible={!!g} title={g?.name ?? ''} onClose={() => setGoalMenu(null)} actions={g ? [
        { label: 'Add funds', onPress: () => setFunds(g) },
        { label: 'Edit', onPress: () => setGoalForm({ open: true, goal: g }) },
        { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this savings goal?', g.name)) delGoal(g.id) } },
      ] : []} />
      <ActionSheet visible={!!r} title={r ? ruleTitle(r) : ''} onClose={() => setRuleMenu(null)} actions={r ? [
        { label: 'Pause', hidden: ruleStatus(r) !== 'active', onPress: () => toggleRule(r) },
        { label: 'Resume', hidden: ruleStatus(r) !== 'paused', onPress: () => toggleRule(r) },
        { label: 'Edit', onPress: () => setRuleForm({ open: true, rule: r }) },
        { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this recurring rule?', `${ruleTitle(r)}. Transactions it already added stay.`)) delRule(r.id) } },
      ] : []} />
      <RecurringRuleForm visible={ruleForm.open} rule={ruleForm.rule} today={today} onClose={() => setRuleForm({ open: false, rule: null })} />
      <TransactionForm visible={txForm.open} txn={txForm.txn} defaultType={txForm.type} today={today} onClose={() => setTxForm({ open: false, txn: null, type: 'expense' })} />
      <SavingsGoalForm visible={goalForm.open} goal={goalForm.goal} onClose={() => setGoalForm({ open: false, goal: null })} />
      <AmountSheet visible={!!funds} title={funds ? `Add to “${funds.name}”` : ''} description={funds ? `${money(funds.saved_paise)} of ${money(funds.target_paise)} saved` : undefined} label="Amount" submitLabel="Add" errorText="Enter an amount greater than 0." onSubmit={(p) => api.addSavingsFunds(funds, p)} onClose={() => setFunds(null)} />
      <AmountSheet visible={budgetOpen} title={`Budget for ${fmtDay(m, 'MMMM yyyy')}`} description="Overrides your default monthly budget for this month only." label="Monthly expense budget" initial={fin.budget ? paiseToInput(fin.budget) : ''} submitLabel="Save budget" allowZero errorText="Enter a valid amount, e.g. 25000" onSubmit={(p) => api.setMonthBudget(m, p)} onClose={() => setBudgetOpen(false)} />
    </SafeAreaView>
  )
}
