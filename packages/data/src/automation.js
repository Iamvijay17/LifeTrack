// Personal Automation Studio: the part that WRITES. The rules (what is due, what a workflow would do) are pure and live in
// @lifetrack/core/automationEngine; this file claims a run, applies its plan one step at a time, and records what happened.
//
// Reliability, in the order things happen:
//   1. CLAIM: a row in automation_executions is inserted first, under a key naming the occurrence ("this task, completed at this moment").
//      The key is unique per workflow, so two devices, two tabs or a restart can never start the same run twice (the second insert gets 23505).
//   2. PLAN: planRun() decides what every action would do from the rows as they are now. Nothing is written yet.
//   3. APPLY: each step is applied and its result saved at once (ids it created included), so a crash never repeats a step that worked.
//   4. FINISH: completed, failed or skipped. A temporary failure (network, a busy database) is retried by itself, with a growing pause, from
//      the step that failed; a permanent one (the record is gone, a rule refused it) is not retried unless the person asks.
// It never deletes anything: actions insert rows, or change a task/goal the workflow was pointed at.
import { LIMITS, tablesFor, triggerNode, validateWorkflow } from '@lifetrack/core/automation'
import { createdIds, findOccurrences, planRun, runAllowance } from '@lifetrack/core/automationEngine'
import { AppError, toAppError } from './errors'

const TEMPORARY = new Set(['40001', '40P01', '57014', '53300', '08006', '08001', 'PGRST000', 'PGRST002'])

/** Is this failure worth trying again later? Network trouble and a busy database are; a refused or vanished record is not. */
export function isTemporary(e) {
  const err = toAppError(e)
  return !!err.isNetwork || TEMPORARY.has(err.code) || (Number(e?.status) >= 500 && Number(e?.status) < 600)
}
/** How long to wait before attempt n+1 (1 min, 2 min, 4 min). */
export const backoffMs = (attempt) => 60_000 * 2 ** Math.max(0, attempt - 1)

/**
 * @param store the app's cache/mutation layer (insert, update, upsert, remove, load, peek)
 * @param deps  { raiseNotification, setTaskStatus } from createApi, so a status change goes through the same path as the Planner's checkbox
 */
