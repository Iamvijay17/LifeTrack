import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** A titled card for a group of related controls (Settings, Data Export). */
export function SettingsSection({ title, desc, icon: Icon, children }) {
  return (
    <Card>
      <CardHeader className="items-start justify-start gap-3">
        {Icon && (
          <span className="lt-icon-soft h-8 w-8 rounded-md">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
