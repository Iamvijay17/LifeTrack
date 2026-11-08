import { z } from 'zod'
import { User } from 'lucide-react'
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

export function ProfileCard() {
  const { displayName } = useAuth()
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
    <SettingsSection icon={User} title="Profile">
      <form className="flex items-start gap-2" noValidate onSubmit={handleSubmit(save)}>
        <Field label="Display name" className="flex-1" error={errors.name?.message}>
          <Input maxLength={80} {...register('name')} />
        </Field>
        <Button type="submit" className="mt-[1.65rem]" loading={pending} disabled={!isDirty}>
          Save
        </Button>
      </form>
    </SettingsSection>
  )
}
