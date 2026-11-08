import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { LazyMotion, MotionConfig, m, useMotionValue, useSpring } from 'motion/react'
import { drawCountable, hasCountable, parseCountable } from '@lifetrack/utils'
import { cn } from '@/lib/utils'
import { duration, ease, motionOff, spring } from './tokens'

export { AnimatePresence, LayoutGroup, m } from 'motion/react'
export { duration, ease, motionOff, spring } from './tokens'

// The animation engine is a separate chunk, about 30 KB smaller first load. It starts downloading as soon as this module runs.
const features = import('./features').then((mod) => mod.default)
const loadFeatures = () => features

/**
 * Wraps the app once. `reducedMotion="user"` turns movement into simple fades for people who asked for less motion.
 * Until the engine arrives, animated elements sit at their starting state, which can be invisible. If it can't load (a stale deploy, a dropped
 * connection), that would be a blank app, so the failure goes to the error boundary, which offers a reload.
 */
export function MotionProvider({ children }) {
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    features.catch(setFailure)
  }, [])
  if (failure) throw failure
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user" transition={{ duration: duration.base, ease: ease.out }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

const staggerParent = (gap, delay) => ({ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } })
const rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } } }

/** Children marked <StaggerItem> arrive one after another. Keep it to page-level blocks, not to long lists. */
export const Stagger = ({ gap = 0.05, delay = 0, as = 'div', className, children, ...p }) => {
  const Tag = m[as]
  return (
    <Tag data-reveal initial="hidden" animate="show" variants={staggerParent(gap, delay)} className={className} {...p}>
      {children}
    </Tag>
  )
}
export const StaggerItem = ({ as = 'div', className, children, ...p }) => {
  const Tag = m[as]
  return (
    <Tag data-reveal variants={rise} className={className} {...p}>
      {children}
    </Tag>
  )
}

/** Rises in the first time it scrolls into view. */
export const Reveal = ({ delay = 0, y = 14, as = 'div', className, children, ...p }) => {
  const Tag = m[as]
  return (
    <Tag
      data-reveal
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -32px 0px' }}
      transition={{ duration: duration.slow, ease: ease.out, delay }}
      className={className}
      {...p}
    >
      {children}
    </Tag>
  )
}

/**
 * A value that counts up when it appears and when it changes. Takes the finished text ("₹12,345", "2h 30m", "3/5") and tweens every number
 * in it, then lands on exactly that text. It writes to the DOM directly, so counting doesn't re-render anything.
 */
export const AnimatedValue = memo(function AnimatedValue({ value, className, ...p }) {
  const text = String(value ?? '')
  const ref = useRef(null)
  const shown = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const parts = parseCountable(text)
    const prev = shown.current == null ? null : parseCountable(shown.current)
    const unchanged = shown.current === text
    shown.current = text
    if (unchanged || !hasCountable(parts) || motionOff()) {
      el.textContent = text
      return undefined
    }
    const started = performance.now()
    let frame = 0
    const step = (now) => {
      const t = Math.min(1, (now - started) / (duration.count * 1000))
      el.textContent = t < 1 ? drawCountable(parts, prev, 1 - (1 - t) ** 3) : text
      if (t < 1) frame = requestAnimationFrame(step)
    }
    el.textContent = drawCountable(parts, prev, 0)
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      el.textContent = text
    }
  }, [text])
  return (
    <span ref={ref} className={cn('tabular-nums', className)} {...p}>
      {text}
    </span>
  )
})

/**
 * Circular progress. `value` is 0-100 or null. Colour comes from the surrounding module unless `from`/`to` are given. Children sit in the centre.
 */
export function ProgressRing({ value, size = 120, stroke = 10, from, to, track, label, className, children }) {
  const id = useId().replaceAll(':', '')
  const r = (size - stroke) / 2
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden={label ? undefined : true}
        role={label ? 'img' : undefined}
        aria-label={label}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: from ?? 'rgb(var(--mod))' }} />
            <stop offset="1" style={{ stopColor: to ?? 'rgb(var(--mod-2))' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: track ?? 'rgb(var(--muted))' }} />
        {value != null && (
          <m.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.max(v / 100, v > 0 ? 0.001 : 0), opacity: v > 0 ? 1 : 0 }}
            transition={{ duration: 0.9, ease: ease.out }}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  )
}

/** Leans a little toward the pointer. Mouse only, and only on the few actions that deserve the attention. */
export function Magnetic({ strength = 0.22, className, children }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, spring.snappy)
  const sy = useSpring(y, spring.snappy)
  const move = (e) => {
    if (e.pointerType !== 'mouse' || motionOff()) return
    const box = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - box.left - box.width / 2) * strength)
    y.set((e.clientY - box.top - box.height / 2) * strength)
  }
  const reset = () => {
    x.set(0)
    y.set(0)
  }
  return (
    <m.span onPointerMove={move} onPointerLeave={reset} style={{ x: sx, y: sy }} className={cn('inline-flex', className)}>
      {children}
    </m.span>
  )
}

/** Smoothly opens and closes to its content's height (accordions, expanding rows). */
export const Collapse = ({ open, className, children }) => (
  <m.div
    initial={false}
    animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
    transition={{ duration: duration.base, ease: ease.out }}
    style={{ overflow: 'hidden' }}
    aria-hidden={!open}
    {...(!open ? { inert: '' } : {})}
    className={className}
  >
    {children}
  </m.div>
)
