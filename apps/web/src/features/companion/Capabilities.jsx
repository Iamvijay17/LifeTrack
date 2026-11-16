import { cn } from '@/lib/utils'

/** What this browser can and cannot do here, in plain words, so nothing is promised that a web page cannot deliver. */
export function CapabilityNote({ caps }) {
  const rows = [
    [caps.floating, 'Stay on top of other windows', 'Use the float button (Chrome and Edge on desktop).'],
    [true, 'Open in its own small window', 'Works in every desktop browser.'],
    [
      caps.installed,
      'Installed as an app',
      caps.installed ? 'Yes, LifeTrack is installed.' : 'Install LifeTrack from Settings to get a dock or taskbar icon.',
    ],
    [
      false,
      'A shortcut that works from any app',
      'Not possible in a browser. Alt+Shift+L works while a LifeTrack tab is focused. The optional desktop app adds a true global shortcut.',
    ],
    [false, 'A system tray icon', 'Needs the optional desktop app.'],
  ]
  return (
    <ul className="space-y-1.5 text-xs" aria-label="What works in this browser">
      {rows.map(([ok, title, note]) => (
        <li key={title} className="flex gap-2">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full text-center text-[9px] leading-[14px] font-bold',
              ok ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground',
            )}
          >
            {ok ? '✓' : '–'}
          </span>
          <span>
            <span className="font-medium">{title}</span> <span className="sr-only">{ok ? '(available)' : '(not available here)'}</span>
            <span className="block text-muted-foreground">{note}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
