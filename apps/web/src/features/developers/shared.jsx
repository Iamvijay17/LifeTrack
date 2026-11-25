import { useState } from 'react'
import { Check, Copy, ServerOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/states'
import { platformAvailable } from '@/services/platform'
import { isDemo } from '@/services/demo'

/** Shown instead of a platform page when there is no Supabase project (dev backend) or demo mode is on. */
export function UnavailableState() {
  return (
    <EmptyState
      icon={ServerOff}
      title={isDemo() ? 'Not available in demo mode' : 'Needs a Supabase project'}
      description={
        isDemo()
          ? 'This page works on your real account, so it is switched off while you explore the demo.'
          : 'This feature is stored on the server. The in-browser dev mode has no server, so there is nothing to show here. Connect LifeTrack to a Supabase project (see docs/SETUP.md) and apply migration 0027.'
      }
    />
  )
}
export { platformAvailable }

export function CopyButton({ text, label = 'Copy', className }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        } catch {
          toast.error('Could not copy. Select the text and copy it by hand.')
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? 'Copied' : label}
    </Button>
  )
}

/** A secret the server shows exactly once (an API key, a webhook signing secret). Closing it is deliberate. */
export function SecretDialog({ open, onClose, title, intro, secret }) {
  return (
    <Dialog
      open={open}
      onOpenChange={() => {}}
      title={title}
      description={intro}
      footer={<Button onClick={onClose}>I have saved it</Button>}
    >
      <div className="space-y-3">
        <code data-testid="secret-value" className="block break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
          {secret}
        </code>
        <CopyButton text={secret} label="Copy to clipboard" />
        <p className="text-xs text-warning">You will not be able to see this again. If you lose it, create a new one.</p>
      </div>
    </Dialog>
  )
}

export const ago = (iso) => {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
export const stamp = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—')
