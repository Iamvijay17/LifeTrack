import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Reveal } from '@/components/motion/primitives'

/** A titled group of stats and charts for one module. */
export const Block = ({ icon: Icon, title, module, children }) => (
  <Reveal as="section" data-module={module} className="space-y-3">
    <h2 className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
      <span className="lt-icon-tile h-7 w-7 rounded-md">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      {title}
    </h2>
    {children}
  </Reveal>
)

/** A card with a title, for one chart or list. */
export const Panel = ({ title, children }) => (
  <Card>
    <CardHeader>
      <CardTitle as="h3">{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
)

export const EmptyNote = ({ children }) => <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
