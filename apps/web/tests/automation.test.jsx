import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { timeStrInTz, todayStr } from '@/lib/dates'
import { pickOption } from './pickers'
import { chain } from '@lifetrack/core/automation'
import * as store from '@/hooks/store'
import { retryExecution, runAutomations, saveWorkflow, setWorkflowEnabled } from '@/services/api'
import { freshBackend, renderApp, signedInUser, db } from './components/helpers'

// Automation Studio through the real app and the in-browser backend: what a person sees and does, and what ends up stored.
vi.setConfig({ testTimeout: 60_000 })

const TZ = 'Asia/Kolkata'
let TODAY
beforeEach(async () => {
  await freshBackend()
  await signedInUser()
  TODAY = todayStr(TZ)
})

const desktop = (on) => {
  window.matchMedia = (query) => ({
    matches: on && /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}
const open = async (path, heading) => {
  const utils = renderApp(path)
  await screen.findByRole('heading', { name: heading }, { timeout: 40_000 })
  await waitFor(() => expect(screen.queryByRole('status', { name: /loading/i })).toBeNull())
  return utils
}
const notify = { kind: 'notify', config: { title: 'Hello {{task.title}}', body: '', priority: 'normal' } }
const make = async (spec, extra = {}) => {
  const { workflow } = await saveWorkflow(null, { name: 'My flow', description: '', graph: chain(spec), ...extra })
  return workflow
}
const rows = (t) => db.list(t)

describe('Automation Studio dashboard', () => {
  it('starts empty with a way in, and every counter at zero', async () => {
    await open('/automation', 'Automation Studio')
    expect(await screen.findByText('No automations yet')).toBeInTheDocument()
    const overview = screen.getByRole('region', { name: 'Overview' })
    for (const label of ['Workflows', 'Active', 'Disabled', 'Successful runs', 'Failed runs'])
      expect(within(overview).getByText(label)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quick create/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Browse templates/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing has run yet. Runs show up here as they happen.')).toBeInTheDocument()
  })

  it('lists workflows with their trigger, counts them, and switches them on and off', async () => {
    const w = await make(
      { trigger: { kind: 'schedule_daily', config: { time: '21:00' } }, actions: [{ kind: 'notify', config: { title: 'Evening' } }] },
      { name: 'Evening nudge' },
    )
    const user = userEvent.setup()
    await open('/automation', 'Automation Studio')
    expect(await screen.findByText('Evening nudge')).toBeInTheDocument()
    expect(screen.getByText('Every day at 21:00')).toBeInTheDocument()
    expect(screen.getByText('Never run')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Switch on Evening nudge' }))
    await waitFor(async () => expect((await rows('automation_workflows'))[0]).toMatchObject({ id: w.id, enabled: true }))
    expect((await rows('automation_workflows'))[0].activated_at).toBeTruthy()
    await user.click(await screen.findByRole('switch', { name: 'Switch off Evening nudge' }))
    await waitFor(async () => expect((await rows('automation_workflows'))[0]).toMatchObject({ enabled: false, activated_at: null }))
  })

  it('refuses to switch on an incomplete workflow and says why', async () => {
    await saveWorkflow(null, { name: 'Unfinished', graph: { nodes: [], edges: [] } })
    const user = userEvent.setup()
    await open('/automation', 'Automation Studio')
    expect(await screen.findByText('Incomplete')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Switch on Unfinished' }))
    expect(await screen.findByText(/"Unfinished" is not ready: Add a trigger/)).toBeInTheDocument()
    expect((await rows('automation_workflows'))[0].enabled).toBe(false)
  })

  it('asks before switching on a workflow that changes existing tasks', async () => {
    await make(
      { trigger: { kind: 'task_created', config: {} }, actions: [{ kind: 'update_task', config: { priority: 'high' } }] },
      { name: 'Bumper' },
    )
    const user = userEvent.setup()
    await open('/automation', 'Automation Studio')
    await user.click(await screen.findByRole('switch', { name: 'Switch on Bumper' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/changes tasks or goals that already exist. It never deletes anything/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect((await rows('automation_workflows'))[0].enabled).toBe(false)
    await user.click(screen.getByRole('switch', { name: 'Switch on Bumper' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch on' }))
    await waitFor(async () => expect((await rows('automation_workflows'))[0].enabled).toBe(true))
  })

  it('"Pause all" is stored, shown, and stops runs', async () => {
    await open('/automation', 'Automation Studio')
    const user = userEvent.setup()
    expect(await screen.findByText('Automations are running')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Pause all automations' }))
    expect(await screen.findByText('All automations are paused')).toBeInTheDocument()
    expect((await rows('user_settings'))[0].automation_prefs.paused).toBe(true)
    await user.click(screen.getByRole('switch', { name: 'Pause all automations' }))
    expect(await screen.findByText('Automations are running')).toBeInTheDocument()
  })

  it('duplicates (switched off) and deletes with a confirmation, keeping history', async () => {
    const w = await saveWorkflow(null, {
      name: 'Original',
      graph: chain({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] }),
    }).then((r) => r.workflow)
    await store.insert('automation_executions', { workflow_id: w.id, workflow_name: 'Original', status: 'completed', dedupe_key: 'k' })
    const user = userEvent.setup()
    await open('/automation', 'Automation Studio')
    await user.click(await screen.findByRole('button', { name: 'Actions for Original' }))
    await user.click(await screen.findByRole('menuitem', { name: /Duplicate/ }))
    expect(await screen.findByText('Original (copy)')).toBeInTheDocument()
    expect((await rows('automation_workflows')).map((x) => [x.name, x.enabled]).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
      ['Original', false],
      ['Original (copy)', false],
    ])
    await user.click(screen.getByRole('button', { name: 'Actions for Original' }))
    await user.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete workflow' }))
    await waitFor(async () => expect((await rows('automation_workflows')).map((x) => x.name)).toEqual(['Original (copy)']))
    expect((await rows('automation_executions'))[0]).toMatchObject({ workflow_id: null, workflow_name: 'Original' })
  })
})

describe('templates', () => {
  it('shows ready-made workflows by group and opens one switched off and editable', async () => {
    const user = userEvent.setup()
    await open('/automation?tab=templates', 'Automation Studio')
    for (const g of ['Daily Productivity', 'Habit Management', 'Career & Learning', 'Fitness'])
      expect(await screen.findByRole('region', { name: g })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Missed habit: recovery task/ }))
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toHaveValue('Missed habit: recovery task')
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Switch workflow on' })).toHaveAttribute('aria-checked', 'false')
    expect(await rows('automation_workflows')).toHaveLength(0) // opening a template creates nothing
  })
})

describe('the editor (phone layout: steps list)', () => {
  beforeEach(() => desktop(false))
  it('saves a new workflow, edits a step, and the change is stored', async () => {
    const user = userEvent.setup()
    await open('/automation/new?template=morning-plan', 'Automation Studio').catch(() => {})
    const name = await screen.findByRole('textbox', { name: 'Workflow name' })
    expect(await screen.findByText('Ready to switch on')).toBeInTheDocument()
    await user.clear(name)
    await user.type(name, 'Plan the day')
    await user.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(async () =>
      expect((await rows('automation_workflows'))[0]).toMatchObject({
        name: 'Plan the day',
        trigger_kind: 'schedule_weekdays',
        enabled: false,
      }),
    )
    const saved = (await rows('automation_workflows'))[0]
    expect(saved.graph.nodes.map((n) => n.kind)).toEqual(['schedule_weekdays', 'notify'])
    // edit the notification's title from the steps list
    await user.click(await screen.findByRole('button', { name: /Notify: Plan your day/ }))
    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Top three today')
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(async () => expect((await rows('automation_workflows'))[0].graph.nodes[1].config.title).toBe('Top three today'))
  })

  it('shows what is wrong, names the step, and tests a workflow without changing anything', async () => {
    await store.insert('tasks', { title: 'Pay rent', priority: 'high', due_date: TODAY })
    const user = userEvent.setup()
    await open('/automation/new?template=overdue-recovery', 'Automation Studio').catch(() => {})
    await screen.findByRole('textbox', { name: 'Workflow name' })
    await user.click(screen.getByRole('button', { name: /Test/ }))
    const dialog = await screen.findByRole('dialog', { name: /Test workflow/ })
    expect(await within(dialog).findByText('It would do this:')).toBeInTheDocument()
    expect(within(dialog).getByText(/Would: Show notification "Overdue: Pay rent"/)).toBeInTheDocument()
    expect(within(dialog).getByText('Nothing is saved or changed.', { exact: false })).toBeInTheDocument()
    // (the notification centre may raise its own "due today" nudge for that task: only automation output counts)
    expect((await rows('notifications')).filter((n) => n.link === '/automation/history')).toHaveLength(0)
    expect(await rows('automation_executions')).toHaveLength(0)
  })

  it('blocks switching on an invalid workflow from the editor', async () => {
    const user = userEvent.setup()
    await open('/automation/new', 'Automation Studio').catch(() => {})
    await screen.findByRole('textbox', { name: 'Workflow name' })
    expect(screen.getByText(/to fix before it can be switched on/)).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Switch workflow on' }))
    expect(await screen.findByText(/Not ready: Connect the trigger to a step/)).toBeInTheDocument()
    expect(await rows('automation_workflows')).toHaveLength(0)
  })

  it('says so when the workflow does not exist', async () => {
    await open('/automation/00000000-0000-4000-8000-000000000000', 'Automation Studio').catch(() => {})
    expect(await screen.findByText('That workflow does not exist')).toBeInTheDocument()
  })
})

describe('the editor (desktop canvas)', () => {
  beforeEach(() => desktop(true))
  it('adds steps from the palette, connects them, undoes and redoes', async () => {
    const user = userEvent.setup()
    await open('/automation/new', 'Automation Studio').catch(() => {})
    await screen.findByRole('textbox', { name: 'Workflow name' })
    const canvas = screen.getByRole('application', { name: /Workflow canvas/ })
    expect(within(canvas).getAllByRole('button', { name: /Trigger:/ })).toHaveLength(1)
    // adding with the trigger selected joins them
    await user.click(within(canvas).getByRole('button', { name: /Trigger:/ }))
    await user.click(screen.getByRole('button', { name: 'Add action: Show an in-app notification' }))
    expect(within(canvas).getAllByRole('button', { name: /Action: Show an in-app notification/ })).toHaveLength(1)
    expect(screen.getAllByText('Title is required.').length).toBeGreaterThan(0)
    const panel = screen.getByRole('complementary', { name: 'Step settings' })
    await user.type(within(panel).getByLabelText('Title'), 'Hi')
    await waitFor(() => expect(screen.queryByText('Title is required.')).toBeNull())
    expect(await screen.findByText('Ready to switch on')).toBeInTheDocument()
    // undo the typing, then the node
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(within(canvas).getAllByRole('button', { name: /Action:/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(within(canvas).queryAllByRole('button', { name: /Action:/ })).toHaveLength(0))
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(await within(canvas).findAllByRole('button', { name: /Action:/ })).toHaveLength(1)
  })

  it('connects through "Runs next", refuses a loop, and removes a step with the keyboard', async () => {
    const user = userEvent.setup()
    await open('/automation/new?template=missed-habit', 'Automation Studio').catch(() => {})
    await screen.findByRole('textbox', { name: 'Workflow name' })
    const canvas = screen.getByRole('application', { name: /Workflow canvas/ })
    await user.click(screen.getByRole('button', { name: 'Add action: Show an in-app notification' })) // a second action, not joined (the trigger is not selected)
    const panel = screen.getByRole('complementary', { name: 'Step settings' })
    expect(await within(panel).findByText('Runs next')).toBeInTheDocument()
    // select the first action and connect it to the new one
    await user.click(within(canvas).getByRole('button', { name: /Action: Create a task/ }))
    const next = within(screen.getByRole('complementary', { name: 'Step settings' }))
    await user.click(next.getByRole('checkbox', { name: 'Show an in-app notification' }))
    expect(next.getByRole('checkbox', { name: 'Show an in-app notification' })).toBeChecked()
    // the new action cannot lead back to the first (a loop)
    await user.click(within(canvas).getByRole('button', { name: /Action: Show an in-app notification/ }))
    await user.click(within(screen.getByRole('complementary', { name: 'Step settings' })).getByRole('checkbox', { name: 'Create a task' }))
    expect(await screen.findByText('That would make a loop.')).toBeInTheDocument()
    // Delete removes the focused step
    const node = within(canvas).getByRole('button', { name: /Action: Show an in-app notification/ })
    node.focus()
    fireEvent.keyDown(node, { key: 'Delete' })
    await waitFor(() => expect(within(canvas).queryByRole('button', { name: /Action: Show an in-app notification/ })).toBeNull())
  })

  it('arrow keys move a step, and the toolbar zooms and tidies', async () => {
    const user = userEvent.setup()
    await open('/automation/new?template=missed-habit', 'Automation Studio').catch(() => {})
    await screen.findByRole('textbox', { name: 'Workflow name' })
    const canvas = screen.getByRole('application', { name: /Workflow canvas/ })
    const node = within(canvas).getByRole('button', { name: /Trigger:/ })
    const left = parseInt(node.style.left, 10)
    node.focus()
    fireEvent.keyDown(node, { key: 'ArrowRight' })
    await waitFor(() => expect(parseInt(within(canvas).getByRole('button', { name: /Trigger:/ }).style.left, 10)).toBe(left + 8))
    const toolbar = within(screen.getByRole('toolbar', { name: 'Canvas controls' }))
    const percent = () => toolbar.getByText(/%$/).textContent
    const before = percent()
    await user.click(toolbar.getByRole('button', { name: 'Zoom in' }))
    expect(percent()).not.toBe(before)
    await user.click(toolbar.getByRole('button', { name: 'Tidy up the layout' }))
    await waitFor(() => expect(parseInt(within(canvas).getByRole('button', { name: /Trigger:/ }).style.left, 10)).toBe(left))
  })

  it("edits a condition: AND / OR rules for the trigger's subject only", async () => {
    const user = userEvent.setup()
    await open('/automation/new', 'Automation Studio').catch(() => {})
    await screen.findByRole('textbox', { name: 'Workflow name' })
    await user.click(screen.getByRole('button', { name: 'Add condition: If … (AND / OR rules)' }))
    const panel = within(screen.getByRole('complementary', { name: 'Step settings' }))
    expect(panel.getByRole('tab', { name: /All rules match \(AND\)/ })).toBeInTheDocument()
    await user.click(panel.getByRole('tab', { name: /Any rule matches \(OR\)/ }))
    expect(panel.getByRole('tab', { name: /Any rule matches \(OR\)/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(panel.getByRole('button', { name: 'Add a rule' }))
    expect(panel.getAllByText(/^Rule \d$/)).toHaveLength(2)
    expect(panel.getByText(/Only day-based rules are available for a time trigger/)).toBeInTheDocument()
  })
})

describe('running and history, end to end', () => {
  it('runs a due workflow once and shows what it did in the history', async () => {
    const tz = TZ
    const w = await make(
      {
        trigger: { kind: 'schedule_daily', config: { time: timeStrInTz(new Date(Date.now() - 10 * 60_000), TZ) } },
        actions: [
          { kind: 'notify', config: { title: 'Daily ping' } },
          { kind: 'create_task', config: { title: 'Plan {{weekday}}', due: 'today' } },
        ],
      },
      { name: 'Daily' },
    )
    await setWorkflowEnabled(w, true)
    await store.update('automation_workflows', w.id, { activated_at: new Date(Date.now() - 20 * 3600_000).toISOString() })
    const first = await runAutomations({ today: TODAY, tz, nowMs: Date.now() })
    const second = await runAutomations({ today: TODAY, tz, nowMs: Date.now() })
    expect(first.ran).toBe(1)
    expect(second.ran).toBe(0)
    const [e] = await rows('automation_executions')
    expect(e).toMatchObject({ status: 'completed', workflow_name: 'Daily' })
    expect((await rows('notifications')).filter((n) => n.link === '/automation/history').map((n) => n.title)).toEqual(['Daily ping'])
    expect((await rows('tasks')).map((t) => t.title)).toHaveLength(1)

    const user = userEvent.setup()
    await open('/automation/history', 'Automation history')
    const row = await screen.findByTestId('execution')
    expect(within(row).getByText('Daily')).toBeInTheDocument()
    expect(within(row).getByText('Completed')).toBeInTheDocument()
    expect(within(row).getByText(/2 actions done/)).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { expanded: false }))
    const steps = within(row).getByRole('list', { name: 'Steps' })
    expect(within(steps).getByText(/Show notification "Daily ping"/)).toBeInTheDocument()
    expect(within(steps).getByText(/Create task "Plan /)).toBeInTheDocument()
  })

  it('filters by status, workflow and date, and says when nothing matches', async () => {
    const a = await make({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] }, { name: 'Alpha' })
    const b = await make({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] }, { name: 'Beta' })
    await store.insert('automation_executions', { workflow_id: a.id, workflow_name: 'Alpha', status: 'completed', dedupe_key: '1' })
    await store.insert('automation_executions', {
      workflow_id: b.id,
      workflow_name: 'Beta',
      status: 'failed',
      error: 'It broke',
      dedupe_key: '2',
    })
    await store.insert('automation_executions', {
      workflow_id: b.id,
      workflow_name: 'Beta',
      status: 'skipped',
      reason: 'The conditions were not met.',
      dedupe_key: '3',
    })
    const user = userEvent.setup()
    await open('/automation/history', 'Automation history')
    await waitFor(() => expect(screen.getAllByTestId('execution')).toHaveLength(3))
    await user.click(screen.getByRole('tab', { name: 'Failed' }))
    expect(screen.getAllByTestId('execution')).toHaveLength(1)
    expect(screen.getByText(/It broke/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Skipped' }))
    expect(screen.getByText(/The conditions were not met/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'All' }))
    await pickOption(user, screen.getByLabelText('Workflow'), a.id)
    expect(screen.getAllByTestId('execution')).toHaveLength(1)
    await user.click(screen.getByRole('tab', { name: 'Failed' }))
    expect(await screen.findByText('No runs match these filters')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    await waitFor(() => expect(screen.getAllByTestId('execution')).toHaveLength(3))
  })

  it('retries a failed run from the step that failed, and says why it failed', async () => {
    const w = await make({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] })
    await store.insert('automation_executions', {
      workflow_id: w.id,
      workflow_name: 'My flow',
      status: 'failed',
      dedupe_key: 'k',
      attempt: 1,
      retryable: false,
      error: 'Show notification "Late": denied',
      trigger_kind: 'task_completed',
      steps: [
        {
          node_id: 'a',
          type: 'action',
          kind: 'notify',
          status: 'failed',
          detail: 'Show notification "Late"',
          error: 'denied',
          effect: { op: 'notify', key: 'auto:late', title: 'Late', body: '', priority: 'normal' },
        },
      ],
    })
    const user = userEvent.setup()
    await open('/automation/history', 'Automation history')
    const row = await screen.findByTestId('execution')
    expect(within(row).getByText(/denied/)).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: /Retry/ }))
    await waitFor(async () => expect((await rows('automation_executions'))[0]).toMatchObject({ status: 'completed', attempt: 2 }))
    expect((await rows('notifications')).filter((n) => n.link === '/automation/history').map((n) => n.title)).toEqual(['Late'])
    await expect(retryExecution((await rows('automation_executions'))[0].id, { today: TODAY })).rejects.toThrow(/Only a failed run/)
  })

  it('the dashboard counts runs and lists the recent ones', async () => {
    const w = await make({ trigger: { kind: 'task_completed', config: {} }, actions: [notify] }, { name: 'Counter' })
    for (const [i, status] of ['completed', 'completed', 'failed', 'skipped'].entries())
      await store.insert('automation_executions', {
        workflow_id: w.id,
        workflow_name: 'Counter',
        status,
        dedupe_key: `k${i}`,
        trigger_info: { label: `Task ${i}` },
      })
    await open('/automation', 'Automation Studio')
    const overview = await screen.findByRole('region', { name: 'Overview' })
    await waitFor(() => expect(within(overview).getByText('Successful runs').previousElementSibling).toHaveTextContent('2'))
    expect(within(overview).getByText('Failed runs').previousElementSibling).toHaveTextContent('1')
    const recent = screen.getByRole('complementary', { name: 'Recently executed' })
    expect(within(recent).getAllByText('Counter')).toHaveLength(4)
  })
})
