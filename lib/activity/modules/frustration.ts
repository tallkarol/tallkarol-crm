import { defineModule } from "@/lib/activity/define"

/** Derived in the browser from clicks, Back and text fields — see lib/activity/detect.ts for the exact rules. */
export const frustration = defineModule({
  key: "frustration",
  label: "Frustration",
  description: "Rage clicks, quick backs, abandoned inputs, flip-flops",
  capturedBy: "the probe, using the rules in lib/activity/detect.ts",
  defaultOn: true,
  available: true,
  kinds: {
    "frustration.rage": {
      label: "Rage-clicked",
      target: true,
      props: { clicks: { type: "number", min: 0, max: 100 } },
    },
    "frustration.quickback": {
      label: "Went back within seconds",
      props: {
        stayedMs: { type: "number", min: 0, max: 60_000 },
        to: { type: "route" },
      },
    },
    "frustration.abandon": {
      label: "Typed, then left without sending",
      target: true,
      props: { chars: { type: "number", min: 0, max: 100_000 } },
    },
    "frustration.flipflop": {
      label: "Changed a value, then changed it back",
      target: true,
      props: {
        value: { type: "string", max: 60 },
        gapMs: { type: "number", min: 0, max: 60_000 },
      },
    },
  },
})
