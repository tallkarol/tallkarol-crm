"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

const HEIGHT = 256

/**
 * Measure the card, then draw at a real pixel size. Recharts'
 * ResponsiveContainer often mounts at 0×0 after a tab switch.
 */
export function ChartFrame({
  children,
}: {
  children: (size: { width: number; height: number }) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      const next = el.clientWidth
      if (next > 0) {
        setWidth((current) => (current === next ? current : next))
        return
      }
      frame = requestAnimationFrame(update)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return (
    <div ref={ref} className="h-64 w-full">
      {width > 0 ? children({ width, height: HEIGHT }) : null}
    </div>
  )
}
