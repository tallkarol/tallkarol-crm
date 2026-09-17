import { defineModule } from "@/lib/activity/define"

/**
 * How you arrived rides on every page.view as `via`. This module adds the one
 * thing a page view cannot say: that ⌘K was used, and how much was typed.
 */
export const navigation = defineModule({
  key: "navigation",
  label: "Navigation",
  description: "How you arrived: sidebar, ⌘K, a link, a peek card, Back, or from outside",
  capturedBy: "data-chrome and data-nav regions, read by the probe",
  defaultOn: true,
  available: true,
  kinds: {
    "nav.palette": {
      label: "Jumped with ⌘K",
      props: {
        /** Length of the query. The query itself is never sent. */
        chars: { type: "number", min: 0, max: 500 },
        to: { type: "route" },
      },
    },
  },
})
