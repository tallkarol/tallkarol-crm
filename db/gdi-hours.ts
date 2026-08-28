export type GdiSession = {
  occurredOn: string
  startedAt: string
  endedAt: string
  hours: string
  summary: string
}

/** Invoice — Karol Buczek (1099) · July 2026 · 20.42 hr · $1,225.00 */
export const GDI_JULY_SESSIONS: GdiSession[] = [
  {
    occurredOn: "2026-06-29",
    startedAt: "5:52 PM",
    endedAt: "6:41 PM",
    hours: "0.82",
    summary: "website migration team meeting.",
  },
  {
    occurredOn: "2026-07-04",
    startedAt: "2:14 PM",
    endedAt: "2:32 PM",
    hours: "0.30",
    summary: "TBA new homepage start",
  },
  {
    occurredOn: "2026-07-04",
    startedAt: "3:01 PM",
    endedAt: "4:42 PM",
    hours: "1.68",
    summary: "tba site speed improvement testing, continue homepage edits",
  },
  {
    occurredOn: "2026-07-04",
    startedAt: "5:55 PM",
    endedAt: "7:53 PM",
    hours: "1.97",
    summary: "tba/uwd meeting, continue homepage edits, local page meeting",
  },
  {
    occurredOn: "2026-07-08",
    startedAt: "6:39 PM",
    endedAt: "8:06 PM",
    hours: "1.45",
    summary: "homepage 2 edits",
  },
  {
    occurredOn: "2026-07-09",
    startedAt: "12:06 PM",
    endedAt: "12:20 PM",
    hours: "0.23",
    summary: "homepage 2 edits",
  },
  {
    occurredOn: "2026-07-09",
    startedAt: "1:14 PM",
    endedAt: "1:22 PM",
    hours: "0.13",
    summary: "homepage 2 edits",
  },
  {
    occurredOn: "2026-07-09",
    startedAt: "7:34 PM",
    endedAt: "7:59 PM",
    hours: "0.42",
    summary: "homepage 2 edits",
  },
  {
    occurredOn: "2026-07-13",
    startedAt: "5:58 PM",
    endedAt: "19:00",
    hours: "1.03",
    summary: "tba/uwd meeting",
  },
  {
    occurredOn: "2026-07-16",
    startedAt: "2:17 PM",
    endedAt: "15:41",
    hours: "1.40",
    summary: "investigate zap errors, plan for fixes and subzap rebuilds",
  },
  {
    occurredOn: "2026-07-17",
    startedAt: "1:54 PM",
    endedAt: "3:41 PM",
    hours: "1.78",
    summary:
      "fix top priority zap errors, build filters for graceful failure, look further into subzap ownership issue.",
  },
  {
    occurredOn: "2026-07-20",
    startedAt: "5:24 PM",
    endedAt: "6:58 PM",
    hours: "1.57",
    summary:
      "melanie edit requests, tba/uwd meeting, look into 404 error scripting",
  },
  {
    occurredOn: "2026-07-24",
    startedAt: "2:55 PM",
    endedAt: "3:22 PM",
    hours: "0.45",
    summary: "weekly meeting",
  },
  {
    occurredOn: "2026-07-27",
    startedAt: "4:37 PM",
    endedAt: "5:51 PM",
    hours: "1.23",
    summary: "uwd preprod page creation begin",
  },
  {
    occurredOn: "2026-07-27",
    startedAt: "6:00 PM",
    endedAt: "6:37 PM",
    hours: "0.62",
    summary: "uwd website meeting",
  },
  {
    occurredOn: "2026-07-28",
    startedAt: "2:51 PM",
    endedAt: "4:59 PM",
    hours: "2.13",
    summary:
      "uwd preprod pattern building and content planning, tba 404 redirects continue work",
  },
  {
    occurredOn: "2026-07-30",
    startedAt: "2:21 PM",
    endedAt: "5:19 PM",
    hours: "2.97",
    summary:
      "tba missing scripts for custom blocks on some pages trial and error (same issue on uwd), uwd site progress",
  },
  {
    occurredOn: "2026-07-31",
    startedAt: "2:59 PM",
    endedAt: "3:13 PM",
    hours: "0.23",
    summary: "scott / karol / pedro / chris meeting (chris final meeting)",
  },
]

