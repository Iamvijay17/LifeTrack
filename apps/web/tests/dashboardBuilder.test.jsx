import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { WIDGET_CATALOG, readState, revOf, writeState } from '@lifetrack/core/dashboardBuilder'

// The saved settings row, as the store would hold it. `refetch` is what the builder calls before every write to see what is really saved.
const remote = { row: {} }
vi.mock('@/hooks/store', () => ({
  refetch: vi.fn(async () => {}),
  peek: () => [{ dashboard_widgets: remote.row }],
  tracked: (fn) => fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const { useDashboardBuilder } = await import('@/features/overview/builder/useDashboardBuilder')
const { WidgetLibrary } = await import('@/features/overview/builder/WidgetLibrary')
const { WidgetSettings } = await import('@/features/overview/builder/WidgetSettings')
const { DashboardGrid } = await import('@/features/overview/builder/DashboardGrid')
const { widgetMenu } = await import('@/features/overview/builder/widgetMenu')
const { TemplatesDialog } = await import('@/features/overview/builder/TemplatesDialog')
const { ConfirmProvider } = await import('@/components/shared/Confirm')

const hook = (saved = {}) => {
  const save = vi.fn(async ({ dashboard_widgets }) => {
    remote.row = dashboard_widgets
  })
  remote.row = saved
  const r = renderHook(({ prefs }) => useDashboardBuilder(prefs, save), { initialProps: { prefs: saved } })
  return { ...r, save }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('useDashboardBuilder', () => {
  it('edits a draft that Cancel throws away, leaving the saved layout alone', () => {
    const { result, save } = hook()
    act(() => result.current.startEdit())
    act(() => result.current.ops.removeWidget('w_score'))
    expect(result.current.active.widgets.some((w) => w.id === 'w_score')).toBe(false)
    expect(result.current.dirty).toBe(true)
    act(() => result.current.cancel())
    expect(result.current.editing).toBe(false)
    expect(result.current.active.widgets.some((w) => w.id === 'w_score')).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('Save writes once, bumps the revision, and keeps the old keys for the phone app in step', async () => {
    const { result, save } = hook({ somethingElse: 1 })
    act(() => result.current.startEdit())
    act(() => result.current.ops.removeWidget('w_nutrition'))
    act(() => result.current.ops.addWidget('notes'))
    await act(async () => {
      expect(await result.current.commit()).toBe(true)
    })
    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0].dashboard_widgets
    expect(revOf(saved)).toBe(1)
    expect(saved.nutrition).toBe(false)
    expect(saved.somethingElse).toBe(1)
    expect(readState(saved).workspaces[0].widgets.some((w) => w.type === 'notes')).toBe(true)
    expect(result.current.editing).toBe(false)
    expect(result.current.status.state).toBe('saved')
  })

  it('does not overwrite a layout another device saved meanwhile: it asks, and either choice is safe', async () => {
    const { result, save } = hook()
    act(() => result.current.startEdit())
    act(() => result.current.ops.removeWidget('w_score'))
    // another device saves in between
    remote.row = writeState({}, readState({}))
    await act(async () => {
      expect(await result.current.commit()).toBe(false)
    })
    expect(save).not.toHaveBeenCalled()
    expect(result.current.conflict).toBeTruthy()
    expect(result.current.editing).toBe(true) // nothing is lost

    await act(async () => result.current.resolveConflict('mine'))
    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0].dashboard_widgets
    expect(revOf(saved)).toBe(2) // on top of the other device's revision
    expect(readState(saved).workspaces[0].widgets.some((w) => w.id === 'w_score')).toBe(false)
    expect(result.current.editing).toBe(false)
  })

  it('can drop its edits in favour of the newer version', async () => {
    const { result, save } = hook()
    act(() => result.current.startEdit())
    act(() => result.current.ops.removeWidget('w_score'))
    remote.row = writeState({}, readState({}))
    await act(async () => {
      await result.current.commit()
    })
    await act(async () => result.current.resolveConflict('theirs'))
    expect(save).not.toHaveBeenCalled()
    expect(result.current.editing).toBe(false)
  })

  it('a failed save keeps the draft, says so, and can be retried', async () => {
    const { result, save } = hook()
    save.mockRejectedValueOnce(new Error('offline'))
    act(() => result.current.startEdit())
    act(() => result.current.ops.removeWidget('w_score'))
    await act(async () => {
      expect(await result.current.commit()).toBe(false)
    })
    expect(result.current.status.state).toBe('error')
    expect(toast.error).toHaveBeenCalled()
    expect(result.current.editing).toBe(true)
    expect(result.current.active.widgets.some((w) => w.id === 'w_score')).toBe(false)
    await act(async () => {
      expect(await result.current.commit()).toBe(true)
    })
    expect(result.current.editing).toBe(false)
  })

  it('creating, renaming and switching workspaces outside edit mode saves at once, and switching needs no save', async () => {
    const { result, save, rerender } = hook()
    let id
    await act(async () => {
      id = result.current.ops.createWorkspace('Fitness Workspace', 'fitness')
    })
    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0].dashboard_widgets
    rerender({ prefs: saved })
    expect(result.current.state.workspaces.map((w) => w.name)).toEqual(['My Daily Life', 'Fitness Workspace'])
    expect(result.current.active.id).toBe(id)
    expect(result.current.active.widgets.map((w) => w.type)).toEqual(expect.arrayContaining(['fitness', 'nutrition', 'sleep']))
    act(() => result.current.select('ws_main'))
    expect(result.current.active.name).toBe('My Daily Life')
    expect(save).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('lt.dashboard.workspace')).toBe('ws_main')
  })

  it('applying a template and restoring keeps data out of it: only the dashboard changes', () => {
    const { result } = hook()
    act(() => result.current.startEdit())
    const before = result.current.current()
    act(() => result.current.ops.resetWorkspace())
    act(() => result.current.ops.restore(before))
    expect(result.current.current()).toBe(before)
  })
})

const wrap = (ui) =>
  render(
    <MemoryRouter>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </MemoryRouter>,
  )

describe('WidgetLibrary', () => {
  const ws = (widgets = []) => ({ id: 'w', name: 'Main', widgets, layouts: { lg: [], md: [], sm: [] } })
  const w = (type, id = type, hidden = false) => ({ id, type, title: '', config: {}, hidden, size: { w: 4, h: 4 } })

  it('lists the catalog, searches it and filters by category', async () => {
    const user = userEvent.setup()
    wrap(<WidgetLibrary open onOpenChange={() => {}} workspace={ws()} onAdd={() => {}} onShow={() => {}} />)
    expect(screen.getAllByRole('listitem').length).toBe(WIDGET_CATALOG.length)
    await user.type(screen.getByRole('textbox', { name: 'Search widgets' }), 'budget')
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))).toContain('library-budget')
    await user.clear(screen.getByRole('textbox', { name: 'Search widgets' }))
    await user.click(screen.getByRole('tab', { name: 'Finance' }))
    const finance = screen.getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))
    expect(finance.sort()).toEqual(['library-budget', 'library-spending', 'library-transactions'])
    await user.type(screen.getByRole('textbox', { name: 'Search widgets' }), 'zzzz')
    expect(screen.getByText(/No widget matches/)).toBeInTheDocument()
  })

  it('adds a widget, will not add a single-instance one twice, but offers another of a multi one', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    wrap(<WidgetLibrary open onOpenChange={() => {}} workspace={ws([w('score'), w('notes')])} onAdd={onAdd} onShow={() => {}} />)
    expect(screen.getByRole('button', { name: 'Add Life Score' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add Budget overview' }))
    expect(onAdd).toHaveBeenCalledWith('budget')
    await user.click(screen.getByRole('button', { name: 'Add another Quick notes' }))
    expect(onAdd).toHaveBeenLastCalledWith('notes')
  })

  it('offers hidden widgets to show again', async () => {
    const user = userEvent.setup()
    const onShow = vi.fn()
    wrap(<WidgetLibrary open onOpenChange={() => {}} workspace={ws([w('goals', 'g1', true)])} onAdd={() => {}} onShow={onShow} />)
    await user.click(screen.getByRole('button', { name: /Show Goal progress/ }))
    expect(onShow).toHaveBeenCalledWith('g1')
  })
})

