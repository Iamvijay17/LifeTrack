import { Button } from '@/components/ui/button'

/** "Show more" footer for a paged list; renders nothing when everything is already visible. */
export function ShowMore({ more, step = 50, onClick, className = '' }) {
  if (more <= 0) return null
  return (
    <div className={`flex justify-center p-3 ${className}`}>
      <Button variant="outline" size="sm" onClick={onClick}>
        Show {Math.min(step, more)} more <span className="text-muted-foreground">({more} hidden)</span>
      </Button>
    </div>
  )
}
