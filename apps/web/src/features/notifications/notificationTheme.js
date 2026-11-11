import { BellRing, Briefcase, CalendarClock, Dumbbell, GraduationCap, Info, ListTodo, Repeat, Target, Wallet } from 'lucide-react'

/** Each category's icon and the gradient behind it. The gradients are written out in full so Tailwind can see them. */
export const CATEGORY_STYLE = {
  custom: { icon: BellRing, tile: 'from-violet-500 to-indigo-600' },
  task: { icon: ListTodo, tile: 'from-sky-500 to-blue-600' },
  event: { icon: CalendarClock, tile: 'from-indigo-500 to-violet-600' },
  habit: { icon: Repeat, tile: 'from-emerald-500 to-teal-600' },
  workout: { icon: Dumbbell, tile: 'from-rose-500 to-orange-500' },
  bill: { icon: Wallet, tile: 'from-amber-500 to-orange-600' },
  study: { icon: GraduationCap, tile: 'from-purple-500 to-fuchsia-600' },
  job: { icon: Briefcase, tile: 'from-cyan-500 to-sky-600' },
  goal: { icon: Target, tile: 'from-pink-500 to-rose-600' },
  system: { icon: Info, tile: 'from-slate-500 to-zinc-600' },
}
export const categoryStyle = (kind) => CATEGORY_STYLE[kind] ?? CATEGORY_STYLE.system

/** How a priority looks: the bar down the side of a card, a badge tone, and whether to mention it at all (normal is the quiet default). */
export const PRIORITY_STYLE = {
  low: { bar: 'bg-muted-foreground/30', tone: 'neutral', show: true },
  normal: { bar: 'bg-transparent', tone: 'neutral', show: false },
  high: { bar: 'bg-warning', tone: 'warning', show: true },
  urgent: { bar: 'bg-danger', tone: 'danger', show: true },
}
