import { useNavigate } from 'react-router-dom'
import { Download, LogOut, Moon, Settings, Sun, User } from 'lucide-react'
import { Menu } from '@/components/ui/menu'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { auth } from '@/services/auth'

export function ProfileMenu() {
  const { displayName, user } = useAuth()
  const { save } = useSettings()
  const nav = useNavigate()
  const dark = document.documentElement.classList.contains('dark')
  const initial = (displayName || user?.email || '?').trim()[0]?.toUpperCase()
  return (
    <Menu label={`Profile menu for ${displayName || user?.email || 'you'}`}
      trigger={<span className="grid h-9 w-9 place-items-center rounded-full bg-primary/20 text-sm font-semibold text-secondary">{initial ?? <User className="h-4 w-4" />}</span>}
      items={[
        { label: 'Settings', icon: Settings, onClick: () => nav('/settings') },
        { label: 'Data export', icon: Download, onClick: () => nav('/export') },
        { label: dark ? 'Light theme' : 'Dark theme', icon: dark ? Sun : Moon, onClick: () => save({ theme: dark ? 'light' : 'dark' }) },
        { label: 'Sign out', icon: LogOut, onClick: () => auth.signOut() },
      ]} />
  )
}
