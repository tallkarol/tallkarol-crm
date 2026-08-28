/** Server-rendered 12-month billing bars in the insights chart ink. */
export function MiniBars({
  values,
  accrued,
  label,
}: {
  /** cents per month, oldest → newest (12 slots) */
  values: number[]
  /** current-month accrued (unbilled) cents, drawn dashed */
  accrued?: number
  label: string
}) {
  const w = 300
  const h = 34
  const max = Math.max(...values, accrued ?? 0, 1)
  const slot = w / 12
  const bw = Math.min(16, slot - 6)
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="rgba(15,22,21,.08)" />
      {values.map((v, i) => {
        const x = i * slot + (slot - bw) / 2
        if (v <= 0)
          return <circle key={i} cx={x + bw / 2} cy={h - 4} r="1.5" fill="rgba(15,22,21,.22)" />
        const bh = Math.max(2, (v / max) * (h - 8))
        return <rect key={i} x={x} y={h - 1 - bh} width={bw} height={bh} rx="2" fill="#009688" />
      })}
      {accrued && accrued > 0 ? (
        <rect
          x={11 * slot + (slot - bw) / 2}
          y={h - 1 - Math.max(4, (accrued / max) * (h - 8))}
          width={bw}
          height={Math.max(4, (accrued / max) * (h - 8))}
          rx="2"
          fill="none"
          stroke="#009688"
          strokeWidth="1.4"
          strokeDasharray="3 2.5"
        />
      ) : null}
    </svg>
  )
}
