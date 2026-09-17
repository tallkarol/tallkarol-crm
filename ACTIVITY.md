# Activity

`/activity` shows how the CRM is used, so the UI can be tuned from evidence
instead of taste: where you go, how you get there, what you click, what you
wait for, and where you stumble. It is first-party. Nothing leaves the CRM's
own database, and nothing anyone types is ever stored.

Signed off by Karol on 13 Sep 2026 from the proposal artifact
(claude.ai/code/artifact/f0f5874d-16eb-4636-b6dc-b9411e99f2c7), with one change:
**client portal sessions are recorded from day one.**

## The rules

- **Nothing typed.** A text field records a length and whether it was sent.
  The ⌘K query records its length only.
- **Props are allowlisted per event kind** in `lib/activity/modules/*`. Ingest
  drops every key a kind does not declare, and counts the drop on the Modules
  tab. A careless `track()` call cannot start storing something new; adding a
  field is an edit to a module file, visible in review.
- **No amounts, notes, message bodies or IP addresses.** The user agent becomes
  a surface (browser, mac_app, phone).
- **No names.** Record ids are stored, and names are looked up when the page
  renders. Rage clicks name a `data-track` id, or only the region and element
  type (`peek › button`). They never use an aria-label, because labels carry
  client names.
- **Verification traffic is flagged, not dropped.** Headless Chrome (every CDP
  verify run) and `navigator.webdriver` are stored with `synthetic = true` and
  hidden everywhere unless the page's "verification events hidden" link is
  followed.
- **The local dev server counts as usage but not as speed.** It shares the
  production database and writes `deploy = 'local'`. Speed queries leave it
  out, because a dev compile would own every p95.

## Pieces

