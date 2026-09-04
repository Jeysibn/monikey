interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
  strokeWidth?: number
  fill?: boolean
  className?: string
}

/** Builds a smoothed SVG path (quadratic curves through midpoints) for a series of values. */
function buildPath(values: number[], width: number, height: number, pad = 3): { line: string; area: string } {
  if (values.length === 0) {
    const flatY = height / 2
    return { line: `M0,${flatY} L${width},${flatY}`, area: `M0,${flatY} L${width},${flatY} L${width},${height} L0,${height} Z` }
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const innerH = height - pad * 2
  const points = values.map((v, i) => ({
    x: values.length === 1 ? width / 2 : (i / (values.length - 1)) * width,
    y: pad + innerH - ((v - min) / range) * innerH,
  }))

  let line = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const midX = (p0.x + p1.x) / 2
    const midY = (p0.y + p1.y) / 2
    line += ` Q${p0.x},${p0.y} ${midX},${midY}`
  }
  const last = points[points.length - 1]
  line += ` L${last.x},${last.y}`

  const area = `${line} L${last.x},${height} L${points[0].x},${height} Z`
  return { line, area }
}

let idCounter = 0

export function Sparkline({
  values,
  width = 120,
  height = 34,
  color = 'var(--cyan)',
  strokeWidth = 2,
  fill = true,
  className,
}: SparklineProps) {
  const gradientId = `spark-${(idCounter++).toString(36)}`
  const { line, area } = buildPath(values, width, height)

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      {fill && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={area} fill={`url(#${gradientId})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
