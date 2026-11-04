import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { CATEGORIES_BY_TYPE, PAYMENT_METHODS, TX_TYPES } from '@lifetrack/core/finance'
import { CURRENCIES } from '@lifetrack/utils'
import { blankSavingsGoal, blankTransaction, parseAmountOrThrow, savingsGoalFormSchema, savingsGoalToForm, savingsGoalToPayload, transactionFormSchema, transactionToForm, transactionToPayload } from '@lifetrack/schemas'
import { api, store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../hooks/useSettings'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { Chip, ChipGroup, DateField, Segmented } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'

type TxType = 'expense' | 'income' | 'savings'

// Categories typed in during this app session, per transaction type (saved rows keep their own category anyway).
const customCats: Record<TxType, string[]> = { expense: [], income: [], savings: [] }

export function TransactionForm({ visible, txn, defaultType, today, onClose }: { visible: boolean; txn: any | null; defaultType: TxType; today: string; onClose: () => void }) {
  const { settings } = useSettings()
  const first = (t: TxType) => (CATEGORIES_BY_TYPE as Record<TxType, string[]>)[t][0]
  const { values, errors, set, reset, validate } = useZodForm(transactionFormSchema, blankTransaction(defaultType, first(defaultType), today))
  useEffect(() => { if (visible) reset(txn ? transactionToForm(txn) : blankTransaction(defaultType, first(defaultType), today)) }, [visible, txn?.id, defaultType, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = transactionToPayload(v)
    if (txn) await store.update('transactions', txn.id, row); else await store.insert('transactions', row)
    onClose()
  })
  const type = values.type as TxType
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const cats = [...new Set([...(CATEGORIES_BY_TYPE as Record<TxType, string[]>)[type], ...customCats[type], values.category])].filter(Boolean)
  const commitCustom = () => {
    const name = custom.trim().slice(0, 40)
    if (name) { if (!cats.includes(name)) customCats[type].push(name); set('category', name) }
    setAdding(false)
    setCustom('')
  }
  return (
    <Sheet visible={visible} title={txn ? 'Edit transaction' : 'Add transaction'} onClose={onClose} footer={<Button title={txn ? 'Save changes' : 'Add'} onPress={save} loading={pending} />}>
      <Segmented value={type} options={TX_TYPES as { value: TxType; label: string }[]} onChange={(v) => { set('type', v); if (!(CATEGORIES_BY_TYPE as Record<TxType, string[]>)[v].includes(values.category)) set('category', first(v)) }} />
      <Field label={`Amount (${CURRENCIES[settings.currency]?.symbol ?? '₹'})`} value={values.amount} onChangeText={(t) => set('amount', t)} error={errors.amount} keyboardType="decimal-pad" placeholder="0.00" autoFocus={!txn} />
      <DateField label="Date" value={values.txn_date} onChange={(v) => set('txn_date', v)} error={errors.txn_date} />
      <ChipGroup label="Category" value={values.category} options={cats.map((c) => ({ value: c, label: c }))} onChange={(v) => set('category', v)} />
      {adding ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="New category" value={custom} onChangeText={setCustom} placeholder="e.g. Rent" maxLength={40} autoFocus onSubmitEditing={commitCustom} /></View>
          <Button title="Add" onPress={commitCustom} />
        </View>
      ) : <View style={{ flexDirection: 'row' }}><Chip label="+ Add new category" onPress={() => setAdding(true)} /></View>}
      <ChipGroup label="Payment method" value={values.payment_method} options={(PAYMENT_METHODS as string[]).map((m) => ({ value: m as typeof values.payment_method, label: m }))} onChange={(v) => set('payment_method', v)} />
      <Field label="Note" value={values.note} onChangeText={(t) => set('note', t)} placeholder="Optional" maxLength={300} />
    </Sheet>
  )
}

export function SavingsGoalForm({ visible, goal, onClose }: { visible: boolean; goal: any | null; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(savingsGoalFormSchema, blankSavingsGoal())
  useEffect(() => { if (visible) reset(goal ? savingsGoalToForm(goal) : blankSavingsGoal()) }, [visible, goal?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = savingsGoalToPayload(v)
    if (goal) await store.update('savings_goals', goal.id, row); else await store.insert('savings_goals', row)
    onClose()
  })
  return (
    <Sheet visible={visible} title={goal ? 'Edit savings goal' : 'New savings goal'} onClose={onClose} footer={<Button title={goal ? 'Save changes' : 'Create goal'} onPress={save} loading={pending} />}>
      <Field label="What are you saving for?" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} placeholder="e.g. Emergency fund" autoFocus={!goal} maxLength={80} />
      <Field label="Target amount" value={values.target} onChangeText={(t) => set('target', t)} error={errors.target} keyboardType="decimal-pad" />
      <Field label="Saved so far" value={values.saved} onChangeText={(t) => set('saved', t)} error={errors.saved} keyboardType="decimal-pad" placeholder="0" />
      <DateField label="Target date (optional)" value={values.target_date} onChange={(v) => set('target_date', v)} error={errors.target_date} clearable />
    </Sheet>
  )
}

/** One amount input in a sheet (used for "add funds" and the monthly budget). */
export function AmountSheet({ visible, title, description, label, initial = '', submitLabel, allowZero, errorText, onSubmit, onClose }: { visible: boolean; title: string; description?: string; label: string; initial?: string; submitLabel: string; allowZero?: boolean; errorText: string; onSubmit: (paise: number) => Promise<unknown>; onClose: () => void }) {
  const [v, setV] = useState(initial)
  const [error, setError] = useState('')
  useEffect(() => { if (visible) { setV(initial); setError('') } }, [visible, initial])
  const [submit, pending] = useAction(async () => {
    let paise: number
    try { paise = parseAmountOrThrow(v, errorText, { allowZero }) } catch (e) { setError((e as Error).message); return }
    await onSubmit(paise)
    onClose()
  })
  return (
    <Sheet visible={visible} title={title} onClose={onClose} footer={<Button title={submitLabel} onPress={submit} loading={pending} />}>
      {description ? <Txt muted>{description}</Txt> : null}
      <Field label={label} value={v} onChangeText={(t) => { setV(t); setError('') }} error={error} keyboardType="decimal-pad" placeholder="0.00" autoFocus />
    </Sheet>
  )
}
