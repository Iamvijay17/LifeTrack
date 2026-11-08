import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Menu } from '@/components/ui/menu'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { placePopup } from '@/components/ui/popup'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmProvider } from '@/components/shared/Confirm'
import { StatCard } from '@/components/shared/StatCard'
import { categoryOptions } from '@/features/finance/TransactionDialog'
import { BudgetAlert } from '@/features/finance/BudgetAlert'
import { UpcomingCard } from '@/features/overview/UpcomingCard'
import { GettingStartedCard } from '@/features/overview/GettingStartedCard'
import { ProgressTab } from '@/features/fitness/ProgressTab'
import { pageTitle } from '@/lib/nav'
import { plural } from '@/lib/format'

vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: { week_starts_on: 1 } }) }))

describe('placePopup', () => {
  const viewport = { width: 400, height: 800 }
  const anchor = { top: 100, bottom: 140, left: 20, right: 120 }
  it('goes below the anchor when it fits', () => {
    expect(placePopup({ anchor, popup: { width: 200, height: 200 }, viewport })).toMatchObject({ top: 144, left: 20, above: false })
  })
  it('flips above when there is more room there', () => {
    const low = { top: 700, bottom: 740, left: 20, right: 120 }
    const p = placePopup({ anchor: low, popup: { width: 200, height: 300 }, viewport })
    expect(p.above).toBe(true)
    expect(p.top).toBe(700 - 4 - 300)
  })
  it('stays on screen horizontally', () => {
    expect(placePopup({ anchor: { ...anchor, left: 350, right: 390 }, popup: { width: 200, height: 50 }, viewport }).left).toBe(192)
    expect(
      placePopup({ anchor: { ...anchor, left: 0, right: 40 }, popup: { width: 200, height: 50 }, viewport, align: 'right' }).left,
    ).toBe(8)
  })
  it('caps the height to the room available so a long list scrolls instead of overflowing', () => {
    const p = placePopup({ anchor: { ...anchor, top: 300, bottom: 340 }, popup: { width: 200, height: 2000 }, viewport })
    expect(p.maxHeight).toBe(800 - 340 - 4 - 8)
  })
})

