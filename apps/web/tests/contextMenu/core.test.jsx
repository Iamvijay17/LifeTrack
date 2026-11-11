import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { ConfirmProvider } from '@/components/shared/Confirm'
import { ContextMenuProvider, useContextMenu, usePageContextMenu, SelectionBar, useSelection } from '@/components/context-menu'
import { placeContextMenu, placeSubmenu } from '@/components/context-menu/placement'
import { SEPARATOR, flattenActions, matchesQuery, normalizeItems } from '@/components/context-menu/items'
import { copyText } from '@/components/context-menu/clipboard'

let locked = []
vi.mock('@/features/security/useModuleLocks', () => ({
  useModuleLocks: () => ({ isLocked: (m) => locked.includes(m), closed: locked, isUnlockedSession: true, unlock: () => {} }),
}))

const VIEW = { width: 1000, height: 700 }

describe('placement', () => {
  const size = { width: 200, height: 300 }
  it('opens with its corner at the pointer when there is room', () => {
    expect(placeContextMenu({ point: { x: 100, y: 120 }, size, viewport: VIEW })).toMatchObject({
      left: 100,
      top: 120,
      flipX: false,
      flipY: false,
    })
  })
  it('flips to the left of the pointer near the right edge', () => {
    const p = placeContextMenu({ point: { x: 950, y: 100 }, size, viewport: VIEW })
    expect(p).toMatchObject({ left: 750, flipX: true })
    expect(p.left + size.width).toBeLessThanOrEqual(VIEW.width - 8)
  })
  it('opens upwards near the bottom edge', () => {
    const p = placeContextMenu({ point: { x: 100, y: 650 }, size, viewport: VIEW })
    expect(p).toMatchObject({ top: 350, flipY: true })
  })
  it('stays inside the viewport at the bottom-right corner', () => {
    const p = placeContextMenu({ point: { x: 998, y: 698 }, size, viewport: VIEW })
    expect(p.left).toBe(792)
    expect(p.top).toBe(392)
  })
  it('clamps at the top and left edges', () => {
    expect(placeContextMenu({ point: { x: 0, y: 0 }, size, viewport: VIEW })).toMatchObject({ left: 8, top: 8 })
    // opening upwards from near the top of a short screen would go off the top: it is clamped
    const p = placeContextMenu({ point: { x: 3, y: 120 }, size: { width: 200, height: 300 }, viewport: { width: 1000, height: 200 } })
    expect(p.top).toBeGreaterThanOrEqual(8)
  })
  it('caps a menu taller than the screen so it can scroll', () => {
    const p = placeContextMenu({ point: { x: 10, y: 10 }, size: { width: 200, height: 2000 }, viewport: VIEW })
    expect(p.maxHeight).toBe(684)
    expect(p.top).toBe(8)
  })
  it('puts a submenu to the right of its parent, or to the left when it would not fit', () => {
    const parent = { left: 100, right: 300 }
    expect(placeSubmenu({ parent, row: { top: 50 }, size: { width: 180, height: 120 }, viewport: VIEW })).toMatchObject({
      side: 'right',
      left: 296,
    })
    const edge = { left: 800, right: 990 }
    const left = placeSubmenu({ parent: edge, row: { top: 50 }, size: { width: 180, height: 120 }, viewport: VIEW })
    expect(left.side).toBe('left')
    expect(left.left).toBeLessThan(edge.left)
  })
  it('keeps a submenu on screen vertically', () => {
    const s = placeSubmenu({ parent: { left: 0, right: 200 }, row: { top: 690 }, size: { width: 150, height: 200 }, viewport: VIEW })
    expect(s.top + 200).toBeLessThanOrEqual(VIEW.height - 8)
  })
})

