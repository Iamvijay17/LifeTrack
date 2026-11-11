import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useInRouterContext, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { useConfirm } from '@/components/shared/Confirm'
import { useModuleLocks } from '@/features/security/useModuleLocks'
import { toAppError } from '@/services/errors'
import { ContextMenu } from './ContextMenu'
import { normalizeItems } from './items'

const LONG_PRESS_MS = 520
const MOVE_TOLERANCE = 10
const UNDO_MS = 8000

// What a page keeps its own behaviour for: typing, links, charts and anything that opted out with data-native-menu.
const NATIVE =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], a[href], [data-native-menu], .recharts-wrapper'

/** Whether the browser's own menu should be left alone for this target: editable fields, links, charts, or selected text under the pointer. */
export function wantsNativeMenu(target, point) {
  if (!(target instanceof Element)) return false
  if (target.closest(NATIVE)) return true
  const sel = typeof window !== 'undefined' ? window.getSelection?.() : null
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return false
  try {
    const range = sel.getRangeAt(0)
    if (!range.intersectsNode(target)) return false
    // Right-clicking the highlighted words wants Copy / Look up. Right-clicking elsewhere on the same card is ours.
    const rects = range.getClientRects?.()
    if (point && rects && rects.length)
      return [...rects].some((r) => point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom)
    return !target.hasAttribute('data-ctx')
  } catch {
    return false
  }
}

const NOOP = {
  open: () => false,
  close: () => {},
  bind: () => ({}),
  registerPage: () => () => {},
  pageProps: () => ({}),
}
const Ctx = createContext(NOOP)

/** `const menu = useContextMenu()` then `<div {...menu.bind(() => items)} />`. Outside a provider it does nothing, so a component renders anywhere. */
export const useContextMenu = () => useContext(Ctx)

/**
 * Registers the empty-area menu of the page that is on screen. The shell lets a right-click on the page's background open it;
 * a card with its own menu takes precedence. `build` runs only when the menu opens, so it can read the latest state for free.
 */
export function usePageContextMenu(build) {
  const { registerPage } = useContextMenu()
  const ref = useRef(build)
  ref.current = build
  useEffect(() => registerPage(() => ref.current()), [registerPage])
}

const isThenable = (v) => v && typeof v.then === 'function'

