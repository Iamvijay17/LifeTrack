export function Logo({ showText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 512 512" aria-hidden><rect width="512" height="512" rx="112" fill="#8B5CF6" /><path d="M150 360V152h42v168h118v40z" fill="#fff" /><circle cx="366" cy="300" r="26" fill="#fff" fillOpacity=".9" /></svg>
      {showText && <span className="text-[15px] font-semibold tracking-tight">LifeTrack</span>}
    </div>
  )
}