describe('item rules', () => {
  const a = { label: 'A' }
  const b = { label: 'B' }
  it('tidies separators and drops hidden items', () => {
    const out = normalizeItems([SEPARATOR, a, SEPARATOR, SEPARATOR, { label: 'gone', hidden: true }, SEPARATOR, b, SEPARATOR])
    expect(out.map((i) => i.label ?? '-')).toEqual(['A', '-', 'B'])
  })
  it('drops a group label with nothing under it', () => {
    expect(normalizeItems([{ type: 'label', label: 'Group' }, SEPARATOR, a]).map((i) => i.label ?? '-')).toEqual(['A'])
  })
  it('hides items of a locked module and greys out items without permission', () => {
    const out = normalizeItems(
      [{ label: 'Money', module: 'finance' }, { label: 'Edit', permission: false, disabledReason: 'Read only' }, a],
      {
        isLocked: (m) => m === 'finance',
      },
    )
    expect(out.map((i) => i.label)).toEqual(['Edit', 'A'])
    expect(out[0]).toMatchObject({ disabled: true })
  })
  it('does not offer an empty submenu, and leaves a lazy submenu unevaluated', () => {
    const lazy = vi.fn(() => [a])
    const out = normalizeItems([
      { label: 'Empty', items: [] },
      { label: 'Lazy', items: lazy },
    ])
    expect(out.map((i) => i.label)).toEqual(['Lazy'])
    expect(lazy).not.toHaveBeenCalled()
  })
  it('searches labels, keywords and parent names', () => {
    const flat = flattenActions([{ label: 'Priority', items: [{ label: 'High', keywords: ['urgent'] }] }, a])
    expect(flat.map((i) => i.label)).toEqual(['High', 'A'])
    expect(matchesQuery(flat[0], 'prio hi')).toBe(true)
    expect(matchesQuery(flat[0], 'urgent')).toBe(true)
    expect(matchesQuery(flat[0], 'zzz')).toBe(false)
  })
})

// ------------------------------------------------------------------ the provider
function Region({ items = [], children, ...rest }) {
  const menu = useContextMenu()
  return (
    <div data-testid="region" tabIndex={0} {...menu.bind(() => items, { label: 'Test menu' })} {...rest}>
      {children ?? 'Region'}
    </div>
  )
}
const mount = (ui) =>
  render(
    <ConfirmProvider>
      <ContextMenuProvider>{ui}</ContextMenuProvider>
      <Toaster />
    </ConfirmProvider>,
  )
const rightClick = (el = screen.getByTestId('region'), pos = { clientX: 100, clientY: 80 }) => fireEvent.contextMenu(el, pos)
const menuEl = () => screen.queryByRole('menu', { name: 'Test menu' })

