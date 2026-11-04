import { useRef } from 'react'
import { AnimatePresence, ease, m, spring } from '@/components/motion/primitives'
import { tick } from '@/lib/celebrate'
import { cn } from '@/lib/utils'

const SIZE = { md: 'h-5 w-5', lg: 'h-10 w-10' }
const TARGET = { md: 'h-11 w-11 md:h-8 md:w-8', lg: 'h-10 w-10' }

/**
 * The check-off circle used across the app. When it's ticked the fill springs in, the tick draws itself and a ring ripples out.
 * `color` overrides the accent (a habit's own colour, say). `icon` replaces the empty circle's look for a status such as "in progress".
 */
export function CheckButton({ done, onToggle, label, color, size = 'md', disabled, pressed = done, className, children }) {
  const wasDone = useRef(done)
  const justDone = done && !wasDone.current
  wasDone.current = done
  const fill = color ?? 'linear-gradient(135deg, rgb(var(--mod)), rgb(var(--mod-2)))'
  const ring = color ?? 'rgb(var(--mod))'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!done) tick()
        onToggle()
      }}
      aria-label={label}
      aria-pressed={pressed}
      className={cn('lt-press group/check grid shrink-0 place-items-center rounded-full disabled:opacity-60', TARGET[size], className)}
    >
      <span className={cn('relative grid place-items-center rounded-full', SIZE[size])}>
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-full border-2 transition-colors duration-150',
            !color && !done && 'border-muted-foreground/50 group-hover/check:border-mod',
          )}
          style={color ? { borderColor: color } : undefined}
        />
        <AnimatePresence initial={false}>
          {done && (
            <m.span
              key="fill"
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: fill }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0, transition: { duration: 0.1 } }}
              transition={spring.bouncy}
            />
          )}
        </AnimatePresence>
        {justDone && (
          <m.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2"
            style={{ borderColor: ring }}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.5, ease: ease.out }}
          />
        )}
        <svg
          viewBox="0 0 20 20"
          className="relative h-[70%] w-[70%]"
          fill="none"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <m.path
            d="M4.5 10.5l3.6 3.6 7.4-8.2"
            initial={false}
            animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
            transition={{ duration: 0.22, ease: ease.out, delay: done ? 0.05 : 0 }}
          />
        </svg>
        {children}
      </span>
    </button>
  )
}
