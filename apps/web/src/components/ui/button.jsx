import { forwardRef } from 'react'
import { cva } from 'class-variance-authority'
import { ButtonLoader } from '@/components/loaders/ButtonLoader'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'lt-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-b from-[#7C3AED] to-[#6246EA] text-primary-foreground shadow-btn-primary hover:brightness-110 active:brightness-95',
        secondary: 'bg-muted text-foreground hover:bg-muted/70',
        outline: 'border border-border bg-card/60 shadow-card hover:border-muted-foreground/40 hover:bg-muted/60',
        ghost: 'hover:bg-muted/60',
        destructive: 'bg-danger-solid text-white shadow-card hover:bg-danger-solid/90',
        success: 'bg-success/15 text-success hover:bg-success/25',
      },
      // Taller on touch layouts (below `md`), compact with a mouse.
      size: {
        default: 'h-11 px-3.5 md:h-9',
        sm: 'h-10 px-3 text-[13px] md:h-8',
        lg: 'h-11 px-5',
        icon: 'h-11 w-11 md:h-9 md:w-9',
        'icon-sm': 'h-10 w-10 md:h-8 md:w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export const Button = forwardRef(({ className, variant, size, loading, disabled, children, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  >
    {loading && <ButtonLoader />}
    {children}
  </button>
))
Button.displayName = 'Button'
