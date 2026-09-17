import { defineModule } from "@/lib/activity/define"

/** How a page was reached. `other` is a navigation no click or Back explains (a redirect, a router.push after an action). */
export const VIA = ["sidebar", "palette", "link", "peek", "back", "outside", "reload", "other"] as const

export const pages = defineModule({
  key: "pages",
  label: "Pages",
  description: "Views, active time, and how long a page took to be ready",
  capturedBy: "ActivityProbe in the admin and portal layouts",
  defaultOn: true,
  available: true,
  kinds: {
    "page.view": {
      label: "Opened a page",
      duration: true,
      props: {
        /** Ties the view to its page.leave rows, so a visit's active time sums. */
        view: { type: "string", max: 16 },
        via: { type: "enum", values: VIA },
        params: { type: "params" },
      },
    },
    "page.leave": {
      label: "Active time on a page",
      duration: true,
      props: {
        view: { type: "string", max: 16 },
        /** tick = a five-minute slice of a long visit, so hours land in the right hour. */
        reason: { type: "enum", values: ["navigate", "hidden", "tick", "close"] },
      },
    },
  },
})
