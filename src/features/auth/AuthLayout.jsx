import { Logo } from '@/components/layout/Logo'
import { Banners } from '@/components/layout/StatusIndicators'

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-dvh">
      <Banners />
      <main className="mx-auto flex min-h-[80dvh] w-full max-w-sm flex-col justify-center px-5 py-10">
        <div className="mb-8"><Logo /></div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </main>
    </div>
  )
}
