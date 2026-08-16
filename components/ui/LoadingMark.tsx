'use client'

export default function LoadingMark({ size = 44 }: { size?: number }) {
  const stroke = Math.max(3, Math.round(size * 0.08))
  const dot = Math.max(3, Math.round(size * 0.09))

  return (
    <span
      aria-label="Loading"
      role="status"
      className="relative inline-block animate-[spin_0.9s_linear_infinite]"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full border-carbon-200 dark:border-carbon-800"
        style={{ borderWidth: stroke, borderStyle: 'solid' }}
      />
      <span
        className="absolute inset-0 rounded-full border-transparent border-t-accent border-r-accent"
        style={{ borderWidth: stroke, borderStyle: 'solid' }}
      />
      <span
        className="absolute rounded-full bg-accent"
        style={{ width: dot, height: dot, left: `calc(50% - ${dot / 2}px)`, top: Math.max(0, stroke / 2) }}
      />
    </span>
  )
}
