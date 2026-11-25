import { z } from 'zod'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Camera, Trash2, User } from 'lucide-react'
import { format } from 'date-fns'
import { useAvatar } from '@/hooks/useAvatar'
import { avatarFileProblem, fitAvatar } from '@/lib/avatar'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { useRecordForm } from '@/hooks/useRecordForm'
import * as store from '@/hooks/store'
import { auth } from '@/services/auth'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name up to 80 characters.').max(80, 'Enter a name up to 80 characters.'),
})

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.') })

/** Profile picture: shrunk in the browser to a small square, kept on the profile, never uploaded to an image host. */
function PhotoRow() {
  const { avatar, save } = useAvatar()
  const { displayName, user } = useAuth()
  const input = useRef(null)
  const [pick, picking] = useAction(
    async (file) => {
      const problem = avatarFileProblem(file)
      if (problem) throw new Error(problem)
      await save(await fitAvatar(file))
    },
    { success: 'Photo updated' },
  )
  const [remove, removing] = useAction(() => save(null), { success: 'Photo removed' })
  return (
    <div className="flex items-center gap-4">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-lg font-semibold text-white">
        {avatar ? (
          <img src={avatar} alt="Your profile photo" className="h-full w-full object-cover" />
        ) : (
          (displayName || user?.email || '?')[0].toUpperCase()
        )}
      </span>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={picking} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" aria-hidden /> {avatar ? 'Change photo' : 'Add photo'}
          </Button>
          {avatar && (
            <Button variant="ghost" size="sm" loading={removing} onClick={() => remove()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPEG, PNG or WebP. It is shrunk to a small square on this device first.</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose a profile photo"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pick(f)
          }}
        />
      </div>
    </div>
  )
}

/** Change the sign-in email. With Supabase the new address must be confirmed from its inbox before it takes effect. */
function EmailRow() {
  const { user } = useAuth()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useRecordForm({
    schema: emailSchema,
    recordKey: 'email',
    version: user?.email,
    valuesFor: () => ({ email: user?.email ?? '' }),
  })
  const [save, pending] = useAction(async ({ email }) => {
    if (email === user?.email) return
    const r = await auth.changeEmail(email)
    if (r?.needsConfirmation)
      toast.success('Check your inbox', { description: `We sent a confirmation link to ${email}. Your email changes once you follow it.` })
    else toast.success('Email updated')
    reset({ email: r?.needsConfirmation ? (user?.email ?? '') : email })
  })
  return (
    <form className="flex items-start gap-2" noValidate onSubmit={handleSubmit(save)}>
      <Field label="Email" className="flex-1" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Button type="submit" className="mt-[1.65rem]" loading={pending} disabled={!isDirty}>
        Change
      </Button>
    </form>
  )
}

const dayOf = (iso) => {
  try {
    return format(new Date(iso), 'd MMM yyyy')
  } catch {
    return null
  }
}

export function ProfileCard() {
  const { displayName, user } = useAuth()
  const created = dayOf(user?.created_at)
  const lastSignIn = user?.last_sign_in_at ? dayOf(user.last_sign_in_at) : null
  store.useTable('profiles') // load so profiles.display_name can be kept in step
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useRecordForm({ schema, recordKey: 'profile', version: displayName, valuesFor: () => ({ name: displayName }) })

  const [save, pending] = useAction(
    async ({ name }) => {
      await auth.updateDisplayName(name)
      const profile = store.peek('profiles')[0]
      if (profile) await store.update('profiles', profile.id, { display_name: name }).catch(() => {})
      reset({ name })
    },
    { success: 'Profile saved' },
  )

  return (
    <SettingsSection headingAs="h3" icon={User} title="Profile">
      <form className="flex items-start gap-2" noValidate onSubmit={handleSubmit(save)}>
        <Field label="Display name" className="flex-1" error={errors.name?.message}>
          <Input maxLength={80} {...register('name')} />
        </Field>
        <Button type="submit" className="mt-[1.65rem]" loading={pending} disabled={!isDirty}>
          Save
        </Button>
      </form>
      <PhotoRow />
      <EmailRow />
      {(created || lastSignIn) && (
        <dl className="grid gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-2">
          {created && (
            <div>
              <dt className="inline">Account created </dt>
              <dd className="inline font-medium text-foreground/80">{created}</dd>
            </div>
          )}
          {lastSignIn && (
            <div>
              <dt className="inline">Last sign-in </dt>
              <dd className="inline font-medium text-foreground/80">{lastSignIn}</dd>
            </div>
          )}
        </dl>
      )}
    </SettingsSection>
  )
}
