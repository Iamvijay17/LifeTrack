import { Check, ShieldAlert, ShieldCheck } from 'lucide-react'
import { m } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

/** What counts toward the level, in the order it is shown. Each is something the person can do on this page. */
export function securityChecks(st) {
  return [
    { id: 'password', label: 'Account password', done: true },
    { id: 'lock', label: 'App lock', done: !!st?.appLockEnabled },
    { id: 'bio', label: 'Fingerprint or face', done: !!st?.biometricEnabled },
    { id: 'auto', label: 'Auto-lock within 15 min', done: !!st?.appLockEnabled && st.autoLockSeconds <= 900 },
  ]
}
const LEVEL = ['Basic', 'Basic', 'Good', 'Strong', 'Excellent']

/** The always-dark header of the Security page: a shield whose ring fills as protections are switched on. */
export function SecurityHero({ state }) {
  const checks = securityChecks(state)
  const n = checks.filter((c) => c.done).length
  const ring = 2 * Math.PI * 44
  const Shield = n >= 3 ? ShieldCheck : ShieldAlert
  return (
    <div className="dark relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b10] p-5 text-foreground shadow-raised sm:p-6">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_0%_0%,rgb(124_58_237/0.35),transparent_65%),radial-gradient(60%_80%_at_100%_100%,rgb(6_182_212/0.18),transparent_65%)]"
      />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
        <div className="relative grid h-28 w-28 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="44" fill="none" strokeWidth="5" className="stroke-white/10" />
            <m.circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className={n >= 3 ? 'stroke-success' : n === 2 ? 'stroke-warning' : 'stroke-danger'}
              strokeDasharray={ring}
              initial={{ strokeDashoffset: ring }}
              animate={{ strokeDashoffset: ring * (1 - n / checks.length) }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <Shield className={cn('h-10 w-10', n >= 3 ? 'text-success' : 'text-warning')} strokeWidth={1.6} aria-hidden />
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Protection</p>
          <h2 className="text-2xl font-semibold tracking-display">
            {LEVEL[n]}{' '}
            <span className="text-base font-normal text-muted-foreground">
              · {n} of {checks.length}
            </span>
          </h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            {checks.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                  c.done ? 'border-success/40 bg-success/10 text-success' : 'border-white/10 bg-white/[0.04] text-muted-foreground',
                )}
              >
                {c.done ? (
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                ) : (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                )}
                <span className="sr-only">{c.done ? 'On: ' : 'Off: '}</span>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