describe('WidgetSettings', () => {
  it('keeps what is entered inside the limits the widget declares', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const widget = { id: 'n', type: 'notes', title: '', config: { count: 4 }, hidden: false }
    wrap(<WidgetSettings widget={widget} onClose={() => {}} onSave={onSave} />)
    await user.type(screen.getByLabelText('Title'), 'Ideas')
    const rows = screen.getByLabelText('Rows to show')
    await user.clear(rows)
    await user.type(rows, '99')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onSave).toHaveBeenCalledWith('n', { title: 'Ideas', config: { count: 8 } })
  })
})

describe('DashboardGrid', () => {
  const widgets = [
    { id: 'a', type: 'score', title: 'My score', config: {}, hidden: false, size: { w: 4, h: 7 } },
    { id: 'b', type: 'goals', title: '', config: {}, hidden: false, size: { w: 4, h: 5 } },
  ]
  const layouts = {
    lg: [
      { i: 'a', x: 0, y: 0, w: 4, h: 7 },
      { i: 'b', x: 4, y: 0, w: 4, h: 5 },
    ],
    md: [
      { i: 'a', x: 0, y: 0, w: 3, h: 7 },
      { i: 'b', x: 3, y: 0, w: 3, h: 5 },
    ],
    sm: [
      { i: 'a', x: 0, y: 0, w: 1, h: 7 },
      { i: 'b', x: 0, y: 7, w: 1, h: 5 },
    ],
  }
  const workspace = { id: 'w', name: 'Main', widgets, layouts }
  const items = (boom) => [
    { widget: widgets[0], node: <p>score body</p> },
    {
      widget: widgets[1],
      node: boom ? <Boom /> : <p>goals body</p>,
    },
  ]
  function Boom() {
    throw new Error('broken widget')
  }
  const grid = (props) =>
    render(
      <DashboardGrid
        workspace={workspace}
        items={items(props?.boom)}
        editing={false}
        menuFor={() => [{ label: 'Remove widget', onClick: () => {} }]}
        onLayout={() => {}}
        onMove={() => {}}
        {...props}
      />,
    )

  it('shows a clean dashboard outside edit mode: no handles, no menus, widgets usable', () => {
    grid()
    expect(screen.getByText('score body')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Drag to move/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Settings for/ })).toBeNull()
    expect(screen.getByText('My score')).toBeInTheDocument() // custom title
    expect(document.querySelectorAll('.react-grid-item:not(.react-resizable-hide)')).toHaveLength(0) // none can be resized
  })

  it('shows drag handles, menus and resize handles while editing', () => {
    grid({ editing: true })
    expect(screen.getByRole('img', { name: 'Drag to move My score' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings for Goal progress' })).toBeInTheDocument()
    expect(document.querySelectorAll('.react-grid-item:not(.react-resizable-hide)').length).toBe(2)
    expect(screen.getByTestId('widget-grid')).toHaveAttribute('data-editing', 'true')
  })

  it('one widget that throws shows a notice and the others keep working', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    grid({ boom: true })
    expect(screen.getByRole('alert')).toHaveTextContent('Goal progress could not load')
    expect(screen.getByText('score body')).toBeInTheDocument()
    spy.mockRestore()
  })
})

