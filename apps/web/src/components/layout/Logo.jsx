export function Logo({ showText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/brand/lifetrack-icon.svg" width="28" height="28" alt="" aria-hidden className="shrink-0" />
      {showText && (
        <span className="animate-fade-in whitespace-nowrap text-[15px] tracking-tight">
          <span className="font-medium">Life</span>
          <span className="font-bold">Track</span>
        </span>
      )}
    </div>
  )
}
