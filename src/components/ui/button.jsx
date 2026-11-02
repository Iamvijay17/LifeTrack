import { forwardRef } from 'react'
import { cva } from 'class-variance-authority'
import { ButtonLoader } from '@/components/loaders/ButtonLoader'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-muted text-foreground hover:bg-muted/70',
        outline: 'border border-border bg-transparent hover:bg-muted/60',
        ghost: 'hover:bg-muted/60',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        success: 'bg-success/15 text-success hover:bg-success/25',
      },
      size: { default: 'h-9 px-3.5', sm: 'h-8 px-3 text-[13px]', lg: 'h-11 px-5', icon: 'h-9 w-9', 'icon-sm': 'h-8 w-8' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export const Button = forwardRef(({ className, variant, size, loading, disabled, children, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(buttonVariants({ variant, size }), className)} {...props}>
    {loading && <ButtonLoader />}
    {children}
  </button>
))
Button.displayName = 'Button'
