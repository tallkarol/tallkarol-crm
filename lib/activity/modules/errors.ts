import { defineModule } from "@/lib/activity/define"

export const errors = defineModule({
  key: "errors",
  label: "Errors",
  description: "Uncaught exceptions and render errors, grouped by fingerprint",
  capturedBy: "the probe, plus the error.tsx boundaries",
  defaultOn: true,
  available: true,
  kinds: {
    "error.client": {
      label: "Hit an error in the browser",
      props: {
        message: { type: "string", max: 200 },
        /** Hash of the message and the top stack frame — what the Friction tab groups by. */
        fingerprint: { type: "string", max: 16 },
        source: { type: "string", max: 160 },
        /** Caught by an error boundary (the page showed the fallback) rather than window.onerror. */
        boundary: { type: "boolean" },
      },
    },
  },
})
