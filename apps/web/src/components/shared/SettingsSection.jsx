import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** A titled card for a group of related controls (Settings, Data Export). */
export function SettingsSection({ title, desc, children }) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-0.5">
        <CardTitle>{title}</CardTitle>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
