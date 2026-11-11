import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { TypedConfirmDialog } from '@/components/shared/TypedConfirmDialog'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/services/auth'

export function AccountCard() {
  const { user } = useAuth()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteAccount, deleting] = useAction(() => auth.deleteAccount())

  return (
    <SettingsSection headingAs="h3" icon={ShieldCheck} title="Account" desc={user?.email}>
      <p className="text-sm text-muted-foreground">
        Password, app lock, fingerprint unlock and your signed-in devices are on the{' '}
        <Link to="/security" className="font-medium text-mod-text underline underline-offset-2">
          Security &amp; Privacy
        </Link>{' '}
        page.
      </p>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={() => auth.signOut()}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
        <Button variant="ghost" className="text-danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Delete account…
        </Button>
      </div>
      <TypedConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your account?"
        description="This permanently deletes your account and ALL data on every device. Export a backup first."
        phrase="DELETE"
        confirmLabel="Delete everything"
        pending={deleting}
        onConfirm={() => deleteAccount()}
      />
    </SettingsSection>
  )
}
