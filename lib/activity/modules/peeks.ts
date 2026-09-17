import { defineModule } from "@/lib/activity/define"

/** `?peek=<type>:<id>` appearing and disappearing — read from the URL, so no peek component knows about it. */
export const peeks = defineModule({
  key: "peeks",
  label: "Peek cards",
  description: "Opens, time open, and whether you acted inside",
  capturedBy: "the probe, from ?peek= in the URL",
  defaultOn: true,
  available: true,
  kinds: {
    "peek.open": {
      label: "Opened a peek card",
      props: {
        peek: { type: "string", max: 24 },
        id: { type: "string", max: 80 },
      },
    },
    "peek.close": {
      label: "Closed a peek card",
      duration: true,
      props: {
        peek: { type: "string", max: 24 },
        /** A button inside the card was pressed before it closed. */
        acted: { type: "boolean" },
      },
    },
  },
})