export function createAutomationApi(store, { raiseNotification, setTaskStatus }) {
  /** An ISO timestamp for `ms` (the check's own clock, so retries and tests agree on time); the real time when not given. */
  const nowIso = (ms) => new Date(ms ?? Date.now()).toISOString()

  // ----------------------------------------------------------------------------------------- workflows
  /**
   * Creates (no `existing`) or updates a workflow. A workflow that is on but no longer valid is switched off rather than left half-working;
   * `result.switchedOff` says so. The trigger kind is copied out of the graph for the list.
   * @returns {Promise<{ workflow: any, switchedOff: boolean }>}
   */
  async function saveWorkflow(existing, values) {
    const row = { ...values }
    const merged = { ...(existing ?? {}), ...row }
    row.trigger_kind = triggerNode(merged.graph ?? { nodes: [] })?.kind ?? ''
    let switchedOff = false
    if (existing?.enabled ?? row.enabled) {
      if (!validateWorkflow(merged).ok) { row.enabled = false; row.activated_at = null; switchedOff = true }
    }
    const workflow = existing ? await store.update('automation_workflows', existing.id, row) : await store.insert('automation_workflows', row)
    return { workflow, switchedOff }
  }

  /** Switches a workflow on (after validating it) or off. Switching on also starts the clock: it only reacts to what happens from now on. */
  async function setWorkflowEnabled(workflow, enabled) {
    if (enabled) {
      const v = validateWorkflow(workflow)
      if (!v.ok) throw new AppError(`This workflow is not ready: ${v.errors[0].message}`)
      if (workflow.enabled) return workflow
      return store.update('automation_workflows', workflow.id, { enabled: true, activated_at: nowIso() })
    }
    return store.update('automation_workflows', workflow.id, { enabled: false, activated_at: null })
  }

  /** The "pause all automations" switch. Runs already started finish; nothing new starts while it is on. */
  async function setAutomationsPaused(paused) {
    await store.load('user_settings')
    const prev = store.peek('user_settings')[0]?.automation_prefs ?? {}
    return store.upsert('user_settings', { automation_prefs: { ...prev, paused: !!paused } }, { onConflict: 'user_id' })
  }

  // ------------------------------------------------------------------------------------------ applying
  /** Applies one planned effect. Resolves to the id of the row it created (or null). */
  async function applyEffect(effect, today) {
    switch (effect.op) {
      case 'notify': {
        const n = await raiseNotification({ key: effect.key, kind: 'system', title: effect.title, body: effect.body, link: '/automation/history', priority: effect.priority })
        return n?.id ?? null // null: this notification was already raised (a retry)
      }
      case 'insert': return (await store.insert(effect.table, effect.row)).id
      case 'update': await store.update(effect.table, effect.id, effect.patch); return null
      case 'update_task': {
        const task = store.peek('tasks').find((t) => t.id === effect.id)
        if (!task) throw new AppError('The task no longer exists.', { code: 'gone' })
        if (Object.keys(effect.patch).length) await store.update('tasks', task.id, effect.patch)
        if (effect.status) await setTaskStatus({ ...task, ...effect.patch }, effect.status, today)
        return null
      }
      default: return null
    }
  }

  const persist = (exec, patch) => store.update('automation_executions', exec.id, patch)

  /** Runs the steps of `exec` that still need doing. Saves each step as it finishes. */
  async function execute(exec, steps, { today, attempt, nowMs }) {
    const deadline = Date.now() + LIMITS.timeoutMs
    const list = steps.map((s) => ({ ...s }))
    await persist(exec, { status: 'running', attempt, steps: list, started_at: exec.started_at ?? nowIso(nowMs), error: '', retryable: false })
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      if (s.type !== 'action' || (s.status !== 'planned' && s.status !== 'failed') || !s.effect) continue
      if (Date.now() > deadline) {
        list[i] = { ...s, status: 'failed', error: 'Timed out before this step ran.' }
        return persist(exec, { status: 'failed', steps: list, error: 'The run took too long and was stopped.', retryable: attempt < LIMITS.maxAttempts, finished_at: nowIso(nowMs) })
      }
      try {
        const ref = await applyEffect(s.effect, today)
        list[i] = { ...s, status: 'ok', ...(ref ? { ref } : {}), error: undefined }
        await persist(exec, { steps: list })
      } catch (e) {
        const err = toAppError(e)
        list[i] = { ...s, status: 'failed', error: err.message }
        return persist(exec, { status: 'failed', steps: list, error: `${s.detail}: ${err.message}`.slice(0, 1000), retryable: isTemporary(e) && attempt < LIMITS.maxAttempts, finished_at: nowIso(nowMs) })
      }
    }
    return persist(exec, { status: 'completed', steps: list, finished_at: nowIso(nowMs) })
  }

  // --------------------------------------------------------------------------------------------- runs
  async function startRun(workflow, occ, src, ctx) {
    const executions = store.peek('automation_executions')
    const allowance = runAllowance(workflow, executions, ctx)
    const base = {
      workflow_id: workflow.id, workflow_name: workflow.name.slice(0, 120), trigger_kind: triggerNode(workflow.graph)?.kind ?? '',
      trigger_info: { label: String(occ.label ?? '').slice(0, 160), subject: occ.subject?.type ?? null, subject_id: occ.subject?.row?.id ?? null, key: occ.key },
    }
    if (!allowance.ok) {
      // One "limit reached" row per workflow per day, so a flood leaves a trace without leaving a thousand rows.
      try { await store.insert('automation_executions', { ...base, status: 'skipped', reason: allowance.reason, dedupe_key: `limit:${ctx.today}`, finished_at: nowIso(ctx.nowMs) }) } catch (e) { if (e?.code !== '23505') throw e }
      return 'limited'
    }
    let exec
    try {
      exec = await store.insert('automation_executions', { ...base, status: 'pending', attempt: 1, dedupe_key: occ.key })
    } catch (e) {
      if (e?.code === '23505') return 'duplicate' // another device or tab already started this one
      throw e
    }
    try {
      const plan = planRun(workflow, occ, src, ctx)
      if (plan.status === 'skipped') {
        await persist(exec, { status: 'skipped', reason: plan.reason.slice(0, 500), steps: plan.steps, started_at: nowIso(ctx.nowMs), finished_at: nowIso(ctx.nowMs) })
        return 'skipped'
      }
      const done = await execute(exec, plan.steps, { today: ctx.today, attempt: 1, nowMs: ctx.nowMs })
      return done?.status ?? 'completed'
    } catch (e) {
      // The bookkeeping itself failed (e.g. offline between the claim and the plan): leave a retryable failure rather than a run stuck "pending".
      await persist(exec, { status: 'failed', error: toAppError(e).message.slice(0, 1000), retryable: isTemporary(e), finished_at: nowIso(ctx.nowMs) }).catch(() => {})
      return 'failed'
    }
  }

  /**
   * Picks the run up again from the step that failed. Steps that already worked are NOT repeated.
   * Safe for any failed run: a notification has a fixed key, and a created row is recorded the moment it exists.
   */
  async function retryExecution(id, { today, nowMs }) {
    await store.refetch('automation_executions')
    const exec = store.peek('automation_executions').find((e) => e.id === id)
    if (!exec) throw new AppError('That run no longer exists.')
    if (exec.status !== 'failed') throw new AppError('Only a failed run can be retried.')
    if (exec.attempt >= 10) throw new AppError('This run has been retried too many times.')
    const attempt = exec.attempt + 1
    const steps = (exec.steps ?? []).map((s) => (s.status === 'failed' ? { ...s, status: 'planned' } : s))
    if (!steps.some((s) => s.status === 'planned')) {
      // The failure came before any step was planned (the bookkeeping failed). Nothing was done, so there is nothing to resume: say so.
      throw new AppError('This run failed before it did anything. It will start again by itself when the trigger comes round.')
    }
    return execute(exec, steps, { today, attempt, nowMs })
  }

  /** Fails runs left "running" by a closed tab, and lets temporary failures try again after their pause. */
  async function sweep({ today, nowMs }) {
    const rows = store.peek('automation_executions')
    for (const e of rows) {
      if ((e.status === 'running' || e.status === 'pending') && nowMs - Date.parse(e.created_at) > LIMITS.timeoutMs * 2) {
        await persist(e, { status: 'failed', error: 'The app was closed before this run finished.', retryable: (e.steps ?? []).some((s) => s.status === 'planned' || s.status === 'failed'), finished_at: nowIso(nowMs) }).catch(() => {})
      }
    }
    const workflows = new Map(store.peek('automation_workflows').map((w) => [w.id, w]))
    let retried = 0
    for (const e of store.peek('automation_executions')) {
      if (e.status !== 'failed' || !e.retryable || e.attempt >= LIMITS.maxAttempts) continue
      if (nowMs - Date.parse(e.finished_at ?? e.updated_at) < backoffMs(e.attempt)) continue
      if (!workflows.get(e.workflow_id)?.enabled) continue
      try { await retryExecution(e.id, { today, nowMs }); retried++ } catch { await persist(e, { retryable: false }).catch(() => {}) }
    }
    return retried
  }

  /**
   * One check: for every switched-on workflow, start a run for each occurrence that has not run yet. Safe to call as often as you like and from
   * any number of devices. A workflow whose data could not be loaded is skipped (never treated as "nothing happened").
   * @param {{ today: string, tz: string, nowMs?: number, weekStartsOn?: 0 | 1 }} opts
   */
  async function runAutomations({ today, tz, nowMs = Date.now(), weekStartsOn = 1 }) {
    await Promise.all([store.load('automation_workflows'), store.load('automation_executions'), store.load('user_settings')])
    if (store.peek('user_settings')[0]?.automation_prefs?.paused) return { ran: 0, paused: true }
    const workflows = store.peek('automation_workflows').filter((w) => w.enabled && w.activated_at && validateWorkflow(w).ok)
    if (!workflows.length) return { ran: 0 }
    const retried = await sweep({ today, nowMs })
    const failedTables = new Set()
    const need = new Set(workflows.flatMap((w) => tablesFor(w)))
    await Promise.all([...need].map((t) => store.load(t).then(() => { if (!store.isReady?.(t) && store.isReady) failedTables.add(t) }).catch(() => failedTables.add(t))))
    const src = () => ({
      tasks: store.peek('tasks'), habits: store.peek('habits'), habitLogs: store.peek('habit_logs'), habitPauses: store.peek('habit_pauses'),
      goals: store.peek('goals'), milestones: store.peek('milestones'), sessions: store.peek('study_sessions'), reminders: store.peek('reminders'),
      events: store.peek('calendar_events'), exceptions: store.peek('calendar_event_exceptions'),
    })
    let ran = 0
    let started = 0
    for (const w of workflows) {
      if (tablesFor(w).some((t) => failedTables.has(t))) continue
      const executions = store.peek('automation_executions')
      const taken = new Set(executions.filter((e) => e.workflow_id === w.id).map((e) => e.dedupe_key))
      const ctx = { today, tz, nowMs, weekStartsOn, automationIds: createdIds(executions) }
      const fresh = findOccurrences(w, src(), ctx).filter((o) => !taken.has(o.key)).slice(0, LIMITS.maxPerTick)
      for (const occ of fresh) {
        if (started >= LIMITS.maxPerTick) break
        const result = await startRun(w, occ, src(), { ...ctx, automationIds: createdIds(store.peek('automation_executions')) })
        if (result === 'duplicate') continue
        started++
        if (result === 'completed' || result === 'failed') ran++
      }
    }
    return { ran, retried }
  }

  return { saveWorkflow, setWorkflowEnabled, setAutomationsPaused, runAutomations, retryExecution }
}