function CloseOnNavigate({ onClose }) {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else onClose('navigate')
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function ContextMenuProvider({ children }) {
  const confirm = useConfirm()
  const moduleLocks = useModuleLocks()
  const inRouter = useInRouterContext()
  const [menu, setMenu] = useState(null) // { point, items, label, id, keyboard }
  const [pendingItem, setPendingItem] = useState(null)
  const returnFocus = useRef(null)
  const pageBuilder = useRef(null)
  const press = useRef(null) // the one touch that is being held
  const menuRef = useRef(null)
  const pending = useRef(false)

  // The lock rule the items are filtered by. Locked modules offer nothing through the menu, whatever a page puts in it.
  const locks = useMemo(() => ({ isLocked: moduleLocks.isLocked }), [moduleLocks])

  const close = useCallback((reason = 'dismiss') => {
    if (!menuRef.current) return
    const back = returnFocus.current
    returnFocus.current = null
    menuRef.current = null
    setMenu(null)
    // Focus goes back to where it was, unless the person clicked or scrolled elsewhere on purpose.
    if (back?.isConnected && (reason === 'escape' || reason === 'select' || reason === 'tab')) back.focus({ preventScroll: true })
  }, [])

  const open = useCallback(
    ({ x, y, items, label, keyboard = false }) => {
      const list = normalizeItems(items, locks)
      if (!list.length) return false
      const active = document.activeElement
      returnFocus.current = active && active !== document.body ? active : null
      const next = { point: { x, y }, items: list, label, id: `${Date.now()}-${Math.random()}`, keyboard }
      menuRef.current = next
      setMenu(next)
      return true
    },
    [locks],
  )

  const announce = useCallback((result, item) => {
    const obj = result && typeof result === 'object' ? result : null
    const message = obj?.message ?? item.success
    if (typeof obj?.undo === 'function') {
      toast(message ?? `${item.label} done`, {
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await obj.undo()
              toast.success('Undone')
            } catch (e) {
              toast.error(`Could not undo: ${toAppError(e).message}`)
            }
          },
        },
      })
    } else if (message) toast.success(message)
  }, [])

  const run = useCallback(
    async (item) => {
      if (pending.current || item.disabled) return
      if (item.confirm) {
        close('select')
        const c = item.confirm
        const ok = await confirm({
          title: c.title ?? `${item.label}?`,
          description: c.description,
          confirmLabel: c.confirmLabel ?? item.label,
          destructive: c.destructive ?? true,
        })
        if (!ok) return
        try {
          announce(await item.onSelect?.(), item)
        } catch (e) {
          toast.error(toAppError(e).message)
        }
        return
      }
      pending.current = true
      try {
        const out = item.onSelect?.()
        if (isThenable(out)) {
          setPendingItem(item) // the row shows a spinner and the menu stays until the work is done
          const result = await out
          close('select')
          announce(result, item)
        } else {
          close('select')
          announce(out, item)
        }
      } catch (e) {
        close('select')
        toast.error(toAppError(e).message)
      } finally {
        pending.current = false
        setPendingItem(null)
      }
    },
    [announce, close, confirm],
  )

  // While a menu is open: Escape, a press outside, scrolling, resizing or leaving the window all dismiss it.
  const isOpen = !!menu
  useEffect(() => {
    if (!isOpen) return undefined
    const inMenu = (t) => t instanceof Element && !!t.closest('[data-ctx-menu]')
    const key = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      close('escape')
    }
    const down = (e) => {
      if (!inMenu(e.target)) close('outside')
    }
    const scroll = (e) => {
      if (!inMenu(e.target)) close('scroll')
    }
    const away = () => close('blur')
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('scroll', scroll, true)
    document.addEventListener('wheel', scroll, { capture: true, passive: true })
    window.addEventListener('resize', away)
    window.addEventListener('blur', away)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('scroll', scroll, true)
      document.removeEventListener('wheel', scroll, true)
      window.removeEventListener('resize', away)
      window.removeEventListener('blur', away)
    }
  }, [isOpen, close])

  const registerPage = useCallback((fn) => {
    pageBuilder.current = fn
    return () => {
      if (pageBuilder.current === fn) pageBuilder.current = null
    }
  }, [])

  // The props a region spreads onto its element: the right-click handler, and the long-press handlers for touch.
  const bind = useCallback(
    (build, { label, enabled = true, longPress = true } = {}) => {
      if (!enabled) return {}
      const itemsFor = (e, point) => {
        try {
          return normalizeItems(build({ target: e.target, point }), locks)
        } catch {
          return []
        }
      }
      // React events also bubble out of portals (a dialog rendered inside a card): only this element's own DOM counts.
      const mine = (e) => e.currentTarget.contains(e.target)
      const cancelPress = () => {
        if (press.current) clearTimeout(press.current.timer)
        press.current = null
      }
      return {
        'data-ctx': '',
        onContextMenu(e) {
          // A page with its own touch gesture (the calendar's press-and-drag) turns long-press off; Android's long-press contextmenu goes with it.
          if (!longPress && e.nativeEvent.pointerType === 'touch') return
          if (e.shiftKey || e.nativeEvent.__ltCtx || !mine(e) || wantsNativeMenu(e.target, { x: e.clientX, y: e.clientY })) return // Shift+right-click is the way to the browser's own menu
          let x = e.clientX
          let y = e.clientY
          const fromKeyboard = x === 0 && y === 0 && e.nativeEvent.button === 0
          if (fromKeyboard) {
            const r = e.target.getBoundingClientRect()
            x = r.left + Math.min(24, r.width / 2)
            y = r.top + Math.min(24, r.height / 2)
          }
          const items = itemsFor(e, { x, y })
          if (!items.length) return // nothing to offer here: the next region up (or the browser) gets the event
          e.nativeEvent.__ltCtx = true
          e.preventDefault()
          cancelPress()
          open({ x, y, items, label, keyboard: fromKeyboard })
        },
        onPointerDown(e) {
          if (
            e.pointerType === 'mouse' ||
            !e.isPrimary ||
            e.nativeEvent.__ltPress ||
            !mine(e) ||
            wantsNativeMenu(e.target, { x: e.clientX, y: e.clientY })
          )
            return
          const { clientX: x, clientY: y } = e
          const items = itemsFor(e, { x, y })
          if (!items.length) return
          e.nativeEvent.__ltPress = true
          cancelPress()
          press.current = {
            x,
            y,
            timer: setTimeout(() => {
              press.current = null
              if (!open({ x, y, items, label })) return
              // The finger is still down: the click it makes on lifting is not a tap on whatever lies under the menu.
              const stopSwallowing = () => window.removeEventListener('click', swallow, true)
              const swallow = (ev) => {
                ev.stopPropagation()
                ev.preventDefault()
                stopSwallowing() // one tap, once
              }
              window.addEventListener('click', swallow, true)
              setTimeout(stopSwallowing, 600)
              navigator.vibrate?.(8)
            }, LONG_PRESS_MS),
          }
        },
        onPointerMove(e) {
          const p = press.current
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancelPress()
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
      }
    },
    [open, locks],
  )

  const pageProps = useCallback((extra) => bind(() => pageBuilder.current?.() ?? [], extra), [bind])
  const api = useMemo(() => ({ open, close, bind, registerPage, pageProps }), [open, close, bind, registerPage, pageProps])

  return (
    <Ctx.Provider value={api}>
      {children}
      {inRouter && <CloseOnNavigate onClose={close} />}
      {menu && (
        <ContextMenu
          key={menu.id}
          point={menu.point}
          items={menu.items}
          label={menu.label}
          locks={locks}
          pendingItem={pendingItem}
          keyboard={menu.keyboard}
          onRun={run}
          onClose={close}
        />
      )}
    </Ctx.Provider>
  )
}
