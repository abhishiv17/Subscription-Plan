/** The Brightloop mark: a plum ring with a marigold arc for the billing cycle. */
export function LoopMark({ size = 32, ring = "var(--color-brand)", className = "" }: { size?: number; ring?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <circle cx="16" cy="16" r="11" stroke={ring} strokeWidth="5" />
      <path d="M16 5a11 11 0 0 1 11 11" stroke="var(--color-loop)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LoopMark size={28} ring={light ? "#fff" : undefined} />
      <span className={`text-[17px] font-bold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>Brightloop</span>
    </span>
  );
}
