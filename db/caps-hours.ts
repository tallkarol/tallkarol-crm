export type CapsSession = {
  occurredOn: string
  startedAt: string
  endedAt: string
  hours: string
  summary: string
}

/** Invoice 001 · 13 Nov 2025 · 14.98 hr billed at $65/hr. Tracker dates are 2025. */
export const CAPS_LAUNCH_SESSIONS: CapsSession[] = [
  {
    occurredOn: "2025-10-15",
    startedAt: "11:42 AM",
    endedAt: "11:59 AM",
    hours: "0.28",
    summary:
      "View websites we like, grab screenshots for inspiration, login to fieldhouse backend",
  },
  {
    occurredOn: "2025-10-15",
    startedAt: "12:00 PM",
    endedAt: "1:27 PM",
    hours: "1.45",
    summary:
      "Install activity log for temporary insight, add Yoast for SEO, start homepage construction, initial theme setup",
  },
  {
    occurredOn: "2025-10-15",
    startedAt: "8:00 PM",
    endedAt: "9:27 PM",
    hours: "1.45",
    summary: "Meeting with Grace and Bianco",
  },
  {
    occurredOn: "2025-10-22",
    startedAt: "4:47 PM",
    endedAt: "5:05 PM",
    hours: "0.30",
    summary: "Migration to WP Engine initiate, troubleshoot redirect error",
  },
  {
    occurredOn: "2025-10-22",
    startedAt: "5:22 PM",
    endedAt: "5:28 PM",
    hours: "0.10",
    summary: "Quick content audit, verify pages and media",
  },
  {
    occurredOn: "2025-10-22",
    startedAt: "6:26 PM",
    endedAt: "6:49 PM",
    hours: "0.38",
    summary: "Point domain to new server, propagate DNS records, verify SSL",
  },
  {
    occurredOn: "2025-10-22",
    startedAt: "7:01 PM",
    endedAt: "7:19 PM",
    hours: "0.30",
    summary: "Troubleshoot SSL error, verify SSL installation, verify DNS propagation",
  },
  {
    occurredOn: "2025-11-01",
    startedAt: "5:27 PM",
    endedAt: "7:03 PM",
    hours: "1.60",
    summary:
      "Set up staging env, remove unused plugins, create theme, add menu header",
  },
  {
    occurredOn: "2025-11-01",
    startedAt: "10:22 PM",
    endedAt: "11:24 PM",
    hours: "1.03",
    summary: "Footer, copy reviews",
  },
  {
    occurredOn: "2025-11-05",
    startedAt: "3:01",
    endedAt: "5:20",
    hours: "2.32",
    summary: "Continue transfer of content",
  },
  {
    occurredOn: "2025-11-05",
    startedAt: "4:19 PM",
    endedAt: "4:51 PM",
    hours: "0.53",
    summary: "Continue transfer of content",
  },
  {
    occurredOn: "2025-11-06",
    startedAt: "2:03",
    endedAt: "2:56",
    hours: "0.88",
    summary: "Continue transfer of content",
  },
  {
    occurredOn: "2025-11-06",
    startedAt: "3:44",
    endedAt: "5:22",
    hours: "1.63",
    summary: "Continue transfer of content",
  },
  {
    occurredOn: "2025-11-06",
    startedAt: "3:48 PM",
    endedAt: "5:59 PM",
    hours: "2.18",
    summary: "Install schedule tables, continue transfer of content, create hub pages",
  },
  {
    occurredOn: "2025-11-06",
    startedAt: "6:12 PM",
    endedAt: "7:29 PM",
    hours: "1.28",
    summary: "Nav optimizations, link checks, button checks",
  },
  {
    occurredOn: "2025-11-13",
    startedAt: "6:43 PM",
    endedAt: "6:47 PM",
    hours: "0.07",
    summary: "Build Dev backup of live site",
  },
  {
    occurredOn: "2025-11-13",
    startedAt: "7:03 PM",
    endedAt: "7:41 PM",
    hours: "0.63",
    summary: "Launch site, check links, check media",
  },
]
