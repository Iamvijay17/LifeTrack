// Compile-time assertions (checked by `pnpm typecheck`).
import type { Task, Insert, Update, Transaction } from './index'

const insert: Insert<'tasks'> = { title: 'x' }
const bad: Insert<'tasks'> = { title: 'x', priority: 'medium' }
// @ts-expect-error title is required
const noTitle: Insert<'tasks'> = {}
// @ts-expect-error invalid enum value
const badStatus: Update<'tasks'> = { status: 'nope' }
const t = null as unknown as Task
const id: string = t.id
const due: string | null = t.due_date
const amount: number = (null as unknown as Transaction).amount_paise
export { insert, bad, noTitle, badStatus, id, due, amount }
