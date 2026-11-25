import { Briefcase, Send, Trophy, Users } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { Stagger, StaggerItem, ease, m } from '@/components/motion/primitives'
import { JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'
import { pctText, plural } from '@/lib/format'
import { STAGE_COLOR } from './StatusBadge'

/** Where every application stands right now, as one bar. Hidden until there's something to show. */
function PipelineBar({ apps }) {
  const stages = JOB_STATUSES.map((s) => ({ s, count: apps.filter((a) => a.status === s).length })).filter((x) => x.count)
  if (!stages.length) return null
  const summary = stages.map((x) => `${STATUS_LABEL[x.s]} ${x.count}`).join(', ')
  return (
    <section className="lt-hero px-4 py-3.5 md:px-5" role="img" aria-label={`Pipeline: ${summary}`}>
      <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
        {stages.map((x) => (
          <m.span
            key={x.s}
            layout
            className="h-full rounded-[3px] first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: x.count, flexBasis: 0, background: STAGE_COLOR[x.s] }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: ease.out }}
          />
        ))}
      </div>
      <div aria-hidden className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {stages.map((x) => (
          <span key={x.s} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[x.s] }} />
            {STATUS_LABEL[x.s]} <b className="font-semibold tabular-nums text-foreground">{x.count}</b>
          </span>
        ))}
      </div>
    </section>
  )
}

/** `funnel` is domain funnel() over all applications; `apps` draws the pipeline bar. */
export function JobsStats({ appliedThisWeek, active, total, funnel, apps = [] }) {
  return (
    <div className="space-y-3">
      <Stagger gap={0.05} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={Send} label="Applied this week" value={appliedThisWeek} sub={`${funnel.applied} all time`} className="h-full" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Briefcase} label="Active pipeline" value={active} sub={`${total} total tracked`} className="h-full" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            icon={Users}
            label="Interview rate"
            value={pctText(funnel.conversion)}
            sub={`${funnel.interviews} of ${funnel.applied} applied`}
            className="h-full"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Trophy} label="Offers" value={funnel.offers} sub={plural(funnel.rejections, 'rejection')} className="h-full" />
        </StaggerItem>
      </Stagger>
      <PipelineBar apps={apps} />
    </div>
  )
}
