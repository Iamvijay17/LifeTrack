import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { exerciseImageUrl } from './useCatalog'

/**
 * One demonstration image in the one frame used everywhere: 3:2, light neutral backdrop (identical in both themes, so letterboxing never clashes with the photo),
 * object-contain so portrait and wide originals are letterboxed, never cropped or stretched.
 * Falls back to a labelled placeholder when there is no image or it fails to load.
 */
export function ExerciseImage({ path, alt, priority = false, className, label = 'No demonstration image' }) {
  const [state, setState] = useState('loading') // loading | loaded | failed
  const ref = useRef(null)
  const src = exerciseImageUrl(path)
  useEffect(() => {
    setState('loading')
    // A cached image can finish before React attaches onLoad.
    const el = ref.current
    if (el?.complete && el.naturalWidth > 0) setState('loaded')
  }, [src])
  const shown = src && state !== 'failed'
  return (
    <div
      data-testid="exercise-frame"
      className={cn('relative aspect-[3/2] w-full overflow-hidden rounded-lg border border-border bg-neutral-100', className)}
    >
      {shown ? (
        <>
          {state === 'loading' && <div aria-hidden className="skeleton absolute inset-0 rounded-none" />}
          <img
            ref={ref}
            src={src}
            alt={alt}
            width={850}
            height={567}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            draggable={false}
            onLoad={() => setState('loaded')}
            onError={() => setState('failed')}
            className={cn(
              'absolute inset-0 h-full w-full object-contain transition-opacity duration-200',
              state === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
          />
        </>
      ) : (
        <div role="img" aria-label={label} className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-neutral-600">
          <ImageOff className="h-6 w-6" aria-hidden />
          <span className="px-3 text-center text-xs">{label}</span>
        </div>
      )}
    </div>
  )
}