| Piece | Where | Notes |
| --- | --- | --- |
| Registry | `lib/activity/define.ts`, `lib/activity/modules/*` | PURE. A module is one file: kinds, and the props each may carry. Add it to `modules/index.ts`; no migration. |
| Probe | `components/activity/ActivityProbe.tsx` + `lib/activity/client.ts` | Mounted in `app/(admin)/layout.tsx` and `app/(public)/portal/layout.tsx`. Passive listeners on the document, one queue, one `sendBeacon` every 10 s / 50 events / tab hide. |
| Rules | `lib/activity/detect.ts` | PURE. Rage click, quick back, flip-flop, abandon grace, session idle, active-input window. Every threshold the page quotes lives here. |
| Door | `lib/activity/sanitize.ts` | PURE. Unknown kind refused; server-only kinds refused from a browser; props allowlisted; time clamped to a day behind arrival and never ahead (the punch clock's rule); path → route pattern. |
| Routes | `lib/activity/routes.ts` + `content/activity-catalog.json` | Patterns come from `npm run activity:scan`, which also runs in prebuild, so a deploy knows its own routes. An unmatched path collapses id-looking segments (anything with a digit, a uuid) to `[id]`. |
| Ingest | `POST /api/activity` → `lib/activity/ingest.ts` | Session cookie, admins and portal customers alike. 1,500 events per 5 minutes per session. Answers 204. |
| Actions | `lib/activity/tracked.ts` | `export const x = tracked("ns.name", async (…) => { … })`. Failure = throws, or returns `{ ok: false }` / an `error` string. redirect() and notFound() are not failures. An in-process buffer flushes every 5 s as one insert; a click never waits on the log. |
| Store | `lib/activity/store.ts` | Attribution: session hash → user, role, and the client when a customer holds exactly one grant. Memoised for a minute. |
| Switches | `lib/activity/settings.ts` | `app_settings.activity.modules` (cached a minute in-process); ingest counters in `app_settings.activity_ingest`. |
| Read side | `lib/activity/summary/*` | SQL group-bys at read time, bucketed in the workspace time zone. Timestamps go into raw SQL through `ts()`: postgres-js cannot bind a Date inside `db.execute`. |
| Tuning notes | `lib/activity/findings.ts` + `summary/tuning.ts` | PURE rules with thresholds in `FINDING_RULES`, the same shape as `lib/attention.ts`. A rule that needs more days than exist says so. |
| Retention | `lib/activity/rollup.ts`, called from `tick()` | Raw events live 90 days, then fold into `activity_daily` (Karol's call). The cutoff is a midnight in the workspace zone, so a day is never split. Synthetic rows are deleted without being rolled. |
| Error boundaries | `app/(admin)/error.tsx`, `app/(public)/portal/error.tsx` | There were none before. A render error now shows a retry card and lands on Friction. |

## Event kinds

| Module | Kind | durationMs | Props |
| --- | --- | --- | --- |
| pages | `page.view` | click (or navigation start) → content painted | `view`, `via` (sidebar, palette, link, peek, back, outside, reload, other), `params` (from the path) |
| pages | `page.leave` | active time since the last slice | `view`, `reason` (navigate, hidden, tick, close) |
| navigation | `nav.palette` | — | `chars`, `to` |
| controls | `control.use` | — | `value`, `chars`, `sent` |
| peeks | `peek.open` / `peek.close` | time open (close) | `peek`, `id` (open), `acted` (close) |
| actions | `action.run` (server only) | run time | `message` |
| errors | `error.client` | — | `message`, `fingerprint`, `source`, `boundary` |
| vitals | `vitals.lcp` `.inp` `.fcp` `.ttfb` / `.cls` | the metric / — | `rating` / `value` |
| frustration | `.rage` `.quickback` `.abandon` `.flipflop` | — | `clicks` / `stayedMs`, `to` / `chars` / `value`, `gapMs` |

**Active time** counts only while the tab is visible, the window has focus,
and something was touched in the last 60 s. A long visit is written in
5-minute slices so the hour heatmap puts time in the right hour.

**How you arrived**: a click inside `[data-chrome="sidebar"]` or the mobile
menu is `sidebar`; inside `[data-nav="palette"]` it is `palette`; inside
`[data-nav="peek"]` it is `peek`; anywhere else it is `link`. Back or Forward
is `back`. The cause is remembered when it happens, because the route only
changes once the server render arrives: a link, a sidebar row, ⌘K, a peek card
or Back stays the cause for 30 s, and a plain button for 10 s. A first load with no same-site referrer is `outside`
(push notifications, widgets, bookmarks, opening the Mac app). A navigation no
click explains is `other`.

## Instrumenting

- **A control:** add `data-track="page.control"`. Add `data-track-value="board"`
  when the value is part of the markup, and `data-track-from={current}` so a
  flip-flop can be seen from the first change. Optionally add
  `data-track-label="Layout: board"`. Then run `npm run activity:scan` so the
  Controls tab can list it before anyone uses it. A `<form data-track>` records
  on submit, with the text length.
- **A server action:** `npx tsx scripts/activity-wrap-actions.ts <file>` wraps
  every export in that file, then run `npm run activity:scan`. Work one file at a
  time, and skip any file another session has uncommitted changes in. A
  parameter with a default and no annotation (`note = ""`) needs its type
  written out (`note: string = ""`), because inside the wrapper's generic it
  would otherwise be read as `unknown`. Leave background polls unwrapped (the
  floating clock's `runningNow`): nobody waits on them, and they would drown
  the actions people do wait on.
- **An event kind:** add it to its module file with its props. A new kind
  family (the part before the dot) also needs a line in `MODULE_OF` in
  `lib/activity/client.ts`.

## Checks

    npm run check:activity      # pure: registry, routes, the door, the rules, formatting, every tuning rule
    npm run check:activity:db   # plants rows through ingest, runs every query and the rollup, cleans up
    npm run activity:scan       # rebuild content/activity-catalog.json (prebuild does this too)

## Coverage on 13 Sep 2026

- **Actions:** 69 of 186 are timed. Wrapped files: peek, task peek, timesheet,
  punch, meetings, delivery, inbox, support, calendar, punch lists, activity.
  `lib/task-actions.ts` and `lib/chat/*` are not wrapped yet, because they had
  another session's uncommitted changes.
- **Controls:** 37 are marked, on the dashboard (toolbar, week board, needs
  attention, the New / Clock / Record popovers), Delivery (row, status menu),
  Inbox (lens, kind, client, triage) and Timesheet (clock, review queue, floating
  clock). `components/tasks/*` waits for the same reason.

## Not built

- **Devices module:** API calls from widgets, the watch and the Mac app, per
  device token. It is listed on the Modules tab as not built.
- **Portal notice:** portal visitors are recorded but not told. Whether the
  portal should say so is Karol's call.
