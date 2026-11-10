import { useNavigate } from 'react-router-dom'
import { Download, LifeBuoy, LogOut, Moon, Settings, Sun, User } from 'lucide-react'
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
    <Menu
      label={`Profile menu for ${displayName || user?.email || 'you'}`}
      trigger={
        <span className="lt-press grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-sm font-semibold text-white shadow-card md:h-8 md:w-8 md:text-xs">
          {initial ?? <User className="h-4 w-4" />}
        </span>
      }
      items={[
        { label: 'Settings', icon: Settings, onClick: () => nav('/settings') },
        { label: 'Data export', icon: Download, onClick: () => nav('/export') },
        { label: 'Help', icon: LifeBuoy, onClick: () => nav('/help') },
        { label: dark ? 'Light theme' : 'Dark theme', icon: dark ? Sun : Moon, onClick: () => save({ theme: dark ? 'light' : 'dark' }) },
        { label: 'Sign out', icon: LogOut, onClick: () => auth.signOut() },
      ]}
    />
  )
}
