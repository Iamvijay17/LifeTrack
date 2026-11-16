import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { TEMPLATES, TEMPLATE_GROUPS, nodeSummary } from '@lifetrack/core/automation'
import { Card } from '@/components/ui/card'

/** Ready-made workflows. Choosing one opens it in the editor, switched off, so it can be changed before it is saved or activated. */
export function Templates() {
  const nav = useNavigate()
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Pick one to open it in the editor. Nothing runs until you save it and switch it on.</p>
      {TEMPLATE_GROUPS.map((group) => (
        <section key={group} aria-label={group}>
          <h2 className="mb-2 text-sm font-semibold">{group}</h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.filter((t) => t.group === group).map((t) => {
              const trigger = { type: 'trigger', kind: t.spec.trigger.kind, config: t.spec.trigger.config }
              return (
                <Card key={t.key} interactive className="p-0">
                  <button
                    type="button"
                    onClick={() => nav(`/automation/new?template=${t.key}`)}
                    className="flex h-full w-full flex-col gap-1.5 p-3.5 text-left"
                  >
                    <span className="text-sm font-semibold">{t.name}</span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{t.description}</span>
                    <span className="mt-auto pt-2 text-xs text-muted-foreground">{nodeSummary(trigger)}</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-mod-text">
                      Use this template <ArrowRight className="h-3 w-3" aria-hidden />
                    </span>
                  </button>
                </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
