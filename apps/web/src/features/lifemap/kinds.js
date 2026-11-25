import { Compass, Flag, FolderKanban, Repeat, SquareCheck, Target } from 'lucide-react'

/**
 * What each kind of node looks like. Colour is never the only signal: every kind also has its own icon, its own badge shape and its own name in
 * the legend and the screen-reader label. (Habits keep the colour the person gave them.)
 */
export const KIND_STYLE = {
  goal: { icon: Target, color: '#EC4899', shape: 'hex', label: 'Goal' },
  milestone: { icon: Flag, color: '#F59E0B', shape: 'diamond', label: 'Milestone' },
  project: { icon: FolderKanban, color: '#6366F1', shape: 'tab', label: 'Project' },
  area: { icon: Compass, color: '#14B8A6', shape: 'ring', label: 'Area of life' },
  habit: { icon: Repeat, color: '#F43F5E', shape: 'circle', label: 'Habit' },
  task: { icon: SquareCheck, color: '#3B82F6', shape: 'square', label: 'Task' },
}
export const kindColor = (n) => (n.kind === 'habit' && n.color) || KIND_STYLE[n.kind].color

/** The badge outline at (0,0) in a 28×28 box. */
export function badgePath(shape) {
  switch (shape) {
    case 'hex':
      return 'M14 1 L25.3 7.5 L25.3 20.5 L14 27 L2.7 20.5 L2.7 7.5 Z'
    case 'diamond':
      return 'M14 1 L27 14 L14 27 L1 14 Z'
    case 'tab':
      return 'M3 6 Q3 3 6 3 L11 3 L14 6 L22 6 Q25 6 25 9 L25 22 Q25 25 22 25 L6 25 Q3 25 3 22 Z'
    case 'square':
      return 'M7 2 H21 Q26 2 26 7 V21 Q26 26 21 26 H7 Q2 26 2 21 V7 Q2 2 7 2 Z'
    default:
      return null // circle / ring are drawn as circles
  }
}

export const MAP_KINDS = ['goal', 'milestone', 'project', 'area', 'habit', 'task']
