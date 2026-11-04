import { Briefcase, Send, Trophy, Users } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { pctText, plural } from '@/lib/format'

/** `funnel` is domain funnel() over all applications. */
export function JobsStats({ appliedThisWeek, active, total, funnel }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Send} label="Applied this week" value={appliedThisWeek} sub={`${funnel.applied} all time`} />
      <StatCard icon={Briefcase} label="Active pipeline" value={active} sub={`${total} total tracked`} />
      <StatCard
        icon={Users}
        label="Interview rate"
        value={pctText(funnel.conversion)}
        sub={`${funnel.interviews} of ${funnel.applied} applied`}
      />
      <StatCard icon={Trophy} label="Offers" value={funnel.offers} sub={plural(funnel.rejections, 'rejection')} />
    </div>
  )
}