/** Invoice — Karol Buczek (1099) · Aug-26 · 70.25 hr · $4,215.00 */
export const GDI_AUGUST_SESSIONS: GdiSession[] = [
  {
    occurredOn: "2026-08-03",
    startedAt: "4:13 PM",
    endedAt: "5:04 PM",
    hours: "0.85",
    summary:
      "update everyone on statuses, setup time with scott to finalize css needs",
  },
  {
    occurredOn: "2026-08-03",
    startedAt: "6:12 PM",
    endedAt: "6:49 PM",
    hours: "0.62",
    summary: "uwd website migration standup meeting",
  },
  {
    occurredOn: "2026-08-06",
    startedAt: "3:30 PM",
    endedAt: "4:27 PM",
    hours: "0.95",
    summary: "meeting with erin",
  },
  {
    occurredOn: "2026-08-06",
    startedAt: "1:58",
    endedAt: "5:58",
    hours: "4",
    summary: "continue uwd website migration -- top level nav pages",
  },
  {
    occurredOn: "2026-08-06",
    startedAt: "6:22",
    endedAt: "8:04",
    hours: "1.7",
    summary:
      "continue uwd website migration -- mobile styling, continue top level navs",
  },
  {
    occurredOn: "2026-08-06",
    startedAt: "2:09 PM",
    endedAt: "5:27 PM",
    hours: "3.3",
    summary:
      "continue uwd website migration - careers pages, meeting with pedro",
  },
  {
    occurredOn: "2026-08-12",
    startedAt: "8:29 PM",
    endedAt: "10:17 PM",
    hours: "1.8",
    summary:
      "meet about gtm optimizations, fix slick slider enquement error on tba that was preventing page duplication, fixed gdi core utilities theme dependency, continue porting content",
  },
  {
    occurredOn: "2026-08-13",
    startedAt: "1:23",
    endedAt: "2:08",
    hours: "0.75",
    summary:
      "implement new header nav, implement new footer nav, continue porting content",
  },
  {
    occurredOn: "2026-08-13",
    startedAt: "2:25",
    endedAt: "4:47",
    hours: "2.37",
    summary:
      "continue porting content, pull requests for all edits, test in develop env, create",
  },
  {
    occurredOn: "2026-08-13",
    startedAt: "2:27 PM",
    endedAt: "4:19 PM",
    hours: "1.87",
    summary:
      "pull request cleanup, meeting with scott and pedro, meeting with erin",
  },
  {
    occurredOn: "2026-08-13",
    startedAt: "5:17 PM",
    endedAt: "5:56 PM",
    hours: "0.65",
    summary:
      "test preprod after pull request deploy, create pull request into prod",
  },
  {
    occurredOn: "2026-08-13",
    startedAt: "9:16 PM",
    endedAt: "9:59 PM",
    hours: "0.72",
    summary:
      "cherry pick slick slider fix from preprod into prod, create pr, check codebot",
  },
  {
    occurredOn: "2026-08-14",
    startedAt: "4:08 PM",
    endedAt: "4:37 PM",
    hours: "0.48",
    summary:
      "reset uwd live wp password with scott, export blog posts and press releases",
  },
  {
    occurredOn: "2026-08-14",
    startedAt: "4:57 PM",
    endedAt: "7:19 PM",
    hours: "2.37",
    summary:
      "import blog posts and press releases, create blogs template. Create single post",
  },
  {
    occurredOn: "2026-08-14",
    startedAt: "8:21 PM",
    endedAt: "11:59 PM",
    hours: "3.63",
    summary:
      "theme core web vital optimizations, media encoding first pass, start building local pages, generate local page template, v2 local page template and script ready",
  },
  {
    occurredOn: "2026-08-15",
    startedAt: "12:00",
    endedAt: "6:43",
    hours: "6.72",
    summary:
      "continue local page work, figure out testimonials slider, create sample testimonials",
  },
  {
    occurredOn: "2026-08-15",
    startedAt: "2:17 PM",
    endedAt: "5:31 PM",
    hours: "3.23",
    summary:
      "continue ui qa for optimized theme (mobile focused), continue local pages",
  },
  {
    occurredOn: "2026-08-15",
    startedAt: "6:47 PM",
    endedAt: "11:59 PM",
    hours: "5.22",
    summary:
      "continue local pages, start sub service pages, more local pages",
  },
  {
    occurredOn: "2026-08-16",
    startedAt: "12:00",
    endedAt: "4:17",
    hours: "4.28",
    summary:
      "continue local pages, random pages build, compare against keep/kill list",
  },
  {
    occurredOn: "2026-08-16",
    startedAt: "9:57 PM",
    endedAt: "11:59 PM",
    hours: "2.03",
    summary:
      "clean up yesterdays imports, fill in metadatas, update content bundler plugin",
  },
  {
    occurredOn: "2026-08-17",
    startedAt: "12:00",
    endedAt: "4:04",
    hours: "4.07",
    summary:
      "send local uwd theme to develop, qa test, build gdi/dealer-map block, build gdi/financing-options block, add global offer block, sync develop content with local. begin migration from develop to preprod, first isolate theme and content bundler and send via pr, upload sample bundle in pr, verify, upload remainder",
  },
  {
    occurredOn: "2026-08-17",
    startedAt: "5:59 PM",
    endedAt: "6:33 PM",
    hours: "0.57",
    summary: "martech meeting",
  },
  {
    occurredOn: "2026-08-17",
    startedAt: "8:01 PM",
    endedAt: "9:02 PM",
    hours: "1.02",
    summary:
      "meeting with megan and melanie about uwd page creation and missing blocks",
  },
  {
    occurredOn: "2026-08-19",
    startedAt: "4:58 PM",
    endedAt: "5:17 PM",
    hours: "0.32",
    summary: "Meeting with Pedro and Scott",
  },
  {
    occurredOn: "2026-08-20",
    startedAt: "2:19 PM",
    endedAt: "4:15 PM",
    hours: "1.93",
    summary:
      "Start punch list, Meeting with Erin, push punchlist changes into develop, test",
  },
  {
    occurredOn: "2026-08-20",
    startedAt: "5:19 PM",
    endedAt: "5:24 PM",
    hours: "0.08",
    summary: "q/a push to preprod",
  },
  {
    occurredOn: "2026-08-24",
    startedAt: "5:14 PM",
    endedAt: "7:03 PM",
    hours: "1.82",
    summary: "punchlist, meeting, punchlist",
  },
  {
    occurredOn: "2026-08-25",
    startedAt: "12:30",
    endedAt: "1:24",
    hours: "0.9",
    summary: "punchlist",
  },
  {
    occurredOn: "2026-08-25",
    startedAt: "10:43",
    endedAt: "4:17 PM",
    hours: "5.57",
    summary:
      "punchlist, meeting with scott about heavyset, local dev into preprod flow",
  },
  {
    occurredOn: "2026-08-25",
    startedAt: "5:11 PM",
    endedAt: "5:30 PM",
    hours: "0.32",
    summary: "punchlist",
  },
  {
    occurredOn: "2026-08-25",
    startedAt: "6:02 PM",
    endedAt: "7:42 PM",
    hours: "1.67",
    summary: "punchlist, word doc hit list",
  },
  {
    occurredOn: "2026-08-26",
    startedAt: "7:19 PM",
    endedAt: "10:10 PM",
    hours: "2.85",
    summary:
      "punchlist, melanie email changes, hit list changes, q/a for mobile",
  },
  {
    occurredOn: "2026-08-26",
    startedAt: "10:54 PM",
    endedAt: "11:59 PM",
    hours: "1.08",
    summary:
      "additional fixes before business owners presentation, more punchlist",
  },
  {
    occurredOn: "2026-08-26",
    startedAt: "12:00",
    endedAt: "12:03",
    hours: "0.05",
    summary: "final fixes before business presentation from latest email",
  },
  {
    occurredOn: "2026-08-27",
    startedAt: "3:44 PM",
    endedAt: "4:13 PM",
    hours: "0.48",
    summary:
      "check on reviewed punchlist items, meeting with pedro and scott",
  },
]
