import { defineModule } from "@/lib/activity/define"

/**
 * Anything carrying `data-track="<id>"`. The value travels only when the
 * markup names it (`data-track-value="board"`) or the control is a select, a
 * checkbox or a radio. A text field sends its length, never its text.
 */
export const controls = defineModule({
  key: "controls",
  label: "Controls",
  description: "Clicks and changes on anything marked data-track",
  capturedBy: "data-track attributes, catalogued by npm run activity:scan",
  defaultOn: true,
  available: true,
  kinds: {
    "control.use": {
      label: "Used a control",
      target: true,
      props: {
        value: { type: "string", max: 60 },
        chars: { type: "number", min: 0, max: 100_000 },
        sent: { type: "boolean" },
      },
    },
  },
})
