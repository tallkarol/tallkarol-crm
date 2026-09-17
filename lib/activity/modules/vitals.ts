import { defineModule, type KindSpec } from "@/lib/activity/define"

const RATING = { type: "enum", values: ["good", "needs-improvement", "poor"] } as const

/** Time metrics carry milliseconds in durationMs; CLS is unitless and rides in `value`. */
const timed = (label: string): KindSpec => ({ label, duration: true, props: { rating: RATING } })

export const vitals = defineModule({
  key: "vitals",
  label: "Vitals",
  description: "LCP, INP, CLS, FCP and TTFB per route",
  capturedBy: "useReportWebVitals, which ships with Next",
  defaultOn: true,
  available: true,
  kinds: {
    "vitals.lcp": timed("Largest contentful paint"),
    "vitals.inp": timed("Interaction to next paint"),
    "vitals.fcp": timed("First contentful paint"),
    "vitals.ttfb": timed("Time to first byte"),
    "vitals.cls": {
      label: "Cumulative layout shift",
      props: { rating: RATING, value: { type: "number", min: 0, max: 100 } },
    },
  },
})