describe('widget menu', () => {
  const state = {
    defaultId: 'a',
    workspaces: [
      {
        id: 'a',
        name: 'Main',
        widgets: [
          { id: 'n', type: 'notes', title: '', config: { count: 4 }, hidden: false, size: { w: 4, h: 6 } },
          { id: 's', type: 'score', title: '', config: {}, hidden: false, size: { w: 4, h: 7 } },
        ],
        layouts: {
          lg: [
            { i: 'n', x: 0, y: 0, w: 4, h: 6 },
            { i: 's', x: 4, y: 0, w: 4, h: 7 },
          ],
          md: [],
          sm: [],
        },
      },
      {
        id: 'b',
        name: 'Fitness',
        widgets: [{ id: 's2', type: 'score', title: '', config: {}, hidden: false, size: { w: 4, h: 7 } }],
        layouts: { lg: [{ i: 's2', x: 0, y: 0, w: 4, h: 7 }], md: [], sm: [] },
      },
    ],
  }
  const ops = new Proxy({}, { get: () => vi.fn() })
  const labels = (id) =>
    widgetMenu({
      widget: state.workspaces[0].widgets.find((w) => w.id === id),
      workspace: state.workspaces[0],
      state,
      ops,
      configure: () => {},
      confirmRemove: () => {},
    })
      .filter((m) => !m.hidden)
      .map((m) => m.label)

  it('offers duplicate only where several are allowed, and move only where the target has room', () => {
    expect(labels('n')).toEqual(
      expect.arrayContaining(['Duplicate', 'Move to Fitness', 'Hide for now', 'Remove widget', 'Settings and title']),
    )
    expect(labels('s')).not.toContain('Duplicate')
    expect(labels('s')).not.toContain('Move to Fitness') // Fitness already has a Life Score
  })
  it('lists only the sizes the widget supports', () => {
    expect(labels('n').filter((l) => l.startsWith('Size:'))).toEqual(['Size: Small ✓', 'Size: Medium', 'Size: Large'])
  })
})

describe('TemplatesDialog', () => {
  it('previews built-in templates, applies one after confirming, and saves the current layout', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onSave = vi.fn()
    const workspace = { id: 'w', name: 'Main', widgets: [], layouts: { lg: [], md: [], sm: [] } }
    wrap(
      <TemplatesDialog
        open
        onOpenChange={() => {}}
        workspace={workspace}
        templates={[]}
        onApply={onApply}
        onNew={() => {}}
        onSave={onSave}
        onDelete={() => {}}
      />,
    )
    for (const key of ['minimal', 'productivity', 'career', 'fitness', 'finance'])
      expect(screen.getByTestId(`template-${key}`)).toBeInTheDocument()
    await user.click(within(screen.getByTestId('template-minimal')).getByRole('button', { name: 'Apply here' }))
    await user.click(await screen.findByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'minimal' }))
    await user.type(screen.getByPlaceholderText('Template name'), 'Mine')
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    expect(onSave).toHaveBeenCalledWith('Mine')
  })
})
