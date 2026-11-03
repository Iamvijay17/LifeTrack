import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** A titled group of stats and charts for one module. */
export const Block = ({ icon: Icon, title, children }) => (
  <section className="space-y-3">
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-secondary" />
      {title}
    </h2>
    {children}
  </section>
)

/** A card with a title, for one chart or list. */
export const Panel = ({ title, children }) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
)

export const EmptyNote = ({ children }) => <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
