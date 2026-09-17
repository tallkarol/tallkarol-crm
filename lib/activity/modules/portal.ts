import { defineModule } from "@/lib/activity/define"

/**
 * Owns no kinds of its own: it decides whether the probe mounts in the client
 * portal and whether ingest keeps events from customer sessions. Karol chose
 * to record customers from day one (sign-off, 13 Sep 2026).
 */
export const portal = defineModule({
  key: "portal",
  label: "Portal",
  description: "The same modules, for client portal sessions",
  capturedBy: "the probe in the portal layout",
  defaultOn: true,
  available: true,
  kinds: {},
})
