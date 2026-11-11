import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { POPUP_ATTR } from '@/components/ui/popup'
import { placeContextMenu, placeSubmenu } from './placement'
import { countActions, flattenActions, hasSubmenu, isLabel, isSeparator, matchesQuery, resolveSubmenu, SEARCH_THRESHOLD } from './items'

const SUBMENU_DELAY = 140

// ---------------------------------------------------------------- small parts

/** The right-aligned keyboard hint of a row: "⌘⌫", "Del". */
export function Shortcut({ children, className }) {
  if (!children) return null
  return (
    <kbd aria-hidden className={cn('ml-auto shrink-0 pl-6 font-sans text-[11px] tracking-wide text-muted-foreground', className)}>
      {children}
    </kbd>
  )
}

export function MenuSeparator() {
  return <div role="separator" aria-orientation="horizontal" className="mx-1 my-1.5 h-px bg-border/80" />
}

export function MenuLabel({ children }) {
  return (
    <div role="presentation" className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </div>
  )
}

/** One action row. A real <button>, so Enter and Space activate it everywhere (assistive tech included). */
export function MenuItem({ item, index, busy, expanded, onActivate, onHover, trail }) {
  const submenu = hasSubmenu(item)
  const Icon = item.icon
  const toggles = item.checked !== undefined
  return (
    <button
      type="button"
      data-menu-row=""
      data-index={index}
      role={toggles ? (item.radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem'}
      aria-checked={toggles ? !!item.checked : undefined}
      aria-haspopup={submenu ? 'menu' : undefined}
      aria-expanded={submenu ? !!expanded : undefined}
      aria-disabled={item.disabled || undefined}
      aria-busy={busy || undefined}
      title={item.disabled ? item.disabledReason : undefined}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation()
        if (!item.disabled) onActivate(item, e.currentTarget)
      }}
      onPointerEnter={(e) => onHover?.(item, e.currentTarget)}
      className={cn(
        'flex w-full items-center gap-2.5 whitespace-nowrap rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors duration-100',
        '[@media(pointer:coarse)]:py-2.5',
        item.danger
          ? 'text-danger focus:bg-danger/10 data-[open=true]:bg-danger/10'
          : 'text-foreground focus:bg-primary/[0.13] data-[open=true]:bg-primary/[0.13]',
        item.disabled && 'cursor-not-allowed opacity-45',
      )}
      data-open={expanded ? 'true' : undefined}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground" aria-hidden>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : Icon ? (
          <Icon className={cn('h-3.5 w-3.5', item.danger && 'text-danger')} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {trail?.length > 0 && <span className="text-muted-foreground">{trail.join(' › ')} › </span>}
        {item.label}
      </span>
      {toggles && item.checked && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
      {submenu ? (
        <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <Shortcut>{item.shortcut}</Shortcut>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------- panel

const rowsOf = (panel) =>
  [...panel.querySelectorAll('[data-menu-row]:not([aria-disabled="true"])')].filter((r) => r.closest('[data-ctx-menu]') === panel)

/**
 * One menu level, drawn in a portal. The root is placed at the pointer; a submenu beside the row that opened it. It measures itself
 * once it is on screen and keeps itself inside the viewport, so nothing here needs to know the screen size up front.
 */
function MenuPanel({ items, label, depth, placement, locks, pendingItem, onRun, onCloseSelf, onCloseAll, focusFirst, search }) {
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [open, setOpen] = useState(null) // { index, keyboard }
  const [query, setQuery] = useState('')
  const hoverTimer = useRef(null)
  const searchable = search ?? (depth === 0 && countActions(items) >= SEARCH_THRESHOLD)
  const q = query.trim()
  const shown = useMemo(() => (q ? flattenActions(items, locks).filter((i) => matchesQuery(i, q)) : items), [items, q, locks])

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const size = { width: el.offsetWidth, height: el.scrollHeight }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    if (placement.type === 'point') setPos(placeContextMenu({ point: placement.point, size, viewport }))
    else setPos(placeSubmenu({ parent: placement.parent, row: placement.row, size, viewport }))
    // Placed once per open (and again when the search changes the list's height); `placement` is fixed for a mounted panel.
  }, [shown.length, placement])

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    if (focusFirst) rowsOf(el)[0]?.focus({ preventScroll: true })
    else if (depth === 0) el.focus({ preventScroll: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  const moveFocus = (to) => {
    const rows = rowsOf(panelRef.current)
    if (!rows.length) return
    const at = rows.indexOf(document.activeElement)
    const next = {
      first: 0,
      last: rows.length - 1,
      down: at < 0 ? 0 : (at + 1) % rows.length,
      up: at < 0 ? rows.length - 1 : (at - 1 + rows.length) % rows.length,
    }[to]
    rows[next]?.focus({ preventScroll: false })
  }

  const openSub = (index, keyboard) => {
    clearTimeout(hoverTimer.current)
    setOpen({ index, keyboard })
  }
  const activate = (item) => {
    if (hasSubmenu(item)) openSub(shown.indexOf(item), false)
    else onRun(item)
  }
  const hover = (item, rowEl) => {
    if (item.disabled) return
    rowEl.focus({ preventScroll: true })
    clearTimeout(hoverTimer.current)
    const index = shown.indexOf(item)
    if (hasSubmenu(item)) hoverTimer.current = setTimeout(() => openSub(index, false), SUBMENU_DELAY)
    else if (open) hoverTimer.current = setTimeout(() => setOpen(null), SUBMENU_DELAY)
  }

  const onKeyDown = (e) => {
    if (!panelRef.current.contains(e.target)) return // a submenu's key presses bubble through React's tree, not the DOM
    const inSearch = e.target === searchRef.current
    const stop = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    switch (e.key) {
      case 'ArrowDown':
        stop()
        return moveFocus('down')
      case 'ArrowUp':
        stop()
        return moveFocus('up')
      case 'Home':
        if (inSearch) return
        stop()
        return moveFocus('first')
      case 'End':
        if (inSearch) return
        stop()
        return moveFocus('last')
      case 'ArrowRight': {
        if (inSearch) return
        const index = Number(document.activeElement?.dataset?.index ?? -1)
        if (index >= 0 && hasSubmenu(shown[index]) && !shown[index].disabled) {
          stop()
          openSub(index, true)
        }
        return
      }
      case 'ArrowLeft':
        if (inSearch || depth === 0) return
        stop()
        return onCloseSelf()
      case 'Escape':
        if (depth > 0) {
          stop()
          onCloseSelf()
        }
        return // the root's Escape is the provider's: it closes the whole menu and restores focus
      case 'Tab':
        stop()
        return onCloseAll('tab')
      case 'Enter':
        if (inSearch) {
          stop()
          const first = rowsOf(panelRef.current)[0]
          first?.click()
        }
        return
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !inSearch) {
          if (searchable) {
            searchRef.current?.focus()
            return // the character lands in the box
          }
          // Type-ahead: jump to the next row that starts with that letter.
          const rows = rowsOf(panelRef.current)
          const at = rows.indexOf(document.activeElement)
          const ordered = [...rows.slice(at + 1), ...rows.slice(0, at + 1)]
          const hit = ordered.find((r) => r.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()))
          if (hit) {
            stop()
            hit.focus()
          }
        }
    }
  }

  const style = pos
    ? {
        left: pos.left,
        top: pos.top,
        maxHeight: pos.maxHeight,
        transformOrigin: `${pos.flipY ? 'bottom' : 'top'} ${pos.flipX || pos.side === 'left' ? 'right' : 'left'}`,
      }
    : { left: 0, top: 0, opacity: 0, pointerEvents: 'none' }

  return createPortal(
    <div
      ref={panelRef}
      {...{ [POPUP_ATTR]: '' }}
      data-ctx-menu=""
      data-depth={depth}
      role="menu"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={-1}
      style={style}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'lt-ctx fixed z-[70] min-w-[12.5rem] max-w-[min(22rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-lg p-1.5 text-foreground outline-none',
        pos && 'animate-ctx-in',
      )}
    >
      {searchable && (
        <div className="mb-1 flex items-center gap-2 rounded-[8px] border border-border/70 bg-muted/60 px-2 py-1.5 [@media(pointer:coarse)]:py-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            type="text"
            role="searchbox"
            aria-label="Search actions"
            placeholder="Search actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}
      {shown.length === 0 && q && (
        <p role="status" className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">
          No matching actions
        </p>
      )}
      {shown.map((item, i) => {
        if (isSeparator(item)) return <MenuSeparator key={`s${i}`} />
        if (isLabel(item)) return <MenuLabel key={`l${i}`}>{item.label}</MenuLabel>
        const expanded = open?.index === i
        return (
          <Fragment key={item.id ?? `${i}-${item.label}`}>
            <MenuItem
              item={item}
              index={i}
              busy={pendingItem === item}
              expanded={expanded}
              onActivate={activate}
              onHover={hover}
              trail={q ? item.path : undefined}
            />
            {expanded && (
              <SubMenu
                item={item}
                parentEl={panelRef}
                index={i}
                keyboard={open.keyboard}
                locks={locks}
                pendingItem={pendingItem}
                onRun={onRun}
                onCloseAll={onCloseAll}
                onCloseSelf={() => {
                  setOpen(null)
                  panelRef.current?.querySelector(`[data-menu-row][data-index="${i}"]`)?.focus({ preventScroll: true })
                }}
              />
            )}
          </Fragment>
        )
      })}
    </div>,
    document.body,
  )
}

/** A submenu, built only when it opens: its items function runs now, not while the parent is drawn. */
function SubMenu({ item, parentEl, index, keyboard, locks, pendingItem, onRun, onCloseAll, onCloseSelf }) {
  const [placement] = useState(() => {
    const parentRect = parentEl.current.getBoundingClientRect()
    const row = parentEl.current.querySelector(`[data-menu-row][data-index="${index}"]`)?.getBoundingClientRect() ?? parentRect
    return { type: 'sub', parent: parentRect, row }
  })
  const items = useMemo(() => resolveSubmenu(item, locks), [item, locks])
  return (
    <MenuPanel
      items={items}
      label={item.label}
      depth={1}
      placement={placement}
      locks={locks}
      pendingItem={pendingItem}
      onRun={onRun}
      onCloseSelf={onCloseSelf}
      onCloseAll={onCloseAll}
      focusFirst={keyboard}
      search={false}
    />
  )
}

/**
 * The context menu itself: the root level plus whatever submenus are open. Controlled: the provider decides when it is shown
 * and what happens when an action is chosen. `point` is the viewport position of the pointer.
 */
export function ContextMenu({ point, items, label = 'Context menu', locks, pendingItem, keyboard = false, onRun, onClose }) {
  const placement = useMemo(() => ({ type: 'point', point }), [point])
  const close = useCallback((reason) => onClose(reason), [onClose])
  return (
    <MenuPanel
      items={items}
      label={label}
      depth={0}
      placement={placement}
      locks={locks}
      pendingItem={pendingItem}
      onRun={onRun}
      onCloseSelf={() => close('escape')}
      onCloseAll={close}
      focusFirst={keyboard}
    />
  )
}
