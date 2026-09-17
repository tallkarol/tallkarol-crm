import { defineModule } from "@/lib/activity/define"

export const actions = defineModule({
  key: "actions",
  label: "Actions",
  description: "Server action runs: duration, success, and the message returned",
  capturedBy: "tracked() around a server action's export",
  defaultOn: true,
  available: true,
  kinds: {
    "action.run": {
      label: "Ran a server action",
      target: true,
      duration: true,
      outcome: true,
      serverOnly: true,
      props: {
        /** The action's own `{ ok: false, error }` text, or the thrown error's first line. */
        message: { type: "string", max: 200 },
      },
    },
  },
})
