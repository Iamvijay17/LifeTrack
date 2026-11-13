import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useDragControls } from 'motion/react'
import { AnimatePresence, duration, ease, m, spring } from '@/components/motion/primitives'
import { useOpenSound } from '@/hooks/useInteraction'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { hasOpenPopup } from './popup'

const CLOSE_DRAG_PX = 110
const CLOSE_DRAG_SPEED = 600

/**
 * Bottom sheet on phones (drag the handle down to dismiss), centred modal on desktop.
 * `stacked` is for a dialog opened on top of another. It leaves at once, because while one is animating out it still counts as the top layer
 * and would swallow an Escape meant for the dialog underneath.
 */
export function Dialog({ open, onOpenChange, title, description, children, className, footer, stacked }) {
  const desktop = useIsDesktop()
  const drag = useDragControls()
  useOpenSound(open)
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-black/60 md:backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={stacked ? undefined : { opacity: 0, transition: { duration: duration.fast } }}
                transition={{ duration: duration.base, ease: ease.out }}
              />
            </D.Overlay>
            <D.Content
              asChild
              forceMount
              onEscapeKeyDown={(e) => hasOpenPopup() && e.preventDefault()} // Esc closes the open dropdown or calendar, not the form under it
            >
              <m.div
                className={cn(
                  'fixed z-50 flex max-h-[92dvh] w-full flex-col border border-border bg-card shadow-overlay',
                  // `margin: auto` centres it, because Motion owns the transform.
                  'inset-x-0 bottom-0 rounded-t-2xl md:inset-0 md:m-auto md:h-fit md:max-w-lg md:rounded-2xl',
                  className,
                )}
                initial={desktop ? { opacity: 0, scale: 0.97, y: 10 } : { y: '100%' }}
                animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
                exit={
                  stacked
                    ? undefined
                    : desktop
                      ? { opacity: 0, scale: 0.98, y: 6, transition: { duration: duration.fast, ease: ease.in } }
                      : { y: '100%', transition: { duration: duration.base, ease: ease.in } }
                }
                transition={desktop ? { duration: duration.base, ease: ease.out } : spring.soft}
                drag={desktop ? false : 'y'}
                dragControls={drag}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.8 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > CLOSE_DRAG_PX || info.velocity.y > CLOSE_DRAG_SPEED) onOpenChange(false)
                }}
              >
                {!desktop && (
                  <div
                    aria-hidden
                    className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5"
                    onPointerDown={(e) => drag.start(e)}
                  >
                    <span className="h-1 w-9 rounded-full bg-muted-foreground/35" />
                  </div>
                )}
                <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                  <div className="min-w-0">
                    <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
                    {description ? (
                      <D.Description className="mt-0.5 text-sm text-muted-foreground">{description}</D.Description>
                    ) : (
                      <D.Description className="sr-only">{title}</D.Description>
                    )}
                  </div>
                  <D.Close
                    className="lt-press -m-1.5 rounded-md p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:m-0 md:p-1"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </D.Close>
                </div>
                <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4', !footer && 'pb-safe-3')}>{children}</div>
                {footer && <div className="flex justify-end gap-2 border-t border-border px-5 pb-safe-3 pt-3">{footer}</div>}
              </m.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  )
}