beforeEach(() => {
  locked = []
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('opening and closing', () => {
  it('opens at the cursor and cancels the native menu', () => {
    mount(<Region items={[{ label: 'Edit', onSelect: vi.fn() }]} />)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 140, clientY: 90 })
    act(() => {
      screen.getByTestId('region').dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    const menu = menuEl()
    expect(menu).toBeInTheDocument()
    expect(menu.parentElement).toBe(document.body) // in a portal: no scroll container can clip it
    expect(menu.style.left).toBe('140px')
    expect(menu.style.top).toBe('90px')
  })

  it('keeps the menu inside the viewport near every edge', () => {
    const sizes = { offsetWidth: 200, scrollHeight: 150 }
    const spies = Object.entries(sizes).map(([k, v]) => vi.spyOn(HTMLElement.prototype, k, 'get').mockReturnValue(v))
    const [w, h] = [window.innerWidth, window.innerHeight]
    window.innerWidth = 1000
    window.innerHeight = 700
    try {
      mount(<Region items={[{ label: 'Edit' }]} />)
      const at = (x, y) => {
        rightClick(screen.getByTestId('region'), { clientX: x, clientY: y })
        const m = menuEl()
        const box = { left: parseFloat(m.style.left), top: parseFloat(m.style.top) }
        fireEvent.keyDown(document, { key: 'Escape' })
        return box
      }
      expect(at(995, 20)).toMatchObject({ left: 792 }) // right
      expect(at(20, 695)).toMatchObject({ top: 542 }) // bottom
      expect(at(995, 695)).toEqual({ left: 792, top: 542 }) // corner
      const topLeft = at(1, 1)
      expect(topLeft.left).toBeGreaterThanOrEqual(8) // left and top
      expect(topLeft.top).toBeGreaterThanOrEqual(8)
    } finally {
      spies.forEach((s) => s.mockRestore())
      window.innerWidth = w
      window.innerHeight = h
    }
  })

  it('leaves the browser menu alone on inputs, links, selected text and where nothing is registered', () => {
    mount(
      <>
        <Region items={[{ label: 'Edit' }]}>
          <input aria-label="field" />
          <textarea aria-label="notes" />
          <a href="/x">link</a>
          <div contentEditable suppressContentEditableWarning data-testid="editable">
            x
          </div>
          <div data-native-menu>
            <span>chart</span>
          </div>
          <p data-testid="text">some words</p>
        </Region>
        <div data-testid="elsewhere">nothing here</div>
      </>,
    )
    const native = (el) => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
      act(() => {
        el.dispatchEvent(ev)
      })
      return !ev.defaultPrevented
    }
    expect(native(screen.getByLabelText('field'))).toBe(true)
    expect(native(screen.getByLabelText('notes'))).toBe(true)
    expect(native(screen.getByText('link'))).toBe(true)
    expect(native(screen.getByTestId('editable'))).toBe(true)
    expect(native(screen.getByText('chart'))).toBe(true)
    expect(native(screen.getByTestId('elsewhere'))).toBe(true)
    // selected text
    const range = document.createRange()
    range.selectNodeContents(screen.getByTestId('text'))
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    expect(native(screen.getByTestId('text'))).toBe(true)
    window.getSelection().removeAllRanges()
    expect(native(screen.getByTestId('text'))).toBe(false) // and a plain right-click on the same text is ours
    expect(menuEl()).toBeInTheDocument()
  })

  it('lets Shift+right-click through to the browser, and offers nothing for an empty menu', () => {
    mount(<Region items={[{ label: 'Edit' }]} />)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, shiftKey: true })
    act(() => {
      screen.getByTestId('region').dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(menuEl()).toBeNull()
    cleanup()
    mount(<Region items={[]} />)
    rightClick()
    expect(menuEl()).toBeNull()
  })

  it('closes on Escape and gives focus back', async () => {
    mount(<Region items={[{ label: 'Edit' }]} />)
    screen.getByTestId('region').focus()
    rightClick()
    expect(menuEl()).toBeInTheDocument()
    fireEvent.keyDown(menuEl(), { key: 'Escape' })
    expect(menuEl()).toBeNull()
    expect(screen.getByTestId('region')).toHaveFocus()
  })

  it('closes on an outside press and on scroll, but not when the menu itself scrolls', () => {
    mount(
      <>
        <Region items={[{ label: 'Edit' }]} />
        <button>outside</button>
      </>,
    )
    rightClick()
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(menuEl()).toBeNull()
    rightClick()
    fireEvent.scroll(menuEl())
    expect(menuEl()).toBeInTheDocument()
    fireEvent.scroll(document)
    expect(menuEl()).toBeNull()
  })

  it('closes after an action is chosen and runs it', async () => {
    const onSelect = vi.fn()
    mount(<Region items={[{ label: 'Edit', onSelect }]} />)
    rightClick()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(menuEl()).toBeNull()
  })

  it('replaces the menu on a second right-click', () => {
    mount(<Region items={[{ label: 'Edit' }]} />)
    rightClick()
    rightClick(screen.getByTestId('region'), { clientX: 300, clientY: 200 })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(menuEl().style.left).toBe('300px')
  })

  it('does not react to a right-click that came from inside a dialog portalled out of the region', () => {
    mount(<Region items={[{ label: 'Edit' }]} />)
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })
    act(() => {
      outside.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(false)
    outside.remove()
  })

  it('an inner region takes the event and the outer one stays closed', () => {
    mount(
      <Region items={[{ label: 'Page action' }]}>
        <InnerCard />
      </Region>,
    )
    rightClick(screen.getByTestId('inner'))
    expect(screen.getByRole('menuitem', { name: 'Card action' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Page action' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    rightClick(screen.getByTestId('region'))
    expect(screen.getByRole('menuitem', { name: 'Page action' })).toBeInTheDocument()
  })

  it('falls through to the outer region when the inner one has nothing to offer', () => {
    mount(
      <Region items={[{ label: 'Page action' }]}>
        <Region data-testid="inner" items={[{ label: 'Hidden', hidden: true }]} />
      </Region>,
    )
    rightClick(screen.getAllByTestId('region')[1])
    expect(screen.getByRole('menuitem', { name: 'Page action' })).toBeInTheDocument()
  })
})
function InnerCard() {
  const menu = useContextMenu()
  return (
    <div data-testid="inner" {...menu.bind(() => [{ label: 'Card action' }], { label: 'Test menu' })}>
      Card
    </div>
  )
}

describe('page-level menu', () => {
  function Page() {
    usePageContextMenu(() => [{ label: 'Refresh' }])
    return <div data-testid="page">page</div>
  }
  function Shell() {
    const menu = useContextMenu()
    return (
      <main data-testid="main" {...menu.pageProps({ label: 'Test menu' })}>
        <Page />
      </main>
    )
  }
  it('opens the registered page menu from empty space and forgets it when the page unmounts', () => {
    const { rerender } = mount(<Shell />)
    rightClick(screen.getByTestId('page'))
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    rerender(
      <ConfirmProvider>
        <ContextMenuProvider>
          <main data-testid="main" />
        </ContextMenuProvider>
      </ConfirmProvider>,
    )
    expect(menuEl()).toBeNull()
  })
})

describe('keyboard', () => {
  const items = [
    { label: 'One', onSelect: vi.fn() },
    { label: 'Two (off)', disabled: true },
    { label: 'Three', onSelect: vi.fn() },
    {
      label: 'More',
      items: () => [
        { label: 'Sub A', onSelect: vi.fn() },
        { label: 'Sub B', onSelect: vi.fn() },
      ],
    },
  ]
  it('moves with the arrows (wrapping, skipping disabled rows), Home and End', async () => {
    const user = userEvent.setup()
    mount(<Region items={items} />)
    rightClick()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus() // wrapped
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'More' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'More' })).toHaveFocus()
  })

  it('activates with Enter', async () => {
    const user = userEvent.setup()
    items[0].onSelect.mockClear()
    mount(<Region items={items} />)
    rightClick()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(items[0].onSelect).toHaveBeenCalled()
    expect(menuEl()).toBeNull()
  })

  it('jumps to a row by its first letter', async () => {
    const user = userEvent.setup()
    mount(<Region items={items} />)
    rightClick()
    await user.keyboard('m')
    expect(screen.getByRole('menuitem', { name: 'More' })).toHaveFocus()
  })

  it('opens a submenu with ArrowRight, closes it with ArrowLeft or Escape, and builds it only then', async () => {
    const user = userEvent.setup()
    const lazy = vi.fn(() => [{ label: 'Sub A' }, { label: 'Sub B' }])
    mount(<Region items={[{ label: 'First' }, { label: 'More', items: lazy }]} />)
    rightClick()
    expect(lazy).not.toHaveBeenCalled()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'More' })).toHaveAttribute('aria-haspopup', 'menu')
    await user.keyboard('{ArrowRight}')
    expect(lazy).toHaveBeenCalled()
    const sub = screen.getByRole('menu', { name: 'More' })
    expect(within(sub).getByRole('menuitem', { name: 'Sub A' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(within(sub).getByRole('menuitem', { name: 'Sub B' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'More' })).toHaveFocus()
    await user.keyboard('{ArrowRight}{Escape}') // Escape closes only the submenu
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull()
    expect(menuEl()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(menuEl()).toBeNull()
  })

  it('runs a submenu action and closes the whole menu', async () => {
    const onSelect = vi.fn()
    mount(<Region items={[{ label: 'More', items: [{ label: 'Sub A', onSelect }] }]} />)
    rightClick()
    await userEvent.click(screen.getByRole('menuitem', { name: 'More' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sub A' }))
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens a submenu on hover', async () => {
    const user = userEvent.setup()
    mount(<Region items={[{ label: 'More', items: [{ label: 'Sub A' }] }]} />)
    rightClick()
    await user.hover(screen.getByRole('menuitem', { name: 'More' }))
    expect(await screen.findByRole('menuitem', { name: 'Sub A' })).toBeInTheDocument()
  })

  it('exposes menu, menuitem, separator, checkbox and busy roles', () => {
    mount(
      <Region
        items={[
          { label: 'Edit', icon: Pencil, shortcut: 'E' },
          SEPARATOR,
          { label: 'Pinned', checked: true },
          { label: 'Delete', icon: Trash2, danger: true },
        ]}
      />,
    )
    rightClick()
    expect(menuEl()).toHaveAttribute('aria-orientation', 'vertical')
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('E')).toBeInTheDocument() // right-aligned shortcut label
  })
})

describe('search', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ label: `Action ${i + 1}`, onSelect: vi.fn() }))
  it('appears on long menus, filters across submenus and runs the first match on Enter', async () => {
    const user = userEvent.setup()
    const deep = vi.fn()
    mount(<Region items={[...many, { label: 'Priority', items: [{ label: 'Urgent', keywords: ['asap'], onSelect: deep }] }]} />)
    rightClick()
    const box = screen.getByRole('searchbox', { name: 'Search actions' })
    await user.keyboard('x') // typing anywhere goes to the box
    expect(box).toHaveFocus()
    await user.clear(box)
    await user.type(box, 'asap')
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(deep).toHaveBeenCalled()
  })
  it('says so when nothing matches, and is absent on short menus', async () => {
    const user = userEvent.setup()
    mount(<Region items={many} />)
    rightClick()
    await user.type(screen.getByRole('searchbox'), 'zzzz')
    expect(screen.getByText('No matching actions')).toBeInTheDocument()
    cleanup()
    mount(<Region items={[{ label: 'One' }]} />)
    rightClick()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})

describe('confirm, undo, loading, permissions', () => {
  it('asks before a destructive action and does nothing when cancelled', async () => {
    const onSelect = vi.fn()
    mount(<Region items={[{ label: 'Delete', danger: true, confirm: { title: 'Delete this task?', confirmLabel: 'Delete' }, onSelect }]} />)
    rightClick()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(menuEl()).toBeNull()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('Delete this task?').length).toBeGreaterThan(0)
    expect(onSelect).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('runs the action once confirmed', async () => {
    const onSelect = vi.fn()
    mount(
      <Region
        items={[
          {
            label: 'Delete',
            danger: true,
            confirm: { title: 'Delete this task?', confirmLabel: 'Delete it' },
            onSelect,
            success: 'Task deleted',
          },
        ]}
      />,
    )
    rightClick()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Task deleted')).toBeInTheDocument()
  })

  it('offers Undo in a toast and undoes the change', async () => {
    const undo = vi.fn()
    mount(<Region items={[{ label: 'Complete', onSelect: () => ({ message: 'Marked done', undo }) }]} />)
    rightClick()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Complete' }))
    expect(await screen.findByText('Marked done')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Undone')).toBeInTheDocument()
  })

  it('shows a spinner and holds the menu while an async action runs, then closes', async () => {
    let finish
    const onSelect = vi.fn(() => new Promise((r) => (finish = r)))
    mount(
      <Region
        items={[
          { label: 'Sync', onSelect },
          { label: 'Other', onSelect: vi.fn() },
        ]}
      />,
    )
    rightClick()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }))
    expect(screen.getByRole('menuitem', { name: 'Sync' })).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Other' })) // ignored while busy
    expect(onSelect).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    await waitFor(() => expect(menuEl()).toBeNull())
  })

  it('reports a failing action instead of swallowing it', async () => {
    mount(<Region items={[{ label: 'Boom', onSelect: () => Promise.reject(new Error('Server said no')) }]} />)
    rightClick()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Boom' }))
    expect(await screen.findByText(/Server said no/)).toBeInTheDocument()
  })

  it('does not run a disabled or permission-denied item', async () => {
    const onSelect = vi.fn()
    mount(<Region items={[{ label: 'Edit', permission: false, disabledReason: 'Read only', onSelect }]} />)
    rightClick()
    const row = screen.getByRole('menuitem', { name: 'Edit' })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveAttribute('title', 'Read only')
    await userEvent.click(row)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('offers nothing for a locked module', () => {
    locked = ['finance']
    mount(<Region items={[{ label: 'Add transaction', module: 'finance' }, { label: 'Refresh' }]} />)
    rightClick()
    expect(screen.queryByRole('menuitem', { name: 'Add transaction' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    cleanup()
    mount(<Region items={[{ label: 'Add transaction', module: 'finance' }]} />)
    rightClick() // only locked items: no menu at all, and the browser's menu is untouched
    expect(menuEl()).toBeNull()
  })
})

describe('long-press on touch', () => {
  const touch = (type, extra = {}) => ({ pointerType: 'touch', isPrimary: true, clientX: 120, clientY: 160, ...extra, type })
  beforeEach(() => vi.useFakeTimers())
  it('opens after holding, at the finger, and not before', () => {
    mount(<Region items={[{ label: 'Edit' }]} />)
    fireEvent.pointerDown(screen.getByTestId('region'), touch('pointerdown'))
    act(() => vi.advanceTimersByTime(300))
    expect(menuEl()).toBeNull()
    act(() => vi.advanceTimersByTime(300))
    expect(menuEl()).toBeInTheDocument()
    expect(menuEl().style.left).toBe('120px')
  })
  it('does not open when the finger lifts, moves (a scroll) or the press is cancelled', () => {
    mount(<Region items={[{ label: 'Edit' }]} />)
    const el = screen.getByTestId('region')
    fireEvent.pointerDown(el, touch('pointerdown'))
    fireEvent.pointerUp(el, touch('pointerup'))
    act(() => vi.advanceTimersByTime(900))
    expect(menuEl()).toBeNull()
    fireEvent.pointerDown(el, touch('pointerdown'))
    fireEvent.pointerMove(el, { pointerType: 'touch', clientX: 120, clientY: 220 })
    act(() => vi.advanceTimersByTime(900))
    expect(menuEl()).toBeNull()
    fireEvent.pointerDown(el, touch('pointerdown'))
    fireEvent.pointerCancel(el, touch('pointercancel'))
    act(() => vi.advanceTimersByTime(900))
    expect(menuEl()).toBeNull()
  })
  it('ignores a mouse pointer and a press on an input', () => {
    mount(
      <Region items={[{ label: 'Edit' }]}>
        <input aria-label="field" />
      </Region>,
    )
    fireEvent.pointerDown(screen.getByTestId('region'), { pointerType: 'mouse', isPrimary: true, clientX: 5, clientY: 5 })
    fireEvent.pointerDown(screen.getByLabelText('field'), touch('pointerdown'))
    act(() => vi.advanceTimersByTime(900))
    expect(menuEl()).toBeNull()
  })
  it('swallows the tap that follows the long-press so the card underneath is not activated', () => {
    const onClick = vi.fn()
    mount(
      <Region items={[{ label: 'Edit' }]} onClick={onClick}>
        card
      </Region>,
    )
    fireEvent.pointerDown(screen.getByTestId('region'), touch('pointerdown'))
    act(() => vi.advanceTimersByTime(600))
    fireEvent.click(screen.getByTestId('region'))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('multi-select', () => {
  function List() {
    const sel = useSelection(['a', 'b', 'c'])
    const menu = useContextMenu()
    const bulk = () => [{ label: `Delete ${sel.size}` }]
    return (
      <>
        {['a', 'b', 'c'].map((id) => (
          <div
            key={id}
            data-testid={id}
            {...sel.itemProps(id)}
            {...menu.bind(() => (sel.targets(id).length > 1 ? bulk() : [{ label: `Edit ${id}`, onSelect: () => sel.add(id) }]), {
              label: 'Test menu',
            })}
          >
            {id}
          </div>
        ))}
        <SelectionBar selection={sel} noun="task" build={bulk} />
      </>
    )
  }
  it('selects with ctrl-click, offers bulk actions on a selected row, and clears with Escape', async () => {
    const user = userEvent.setup()
    mount(<List />)
    await user.keyboard('{Control>}')
    await user.click(screen.getByTestId('a'))
    await user.click(screen.getByTestId('b'))
    await user.keyboard('{/Control}')
    expect(screen.getByTestId('a')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByText('2 tasks selected')).toBeInTheDocument()
    rightClick(screen.getByTestId('b'))
    expect(screen.getByRole('menuitem', { name: 'Delete 2' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await user.keyboard('{Escape}')
    expect(screen.queryByText('2 tasks selected')).toBeNull()
  })
  it('acts on one row and drops the old selection when the row is outside it', async () => {
    const user = userEvent.setup()
    mount(<List />)
    await user.keyboard('{Control>}')
    await user.click(screen.getByTestId('a'))
    await user.keyboard('{/Control}')
    rightClick(screen.getByTestId('c'))
    expect(screen.getByRole('menuitem', { name: 'Edit c' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('a')).not.toHaveAttribute('data-selected'))
  })
  it('"Select" from the menu adds the row, and the Actions button opens the bulk menu', async () => {
    const user = userEvent.setup()
    mount(<List />)
    rightClick(screen.getByTestId('a'))
    await user.click(screen.getByRole('menuitem', { name: 'Edit a' }))
    expect(await screen.findByText('1 task selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.getByRole('menu', { name: 'Actions for 1 tasks' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText('1 task selected')).toBeNull()
  })
})

describe('copyText', () => {
  it('writes to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Toaster />)
    expect(await copyText('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument()
  })
  it('falls back to the legacy copy and reports a failure', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    document.execCommand = vi.fn(() => false)
    render(<Toaster />)
    expect(await copyText('x')).toBe(false)
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument()
  })
})