describe('Menu keyboard support', () => {
  const setup = () => {
    const edit = vi.fn()
    render(
      <Menu
        label="Actions"
        items={[
          { label: 'Edit', onClick: edit },
          { label: 'Hidden', hidden: true, onClick: () => {} },
          { label: 'Delete', onClick: () => {} },
        ]}
      />,
    )
    return { user: userEvent.setup(), edit }
  }
  it('moves focus into the menu and through it with the arrow keys, skipping hidden items', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
    expect(screen.queryByRole('menuitem', { name: 'Hidden' })).not.toBeInTheDocument()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
  })
  it('Escape closes it and returns focus to the trigger', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus()
  })
  it('runs the action and closes', async () => {
    const { user, edit } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(edit).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('popups inside a dialog', () => {
  function Form() {
    const [open, setOpen] = useState(true)
    return open ? (
      <Dialog open onOpenChange={setOpen} title="Form">
        <Field label="Note">
          <Input />
        </Field>
        <Field label="Kind">
          <Select defaultValue="a">
            <optgroup label="Group one">
              <option value="a">Apple</option>
            </optgroup>
            <optgroup label="Group two">
              <option value="b">Pear</option>
            </optgroup>
          </Select>
        </Field>
        <Field label="Day">
          <Input type="date" defaultValue="2026-11-02" />
        </Field>
      </Dialog>
    ) : (
      <p>closed</p>
    )
  }
  it('Escape closes the open dropdown, not the form under it; a second Escape closes the form', async () => {
    const user = userEvent.setup()
    render(<Form />)
    await user.click(screen.getByLabelText('Kind'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Form' })).toBeInTheDocument()
    expect(screen.getByLabelText('Kind')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(await screen.findByText('closed')).toBeInTheDocument()
  })
  it('the same for the calendar', async () => {
    const user = userEvent.setup()
    render(<Form />)
    await user.click(screen.getByLabelText('Day'))
    expect(screen.getByRole('dialog', { name: 'Choose date' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose date' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Form' })).toBeInTheDocument()
  })
  it('renders inside the dialog so the focus trap and clicks still work, and keeps option group labels', async () => {
    const user = userEvent.setup()
    render(<Form />)
    await user.click(screen.getByLabelText('Kind'))
    const dialog = screen.getByRole('dialog', { name: 'Form' })
    expect(within(dialog).getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Group one')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Pear' }))
    expect(screen.getByLabelText('Kind')).toHaveTextContent('Pear')
    expect(screen.getByRole('dialog', { name: 'Form' })).toBeInTheDocument()
  })
})

describe('Field wiring', () => {
  it('marks an invalid input and describes it with the error, otherwise the hint', () => {
    const { rerender } = render(
      <Field label="Name" hint="Your full name">
        <Input />
      </Field>,
    )
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Your full name')
    rerender(
      <Field label="Name" hint="Your full name" error="Required">
        <Input />
      </Field>,
    )
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Required')
  })
})

describe('Segmented keyboard support', () => {
  const OPTIONS = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ]
  function Tabs() {
    const [v, setV] = useState('a')
    return <Segmented value={v} onChange={setV} options={OPTIONS} />
  }
  it('arrow keys move and wrap, Home and End jump, only the selected tab is in the tab order', async () => {
    const user = userEvent.setup()
    render(<Tabs />)
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('tabindex', '-1')
    screen.getByRole('tab', { name: 'A' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'B' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('FormDialog', () => {
  const setup = () => {
    const onOpenChange = vi.fn()
    render(
      <ConfirmProvider>
        <FormDialog open title="Edit" onOpenChange={onOpenChange} onSubmit={(e) => e.preventDefault()}>
          <Field label="Name">
            <Input />
          </Field>
        </FormDialog>
      </ConfirmProvider>,
    )
    return { onOpenChange, user: userEvent.setup() }
  }
  it('closes without asking when nothing was typed', async () => {
    const { user, onOpenChange } = setup()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(screen.queryByText('Discard your changes?')).not.toBeInTheDocument()
  })
  it('asks before an accidental dismissal loses typed text, and "Keep editing" keeps the form', async () => {
    const { user, onOpenChange } = setup()
    await user.type(screen.getByLabelText('Name'), 'Half written')
    await user.keyboard('{Escape}')
    expect(await screen.findByText('Discard your changes?')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('Half written')
  })
  it('"Discard" closes it, and the Cancel button never asks', async () => {
    const { user, onOpenChange } = setup()
    await user.type(screen.getByLabelText('Name'), 'x')
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
  it('keeps the submit button connected to the form from the sticky footer', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.form).toBe(screen.getByLabelText('Name').closest('form'))
  })
})

describe('StatCard', () => {
  it('links to its module when given `to`', () => {
    render(
      <MemoryRouter>
        <StatCard label="Water" value="1" to="/health" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Water/ })).toHaveAttribute('href', '/health')
  })
})

describe('small helpers', () => {
  it('pluralises', () => {
    expect(plural(1, 'rejection')).toBe('1 rejection')
    expect(plural(0, 'rejection')).toBe('0 rejections')
  })
  it('titles pages', () => {
    expect(pageTitle('/planner')).toBe('Daily Planner · LifeTrack')
    expect(pageTitle('/nope')).toBe('LifeTrack')
  })
  it('offers categories the user has already used, so they follow them across devices', () => {
    const tx = [
      { type: 'expense', category: 'Pets' },
      { type: 'income', category: 'Royalties' },
      { type: 'expense', category: 'Food' },
    ]
    const options = categoryOptions('expense', tx)
    expect(options).toContain('Pets')
    expect(options).not.toContain('Royalties')
    expect(options.filter((c) => c === 'Food')).toHaveLength(1)
    expect(categoryOptions('income')).toContain('Salary')
  })
})

describe('BudgetAlert', () => {
  const money = (p) => `₹${p}`
  const noop = () => {}
  it('stays quiet below 80% and without a budget', () => {
    const { container, rerender } = render(<BudgetAlert sum={{ budgetUsed: 0.5, remaining: 50 }} money={money} onEdit={noop} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<BudgetAlert sum={{ budgetUsed: null, remaining: null }} money={money} onEdit={noop} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('warns near the limit and says how far over when past it', () => {
    const { rerender } = render(<BudgetAlert sum={{ budgetUsed: 0.85, remaining: 15 }} money={money} onEdit={noop} />)
    expect(screen.getByRole('status')).toHaveTextContent("You've used 85% of this month's budget. ₹15 left.")
    rerender(<BudgetAlert sum={{ budgetUsed: 1.2, remaining: -20 }} money={money} onEdit={noop} />)
    expect(screen.getByRole('status')).toHaveTextContent("You're ₹20 over this month's budget.")
  })
})

describe('UpcomingCard', () => {
  it('links each row to where it can be acted on and flags overdue ones', () => {
    render(
      <MemoryRouter>
        <UpcomingCard
          today="2026-11-02"
          upcoming={{
            more: 2,
            items: [
              { id: 'overdue', kind: 'overdue', title: '2 overdue tasks', date: '2026-10-30', overdue: true },
              { id: 'i', kind: 'interview', refId: 'a1', title: 'Acme · HR', date: '2026-11-03', time: '15:00' },
            ],
          }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /2 overdue tasks/ })).toHaveAttribute('href', '/planner')
    expect(screen.getByRole('link', { name: /Acme · HR.*Tomorrow, 15:00/ })).toHaveAttribute('href', '/jobs?app=a1')
    expect(screen.getByText('and 2 more')).toBeInTheDocument()
  })
  it('says when nothing is due', () => {
    render(
      <MemoryRouter>
        <UpcomingCard today="2026-11-02" upcoming={{ items: [], more: 0 }} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Nothing due/)).toBeInTheDocument()
  })
})

describe('GettingStartedCard', () => {
  it('links open steps to their screen or form, marks done ones, and can be dismissed', async () => {
    const user = userEvent.setup()
    const onQuick = vi.fn()
    const onDismiss = vi.fn()
    const guide = {
      done: 1,
      total: 3,
      steps: [
        { key: 'task', label: 'Plan a task', done: false },
        { key: 'goal', label: 'Set a goal', done: false },
        { key: 'habit', label: 'Create a habit', done: true },
      ],
    }
    render(
      <MemoryRouter>
        <GettingStartedCard guide={guide} onQuick={onQuick} onDismiss={onDismiss} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Plan a task' }))
    expect(onQuick).toHaveBeenCalledWith('task')
    expect(screen.getByRole('link', { name: 'Set a goal' })).toHaveAttribute('href', '/goals')
    expect(screen.getByText('Done:')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create a habit/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Dismiss/ }))
    expect(onDismiss).toHaveBeenCalled()
  })
})

describe('ProgressTab', () => {
  const workouts = [
    { id: 'w1', status: 'completed', workout_date: '2026-10-01' },
    { id: 'w2', status: 'completed', workout_date: '2026-10-08' },
  ]
  const logs = [
    { workout_id: 'w1', exercise_name: 'Bench', reps: 8, weight_kg: 60 },
    { workout_id: 'w2', exercise_name: 'Bench', reps: 6, weight_kg: 70 },
    { workout_id: 'w2', exercise_name: 'Pull-up', reps: 10, weight_kg: 0 },
  ]
  it('lists each exercise with its best set', () => {
    render(<ProgressTab logs={logs} workouts={workouts} />)
    expect(screen.getByText('70 kg × 6')).toBeInTheDocument()
    expect(screen.getByText('10 reps')).toBeInTheDocument()
    expect(screen.getByText(/2 sessions/)).toBeInTheDocument()
  })
  it('explains itself when there is nothing logged', () => {
    render(<ProgressTab logs={[]} workouts={[]} />)
    expect(screen.getByText('No records yet')).toBeInTheDocument()
  })
})
