import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { updateOnboarding, useOnboarding } from '@/hooks/useOnboarding'
import { findTarget, placePopover, tourByKey, tourForRoute } from '@/lib/tours'

const Ctx = createContext({ start: () => {}, active: null })
export const useTour = () => useContext(Ctx)

// A module-level handle so places without the context (a toast action, a settings card) can start a tour too.
let starter = null
export const startTour = (key) => starter?.(key)

const POPOVER = { w: 340, h: 200 }

/** Everything the tour needs from the page: where the target is now. Re-measured on scroll, resize and layout changes. */
function useTargetRect(selectors, active) {
  const [rect, setRect] = useState(null)
  useLayoutEffect(() => {
    if (!active) return void setRect(null)
    let el = null
    let tries = 0
    let frame = 0
    const measure = () => {
      if (!el || !el.isConnected) el = findTarget(selectors)
      setRect(el ? el.getBoundingClientRect().toJSON() : null)
    }
    const settle = () => {
      measure()
      // The page may still be loading after a route change: look for the target for about a second and a half.
      if (!el && tries++ < 15) frame = window.setTimeout(settle, 100)
      else if (el) el.scrollIntoView?.({ block: 'center', behavior: 'instant' })
    }
    settle()
    const on = () => measure()
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => {
      clearTimeout(frame)
      window.removeEventListener('resize', on)
      window.removeEventListener('scroll', on, true)
    }
  }, [selectors, active])
  return rect
}

function TourLayer({ tour, index, onNext, onBack, onSkip }) {
  const step = tour.steps[index]
  const rect = useTargetRect(step.target, true)
  const next = useRef(null)
  useEffect(() => next.current?.focus({ preventScroll: true }), [index])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') (e.stopPropagation(), onSkip())
      else if (e.key === 'ArrowRight') onNext()
      else if (e.key === 'ArrowLeft') onBack()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onNext, onBack, onSkip])
  const view = { w: window.innerWidth, h: window.innerHeight }
  const pos = placePopover(rect, view, POPOVER)
  const last = index === tour.steps.length - 1
  const pad = 6
  return (
    <div className="fixed inset-0 z-[70]" data-testid="tour">
      {/* Spotlight: a box over the target whose enormous shadow dims the rest of the page. Clicks outside it are absorbed by this layer. */}
      <div className="absolute inset-0" onClick={onSkip} aria-hidden />
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary-solid transition-all duration-200"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)',
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/60" />
      )}
      <div
        role="dialog"
        aria-label={`${tour.label} tour, step ${index + 1} of ${tour.steps.length}`}
        className="absolute rounded-xl border border-border bg-card p-4 shadow-overlay"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {tour.label} · {index + 1} of {tour.steps.length}
        </p>
        <h2 className="mt-1 text-sm font-semibold tracking-tight">{step.title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{step.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip} className="mr-auto">
            Skip tour
          </Button>
          {index > 0 && (
            <Button variant="outline" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          <Button ref={next} size="sm" onClick={onNext}>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Runs the guided tours and offers each module's tour once, the first time it is opened. Mount inside the router and the signed-in shell. */
export function TourProvider({ children }) {
  const [run, setRun] = useState(null) // { key, index }
  const nav = useNavigate()
  const { pathname } = useLocation()
  const state = useOnboarding()
  const stateRef = useRef(state)
  stateRef.current = state

  const start = useCallback(
    (key) => {
      const tour = tourByKey(key)
      if (!tour) return
      setRun({ key, index: 0 })
      if (window.location.pathname !== tour.route) nav(tour.route)
    },
    [nav],
  )
  starter = start
  useEffect(() => () => void (starter = null), [])

  const runRef = useRef(null)
  runRef.current = run
  const end = useCallback((result) => {
    const r = runRef.current
    if (r) updateOnboarding({ tours: { [r.key]: result }, offered: { [r.key]: true } })
    setRun(null)
  }, [])

  // Offer a module's tour once, when it is first opened — and only when onboarding is out of the way.
  useEffect(() => {
    const tour = tourForRoute(pathname)
    const s = stateRef.current
    if (!tour || run || !['done', 'existing'].includes(s.status) || s.tours[tour.key] || s.offered[tour.key]) return
    const t = setTimeout(() => {
      updateOnboarding({ offered: { [tour.key]: true } })
      toast(`New to ${tour.label}?`, {
        description: 'A 30-second tour shows you around.',
        action: { label: 'Take the tour', onClick: () => start(tour.key) },
        duration: 9000,
      })
    }, 1200)
    return () => clearTimeout(t)
  }, [pathname, run, start, state.status])

  const active = run ? tourByKey(run.key) : null
  const value = useMemo(() => ({ start, active: run?.key ?? null }), [start, run])
  return (
    <Ctx.Provider value={value}>
      {children}
      {active && (
        <TourLayer
          key={run.key}
          tour={active}
          index={run.index}
          onNext={() => (run.index >= active.steps.length - 1 ? end('done') : setRun({ ...run, index: run.index + 1 }))}
          onBack={() => setRun({ ...run, index: Math.max(0, run.index - 1) })}
          onSkip={() => end('skipped')}
        />
      )}
    </Ctx.Provider>
  )
}
