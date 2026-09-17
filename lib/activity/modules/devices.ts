import { defineModule } from "@/lib/activity/define"

/** Listed so the Modules tab tells the truth about what is not recorded yet. */
export const devices = defineModule({
  key: "devices",
  label: "Devices",
  description: "Widget, watch and Mac app API calls, per device token",
  capturedBy: "device-token auth (not wired yet)",
  defaultOn: false,
  available: false,
  kinds: {},
})
